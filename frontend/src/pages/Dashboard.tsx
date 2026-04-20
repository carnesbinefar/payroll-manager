import { useEffect, useState } from 'react';
import { Users, TrendingUp, Euro, Building2 } from 'lucide-react';
import {
  AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, Legend, Cell,
} from 'recharts';
import { api } from '../utils/api';
import { formatEur, formatPeriod } from '../utils/format';
import type { DashboardData } from '../types';

function StatCard({ icon: Icon, label, value, sub }: {
  icon: React.ElementType; label: string; value: string; sub?: string;
}) {
  return (
    <div className="card p-6 flex items-start gap-4">
      <div className="p-3 rounded-lg bg-brand-50 text-brand-600">
        <Icon size={22} />
      </div>
      <div>
        <p className="text-sm text-gray-500">{label}</p>
        <p className="text-2xl font-bold mt-0.5">{value}</p>
        {sub && <p className="text-xs text-gray-400 mt-0.5">{sub}</p>}
      </div>
    </div>
  );
}

const CENTRO_COLORS = [
  '#0ea5e9', '#38bdf8', '#7dd3fc', '#0284c7', '#0369a1',
  '#06b6d4', '#22d3ee', '#67e8f9', '#a5f3fc', '#cffafe',
];

export default function Dashboard() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    api.get<DashboardData>('/payroll/dashboard')
      .then(setData)
      .catch(e => setError(e.message));
  }, []);

  if (error) return (
    <div className="p-8 text-center text-red-600">Error cargando datos: {error}</div>
  );
  if (!data) return (
    <div className="p-8 text-center text-gray-400">Cargando...</div>
  );

  const chartData = data.monthly.map(m => ({
    name: formatPeriod(m.period),
    'Salario bruto': Math.round(m.total_gross),
    'Salario neto': Math.round(m.total_net),
    'Coste total': Math.round(m.total_cost),
    'Empleados': m.employee_count,
  }));

  const totals = data.totals || { total_employees: 0, ytd_gross: 0, ytd_cost: 0 };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Dashboard</h1>
        <p className="text-gray-500 text-sm mt-1">Resumen del año en curso</p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard icon={Users} label="Empleados activos" value={String(totals.total_employees)} />
        <StatCard
          icon={Euro}
          label="Masa salarial YTD"
          value={formatEur(totals.ytd_gross || 0)}
          sub="Bruto acumulado"
        />
        <StatCard
          icon={TrendingUp}
          label="Coste empresa YTD"
          value={formatEur(totals.ytd_cost || 0)}
          sub="Incl. SS empresa"
        />
        <StatCard
          icon={Building2}
          label="Empresas"
          value={String(data.byCompany.length)}
        />
      </div>

      {chartData.length > 0 && (
        <>
          <div className="card p-6">
            <h2 className="font-semibold mb-4">Evolución mensual — Masa salarial</h2>
            <ResponsiveContainer width="100%" height={280}>
              <AreaChart data={chartData}>
                <defs>
                  <linearGradient id="gradGross" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#0ea5e9" stopOpacity={0.15} />
                    <stop offset="95%" stopColor="#0ea5e9" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="gradNet" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#38bdf8" stopOpacity={0.15} />
                    <stop offset="95%" stopColor="#38bdf8" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                <YAxis tickFormatter={v => `${(v / 1000).toFixed(0)}k€`} tick={{ fontSize: 12 }} />
                <Tooltip formatter={(v: number) => formatEur(v)} />
                <Legend />
                <Area type="monotone" dataKey="Salario bruto" stroke="#0ea5e9" fill="url(#gradGross)" strokeWidth={2} />
                <Area type="monotone" dataKey="Salario neto" stroke="#38bdf8" fill="url(#gradNet)" strokeWidth={2} />
              </AreaChart>
            </ResponsiveContainer>
          </div>

          <div className="card p-6">
            <h2 className="font-semibold mb-4">Coste total mensual</h2>
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                <YAxis tickFormatter={v => `${(v / 1000).toFixed(0)}k€`} tick={{ fontSize: 12 }} />
                <Tooltip formatter={(v: number) => formatEur(v)} />
                <Bar dataKey="Coste total" fill="#0ea5e9" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </>
      )}

      {(data.byCentro ?? []).length > 0 && (
        <div className="card p-6">
          <h2 className="font-semibold mb-4">Masa salarial por centro</h2>
          <ResponsiveContainer width="100%" height={Math.max(200, (data.byCentro ?? []).length * 48)}>
            <BarChart
              layout="vertical"
              data={(data.byCentro ?? []).map(c => ({
                name: c.centro,
                'Masa salarial': Math.round(c.total_gross || 0),
                'Empleados': c.employee_count,
              }))}
              margin={{ left: 16, right: 32, top: 4, bottom: 4 }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" horizontal={false} />
              <XAxis type="number" tickFormatter={v => `${(v / 1000).toFixed(0)}k€`} tick={{ fontSize: 12 }} />
              <YAxis type="category" dataKey="name" tick={{ fontSize: 12 }} width={160} />
              <Tooltip
                formatter={(v: number, name: string) =>
                  name === 'Masa salarial' ? [formatEur(v), name] : [v, name]
                }
              />
              <Bar dataKey="Masa salarial" radius={[0, 4, 4, 0]}>
                {(data.byCentro ?? []).map((_c, i) => (
                  <Cell key={i} fill={CENTRO_COLORS[i % CENTRO_COLORS.length]} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {data.monthly.length === 0 && (
        <div className="card p-12 text-center text-gray-400">
          <p className="text-lg font-medium">Sin datos todavía</p>
          <p className="text-sm mt-1">Sube los PDFs de nóminas para ver el dashboard</p>
        </div>
      )}
    </div>
  );
}
