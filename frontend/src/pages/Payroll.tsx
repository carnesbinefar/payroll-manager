import { useEffect, useState, useCallback } from 'react';
import { Upload, FileText, Send, RefreshCw, CheckCircle, XCircle, Clock, Download, ChevronDown, ChevronUp, Trash2 } from 'lucide-react';
import { api } from '../utils/api';
import { formatPeriodLong } from '../utils/format';
import type { PayrollUpload, PayrollRecord, EmailSend } from '../types';

type Tab = 'upload' | 'records' | 'sends';

function StatusBadge({ status }: { status: EmailSend['status'] }) {
  if (status === 'sent') return <span className="badge-green">Enviado</span>;
  if (status === 'failed') return <span className="badge-red">Error</span>;
  return <span className="badge-yellow">Pendiente</span>;
}

function ResetModal({ onClose }: { onClose: () => void }) {
  const [confirm, setConfirm] = useState('');
  const [resetting, setResetting] = useState(false);

  const doReset = async () => {
    setResetting(true);
    try {
      await api.post('/payroll/reset', {});
      window.location.reload();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Error');
      setResetting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-6 space-y-4">
        <div className="flex items-center gap-3 text-red-600">
          <Trash2 size={20} />
          <h2 className="text-lg font-bold">Borrar todos los datos</h2>
        </div>
        <p className="text-sm text-gray-600">
          Esta acción eliminará <strong>todos los empleados, nóminas, archivos subidos e historial de envíos</strong> de forma irreversible.
        </p>
        <p className="text-sm text-gray-600">
          Escribe <strong>BORRAR</strong> para confirmar:
        </p>
        <input
          type="text"
          value={confirm}
          onChange={e => setConfirm(e.target.value)}
          placeholder="BORRAR"
          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-500"
          autoFocus
        />
        <div className="flex gap-3 justify-end">
          <button onClick={onClose} className="btn-secondary">Cancelar</button>
          <button
            onClick={doReset}
            disabled={confirm !== 'BORRAR' || resetting}
            className="px-4 py-2 bg-red-600 text-white text-sm font-medium rounded-lg hover:bg-red-700 disabled:opacity-40 transition-colors"
          >
            {resetting ? <RefreshCw size={14} className="animate-spin inline mr-1" /> : null}
            Borrar todo
          </button>
        </div>
      </div>
    </div>
  );
}

function UploadSection() {
  const [dragging, setDragging] = useState(false);
  const [uploads, setUploads] = useState<PayrollUpload[]>([]);
  const [processing, setProcessing] = useState<Record<string, boolean>>({});
  const [uploadResult, setUploadResult] = useState<string>('');
  const [showReset, setShowReset] = useState(false);

  const loadUploads = useCallback(() => {
    api.get<PayrollUpload[]>('/payroll/uploads').then(setUploads).catch(console.error);
  }, []);

  useEffect(() => { loadUploads(); }, [loadUploads]);

  const handleFiles = async (files: File[]) => {
    setUploadResult('');
    try {
      const result = await api.uploadFiles<{ results: Array<{ filename: string; status: string; error?: string }> }>(
        '/payroll/upload',
        files,
      );
      const ok = result.results.filter(r => r.status === 'ok').length;
      const err = result.results.filter(r => r.status === 'error');
      let msg = `${ok} archivo(s) subidos correctamente.`;
      if (err.length) msg += ` ${err.length} error(s): ${err.map(e => e.error).join(', ')}`;
      setUploadResult(msg);
      loadUploads();
    } catch (err) {
      setUploadResult(`Error: ${err instanceof Error ? err.message : String(err)}`);
    }
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const files = Array.from(e.dataTransfer.files).filter(f => f.type === 'application/pdf');
    if (files.length) handleFiles(files);
  };

  const processUpload = async (id: string) => {
    setProcessing(p => ({ ...p, [id]: true }));
    try {
      const res = await api.post<{ processed: number }>(`/payroll/process/${id}`, {});
      alert(`Procesados ${res.processed} registros`);
      loadUploads();
    } catch (err) {
      alert(`Error: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setProcessing(p => ({ ...p, [id]: false }));
    }
  };

  const groupedByPeriod = uploads.reduce<Record<string, PayrollUpload[]>>((acc, u) => {
    (acc[u.period] = acc[u.period] || []).push(u);
    return acc;
  }, {});

  return (
    <div className="space-y-6">
      <div
        onDragOver={e => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        className={`border-2 border-dashed rounded-xl p-12 text-center transition-colors ${
          dragging ? 'border-brand-500 bg-brand-50' : 'border-gray-200 hover:border-brand-300'
        }`}
      >
        <Upload size={36} className="mx-auto text-gray-300 mb-3" />
        <p className="text-gray-600 font-medium">Arrastra los PDFs aquí</p>
        <p className="text-gray-400 text-sm mt-1">
          Archivos REC*.pdf (nóminas individuales) y resúmenes mensuales
        </p>
        <label className="mt-4 btn-primary cursor-pointer inline-flex">
          <span>Seleccionar archivos</span>
          <input
            type="file"
            accept="application/pdf"
            multiple
            className="hidden"
            onChange={e => {
              const files = Array.from(e.target.files || []);
              if (files.length) handleFiles(files);
              e.target.value = '';
            }}
          />
        </label>
      </div>

      {uploadResult && (
        <div className={`p-3 rounded-lg text-sm ${uploadResult.includes('Error') ? 'bg-red-50 text-red-700' : 'bg-green-50 text-green-700'}`}>
          {uploadResult}
        </div>
      )}

      {Object.keys(groupedByPeriod).sort().reverse().map(period => (
        <div key={period} className="card overflow-hidden">
          <div className="px-4 py-3 bg-gray-50 border-b border-gray-100 flex items-center justify-between">
            <h3 className="font-medium">{formatPeriodLong(period)}</h3>
            <span className="text-xs text-gray-400">{groupedByPeriod[period].length} archivo(s)</span>
          </div>
          <div className="divide-y divide-gray-50">
            {groupedByPeriod[period].map(u => (
              <div key={u.id} className="px-4 py-3 flex items-center gap-3">
                <FileText size={16} className="text-gray-400 shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{u.filename}</p>
                  <p className="text-xs text-gray-400">
                    {u.type === 'individual' ? 'Nóminas individuales' : 'Resumen mensual'}
                    {' · '}{u.company_name}
                  </p>
                </div>
                {u.processed ? (
                  <span className="badge-green flex items-center gap-1">
                    <CheckCircle size={12} /> Procesado
                  </span>
                ) : (
                  <button
                    onClick={() => processUpload(u.id)}
                    disabled={processing[u.id]}
                    className="btn-primary text-xs py-1.5"
                  >
                    {processing[u.id] ? (
                      <RefreshCw size={12} className="animate-spin" />
                    ) : 'Procesar'}
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      ))}

      {uploads.length === 0 && (
        <p className="text-center text-gray-400 py-8">No hay archivos subidos todavía</p>
      )}

      <div className="border-t border-gray-100 pt-4 flex justify-end">
        <button
          onClick={() => setShowReset(true)}
          className="flex items-center gap-2 text-xs text-red-400 hover:text-red-600 transition-colors"
        >
          <Trash2 size={13} /> Borrar todos los datos
        </button>
      </div>

      {showReset && <ResetModal onClose={() => setShowReset(false)} />}
    </div>
  );
}

function RecordsSection() {
  const [records, setRecords] = useState<PayrollRecord[]>([]);
  const [sending, setSending] = useState<Record<string, boolean>>({});
  const [expandedPeriod, setExpandedPeriod] = useState<string | null>(null);
  const [bulkSending, setBulkSending] = useState<Record<string, boolean>>({});

  useEffect(() => {
    api.get<PayrollRecord[]>('/payroll/records').then(setRecords).catch(console.error);
  }, []);

  const periods = [...new Set(records.map(r => r.period))].sort().reverse();

  const sendOne = async (recordId: string) => {
    setSending(s => ({ ...s, [recordId]: true }));
    try {
      await api.post(`/email/send/${recordId}`, {});
      alert('Nómina enviada correctamente');
    } catch (err) {
      alert(`Error: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setSending(s => ({ ...s, [recordId]: false }));
    }
  };

  const sendAll = async (period: string) => {
    setBulkSending(s => ({ ...s, [period]: true }));
    try {
      const res = await api.post<{ queued: number }>('/email/send-period', { period });
      alert(`${res.queued} emails en cola`);
    } catch (err) {
      alert(`Error: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setBulkSending(s => ({ ...s, [period]: false }));
    }
  };

  return (
    <div className="space-y-4">
      {periods.map(period => {
        const periodRecords = records.filter(r => r.period === period);
        const withEmail = periodRecords.filter(r => r.employee_email).length;
        const isExpanded = expandedPeriod === period;

        return (
          <div key={period} className="card overflow-hidden">
            <div
              className="px-4 py-3 bg-gray-50 border-b border-gray-100 flex items-center justify-between cursor-pointer hover:bg-gray-100 transition-colors"
              onClick={() => setExpandedPeriod(isExpanded ? null : period)}
            >
              <div>
                <h3 className="font-medium">{formatPeriodLong(period)}</h3>
                <p className="text-xs text-gray-400 mt-0.5">
                  {periodRecords.length} empleados · {withEmail} con email configurado
                </p>
              </div>
              <div className="flex items-center gap-3">
                <button
                  onClick={e => { e.stopPropagation(); sendAll(period); }}
                  disabled={bulkSending[period] || withEmail === 0}
                  className="btn-primary text-xs py-1.5"
                  title={withEmail === 0 ? 'Ningún empleado tiene email configurado' : undefined}
                >
                  {bulkSending[period] ? <RefreshCw size={12} className="animate-spin" /> : <Send size={12} />}
                  Enviar todas ({withEmail})
                </button>
                {isExpanded ? <ChevronUp size={16} className="text-gray-400" /> : <ChevronDown size={16} className="text-gray-400" />}
              </div>
            </div>

            {isExpanded && (
              <div className="divide-y divide-gray-50">
                {periodRecords.map(r => (
                  <div key={r.id} className="px-4 py-3 flex items-center gap-3">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium">{r.employee_name}</p>
                      <p className="text-xs text-gray-400">{r.company_name}</p>
                    </div>
                    <div className="text-right text-sm">
                      <p className="font-medium">{r.net_pay.toLocaleString('es-ES', { style: 'currency', currency: 'EUR' })}</p>
                      <p className="text-xs text-gray-400">neto</p>
                    </div>
                    {r.employee_email ? (
                      <span className="text-xs text-gray-400 hidden md:block truncate max-w-[180px]">{r.employee_email}</span>
                    ) : (
                      <span className="badge-gray text-xs">Sin email</span>
                    )}
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => api.downloadPdf(`/payroll/records/${r.id}/pdf`, `nomina_${r.employee_name}_${r.period}.pdf`).catch(e => alert(e.message))}
                        className="p-1.5 text-gray-400 hover:text-brand-600 hover:bg-brand-50 rounded transition-colors"
                        title="Descargar PDF"
                      >
                        <Download size={14} />
                      </button>
                      <button
                        onClick={() => sendOne(r.id)}
                        disabled={sending[r.id] || !r.employee_email}
                        className="btn-primary text-xs py-1.5 disabled:opacity-40"
                        title={!r.employee_email ? 'Configura un email en la pestaña Empleados' : 'Enviar nómina'}
                      >
                        {sending[r.id] ? <RefreshCw size={12} className="animate-spin" /> : <Send size={12} />}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })}
      {records.length === 0 && (
        <div className="card p-12 text-center text-gray-400">
          Procesa los PDFs subidos para ver los registros de nóminas
        </div>
      )}
    </div>
  );
}

function SendsSection() {
  const [sends, setSends] = useState<EmailSend[]>([]);
  const [retrying, setRetrying] = useState<Record<string, boolean>>({});

  const load = useCallback(() => {
    api.get<EmailSend[]>('/email/sends').then(setSends).catch(console.error);
  }, []);

  useEffect(() => { load(); }, [load]);

  const retry = async (sendId: string) => {
    setRetrying(r => ({ ...r, [sendId]: true }));
    try {
      await api.post(`/email/retry/${sendId}`, {});
      setTimeout(load, 2000);
    } catch (err) {
      alert(`Error: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setRetrying(r => ({ ...r, [sendId]: false }));
    }
  };

  const failed = sends.filter(s => s.status === 'failed');
  const sent = sends.filter(s => s.status === 'sent');

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-4">
        <div className="card p-4 text-center">
          <p className="text-2xl font-bold text-green-600">{sent.length}</p>
          <p className="text-sm text-gray-500 mt-1">Enviados</p>
        </div>
        <div className="card p-4 text-center">
          <p className="text-2xl font-bold text-red-600">{failed.length}</p>
          <p className="text-sm text-gray-500 mt-1">Con error</p>
        </div>
        <div className="card p-4 text-center">
          <p className="text-2xl font-bold text-yellow-600">{sends.filter(s => s.status === 'pending').length}</p>
          <p className="text-sm text-gray-500 mt-1">Pendientes</p>
        </div>
      </div>

      {failed.length > 0 && (
        <div className="card overflow-hidden">
          <div className="px-4 py-3 bg-red-50 border-b border-red-100">
            <h3 className="font-medium text-red-800">Envíos fallidos — requieren acción</h3>
          </div>
          <div className="divide-y divide-gray-50">
            {failed.map(s => (
              <div key={s.id} className="px-4 py-3 flex items-center gap-3">
                <XCircle size={16} className="text-red-500 shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium">{s.employee_name}</p>
                  <p className="text-xs text-gray-400">{s.email} · {formatPeriodLong(s.period)}</p>
                  {s.last_error && (
                    <p className="text-xs text-red-500 mt-0.5 truncate">{s.last_error}</p>
                  )}
                </div>
                <span className="text-xs text-gray-400">{s.attempts} intento(s)</span>
                <button
                  onClick={() => retry(s.id)}
                  disabled={retrying[s.id]}
                  className="btn-secondary text-xs py-1.5"
                >
                  {retrying[s.id] ? <RefreshCw size={12} className="animate-spin" /> : <RefreshCw size={12} />}
                  Reintentar
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="card overflow-hidden">
        <div className="px-4 py-3 bg-gray-50 border-b border-gray-100">
          <h3 className="font-medium">Historial de envíos</h3>
        </div>
        <div className="divide-y divide-gray-50 max-h-[500px] overflow-y-auto">
          {sends.map(s => (
            <div key={s.id} className="px-4 py-3 flex items-center gap-3">
              {s.status === 'sent'
                ? <CheckCircle size={16} className="text-green-500 shrink-0" />
                : s.status === 'failed'
                ? <XCircle size={16} className="text-red-500 shrink-0" />
                : <Clock size={16} className="text-yellow-500 shrink-0" />
              }
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium">{s.employee_name}</p>
                <p className="text-xs text-gray-400">{s.email} · {formatPeriodLong(s.period)}</p>
              </div>
              <StatusBadge status={s.status} />
              <span className="text-xs text-gray-400 hidden md:block">
                {s.sent_at ? new Date(s.sent_at).toLocaleString('es-ES') : ''}
              </span>
            </div>
          ))}
          {sends.length === 0 && (
            <p className="px-4 py-12 text-center text-gray-400">No hay envíos todavía</p>
          )}
        </div>
      </div>
    </div>
  );
}

export default function Payroll() {
  const [tab, setTab] = useState<Tab>('upload');

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Nóminas</h1>
        <p className="text-gray-500 text-sm mt-1">Subida, procesado y envío de nóminas</p>
      </div>

      <div className="flex gap-1 border-b border-gray-200">
        {([
          { key: 'upload', label: 'Subir archivos' },
          { key: 'records', label: 'Registros y envío' },
          { key: 'sends', label: 'Historial de envíos' },
        ] as { key: Tab; label: string }[]).map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors ${
              tab === t.key
                ? 'border-brand-600 text-brand-700'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'upload' && <UploadSection />}
      {tab === 'records' && <RecordsSection />}
      {tab === 'sends' && <SendsSection />}
    </div>
  );
}
