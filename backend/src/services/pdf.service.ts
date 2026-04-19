import { PDFDocument } from 'pdf-lib';
// eslint-disable-next-line @typescript-eslint/no-require-imports
const pdfjs = require('pdfjs-dist/legacy/build/pdf.js') as typeof import('pdfjs-dist');

type TextItem = { str: string };
type TextMarkedContent = { type: string };

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
  const m = text.match(/Del\s+\d+\s+al\s+\d+\s+de\s+([A-ZÁÉÍÓÚ]+)\s+de\s+(\d{4})/i);
  if (m) {
    const month = months[m[1].toUpperCase()] || '01';
    return `${m[2]}-${month}`;
  }
  return '';
}

async function extractPageText(pdfBytes: Uint8Array, pageIndex: number): Promise<string> {
  const doc = await pdfjs.getDocument({ data: pdfBytes }).promise;
  const page = await doc.getPage(pageIndex + 1);
  const content = await page.getTextContent();
  return content.items.map((item: TextItem | TextMarkedContent) => {
    if ('str' in item) return (item as TextItem).str;
    return '';
  }).join(' ');
}

export async function parseIndividualPdf(
  pdfBytes: Buffer,
  companyId: string,
): Promise<ParsedPayslip[]> {
  const pdfDoc = await PDFDocument.load(pdfBytes);
  const pageCount = pdfDoc.getPageCount();
  const results: ParsedPayslip[] = [];

  const bytes = new Uint8Array(pdfBytes);

  for (let i = 0; i < pageCount; i++) {
    try {
      const text = await extractPageText(bytes, i);
      const payslip = parsePayslipText(text, i, companyId);
      if (payslip) results.push(payslip);
    } catch (err) {
      console.error(`Error parsing page ${i}:`, err);
    }
  }
  return results;
}

function parsePayslipText(text: string, pageIndex: number, companyId: string): ParsedPayslip | null {
  // Employee name — appears after "Trabajador/a"
  const nameMatch = text.match(/Trabajador\/a\s+([A-ZÁÉÍÓÚÑÜ][A-ZÁÉÍÓÚÑÜ ,.-]+?)(?:Centro|Categoría|$)/i);
  const employeeName = nameMatch ? nameMatch[1].trim() : '';

  // NIF
  const nifMatch = text.match(/N\.I\.F\.\s+(\w+)/i);
  const nif = nifMatch ? nifMatch[1] : '';

  // NASS
  const nassMatch = text.match(/N\.A\.S\.S\.\s+(\d+)/i);
  const nass = nassMatch ? nassMatch[1] : '';

  // Employee code from "Código" field: e.g. "00060/06060-002"
  const codeMatch = text.match(/Código\s+([\d\/\-]+)/i);
  let employeeCode = '';
  if (codeMatch) {
    // Extract the part after the slash: "06060-002"
    const parts = codeMatch[1].split('/');
    employeeCode = parts[parts.length - 1]?.trim() || codeMatch[1].trim();
  }

  // Company name
  const companyMatch = text.match(/Empresa\s+([A-ZÁÉÍÓÚÑÜ][A-Z\s,\.]+?)(?:Trabajador|Centro)/i);
  const companyName = companyMatch ? companyMatch[1].trim() : '';

  // Category
  const categoryMatch = text.match(/Categoría\s+([A-ZÁÉÍÓÚÑÜ][A-Z\s\(\)]+?)(?:Domicilio|Puesto|$)/i);
  const category = categoryMatch ? categoryMatch[1].trim() : '';

  // Period
  const period = parsePeriod(text);

  // Financial figures — look for "Líquido" section
  // T.Devengado and T.Deducciones
  const devengadoMatch = text.match(/T\.\s*Devengado[^T]*?([\d]+[,\.]\d{2})/i);
  const grossPay = devengadoMatch ? parseAmount(devengadoMatch[1]) : 0;

  const liquidoMatch = text.match(/Líquido\s+([\d]+[,\.]\d{2})/i);
  const netPay = liquidoMatch ? parseAmount(liquidoMatch[1]) : 0;

  // IRPF deduction
  const irpfMatch = text.match(/Descuentos IRPF\s+[\d,\.]+\s+[\d,\.]+\s+([\d]+[,\.]\d{2})/i);
  const irpf = irpfMatch ? parseAmount(irpfMatch[1]) : 0;

  // SS worker contribution
  const ssWorkerMatch = text.match(/Total\s+([\d]+[,\.]\d{2})\s+[\d]+[,\.]\d{2}/i);
  const ssWorker = ssWorkerMatch ? parseAmount(ssWorkerMatch[1]) : 0;

  // SS employer contribution (second total)
  const ssEmployerMatch = text.match(/Total\s+[\d]+[,\.]\d{2}\s+([\d]+[,\.]\d{2})/i);
  const ssEmployer = ssEmployerMatch ? parseAmount(ssEmployerMatch[1]) : 0;

  const totalCost = grossPay + ssEmployer;

  if (!employeeName || !period) return null;

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
  const bytes = new Uint8Array(pdfBytes);
  const doc = await pdfjs.getDocument({ data: bytes }).promise;
  const results: ParsedSummaryRow[] = [];

  let period = '';

  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p);
    const content = await page.getTextContent();
    const lines = (content.items as Array<TextItem | TextMarkedContent>)
      .filter((i): i is TextItem => 'str' in i)
      .map(i => i.str);
    const fullText = lines.join(' ');

    // Extract period from header
    if (!period) {
      const periodMatch = fullText.match(/Desde:\s+([A-ZÁÉÍÓÚ]+)\s+Hasta:/i);
      const yearMatch = fullText.match(/Eje\.\:\s+(\d{4})/i);
      if (periodMatch && yearMatch) {
        const months: Record<string, string> = {
          ENERO: '01', FEBRERO: '02', MARZO: '03', ABRIL: '04',
          MAYO: '05', JUNIO: '06', JULIO: '07', AGOSTO: '08',
          SEPTIEMBRE: '09', OCTUBRE: '10', NOVIEMBRE: '11', DICIEMBRE: '12',
        };
        const m = months[periodMatch[1].toUpperCase()];
        period = m ? `${yearMatch[1]}-${m}` : '';
      }
    }

    // Each data row looks like: "00003 001 ROMAN SORIA JAIME 3571,43 0,00 0,00 270,83 0,00 0,00 805,36 2495,24 1414,59 0,00 4986,02"
    // Pattern: code space subcode space NAME (all caps) numbers...
    const rowPattern = /(\d{5})\s+(\d{3})\s+([A-ZÁÉÍÓÚÑÜ][A-Z\s]+?)\s+([\d,\.]+)\s+([\d,\.]+)\s+([\d,\.]+)\s+([\d,\.]+)\s+([\d,\.]+)\s+([\d,\.]+)\s+([\d,\.]+)\s+([\d,\.]+)\s+([\d,\.]+)\s+([\d,\.]+)\s+([\d,\.]+)/g;

    let match;
    while ((match = rowPattern.exec(fullText)) !== null) {
      const code = `${match[1]}-${match[2]}`;
      const name = match[3].trim();
      const grossPay = parseAmount(match[4]);
      // match[5] = anticipos, match[6] = embargos
      const ssWorker = parseAmount(match[7]);
      // match[8] = b.exenta, match[9] = b.especie
      const irpf = parseAmount(match[10]);
      const netPay = parseAmount(match[11]);
      const ssEmployer = parseAmount(match[12]);
      // match[13] = bonificaciones
      const totalCost = parseAmount(match[14]);

      results.push({
        employeeCode: code,
        employeeName: name,
        grossPay,
        netPay,
        irpf,
        ssWorker,
        ssEmployer,
        totalCost,
        companyId,
        period,
      });
    }
  }

  return results;
}

export async function extractPageAsPdf(pdfBytes: Buffer, pageIndex: number): Promise<Buffer> {
  const srcDoc = await PDFDocument.load(pdfBytes);
  const newDoc = await PDFDocument.create();
  const [page] = await newDoc.copyPages(srcDoc, [pageIndex]);
  newDoc.addPage(page);
  const bytes = await newDoc.save();
  return Buffer.from(bytes);
}
