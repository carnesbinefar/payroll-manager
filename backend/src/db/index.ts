import Database from 'better-sqlite3';
import { DB_PATH } from '../config';

const db = new Database(DB_PATH);

db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
  CREATE TABLE IF NOT EXISTS companies (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    nif TEXT
  );

  CREATE TABLE IF NOT EXISTS employees (
    id TEXT PRIMARY KEY,
    company_id TEXT NOT NULL REFERENCES companies(id),
    code TEXT NOT NULL,
    name TEXT NOT NULL,
    nif TEXT,
    nass TEXT,
    category TEXT,
    email TEXT,
    active INTEGER DEFAULT 1,
    centro TEXT,
    domicilio TEXT,
    poblacion TEXT,
    contrato TEXT,
    antiguedad TEXT,
    cif_empresa TEXT,
    ccc TEXT,
    UNIQUE(company_id, code)
  );

  CREATE TABLE IF NOT EXISTS payroll_uploads (
    id TEXT PRIMARY KEY,
    company_id TEXT NOT NULL REFERENCES companies(id),
    period TEXT NOT NULL,
    filename TEXT NOT NULL,
    type TEXT NOT NULL CHECK(type IN ('individual','summary')),
    pdf_data BLOB NOT NULL,
    uploaded_at TEXT DEFAULT (datetime('now')),
    processed INTEGER DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS payroll_records (
    id TEXT PRIMARY KEY,
    employee_id TEXT NOT NULL REFERENCES employees(id),
    company_id TEXT NOT NULL REFERENCES companies(id),
    period TEXT NOT NULL,
    gross_pay REAL DEFAULT 0,
    net_pay REAL DEFAULT 0,
    irpf REAL DEFAULT 0,
    ss_worker REAL DEFAULT 0,
    ss_employer REAL DEFAULT 0,
    total_cost REAL DEFAULT 0,
    payslip_pdf BLOB,
    UNIQUE(employee_id, period)
  );

  CREATE TABLE IF NOT EXISTS email_sends (
    id TEXT PRIMARY KEY,
    payroll_record_id TEXT NOT NULL REFERENCES payroll_records(id),
    employee_id TEXT NOT NULL,
    email TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','sent','failed')),
    attempts INTEGER DEFAULT 0,
    last_error TEXT,
    sent_at TEXT,
    created_at TEXT DEFAULT (datetime('now'))
  );
`);

// Migrations: add columns that may not exist in older DBs
for (const col of ['centro', 'domicilio', 'poblacion', 'contrato', 'antiguedad', 'cif_empresa', 'ccc']) {
  try { db.exec(`ALTER TABLE employees ADD COLUMN ${col} TEXT`); } catch { /* already exists */ }
}

export default db;
