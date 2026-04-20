import { useEffect, useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { Pencil, Check, X, Mail, Search, ChevronUp, ChevronDown, ChevronsUpDown } from 'lucide-react';
import { api } from '../utils/api';
import { formatEur, formatPeriodLong } from '../utils/format';
import type { Employee } from '../types';

type SortCol = 'name' | 'company' | 'category' | 'net' | 'period';
type SortDir = 'asc' | 'desc';

function SortIcon({ col, active, dir }: { col: string; active: SortCol; dir: SortDir }) {
  if (col !== active) return <ChevronsUpDown size={13} className="text-gray-300 inline ml-1" />;
  return dir === 'asc'
    ? <ChevronUp size={13} className="text-brand-600 inline ml-1" />
    : <ChevronDown size={13} className="text-brand-600 inline ml-1" />;
}

export default function Employees() {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [search, setSearch] = useState('');
  const [filterCompany, setFilterCompany] = useState('');
  const [filterCategory, setFilterCategory] = useState('');
  const [sortCol, setSortCol] = useState<SortCol>('name');
  const [sortDir, setSortDir] = useState<SortDir>('asc');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editEmail, setEditEmail] = useState('');
  const [editingCompanyId, setEditingCompanyId] = useState<string | null>(null);
  const [editCompanyName, setEditCompanyName] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    api.get<Employee[]>('/employees').then(setEmployees).catch(e => setError(e.message));
  }, []);

  const companies = useMemo(() => {
    const seen = new Map<string, string>();
    employees.forEach(e => seen.set(e.company_id, e.company_name));
    return Array.from(seen.entries()).map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name));
  }, [employees]);

  const categories = useMemo(() => {
    const cats = [...new Set(employees.map(e => e.category).filter(Boolean))] as string[];
    return cats.sort();
  }, [employees]);

  const filtered = useMemo(() => {
    let list = employees.filter(e =>
      (!filterCompany || e.company_id === filterCompany) &&
      (!filterCategory || e.category === filterCategory) &&
      (
        e.name.toLowerCase().includes(search.toLowerCase()) ||
        e.company_name.toLowerCase().includes(search.toLowerCase()) ||
        (e.email || '').toLowerCase().includes(search.toLowerCase())
      ),
    );

    list = [...list].sort((a, b) => {
      let av: string | number = '';
      let bv: string | number = '';
      if (sortCol === 'name') { av = a.name; bv = b.name; }
      else if (sortCol === 'company') { av = a.company_name; bv = b.company_name; }
      else if (sortCol === 'category') { av = a.category || ''; bv = b.category || ''; }
      else if (sortCol === 'net') { av = a.last_net ?? 0; bv = b.last_net ?? 0; }
      else if (sortCol === 'period') { av = a.last_period || ''; bv = b.last_period || ''; }
      const cmp = typeof av === 'number' ? av - (bv as number) : (av as string).localeCompare(bv as string);
      return sortDir === 'asc' ? cmp : -cmp;
    });

    return list;
  }, [employees, search, filterCompany, filterCategory, sortCol, sortDir]);

  const toggleSort = (col: SortCol) => {
    if (sortCol === col) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortCol(col); setSortDir('asc'); }
  };

  const startEdit = (emp: Employee) => { setEditingId(emp.id); setEditEmail(emp.email || ''); };
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

  const startEditCompany = (companyId: string, companyName: string) => {
    setEditingCompanyId(companyId);
    setEditCompanyName(companyName);
  };
  const cancelEditCompany = () => { setEditingCompanyId(null); setEditCompanyName(''); };
  const saveCompanyName = async (companyId: string) => {
    if (!editCompanyName.trim()) return;
    setSaving(true);
    try {
      await api.patch(`/employees/companies/${companyId}/name`, { name: editCompanyName.trim() });
      setEmployees(prev => prev.map(e => e.company_id === companyId ? { ...e, company_name: editCompanyName.trim() } : e));
      setEditingCompanyId(null);
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
      <div>
        <h1 className="text-2xl font-bold">Empleados</h1>
        <p className="text-gray-500 text-sm mt-1">
          {employees.length} empleados · {withEmail} con email · {withoutEmail} sin email
        </p>
      </div>

      <div className="flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-48">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            placeholder="Buscar por nombre, empresa o email..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full pl-9 pr-4 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
          />
        </div>
        <select
          value={filterCompany}
          onChange={e => setFilterCompany(e.target.value)}
          className="border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 bg-white"
        >
          <option value="">Todas las empresas</option>
          {companies.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <select
          value={filterCategory}
          onChange={e => setFilterCategory(e.target.value)}
          className="border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 bg-white"
        >
          <option value="">Todas las categorías</option>
          {categories.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
      </div>

      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-100">
                <th
                  className="px-4 py-3 text-left font-medium text-gray-500 cursor-pointer hover:text-gray-800 select-none"
                  onClick={() => toggleSort('name')}
                >
                  Nombre <SortIcon col="name" active={sortCol} dir={sortDir} />
                </th>
                <th
                  className="px-4 py-3 text-left font-medium text-gray-500 cursor-pointer hover:text-gray-800 select-none"
                  onClick={() => toggleSort('company')}
                >
                  Empresa <SortIcon col="company" active={sortCol} dir={sortDir} />
                </th>
                <th
                  className="px-4 py-3 text-left font-medium text-gray-500 cursor-pointer hover:text-gray-800 select-none"
                  onClick={() => toggleSort('category')}
                >
                  Categoría <SortIcon col="category" active={sortCol} dir={sortDir} />
                </th>
                <th className="px-4 py-3 text-left font-medium text-gray-500">Email nómina</th>
                <th
                  className="px-4 py-3 text-right font-medium text-gray-500 cursor-pointer hover:text-gray-800 select-none"
                  onClick={() => toggleSort('net')}
                >
                  Último neto <SortIcon col="net" active={sortCol} dir={sortDir} />
                </th>
                <th
                  className="px-4 py-3 text-right font-medium text-gray-500 cursor-pointer hover:text-gray-800 select-none"
                  onClick={() => toggleSort('period')}
                >
                  Período <SortIcon col="period" active={sortCol} dir={sortDir} />
                </th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {filtered.map(emp => (
                <tr key={emp.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-4 py-3 font-medium">
                    <Link
                      to={`/employees/${emp.id}`}
                      className="hover:text-brand-600 hover:underline"
                    >
                      {emp.name}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-gray-500 text-xs">
                    {editingCompanyId === emp.company_id ? (
                      <div className="flex items-center gap-1">
                        <input
                          type="text"
                          value={editCompanyName}
                          onChange={e => setEditCompanyName(e.target.value)}
                          className="border border-gray-300 rounded px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-brand-500 w-40"
                          autoFocus
                          onKeyDown={e => {
                            if (e.key === 'Enter') saveCompanyName(emp.company_id);
                            if (e.key === 'Escape') cancelEditCompany();
                          }}
                        />
                        <button onClick={() => saveCompanyName(emp.company_id)} disabled={saving} className="p-1 text-green-600 hover:bg-green-50 rounded"><Check size={12} /></button>
                        <button onClick={cancelEditCompany} className="p-1 text-gray-400 hover:bg-gray-100 rounded"><X size={12} /></button>
                      </div>
                    ) : (
                      <button
                        onClick={() => startEditCompany(emp.company_id, emp.company_name)}
                        className="hover:text-brand-600 hover:underline text-left"
                        title="Editar nombre empresa"
                      >
                        {emp.company_name}
                      </button>
                    )}
                  </td>
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
                        <button onClick={() => saveEmail(emp)} disabled={saving} className="p-1 text-green-600 hover:bg-green-50 rounded">
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
                    {search || filterCompany || filterCategory ? 'No se encontraron resultados' : 'Sin empleados. Sube PDFs de nóminas primero.'}
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
