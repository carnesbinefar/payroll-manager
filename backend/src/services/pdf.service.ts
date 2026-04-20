import { PDFDocument } from 'pdf-lib';
import { execSync } from 'child_process';
import { writeFileSync, readFileSync, unlinkSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
// eslint-disable-next-line @typescript-eslint/no-require-imports
const pdfParse = require('pdf-parse') as (buf: Buffer, options?: { pagerender?: (pageData: any) => Promise<string> }) => Promise<{ text: string; numpages: number }>;

export interface ParsedPayslip {
  employeeCode: string;
  employeeName: string;
  nif: string;
  nass: string;
  companyId: string;
  companyName: string;
  cifEmpresa: string;
  ccc: string;
  centro: string;
  domicilio: string;
  poblacion: string;
  contrato: string;
  antiguedad: string;
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
  // Spanish payroll PDFs are owner-password protected. pdf-lib copies encrypted
  // streams → blank pages. Use gs (Ghostscript) to extract the page properly.
  const tag = `${Date.now()}_${Math.random().toString(36).slice(2)}`;
  const tmpIn = join(tmpdir(), `nom_in_${tag}.pdf`);
  const tmpOut = join(tmpdir(), `nom_out_${tag}.pdf`);
  try {
    writeFileSync(tmpIn, pdfBytes);
    const pageNum = pageIndex + 1;
    execSync(
      `gs -dBATCH -dNOPAUSE -sDEVICE=pdfwrite -dFirstPage=${pageNum} -dLastPage=${pageNum} -sOutputFile="${tmpOut}" "${tmpIn}"`,
      { stdio: 'ignore' },
    );
    return readFileSync(tmpOut);
  } catch {
    // gs not available — fall back to pdf-lib (may yield blank pages on encrypted PDFs)
    const srcDoc = await PDFDocument.load(pdfBytes, { ignoreEncryption: true });
    const newDoc = await PDFDocument.create();
    const [page] = await newDoc.copyPages(srcDoc, [pageIndex]);
    newDoc.addPage(page);
    return Buffer.from(await newDoc.save());
  } finally {
    for (const f of [tmpIn, tmpOut]) try { unlinkSync(f); } catch { /* ignore */ }
  }
}

export async function parseIndividualPdf(
  pdfBytes: Buffer,
  companyId: string,
): Promise<ParsedPayslip[]> {
  // Collect per-page text from the full (possibly encrypted) buffer.
  // pdf-parse / pdfjs-dist can decrypt the streams natively; pdf-lib
  // ignoreEncryption only skips the throw — it never decrypts content.
  const pageTexts: string[] = [];
  await pdfParse(pdfBytes, {
    pagerender: (pageData: any) =>
      pageData.getTextContent().then((tc: any) => {
        // Reproduce newline layout by Y position, same as pdf-parse default renderer
        let lastY: number | null = null;
        let text = '';
        for (const item of tc.items) {
          if (!item.str) continue;
          const y = Math.round(item.transform[5]);
          if (lastY === null) {
            text += item.str;
          } else if (y !== lastY) {
            text += '\n' + item.str;
          } else {
            text += ' ' + item.str;
          }
          lastY = y;
        }
        pageTexts.push(text);
        return text;
      }),
  });

  const results: ParsedPayslip[] = [];
  for (let i = 0; i < pageTexts.length; i++) {
    try {
      const payslip = parsePayslipText(pageTexts[i], i, companyId);
      if (payslip) results.push(payslip);
    } catch (err) {
      console.error(`Error parsing page ${i}:`, err);
    }
  }
  return results;
}

function extractFirstAmountAfter(text: string): number {
  // First number (format 1.234,56) that appears at the start of a line
  const m = text.match(/\n[\s]*([\d\.]+,\d{2})/);
  return m ? parseAmount(m[1]) : 0;
}

function parsePayslipText(text: string, pageIndex: number, companyId: string): ParsedPayslip | null {
  // Employee name: rest of line after "Trabajador/a" label
  const nameMatch = text.match(/Trabajador\/a\s+([^\n]+)/i);
  const employeeName = nameMatch ? nameMatch[1].trim() : '';

  // Company name: line immediately after "Empresa Trabajador/a ..."
  const companyMatch = text.match(/Empresa\s+Trabajador\/a[^\n]*\n([^\n]+)/i);
  const companyName = companyMatch ? companyMatch[1].trim() : '';

  // Work center: line after "Centro Categoría [cat]"
  const centroMatch = text.match(/Centro\s+Categor[íi]a[^\n]*\n([^\n]+)/i);
  const centro = centroMatch ? centroMatch[1].trim() : '';

  // Category: rest of line after "Categoría"
  const categoryMatch = text.match(/Categor[íi]a\s+([^\n]+)/i);
  const category = categoryMatch ? categoryMatch[1].trim() : '';

  // Domicilio + Contrato: both on the line after "Domicilio ... Contrato:"
  const domLineMatch = text.match(/Domicilio[^\n]*Contrato:[^\n]*\n([^\n]+)/i);
  const domLine = domLineMatch ? domLineMatch[1].trim() : '';
  const domTokens = domLine.split(/\s+/);
  const lastTok = domTokens[domTokens.length - 1] || '';
  const contrato = /^\d+$/.test(lastTok) ? lastTok : '';
  const domicilio = contrato ? domLine.replace(/\s+\d+\s*$/, '').trim() : domLine;

  // Población: 2 lines after "Población Antigüedad" (first line = antigüedad date)
  const pobMatch = text.match(/Poblaci[oó]n\s[^\n]*\n[^\n]*\n([^\n]+)/i);
  const poblacion = pobMatch ? pobMatch[1].trim() : '';

  // Antigüedad date
  const antMatch = text.match(/Antig[üu]edad\s*\n([^\n]+)/i);
  const antiguedad = antMatch ? antMatch[1].trim() : '';

  // CCC
  const cccMatch = text.match(/C\.C\.C\.\s+N\.A\.S\.S\.\s+(\S+)/i);
  const ccc = cccMatch ? cccMatch[1] : '';

  // Company CIF (B/A + 8 digits)
  const cifMatch = text.match(/\b([AB]\d{8})\b/);
  const cifEmpresa = cifMatch ? cifMatch[1] : '';

  // NIF or NIE (8digits+letter OR X/Y/Z+7digits+letter)
  const nifMatch = text.match(/\b([0-9]{8}[A-Z])\b/) || text.match(/\b([XYZ][0-9]{7}[A-Z])\b/);
  const nif = nifMatch ? nifMatch[1] : '';

  // NASS: skip CCC code (e.g. "22/1058800/68"), capture 12 digits
  const nassMatch = text.match(/N\.A\.S\.S\.\s+\S+\s+(\d{12})/i);
  const nass = nassMatch ? nassMatch[1] : '';

  // Employee code: look for companyId/empCode pattern (e.g. "00006/00003")
  const empCodeMatch = text.match(new RegExp(`\\b${companyId}\\/(\\d+)\\b`));
  let employeeCode = empCodeMatch ? empCodeMatch[1] : '';
  if (!employeeCode) {
    // fallback: generic "Código XXXXX/YYYYY"
    const codeMatch = text.match(/C[oó]digo\s+([\d\/\-]+)/i);
    if (codeMatch) {
      const parts = codeMatch[1].split('/');
      employeeCode = parts[parts.length - 1]?.trim() || codeMatch[1].trim();
    }
  }

  // Period
  const period = parsePeriod(text);

  // Gross + IRPF: from the IRPF deduction line "Descuentos IRPF [%] [base=gross] [irpf_amount]"
  // The base of IRPF is always the gross pay (T. Devengado) in Spanish payslips.
  const irpfLineMatch = text.match(/Descuentos\s+IRPF\s+[\d,\.]+\s+([\d\.]+,\d{2})\s+([\d\.]+,\d{2})/i);
  const grossPay = irpfLineMatch ? parseAmount(irpfLineMatch[1]) : 0;
  const irpf = irpfLineMatch ? parseAmount(irpfLineMatch[2]) : 0;

  // SS totals: anchor search after "Aportación Trabajador" header to avoid matching
  // the left sub-box "Total 2.072,16" which lands at the same Y as the Líquido value.
  const ssTotalMatch = text.match(/Aportaci[oó]n\s+Trabajador[\s\S]*?^Total\s+([\d\.]+,\d{2})\s+([\d\.]+,\d{2})/im);
  const ssWorker = ssTotalMatch ? parseAmount(ssTotalMatch[1]) : 0;
  const ssEmployer = ssTotalMatch ? parseAmount(ssTotalMatch[2]) : 0;

  // Net and total cost from accounting identities
  const netPay = Math.round((grossPay - irpf - ssWorker) * 100) / 100;
  const totalCost = grossPay + ssEmployer;

  if (!employeeName || !period) {
    console.warn(`Page ${pageIndex}: could not extract employee or period`);
    return null;
  }

  return {
    employeeCode, employeeName, nif, nass,
    companyId, companyName, cifEmpresa, ccc,
    centro, domicilio, poblacion, contrato, antiguedad,
    period, category,
    grossPay, netPay, irpf, ssWorker, ssEmployer, totalCost,
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
