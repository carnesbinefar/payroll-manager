import { Router, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import db from '../db';
import { requireAuth, AuthRequest } from '../middleware/auth';
import { sendPayslipEmail } from '../services/email.service';

const router = Router();

// POST /api/email/send-period — queue and send all payslips for a period
router.post('/send-period', requireAuth, async (req: AuthRequest, res: Response): Promise<void> => {
  const { period, company_id } = req.body;
  if (!period) { res.status(400).json({ error: 'period required' }); return; }

  let query = `
    SELECT r.id, r.payslip_pdf, r.period, r.company_id,
           e.name as employee_name, e.email as employee_email,
           c.name as company_name
    FROM payroll_records r
    JOIN employees e ON e.id = r.employee_id
    JOIN companies c ON c.id = r.company_id
    WHERE r.period = ? AND e.email IS NOT NULL AND e.email != ''
  `;
  const params: string[] = [period];
  if (company_id) { query += ' AND r.company_id = ?'; params.push(company_id); }

  const records = db.prepare(query).all(...params) as Array<{
    id: string; payslip_pdf: Buffer; period: string; company_id: string;
    employee_name: string; employee_email: string; company_name: string;
  }>;

  if (!records.length) {
    res.status(400).json({ error: 'No records with email found for this period' });
    return;
  }

  // Create pending sends
  const sendIds: string[] = [];
  for (const record of records) {
    const existing = db.prepare('SELECT id FROM email_sends WHERE payroll_record_id = ? AND status = ?').get(record.id, 'sent');
    if (existing) continue; // already sent

    const sendId = uuidv4();
    db.prepare(`
      INSERT INTO email_sends (id, payroll_record_id, employee_id, email, status)
      SELECT ?, ?, r.employee_id, e.email, 'pending'
      FROM payroll_records r
      JOIN employees e ON e.id = r.employee_id
      WHERE r.id = ?
    `).run(sendId, record.id, record.id);
    sendIds.push(sendId);
  }

  res.json({ queued: sendIds.length });

  // Process sends in background
  processSends(records).catch(console.error);
});

// POST /api/email/send/:recordId — send single payslip
router.post('/send/:recordId', requireAuth, async (req: AuthRequest, res: Response): Promise<void> => {
  const record = db.prepare(`
    SELECT r.id, r.payslip_pdf, r.period,
           e.name as employee_name, e.email as employee_email,
           c.name as company_name
    FROM payroll_records r
    JOIN employees e ON e.id = r.employee_id
    JOIN companies c ON c.id = r.company_id
    WHERE r.id = ?
  `).get(req.params.recordId) as {
    id: string; payslip_pdf: Buffer; period: string;
    employee_name: string; employee_email: string; company_name: string;
  } | undefined;

  if (!record) { res.status(404).json({ error: 'Record not found' }); return; }
  if (!record.employee_email) { res.status(400).json({ error: 'Employee has no email' }); return; }

  const sendId = uuidv4();
  db.prepare(`
    INSERT INTO email_sends (id, payroll_record_id, employee_id, email, status)
    SELECT ?, ?, r.employee_id, e.email, 'pending'
    FROM payroll_records r
    JOIN employees e ON e.id = r.employee_id
    WHERE r.id = ?
  `).run(sendId, record.id, record.id);

  res.json({ sendId });

  // Send immediately
  try {
    await attemptSend(sendId, record);
  } catch (err) {
    console.error('Send error:', err);
  }
});

// POST /api/email/retry/:sendId — retry a failed send
router.post('/retry/:sendId', requireAuth, async (req: AuthRequest, res: Response): Promise<void> => {
  const send = db.prepare('SELECT * FROM email_sends WHERE id = ? AND status = ?').get(req.params.sendId, 'failed') as {
    id: string; payroll_record_id: string; email: string;
  } | undefined;

  if (!send) { res.status(404).json({ error: 'Failed send not found' }); return; }

  const record = db.prepare(`
    SELECT r.id, r.payslip_pdf, r.period,
           e.name as employee_name, e.email as employee_email,
           c.name as company_name
    FROM payroll_records r
    JOIN employees e ON e.id = r.employee_id
    JOIN companies c ON c.id = r.company_id
    WHERE r.id = ?
  `).get(send.payroll_record_id) as {
    id: string; payslip_pdf: Buffer; period: string;
    employee_name: string; employee_email: string; company_name: string;
  } | undefined;

  if (!record) { res.status(404).json({ error: 'Record not found' }); return; }

  db.prepare("UPDATE email_sends SET status = 'pending' WHERE id = ?").run(send.id);
  res.json({ ok: true });

  try {
    await attemptSend(send.id, record);
  } catch (err) {
    console.error('Retry error:', err);
  }
});

// GET /api/email/sends — list all sends
router.get('/sends', requireAuth, (req: AuthRequest, res: Response) => {
  const { period } = req.query;
  let query = `
    SELECT s.*, e.name as employee_name, c.name as company_name, r.period
    FROM email_sends s
    JOIN payroll_records r ON r.id = s.payroll_record_id
    JOIN employees e ON e.id = s.employee_id
    JOIN companies c ON c.id = r.company_id
    WHERE 1=1
  `;
  const params: string[] = [];
  if (period) { query += ' AND r.period = ?'; params.push(String(period)); }
  query += ' ORDER BY s.created_at DESC';

  res.json(db.prepare(query).all(...params));
});

async function attemptSend(sendId: string, record: {
  id: string; payslip_pdf: Buffer; period: string;
  employee_name: string; employee_email: string; company_name: string;
}): Promise<void> {
  const send = db.prepare('SELECT attempts FROM email_sends WHERE id = ?').get(sendId) as { attempts: number } | undefined;
  const attempts = (send?.attempts || 0) + 1;

  try {
    if (!record.payslip_pdf) throw new Error('No PDF available for this payslip');

    await sendPayslipEmail({
      to: record.employee_email,
      employeeName: record.employee_name,
      period: record.period,
      pdfBuffer: record.payslip_pdf,
      companyName: record.company_name,
    });

    db.prepare(`
      UPDATE email_sends SET status = 'sent', attempts = ?, sent_at = datetime('now'), last_error = NULL WHERE id = ?
    `).run(attempts, sendId);
  } catch (err) {
    db.prepare(`
      UPDATE email_sends SET status = 'failed', attempts = ?, last_error = ? WHERE id = ?
    `).run(attempts, String(err), sendId);
  }
}

async function processSends(records: Array<{
  id: string; payslip_pdf: Buffer; period: string;
  employee_name: string; employee_email: string; company_name: string;
}>): Promise<void> {
  for (const record of records) {
    const send = db.prepare('SELECT id FROM email_sends WHERE payroll_record_id = ? AND status = ?').get(record.id, 'pending') as { id: string } | undefined;
    if (!send) continue;
    await attemptSend(send.id, record);
    await new Promise(r => setTimeout(r, 300)); // rate limit
  }
}

export default router;
