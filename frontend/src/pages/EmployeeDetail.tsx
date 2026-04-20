import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { ArrowLeft, Download, Mail, Pencil, Check, X } from 'lucide-react';
import { api } from '../utils/api';
import { formatEur, formatPeriodLong } from '../utils/format';
import type { Employee, PayrollRecord } from '../types';

export default function EmployeeDetail() {
  const { id } = useParams<{ id: string }>();
  const [employee, setEmployee] = useState<Employee | null>(null);
  const [records, setRecords] = useState<PayrollRecord[]>([]);
  const [editingEmail, setEditingEmail] = useState(false);
  const [editEmail, setEditEmail] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!id) return;
    api.get<Employee>(`/employees/${id}`)
      .then(emp => { setEmployee(emp); setEditEmail(emp.email || ''); })
      .catch(e => setError(e.message));
    api.get<PayrollRecord[]>(`/payroll/records?employee_id=${encodeURIComponent(id)}`)
      .then(setRecords)
      .catch(console.error);
  }, [id]);

  const saveEmail = async () => {
    if (!employee) return;
    setSaving(true);
    try {
      await api.patch(`/employees/${employee.id}/email`, { email: editEmail });
      setEmployee(prev => prev ? { ...prev, email: editEmail || null } : null);
      setEditingEmail(false);
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Error al guardar');
    } finally {
      setSaving(false);
    }
  };

  if (error) return <div className="p-8 text-red-600">Error: {error}</div>;
  if (!employee) return <div className="p-8 text-gray-400">Cargando...</div>;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Link
          to="/employees"
          className="p-2 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
        >
          <ArrowLeft size={18} />
        </Link>
        <div>
          <h1 className="text-2xl font-bold">{employee.name}</h1>
          <p className="text-gray-500 text-sm mt-0.5">{employee.company_name}</p>
        </div>
      </div>

      <div className="card p-6 grid grid-cols-2 md:grid-cols-4 gap-6">
        <div>
          <p className="text-xs text-gray-400 uppercase tracking-wide mb-1">NIF</p>
          <p className="font-medium">{employee.nif || '—'}</p>
        </div>
        <div>
          <p className="text-xs text-gray-400 uppercase tracking-wide mb-1">NASS</p>
          <p className="font-medium">{employee.nass || '—'}</p>
        </div>
        <div>
          <p className="text-xs text-gray-400 uppercase tracking-wide mb-1">Categoría</p>
          <p className="font-medium">{employee.category || '—'}</p>
        </div>
        <div>
          <p className="text-xs text-gray-400 uppercase tracking-wide mb-1">Email nómina</p>
          {editingEmail ? (
            <div className="flex items-center gap-1">
              <input
                type="email"
                value={editEmail}
                onChange={e => setEditEmail(e.target.value)}
                className="border border-gray-300 rounded px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-brand-500 w-40"
                autoFocus
                onKeyDown={e => {
                  if (e.key === 'Enter') saveEmail();
                  if (e.key === 'Escape') setEditingEmail(false);
                }}
              />
              <button onClick={saveEmail} disabled={saving} className="p-1 text-green-600 hover:bg-green-50 rounded">
                <Check size={12} />
              </button>
              <button onClick={() => setEditingEmail(false)} className="p-1 text-gray-400 hover:bg-gray-100 rounded">
                <X size={12} />
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              {employee.email ? (
                <span className="flex items-center gap-1 text-sm">
                  <Mail size={12} className="text-brand-500" />
                  {employee.email}
                </span>
              ) : (
                <span className="text-gray-400 italic text-xs">Sin email</span>
              )}
              <button
                onClick={() => setEditingEmail(true)}
                className="p-1 text-gray-400 hover:text-brand-600 rounded"
              >
                <Pencil size={12} />
              </button>
            </div>
          )}
        </div>
      </div>

      <div className="card overflow-hidden">
        <div className="px-4 py-3 bg-gray-50 border-b border-gray-100">
          <h2 className="font-medium">Nóminas ({records.length})</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 text-xs">
                <th className="px-4 py-3 text-left font-medium text-gray-500">Período</th>
                <th className="px-4 py-3 text-right font-medium text-gray-500">Bruto</th>
                <th className="px-4 py-3 text-right font-medium text-gray-500">Neto</th>
                <th className="px-4 py-3 text-right font-medium text-gray-500">IRPF</th>
                <th className="px-4 py-3 text-right font-medium text-gray-500">SS Trab.</th>
                <th className="px-4 py-3 text-right font-medium text-gray-500">SS Emp.</th>
                <th className="px-4 py-3 text-right font-medium text-gray-500">Coste total</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {records.map(r => (
                <tr key={r.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-4 py-3 font-medium">{formatPeriodLong(r.period)}</td>
                  <td className="px-4 py-3 text-right">{formatEur(r.gross_pay)}</td>
                  <td className="px-4 py-3 text-right font-semibold text-green-700">{formatEur(r.net_pay)}</td>
                  <td className="px-4 py-3 text-right text-red-600">{formatEur(r.irpf)}</td>
                  <td className="px-4 py-3 text-right text-red-600">{formatEur(r.ss_worker)}</td>
                  <td className="px-4 py-3 text-right text-orange-600">{formatEur(r.ss_employer)}</td>
                  <td className="px-4 py-3 text-right font-semibold">{formatEur(r.total_cost)}</td>
                  <td className="px-4 py-3 text-right">
                    <button
                      onClick={() =>
                        api.downloadPdf(
                          `/payroll/records/${r.id}/pdf`,
                          `nomina_${employee.name}_${r.period}.pdf`,
                        ).catch(e => alert(e.message))
                      }
                      className="p-1.5 text-gray-400 hover:text-brand-600 hover:bg-brand-50 rounded transition-colors"
                      title="Descargar PDF"
                    >
                      <Download size={14} />
                    </button>
                  </td>
                </tr>
              ))}
              {records.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-4 py-12 text-center text-gray-400">
                    Sin registros de nóminas
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
