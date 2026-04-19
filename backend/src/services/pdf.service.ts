import { PDFDocument } from 'pdf-lib';
// eslint-disable-next-line @typescript-eslint/no-require-imports
const pdfParse = require('pdf-parse') as (buf: Buffer, opts?: Record<string, unknown>) => Promise<{ text: string; numpages: number }>;

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

async function extractAllPagesText(pdfBytes: Buffer): Promise<string[]> {
  const pageTexts: string[] = [];

  await pdfParse(pdfBytes, {
    pagerender: (pageData: { getTextContent: () => Promise<{ items: Array<{ str?: string }> }> }) =>
      pageData.getTextContent().then(content => {
        const text = content.items.map(i => i.str || '').join(' ');
        pageTexts.push(text);
        return text;
      }),
  });

  return pageTexts;
}

export async function parseIndividualPdf(
  pdfBytes: Buffer,
  companyId: string,
): Promise<ParsedPayslip[]> {
  const pageTexts = await extractAllPagesText(pdfBytes);
  const results: ParsedPayslip[] = [];

  for (let i = 0; i < pageTexts.length; i++) {
    const payslip = parsePayslipText(pageTexts[i], i, companyId);
    if (payslip) results.push(payslip);
  }
  return results;
}

function parsePayslipText(text: string, pageIndex: number, companyId: string): ParsedPayslip | null {
  const nameMatch = text.match(/Trabajador\/a\s+([A-ZÁÉÍÓÚÑÜ][A-ZÁÉÍÓÚÑÜ ,.-]+?)(?:Centro|Categor)/i);
  const employeeName = nameMatch ? nameMatch[1].trim() : '';

  const nifMatch = text.match(/N\.I\.F\.\s+(\w+)/i);
  const nif = nifMatch ? nifMatch[1] : '';

  const nassMatch = text.match(/N\.A\.S\.S\.\s+(\d+)/i);
  const nass = nassMatch ? nassMatch[1] : '';

  const codeMatch = text.match(/C[oó]digo\s+([\d\/\-]+)/i);
  let employeeCode = '';
  if (codeMatch) {
    const parts = codeMatch[1].split('/');
    employeeCode = parts[parts.length - 1]?.trim() || codeMatch[1].trim();
  }

  const companyMatch = text.match(/Empresa\s+([A-ZÁÉÍÓÚÑÜ][A-Z\s,\.]+?)(?:Trabajador|Centro)/i);
  const companyName = companyMatch ? companyMatch[1].trim() : '';

  const categoryMatch = text.match(/Categor[íi]a\s+([A-ZÁÉÍÓÚÑÜ][A-Z\s\(\)]+?)(?:Domicilio|Puesto|$)/i);
  const category = categoryMatch ? categoryMatch[1].trim() : '';

  const period = parsePeriod(text);

  const devengadoMatch = text.match(/T\.\s*Devengado[^T]*?([\d]+[,\.]\d{2})/i);
  const grossPay = devengadoMatch ? parseAmount(devengadoMatch[1]) : 0;

  const liquidoMatch = text.match(/L[íi]quido\s+([\d]+[,\.]\d{2})/i);
  const netPay = liquidoMatch ? parseAmount(liquidoMatch[1]) : 0;

  const irpfMatch = text.match(/Descuentos IRPF\s+[\d,\.]+\s+[\d,\.]+\s+([\d]+[,\.]\d{2})/i);
  const irpf = irpfMatch ? parseAmount(irpfMatch[1]) : 0;

  const ssWorkerMatch = text.match(/Total\s+([\d]+[,\.]\d{2})\s+[\d]+[,\.]\d{2}/i);
  const ssWorker = ssWorkerMatch ? parseAmount(ssWorkerMatch[1]) : 0;

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
  const pageTexts = await extractAllPagesText(pdfBytes);
  const results: ParsedSummaryRow[] = [];
  let period = '';

  for (const fullText of pageTexts) {
    if (!period) {
      const periodMatch = fullText.match(/Desde:\s+([A-ZÁÉÍÓÚ]+)\s+Hasta:/i);
      const yearMatch = fullText.match(/Eje\.:\s+(\d{4})/i);
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

    const rowPattern = /(\d{5})\s+(\d{3})\s+([A-ZÁÉÍÓÚÑÜ][A-Z\s]+?)\s+([\d,\.]+)\s+([\d,\.]+)\s+([\d,\.]+)\s+([\d,\.]+)\s+([\d,\.]+)\s+([\d,\.]+)\s+([\d,\.]+)\s+([\d,\.]+)\s+([\d,\.]+)\s+([\d,\.]+)\s+([\d,\.]+)/g;
    let match;
    while ((match = rowPattern.exec(fullText)) !== null) {
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
