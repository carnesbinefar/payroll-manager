import { PDFDocument } from 'pdf-lib';
// eslint-disable-next-line @typescript-eslint/no-require-imports
const pdfParse = require('pdf-parse') as (buf: Buffer) => Promise<{ text: string; numpages: number }>;

export interface ParsedPayslip {
  employeeCode: string;
  employeeName: string;
  nif: string;
  nass: string;
  companyId: string;
  companyName: string;
  period: string;
  category: string;
  grossPay: number;
  netPay: number;
  irpf: number;
  ssWorker: number;
  ssEmployer: number;
  totalCost: number;
  pageIndex: number;
}

export interface ParsedSummaryRow {
  employeeCode: string;
  employeeName: string;
  grossPay: number;
  netPay: number;
  irpf: number;
  ssWorker: number;
  ssEmployer: number;
  totalCost: number;
  companyId: string;
  period: string;
}

function parseAmount(s: string): number {
  if (!s) return 0;
  return parseFloat(s.replace(/\./g, '').replace(',', '.')) || 0;
}

function parsePeriod(text: string): string {
  const months: Record<string, string> = {
    ENERO: '01', FEBRERO: '02', MARZO: '03', ABRIL: '04',
    MAYO: '05', JUNIO: '06', JULIO: '07', AGOSTO: '08',
    SEPTIEMBRE: '09', OCTUBRE: '10', NOVIEMBRE: '11', DICIEMBRE: '12',
  };
  const m = text.match(/Del\s+\d+\s+al\s+\d+\s+de\s+([A-Z]+)\s+de\s+(\d{4})/i);
  if (m) {
    const month = months[m[1].toUpperCase()] || '01';
    return `${m[2]}-${month}`;
  }
  return '';
}

// Extract a single page from a multi-page PDF
export async function extractPageAsPdf(pdfBytes: Buffer, pageIndex: number): Promise<Buffer> {
  const srcDoc = await PDFDocument.load(pdfBytes);
  const newDoc = await PDFDocument.create();
  const [page] = await newDoc.copyPages(srcDoc, [pageIndex]);
  newDoc.addPage(page);
  const bytes = await newDoc.save();
  return Buffer.from(bytes);
}

export async function parseIndividualPdf(
  pdfBytes: Buffer,
  companyId: string,
): Promise<ParsedPayslip[]> {
  const pdfDoc = await PDFDocument.load(pdfBytes);
  const pageCount = pdfDoc.getPageCount();
  const results: ParsedPayslip[] = [];

  for (let i = 0; i < pageCount; i++) {
    try {
      // Extract one page at a time — more reliable than pagerender callback
      const pageBuf = await extractPageAsPdf(pdfBytes, i);
      const { text } = await pdfParse(pageBuf);
      const payslip = parsePayslipText(text, i, companyId);
      if (payslip) results.push(payslip);
    } catch (err) {
      console.error(`Error parsing page ${i}:`, err);
    }
  }
  return results;
}

function parsePayslipText(text: string, pageIndex: number, companyId: string): ParsedPayslip | null {
  // NIF — reliable anchor (8 digits + letter)
  const nifMatch = text.match(/N\.I\.F\.\s+([0-9]{8}[A-Z])/i);
  const nif = nifMatch ? nifMatch[1] : '';

  // NASS
  const nassMatch = text.match(/N\.A\.S\.S\.\s+(\d{12})/i);
  const nass = nassMatch ? nassMatch[1] : '';

  // Employee code: "Código  00060/06068-001"
  const codeMatch = text.match(/C[oó]digo\s+([\d\/\-]+)/i);
  let employeeCode = '';
  if (codeMatch) {
    const parts = codeMatch[1].split('/');
    employeeCode = parts[parts.length - 1]?.trim() || codeMatch[1].trim();
  }

  // Company name: text between "Empresa" and "Trabajador/a"
  const companyMatch = text.match(/Empresa\s+(.+?)\s+Trabajador\/a/i);
  const companyName = companyMatch ? companyMatch[1].trim() : '';

  // Employee name: text between "Trabajador/a" and next label (Centro/Categoría)
  // Limit to 4 words max to avoid bleeding into company name
  const nameMatch = text.match(/Trabajador\/a\s+((?:[A-ZÁÉÍÓÚÑÜ\.]+\s+){1,4}[A-ZÁÉÍÓÚÑÜ\.]+)/i);
  let employeeName = nameMatch ? nameMatch[1].trim() : '';
  // Remove trailing company-indicator words if bled in
  employeeName = employeeName.replace(/\s+(S\.L\.|S\.A\.|S\.L|S\.A)\.?\s*$/, '').trim();

  // Category: between "Categoría" and next label
  const categoryMatch = text.match(/Categor[íi]a\s+([A-ZÁÉÍÓÚÑÜ\(\)\s]+?)(?:\s+(?:Domicilio|Puesto|Centro|C\.C\.C|$))/i);
  const category = categoryMatch ? categoryMatch[1].trim() : '';

  // Period
  const period = parsePeriod(text);

  // Net pay — "Líquido  1.742,82"
  const liquidoMatch = text.match(/L[íi]quido\s+([\d\.]+,\d{2})/i);
  const netPay = liquidoMatch ? parseAmount(liquidoMatch[1]) : 0;

  // Gross pay — "T. Devengado ... 2.235,59"
  const devengadoMatch = text.match(/T\.\s*Devengado\s+([\d\.]+,\d{2})/i);
  const grossPay = devengadoMatch ? parseAmount(devengadoMatch[1]) : 0;

  // IRPF
  const irpfMatch = text.match(/Descuentos\s+IRPF\s+[\d,\.]+\s+[\d,\.]+\s+([\d\.]+,\d{2})/i);
  const irpf = irpfMatch ? parseAmount(irpfMatch[1]) : 0;

  // SS worker total
  const ssWorkerMatch = text.match(/Total\s+([\d\.]+,\d{2})\s+[\d\.]+,\d{2}/);
  const ssWorker = ssWorkerMatch ? parseAmount(ssWorkerMatch[1]) : 0;

  // SS employer total
  const ssEmployerMatch = text.match(/Total\s+[\d\.]+,\d{2}\s+([\d\.]+,\d{2})/);
  const ssEmployer = ssEmployerMatch ? parseAmount(ssEmployerMatch[1]) : 0;

  const totalCost = grossPay + ssEmployer;

  if (!employeeName || !period) {
    console.warn(`Page ${pageIndex}: could not extract employee or period. NIF=${nif}`);
    return null;
  }

  return {
    employeeCode,
    employeeName,
    nif,
    nass,
    companyId,
    companyName,
    period,
    category,
    grossPay,
    netPay,
    irpf,
    ssWorker,
    ssEmployer,
    totalCost,
    pageIndex,
  };
}

export async function parseSummaryPdf(
  pdfBytes: Buffer,
  companyId: string,
): Promise<ParsedSummaryRow[]> {
  const { text } = await pdfParse(pdfBytes);
  const results: ParsedSummaryRow[] = [];
  let period = '';

  // Period from "Eje.: 2026 ... Desde: FEBRERO"
  const yearMatch = text.match(/Eje\.:\s*(\d{4})/i);
  const monthMatch = text.match(/Desde:\s*([A-Z]+)\s+Hasta:/i);
  if (yearMatch && monthMatch) {
    const months: Record<string, string> = {
      ENERO: '01', FEBRERO: '02', MARZO: '03', ABRIL: '04',
      MAYO: '05', JUNIO: '06', JULIO: '07', AGOSTO: '08',
      SEPTIEMBRE: '09', OCTUBRE: '10', NOVIEMBRE: '11', DICIEMBRE: '12',
    };
    const m = months[monthMatch[1].toUpperCase()];
    if (m) period = `${yearMatch[1]}-${m}`;
  }

  // Each row: "00003 001 ROMAN SORIA JAIME 3571,43 0,00 0,00 270,83 0,00 0,00 805,36 2495,24 1414,59 0,00 4986,02"
  const rowPattern = /(\d{5})\s+(\d{3})\s+([A-ZÁÉÍÓÚÑÜ][A-Z\s]+?)\s+([\d,]+)\s+([\d,]+)\s+([\d,]+)\s+([\d,]+)\s+([\d,]+)\s+([\d,]+)\s+([\d,]+)\s+([\d,]+)\s+([\d,]+)\s+([\d,]+)\s+([\d,]+)/g;
  let match;
  while ((match = rowPattern.exec(text)) !== null) {
    results.push({
      employeeCode: `${match[1]}-${match[2]}`,
      employeeName: match[3].trim(),
      grossPay: parseAmount(match[4]),
      ssWorker: parseAmount(match[7]),
      irpf: parseAmount(match[10]),
      netPay: parseAmount(match[11]),
      ssEmployer: parseAmount(match[12]),
      totalCost: parseAmount(match[14]),
      companyId,
      period,
    });
  }

  return results;
}
