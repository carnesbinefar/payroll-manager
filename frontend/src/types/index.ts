export interface Company {
  id: string;
  name: string;
  nif: string | null;
}

export interface Employee {
  id: string;
  company_id: string;
  company_name: string;
  code: string;
  name: string;
  nif: string | null;
  nass: string | null;
  category: string | null;
  email: string | null;
  active: number;
  centro: string | null;
  domicilio: string | null;
  poblacion: string | null;
  contrato: string | null;
  antiguedad: string | null;
  cif_empresa: string | null;
  ccc: string | null;
  last_period: string | null;
  last_gross: number | null;
  last_net: number | null;
}

export interface PayrollRecord {
  id: string;
  employee_id: string;
  employee_name: string;
  employee_email: string | null;
  company_id: string;
  company_name: string;
  period: string;
  gross_pay: number;
  net_pay: number;
  irpf: number;
  ss_worker: number;
  ss_employer: number;
  total_cost: number;
}

export interface PayrollUpload {
  id: string;
  company_id: string;
  company_name: string;
  period: string;
  filename: string;
  type: 'individual' | 'summary';
  uploaded_at: string;
  processed: number;
}

export interface EmailSend {
  id: string;
  payroll_record_id: string;
  employee_id: string;
  employee_name: string;
  company_name: string;
  email: string;
  status: 'pending' | 'sent' | 'failed';
  attempts: number;
  last_error: string | null;
  sent_at: string | null;
  created_at: string;
  period: string;
}

export interface DashboardData {
  monthly: Array<{
    period: string;
    total_gross: number;
    total_net: number;
    total_irpf: number;
    total_ss_worker: number;
    total_ss_employer: number;
    total_cost: number;
    employee_count: number;
  }>;
  byCompany: Array<{
    company_id: string;
    company_name: string;
    employee_count: number;
    total_gross: number;
    total_cost: number;
  }>;
  byCentro: Array<{
    centro: string;
    employee_count: number;
    total_gross: number;
    total_cost: number;
  }>;
  totals: {
    total_employees: number;
    ytd_gross: number;
    ytd_cost: number;
  };
}
