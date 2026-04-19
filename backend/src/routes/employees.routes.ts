import { Router, Response } from 'express';
import db from '../db';
import { requireAuth, AuthRequest } from '../middleware/auth';

const router = Router();

router.get('/', requireAuth, (_req: AuthRequest, res: Response) => {
  const employees = db.prepare(`
    SELECT e.*, c.name as company_name,
      (SELECT r.period FROM payroll_records r WHERE r.employee_id = e.id ORDER BY r.period DESC LIMIT 1) as last_period,
      (SELECT r.gross_pay FROM payroll_records r WHERE r.employee_id = e.id ORDER BY r.period DESC LIMIT 1) as last_gross,
      (SELECT r.net_pay FROM payroll_records r WHERE r.employee_id = e.id ORDER BY r.period DESC LIMIT 1) as last_net
    FROM employees e
    JOIN companies c ON c.id = e.company_id
    ORDER BY c.id, e.name
  `).all();
  res.json(employees);
});

router.patch('/:id/email', requireAuth, (req: AuthRequest, res: Response): void => {
  const { email } = req.body;
  if (email !== null && email !== undefined) {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (email !== '' && !emailRegex.test(email)) {
      res.status(400).json({ error: 'Invalid email address' });
      return;
    }
  }
  const result = db.prepare('UPDATE employees SET email = ? WHERE id = ?').run(email || null, req.params.id);
  if (result.changes === 0) {
    res.status(404).json({ error: 'Employee not found' });
    return;
  }
  res.json({ ok: true });
});

export default router;
