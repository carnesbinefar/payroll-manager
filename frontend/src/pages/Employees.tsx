import { useEffect, useState } from 'react';
import { Pencil, Check, X, Mail, Search } from 'lucide-react';
import { api } from '../utils/api';
import { formatEur, formatPeriodLong } from '../utils/format';
import type { Employee } from '../types';

export default function Employees() {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [search, setSearch] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editEmail, setEditEmail] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    api.get<Employee[]>('/employees').then(setEmployees).catch(e => setError(e.message));
  }, []);

  const filtered = employees.filter(e =>
    e.name.toLowerCase().includes(search.toLowerCase()) ||
    e.company_name.toLowerCase().includes(search.toLowerCase()) ||
    (e.email || '').toLowerCase().includes(search.toLowerCase()),
  );

  const startEdit = (emp: Employee) => {
    setEditingId(emp.id);
    setEditEmail(emp.email || '');
  };

  const cancelEdit = () => { setEditingId(null); setEditEmail(''); };

  const saveEmail = async (emp: Employee) => {
    setSaving(true);
    try {
      await api.patch(`/employees/${emp.id}/email`, { email: editEmail });
      setEmployees(prev => prev.map(e => e.id === emp.id ? { ...e, email: editEmail || null } : e));
      setEditingId(null);
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Error al guardar');
    } finally {
      setSaving(false);
    }
  };

  if (error) return <div className="p-8 text-red-600">Error: {error}</div>;

  const withEmail = employees.filter(e => e.email).length;
  const withoutEmail = employees.length - withEmail;

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold">Empleados</h1>
          <p className="text-gray-500 text-sm mt-1">
            {employees.length} empleados · {withEmail} con email · {withoutEmail} sin email
          </p>
        </div>
      </div>

      <div className="relative">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
        <input
          type="text"
          placeholder="Buscar por nombre, empresa o email..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="w-full pl-9 pr-4 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
        />
      </div>

      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-100">
                <th className="px-4 py-3 text-left font-medium text-gray-500">Nombre</th>
                <th className="px-4 py-3 text-left font-medium text-gray-500">Empresa</th>
                <th className="px-4 py-3 text-left font-medium text-gray-500">Categoría</th>
                <th className="px-4 py-3 text-left font-medium text-gray-500">Email nómina</th>
                <th className="px-4 py-3 text-right font-medium text-gray-500">Último neto</th>
                <th className="px-4 py-3 text-right font-medium text-gray-500">Período</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {filtered.map(emp => (
                <tr key={emp.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-4 py-3 font-medium">{emp.name}</td>
                  <td className="px-4 py-3 text-gray-500 text-xs">{emp.company_name}</td>
                  <td className="px-4 py-3 text-gray-500 text-xs">{emp.category || '—'}</td>
                  <td className="px-4 py-3">
                    {editingId === emp.id ? (
                      <div className="flex items-center gap-2">
                        <input
                          type="email"
                          value={editEmail}
                          onChange={e => setEditEmail(e.target.value)}
                          placeholder="email@ejemplo.com"
                          className="border border-gray-300 rounded px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-brand-500 w-48"
                          autoFocus
                          onKeyDown={e => {
                            if (e.key === 'Enter') saveEmail(emp);
                            if (e.key === 'Escape') cancelEdit();
                          }}
                        />
                        <button
                          onClick={() => saveEmail(emp)}
                          disabled={saving}
                          className="p-1 text-green-600 hover:bg-green-50 rounded"
                        >
                          <Check size={14} />
                        </button>
                        <button onClick={cancelEdit} className="p-1 text-gray-400 hover:bg-gray-100 rounded">
                          <X size={14} />
                        </button>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2">
                        {emp.email ? (
                          <span className="flex items-center gap-1 text-gray-700">
                            <Mail size={12} className="text-brand-500" />
                            {emp.email}
                          </span>
                        ) : (
                          <span className="text-gray-300 text-xs italic">Sin email</span>
                        )}
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right text-gray-700">
                    {emp.last_net != null ? formatEur(emp.last_net) : '—'}
                  </td>
                  <td className="px-4 py-3 text-right text-gray-400 text-xs">
                    {emp.last_period ? formatPeriodLong(emp.last_period) : '—'}
                  </td>
                  <td className="px-4 py-3 text-right">
                    {editingId !== emp.id && (
                      <button
                        onClick={() => startEdit(emp)}
                        className="p-1.5 text-gray-400 hover:text-brand-600 hover:bg-brand-50 rounded transition-colors"
                        title="Editar email"
                      >
                        <Pencil size={14} />
                      </button>
                    )}
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-4 py-12 text-center text-gray-400">
                    {search ? 'No se encontraron resultados' : 'Sin empleados. Sube PDFs de nóminas primero.'}
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
