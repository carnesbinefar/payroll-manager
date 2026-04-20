import { Router, Response } from 'express';
import multer from 'multer';
import { v4 as uuidv4 } from 'uuid';
import db from '../db';
import { requireAuth, AuthRequest } from '../middleware/auth';
import { parseIndividualPdf, parseSummaryPdf, extractPageAsPdf } from '../services/pdf.service';

const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 50 * 1024 * 1024 } });

// Detect company ID from filename. Filenames: REC00060MMYY.pdf or 0006020260226.pdf
function detectCompanyFromFilename(filename: string): string | null {
  const recMatch = filename.match(/^REC(\d{5})/i);
  if (recMatch) return recMatch[1];
  const summaryMatch = filename.match(/^(\d{5})/);
  if (summaryMatch) return summaryMatch[1];
  return null;
}

function detectTypeFromFilename(filename: string): 'individual' | 'summary' {
  return filename.toUpperCase().startsWith('REC') ? 'individual' : 'summary';
}

// Extract period from filename as fallback
// REC000600226.pdf → 0226 → 2026-02
// 0006020260226.pdf → 20260226 → 2026-02
function extractPeriodFromFilename(filename: string): string {
  const recMatch = filename.match(/^REC\d{5}(\d{2})(\d{2})\.pdf$/i);
  if (recMatch) return `20${recMatch[2]}-${recMatch[1]}`;
  const summaryMatch = filename.match(/^\d{5}(\d{4})(\d{2})\d{2}\.pdf$/i);
  if (summaryMatch) return `${summaryMatch[1]}-${summaryMatch[2]}`;
  return '';
}

// POST /api/payroll/reset — wipe all data (requires auth)
router.post('/reset', requireAuth, (_req: AuthRequest, res: Response): void => {
  db.exec('PRAGMA foreign_keys = OFF; DELETE FROM email_sends; DELETE FROM payroll_records; DELETE FROM payroll_uploads; DELETE FROM employees; DELETE FROM companies; PRAGMA foreign_keys = ON;');
  res.json({ ok: true });
});

// GET /api/payroll/uploads
router.get('/uploads', requireAuth, (_req: AuthRequest, res: Response) => {
  const uploads = db.prepare(`
    SELECT u.*, c.name as company_name
    FROM payroll_uploads u
    LEFT JOIN companies c ON c.id = u.company_id
    ORDER BY u.period DESC, u.uploaded_at DESC
  `).all();
  res.json(uploads);
});

// POST /api/payroll/upload — upload one or more PDFs
router.post('/upload', requireAuth, upload.array('files'), async (req: AuthRequest, res: Response): Promise<void> => {
  const files = req.files as Express.Multer.File[];
  if (!files?.length) {
    res.status(400).json({ error: 'No files uploaded' });
    return;
  }

  const results: Array<{ filename: string; status: string; error?: string }> = [];

  for (const file of files) {
    try {
      const companyId = detectCompanyFromFilename(file.originalname);
      if (!companyId) {
        results.push({ filename: file.originalname, status: 'error', error: 'Cannot detect company from filename' });
        continue;
      }

      const type = detectTypeFromFilename(file.originalname);

      // Ensure company exists
      const existingCompany = db.prepare('SELECT id FROM companies WHERE id = ?').get(companyId);
      if (!existingCompany) {
        db.prepare('INSERT OR IGNORE INTO companies (id, name) VALUES (?, ?)').run(companyId, `Empresa ${companyId}`);
      }

      // Parse to extract period, fallback to filename
      let period = '';
      if (type === 'individual') {
        const payslips = await parseIndividualPdf(file.buffer, companyId);
        period = payslips[0]?.period || '';
      } else {
        const rows = await parseSummaryPdf(file.buffer, companyId);
        period = rows[0]?.period || '';
      }
      if (!period) period = extractPeriodFromFilename(file.originalname);

      if (!period) {
        results.push({ filename: file.originalname, status: 'error', error: 'Cannot extract period from PDF' });
        continue;
      }

      const uploadId = uuidv4();
      db.prepare(`
        INSERT INTO payroll_uploads (id, company_id, period, filename, type, pdf_data)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(uploadId, companyId, period, file.originalname, type, file.buffer);

      results.push({ filename: file.originalname, status: 'ok' });
    } catch (err) {
      console.error(`Error processing ${file.originalname}:`, err);
      results.push({ filename: file.originalname, status: 'error', error: String(err) });
    }
  }

  res.json({ results });
});

// POST /api/payroll/process/:uploadId — parse PDF and create payroll records
router.post('/process/:uploadId', requireAuth, async (req: AuthRequest, res: Response): Promise<void> => {
  const upload = db.prepare('SELECT * FROM payroll_uploads WHERE id = ?').get(req.params.uploadId) as {
    id: string; company_id: string; period: string; type: string; pdf_data: Buffer; processed: number;
  } | undefined;

  if (!upload) {
    res.status(404).json({ error: 'Upload not found' });
    return;
  }

  try {
    if (upload.type === 'individual') {
      const payslips = await parseIndividualPdf(upload.pdf_data, upload.company_id);

      const processOne = db.transaction((payslips: Awaited<ReturnType<typeof parseIndividualPdf>>) => {
        for (const p of payslips) {
          // Upsert employee
          const empId = `${p.companyId}-${p.employeeCode}`;
          db.prepare(`
            INSERT INTO employees (id, company_id, code, name, nif, nass, category, centro, domicilio, poblacion, contrato, antiguedad, cif_empresa, ccc)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(id) DO UPDATE SET
              name = excluded.name,
              nif = excluded.nif,
              nass = excluded.nass,
              category = excluded.category,
              centro = excluded.centro,
              domicilio = excluded.domicilio,
              poblacion = excluded.poblacion,
              contrato = excluded.contrato,
              antiguedad = excluded.antiguedad,
              cif_empresa = excluded.cif_empresa,
              ccc = excluded.ccc
          `).run(empId, p.companyId, p.employeeCode, p.employeeName, p.nif, p.nass, p.category,
                 p.centro, p.domicilio, p.poblacion, p.contrato, p.antiguedad, p.cifEmpresa, p.ccc);

          // Update company name if we got it
          if (p.companyName) {
            db.prepare('UPDATE companies SET name = ? WHERE id = ?').run(p.companyName, p.companyId);
          }

          // Upsert payroll record
          const recordId = uuidv4();
          db.prepare(`
            INSERT INTO payroll_records (id, employee_id, company_id, period, gross_pay, net_pay, irpf, ss_worker, ss_employer, total_cost)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(employee_id, period) DO UPDATE SET
              gross_pay = excluded.gross_pay,
              net_pay = excluded.net_pay,
              irpf = excluded.irpf,
              ss_worker = excluded.ss_worker,
              ss_employer = excluded.ss_employer,
              total_cost = excluded.total_cost
          `).run(recordId, empId, p.companyId, p.period, p.grossPay, p.netPay, p.irpf, p.ssWorker, p.ssEmployer, p.totalCost);
        }
      });

      processOne(payslips);

      // Extract individual PDFs per page and store
      for (const p of payslips) {
        try {
          const pagePdf = await extractPageAsPdf(upload.pdf_data, p.pageIndex);
          const empId = `${p.companyId}-${p.employeeCode}`;
          db.prepare(`
            UPDATE payroll_records SET payslip_pdf = ? WHERE employee_id = ? AND period = ?
          `).run(pagePdf, empId, p.period);
        } catch (err) {
          console.error(`Error extracting page ${p.pageIndex}:`, err);
        }
      }

      db.prepare('UPDATE payroll_uploads SET processed = 1 WHERE id = ?').run(upload.id);
      res.json({ processed: payslips.length });
    } else {
      // Summary PDF — update financial data from summary
      const rows = await parseSummaryPdf(upload.pdf_data, upload.company_id);

      const processSummary = db.transaction((rows: Awaited<ReturnType<typeof parseSummaryPdf>>) => {
        for (const row of rows) {
          const empId = `${row.companyId}-${row.employeeCode}`;
          db.prepare(`
            INSERT OR IGNORE INTO employees (id, company_id, code, name) VALUES (?, ?, ?, ?)
          `).run(empId, row.companyId, row.employeeCode, row.employeeName);

          const recordId = uuidv4();
          db.prepare(`
            INSERT INTO payroll_records (id, employee_id, company_id, period, gross_pay, net_pay, irpf, ss_worker, ss_employer, total_cost)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(employee_id, period) DO UPDATE SET
              gross_pay = excluded.gross_pay,
              net_pay = excluded.net_pay,
              irpf = excluded.irpf,
              ss_worker = excluded.ss_worker,
              ss_employer = excluded.ss_employer,
              total_cost = excluded.total_cost
          `).run(recordId, empId, row.companyId, row.period, row.grossPay, row.netPay, row.irpf, row.ssWorker, row.ssEmployer, row.totalCost);
        }
      });

      processSummary(rows);
      db.prepare('UPDATE payroll_uploads SET processed = 1 WHERE id = ?').run(upload.id);
      res.json({ processed: rows.length });
    }
  } catch (err) {
    console.error('Process error:', err);
    res.status(500).json({ error: String(err) });
  }
});

// GET /api/payroll/records — all payroll records with filters
router.get('/records', requireAuth, (req: AuthRequest, res: Response) => {
  const { period, company_id, employee_id } = req.query;
  let query = `
    SELECT r.*, e.name as employee_name, e.email as employee_email, c.name as company_name
    FROM payroll_records r
    JOIN employees e ON e.id = r.employee_id
    JOIN companies c ON c.id = r.company_id
    WHERE 1=1
  `;
  const params: string[] = [];
  if (period) { query += ' AND r.period = ?'; params.push(String(period)); }
  if (company_id) { query += ' AND r.company_id = ?'; params.push(String(company_id)); }
  if (employee_id) { query += ' AND r.employee_id = ?'; params.push(String(employee_id)); }
  query += ' ORDER BY r.period DESC, e.name ASC';

  const records = db.prepare(query).all(...params);
  res.json(records);
});

// GET /api/payroll/dashboard — yearly summary
router.get('/dashboard', requireAuth, (_req: AuthRequest, res: Response) => {
  const monthly = db.prepare(`
    SELECT
      period,
      SUM(gross_pay) as total_gross,
      SUM(net_pay) as total_net,
      SUM(irpf) as total_irpf,
      SUM(ss_worker) as total_ss_worker,
      SUM(ss_employer) as total_ss_employer,
      SUM(total_cost) as total_cost,
      COUNT(DISTINCT employee_id) as employee_count
    FROM payroll_records
    GROUP BY period
    ORDER BY period ASC
  `).all();

  const byCompany = db.prepare(`
    SELECT
      c.id as company_id,
      c.name as company_name,
      COUNT(DISTINCT e.id) as employee_count,
      SUM(r.gross_pay) as total_gross,
      SUM(r.total_cost) as total_cost
    FROM companies c
    LEFT JOIN employees e ON e.company_id = c.id
    LEFT JOIN payroll_records r ON r.company_id = c.id
    GROUP BY c.id
  `).all();

  const totals = db.prepare(`
    SELECT
      COUNT(DISTINCT employee_id) as total_employees,
      SUM(gross_pay) as ytd_gross,
      SUM(total_cost) as ytd_cost
    FROM payroll_records
    WHERE period LIKE ?
  `).get(`${new Date().getFullYear()}-%`);

  const byCentro = db.prepare(`
    SELECT
      COALESCE(e.centro, 'Sin centro') as centro,
      COUNT(DISTINCT e.id) as employee_count,
      SUM(r.gross_pay) as total_gross,
      SUM(r.total_cost) as total_cost
    FROM employees e
    LEFT JOIN payroll_records r ON r.employee_id = e.id
    GROUP BY e.centro
    ORDER BY total_gross DESC
  `).all();

  res.json({ monthly, byCompany, byCentro, totals });
});

// GET /api/payroll/records/:id/pdf — download individual payslip
router.get('/records/:id/pdf', requireAuth, (req: AuthRequest, res: Response): void => {
  const record = db.prepare('SELECT payslip_pdf, employee_id, period FROM payroll_records WHERE id = ?').get(req.params.id) as {
    payslip_pdf: Buffer; employee_id: string; period: string;
  } | undefined;

  if (!record?.payslip_pdf) {
    res.status(404).json({ error: 'No PDF available for this record' });
    return;
  }
  res.set('Content-Type', 'application/pdf');
  res.set('Content-Disposition', `attachment; filename="nomina_${record.employee_id}_${record.period}.pdf"`);
  res.send(record.payslip_pdf);
});

export default router;
