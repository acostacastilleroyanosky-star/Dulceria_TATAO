import React, { useState, useMemo } from 'react';
import { useApp } from '../context/AppContext';
import { formatDate, formatNumber } from '../lib/calculations';
import {
  Sparkles,
  Send,
  Copy,
  Check,
  MessageCircle,
  Calendar,
  User,
  Table as TableIcon,
  AlertCircle,
  Loader2,
  Printer,
  Trash2,
  Clock,
  FileText,
} from 'lucide-react';

interface GeneratedReport {
  id: string;
  createdAt: string;
  prompt: string;
  titulo: string;
  subtituloPeriodo: string;
  destinatarioNombre: string;
  resumenEjecutivo: string;
  columnas: string[];
  filas: string[][];
  filaTotal: string[];
  mensajeWhatsapp: string;
  notas: string;
}

const QUICK_TEMPLATES = [
  {
    label: 'Cobro WhatsApp a Cliente (Período)',
    buildPrompt: (cliente: string, desde: string, hasta: string) =>
      `Quiero mandarle un mensaje por WhatsApp al cliente ${
        cliente && cliente !== 'Todos' ? cliente : 'Carlos'
      } donde se muestre el detalle consolidado de todos los productos vendidos entre el ${formatDate(
        desde
      )} y el ${formatDate(
        hasta
      )}, indicando cantidad, precio unitario, importe por producto y el total general a pagar para efectuar el pago.`,
  },
  {
    label: 'Ventas detalladas por Vales',
    buildPrompt: (cliente: string, desde: string, hasta: string) =>
      `Genera un reporte de ventas por vales ${
        cliente && cliente !== 'Todos' ? `para el cliente ${cliente}` : 'de todos los clientes'
      } del ${formatDate(desde)} al ${formatDate(
        hasta
      )}, mostrando número de vale, fecha, productos, forma de pago, importe total y un mensaje resumen para WhatsApp.`,
  },
  {
    label: 'Producción y Mermas del Período',
    buildPrompt: (_cliente: string, desde: string, hasta: string) =>
      `Resume la producción total y las mermas por producto entre el ${formatDate(
        desde
      )} y el ${formatDate(
        hasta
      )}, comparando unidades producidas contra unidades vendidas y redactando un mensaje ejecutivo para WhatsApp.`,
  },
  {
    label: 'Resumen de Gastos por Categoría',
    buildPrompt: (_cliente: string, desde: string, hasta: string) =>
      `Genera un desglose de los gastos registrados del ${formatDate(desde)} al ${formatDate(
        hasta
      )} agrupados por categoría (Salarios, Materias Primas, Materiales, Limpieza, Electricidad, Otros) con el total general y un resumen para enviar por WhatsApp.`,
  },
];

export const ReportsView: React.FC = () => {
  const { data, fechaDesde, fechaHasta } = useApp();

  const [prompt, setPrompt] = useState<string>('');
  const [clienteFiltro, setClienteFiltro] = useState<string>('Todos');
  const [usarRangoFechas, setUsarRangoFechas] = useState<boolean>(false);
  const [reporteDesde, setReporteDesde] = useState<string>(fechaDesde);
  const [reporteHasta, setReporteHasta] = useState<string>(fechaHasta);

  const [isGenerating, setIsGenerating] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [activeReport, setActiveReport] = useState<GeneratedReport | null>(null);
  const [editableWhatsapp, setEditableWhatsapp] = useState<string>('');
  const [copiedMsg, setCopiedMsg] = useState<boolean>(false);
  const [history, setHistory] = useState<GeneratedReport[]>(() => {
    try {
      const saved = localStorage.getItem('dulceria_tatao_ai_reports_history');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  const sortedClientes = useMemo(() => {
    return [...data.clientes].sort((a, b) =>
      a.nombre.localeCompare(b.nombre, 'es', { sensitivity: 'base' })
    );
  }, [data.clientes]);

  // Match client phone for WhatsApp delivery
  const matchedClient = useMemo(() => {
    const targetName =
      activeReport?.destinatarioNombre?.trim() ||
      (clienteFiltro !== 'Todos' ? clienteFiltro : '');
    if (!targetName) return null;
    const lower = targetName.toLowerCase();
    return (
      data.clientes.find((c) => c.nombre.toLowerCase() === lower) ||
      data.clientes.find((c) => c.nombre.toLowerCase().includes(lower)) ||
      null
    );
  }, [activeReport, clienteFiltro, data.clientes]);

  const whatsappHref = useMemo(() => {
    const cleanPhone = matchedClient?.telefono
      ? matchedClient.telefono.replace(/[^0-9]/g, '')
      : '';
    const encodedText = encodeURIComponent(editableWhatsapp || '');
    return cleanPhone
      ? `https://wa.me/${cleanPhone}?text=${encodedText}`
      : `https://wa.me/?text=${encodedText}`;
  }, [matchedClient, editableWhatsapp]);

  const saveHistoryList = (next: GeneratedReport[]) => {
    setHistory(next);
    try {
      localStorage.setItem('dulceria_tatao_ai_reports_history', JSON.stringify(next));
    } catch {
      // Ignore storage quota errors
    }
  };

  // Build compact, clean context snapshot for AI report accuracy
  const buildCompactContextData = () => {
    return {
      clientes: sortedClientes.map((c) => ({
        nombre: c.nombre,
        telefono: c.telefono || '',
      })),
      productos: data.productos.map((p) => ({
        nombre: p.nombre,
        precioVigente: p.precioVigente,
        activo: p.activo !== false,
      })),
      ventas: data.ventas.map((v) => ({
        vale: v.vale,
        fecha: v.fecha,
        cliente: v.cliente,
        formaPago: v.formaPago || 'Efectivo',
        importeTotal: v.importeTotal,
        nota: v.nota || undefined,
        lineas: v.lineas.map((l) => ({
          producto: l.producto,
          cantidad: l.cantidad,
          precioUnitario: l.precioUnitario ?? (l.cantidad > 0 ? l.importe / l.cantidad : 0),
          importe: l.importe,
        })),
      })),
      produccion: data.produccion.map((p) => ({
        fecha: p.fecha,
        producto: p.producto,
        cantidad: p.cantidad,
        merma: p.merma || 0,
        costo: p.costo,
      })),
      gastos: data.gastos.map((g) => ({
        fecha: g.fecha,
        categoria: g.categoria,
        concepto: g.concepto,
        importe: g.importe,
        formaPago: g.formaPago,
      })),
      caja: data.caja,
      fechaHoy: new Date().toISOString().slice(0, 10),
    };
  };

  const handleGenerateReport = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!prompt.trim() || isGenerating) return;

    setIsGenerating(true);
    setErrorMsg(null);

    try {
      const filtros = {
        cliente: clienteFiltro !== 'Todos' ? clienteFiltro : null,
        fechaDesde: usarRangoFechas ? reporteDesde : null,
        fechaHasta: usarRangoFechas ? reporteHasta : null,
      };

      const response = await fetch('/api/reports/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: prompt.trim(),
          filtros,
          contextData: buildCompactContextData(),
        }),
      });

      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload?.error || 'No se pudo generar el reporte.');
      }

      const rawReport = payload.report;
      const newReport: GeneratedReport = {
        id: `rep-ai-${Date.now()}`,
        createdAt: new Date().toISOString(),
        prompt: prompt.trim(),
        titulo: rawReport.titulo || 'Reporte Generado',
        subtituloPeriodo: rawReport.subtituloPeriodo || '',
        destinatarioNombre: rawReport.destinatarioNombre || '',
        resumenEjecutivo: rawReport.resumenEjecutivo || '',
        columnas: Array.isArray(rawReport.columnas) ? rawReport.columnas : [],
        filas: Array.isArray(rawReport.filas) ? rawReport.filas : [],
        filaTotal: Array.isArray(rawReport.filaTotal) ? rawReport.filaTotal : [],
        mensajeWhatsapp: rawReport.mensajeWhatsapp || '',
        notas: rawReport.notas || '',
      };

      setActiveReport(newReport);
      setEditableWhatsapp(newReport.mensajeWhatsapp);
      saveHistoryList([newReport, ...history].slice(0, 10));
    } catch (err: any) {
      setErrorMsg(err?.message || 'Error inesperado al consultar la IA.');
    } finally {
      setIsGenerating(false);
    }
  };

  const handleCopyWhatsapp = () => {
    if (!editableWhatsapp) return;
    navigator.clipboard.writeText(editableWhatsapp);
    setCopiedMsg(true);
    setTimeout(() => setCopiedMsg(false), 2000);
  };

  const handleSelectHistory = (rep: GeneratedReport) => {
    setActiveReport(rep);
    setEditableWhatsapp(rep.mensajeWhatsapp);
    setErrorMsg(null);
  };

  const handleClearHistory = () => {
    saveHistoryList([]);
  };

  const handlePrint = () => {
    window.print();
  };

  // Quick reference metrics for the user's current filters
  const previewStats = useMemo(() => {
    const vFiltered = data.ventas
      .filter((v) => (!usarRangoFechas ? true : v.fecha >= reporteDesde && v.fecha <= reporteHasta))
      .filter((v) => (clienteFiltro === 'Todos' ? true : v.cliente === clienteFiltro));
    return {
      valesCount: vFiltered.length,
      totalVentas: vFiltered.reduce((s, v) => s + v.importeTotal, 0),
    };
  }, [data.ventas, usarRangoFechas, reporteDesde, reporteHasta, clienteFiltro]);

  return (
    <div className="space-y-4 pb-12">
      {/* Panel superior: Compositor de Reportes con IA */}
      <div className="bg-white border border-gray-200 rounded-xl shadow-2xs overflow-hidden print:hidden">
        <div className="px-4 py-3 bg-gradient-to-r from-amber-50 via-white to-emerald-50 border-b border-gray-200 flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-amber-500 text-slate-950 flex items-center justify-center shadow-xs">
              <Sparkles className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-xs sm:text-sm font-black text-gray-900 tracking-tight">
                Asistente de Reportes Inteligentes y WhatsApp
              </h2>
              <p className="text-[11px] text-gray-600">
                Describe en tus palabras qué reporte necesitas y para quién; la IA calcula con tus datos reales y prepara el mensaje listo para enviar.
              </p>
            </div>
          </div>

          <div className="text-[11px] text-gray-500 bg-white px-2.5 py-1 rounded-md border border-gray-200">
            Base disponible: <strong className="text-gray-900">{previewStats.valesCount}</strong> vales (
            <strong className="text-emerald-700">{formatNumber(previewStats.totalVentas)}</strong>)
          </div>
        </div>

        <form onSubmit={handleGenerateReport} className="p-4 space-y-3 text-xs">
          {/* Ayudas opcionales de filtrado */}
          <div className="flex flex-wrap items-center gap-3 p-2.5 bg-slate-50 border border-gray-200 rounded-lg">
            <div className="flex items-center gap-1.5">
              <User className="w-3.5 h-3.5 text-amber-700" />
              <label className="font-semibold text-gray-700">Cliente (opcional):</label>
              <select
                value={clienteFiltro}
                onChange={(e) => setClienteFiltro(e.target.value)}
                className="h-7 px-2 text-xs border border-gray-300 rounded bg-white text-gray-800 focus:ring-1 focus:ring-amber-500"
              >
                <option value="Todos">Todos / Detectar del texto</option>
                {sortedClientes.map((c) => (
                  <option key={c.id} value={c.nombre}>
                    {c.nombre}
                  </option>
                ))}
                <option value="Otros">Otros</option>
              </select>
            </div>

            <div className="flex items-center gap-2">
              <label className="flex items-center gap-1.5 cursor-pointer font-semibold text-gray-700">
                <input
                  type="checkbox"
                  checked={usarRangoFechas}
                  onChange={(e) => setUsarRangoFechas(e.target.checked)}
                  className="rounded text-amber-600 focus:ring-amber-500"
                />
                <Calendar className="w-3.5 h-3.5 text-amber-700" />
                <span>Acotar fechas:</span>
              </label>

              {usarRangoFechas && (
                <div className="flex items-center gap-1.5">
                  <input
                    type="date"
                    value={reporteDesde}
                    onChange={(e) => setReporteDesde(e.target.value)}
                    className="h-7 px-2 text-xs border border-gray-300 rounded bg-white"
                  />
                  <span className="text-gray-400">→</span>
                  <input
                    type="date"
                    value={reporteHasta}
                    onChange={(e) => setReporteHasta(e.target.value)}
                    className="h-7 px-2 text-xs border border-gray-300 rounded bg-white"
                  />
                </div>
              )}
            </div>
          </div>

          {/* Plantillas rápidas de solicitud */}
          <div className="space-y-1.5">
            <span className="text-[11px] font-semibold text-gray-500 block">
              Ejemplos rápidos (clic para rellenar):
            </span>
            <div className="flex flex-wrap gap-1.5">
              {QUICK_TEMPLATES.map((tpl) => (
                <button
                  key={tpl.label}
                  type="button"
                  onClick={() => setPrompt(tpl.buildPrompt(clienteFiltro, reporteDesde, reporteHasta))}
                  className="px-2.5 py-1 text-[11px] font-medium bg-amber-50 hover:bg-amber-100 text-amber-900 border border-amber-200 rounded-md transition-colors cursor-pointer"
                >
                  {tpl.label}
                </button>
              ))}
            </div>
          </div>

          {/* Área de descripción en lenguaje natural */}
          <div>
            <label className="font-bold text-gray-800 block mb-1">
              Describe el reporte que necesitas:
            </label>
            <textarea
              rows={3}
              required
              placeholder='Ej. "Quiero mandarle un mensaje por WhatsApp a Carlos donde se muestre el total de productos vendidos del 20/10/2026 al 27/10/2026, con el importe por producto y el total general para efectuar el pago."'
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              className="w-full p-2.5 text-xs border border-gray-300 rounded-lg bg-white text-gray-900 focus:outline-hidden focus:ring-2 focus:ring-amber-500"
            />
          </div>

          {errorMsg && (
            <div className="p-3 bg-rose-50 border border-rose-200 rounded-lg text-rose-800 text-xs flex items-start gap-2">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-rose-600" />
              <span>{errorMsg}</span>
            </div>
          )}

          <div className="flex items-center justify-between gap-2">
            <span className="text-[11px] text-gray-400">
              Los importes se calculan directamente desde tus registros reales sin inventar cifras.
            </span>
            <button
              type="submit"
              disabled={isGenerating || !prompt.trim()}
              className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white font-bold rounded-lg flex items-center gap-2 shadow-xs transition-colors cursor-pointer"
            >
              {isGenerating ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Generando reporte...</span>
                </>
              ) : (
                <>
                  <Send className="w-3.5 h-3.5" />
                  <span>Generar Reporte con IA</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>

      {/* Resultado del reporte activo */}
      {activeReport && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
          {/* Columna Izquierda: Tabla y Resumen Analítico */}
          <div className="lg:col-span-7 bg-white border border-gray-200 rounded-xl shadow-2xs overflow-hidden flex flex-col">
            <div className="px-4 py-3 bg-slate-50 border-b border-gray-200 flex flex-wrap items-start justify-between gap-2">
              <div>
                <div className="flex items-center gap-2">
                  <TableIcon className="w-4 h-4 text-amber-600 shrink-0" />
                  <h3 className="font-black text-sm text-gray-900">{activeReport.titulo}</h3>
                </div>
                {activeReport.subtituloPeriodo && (
                  <p className="text-[11px] text-gray-600 mt-0.5 font-medium">
                    {activeReport.subtituloPeriodo}
                  </p>
                )}
              </div>

              <button
                type="button"
                onClick={handlePrint}
                className="px-2.5 py-1 text-[11px] font-semibold text-slate-700 bg-white hover:bg-slate-100 border border-gray-300 rounded-md flex items-center gap-1 print:hidden"
                title="Imprimir reporte"
              >
                <Printer className="w-3.5 h-3.5" />
                <span>Imprimir</span>
              </button>
            </div>

            <div className="p-4 space-y-3 flex-1">
              {activeReport.resumenEjecutivo && (
                <div className="p-3 bg-amber-50/70 border border-amber-200 rounded-lg text-xs text-amber-950 leading-relaxed">
                  {activeReport.resumenEjecutivo}
                </div>
              )}

              {activeReport.columnas.length > 0 && (
                <div className="border border-gray-200 rounded-lg overflow-hidden">
                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse text-xs">
                      <thead>
                        <tr className="bg-slate-100 border-b border-gray-200 text-gray-700 font-bold">
                          {activeReport.columnas.map((col, idx) => (
                            <th key={idx} className="py-2 px-3 whitespace-nowrap">
                              {col}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {activeReport.filas.length === 0 ? (
                          <tr>
                            <td
                              colSpan={activeReport.columnas.length}
                              className="py-6 text-center text-gray-500"
                            >
                              No se encontraron registros para el criterio solicitado.
                            </td>
                          </tr>
                        ) : (
                          activeReport.filas.map((row, rIdx) => (
                            <tr key={rIdx} className="hover:bg-slate-50 transition-colors">
                              {activeReport.columnas.map((_, cIdx) => (
                                <td key={cIdx} className="py-2 px-3 text-gray-800">
                                  {row[cIdx] ?? '—'}
                                </td>
                              ))}
                            </tr>
                          ))
                        )}
                      </tbody>
                      {activeReport.filaTotal.length > 0 && (
                        <tfoot>
                          <tr className="bg-slate-100 font-black text-gray-900 border-t-2 border-gray-300">
                            {activeReport.columnas.map((_, cIdx) => (
                              <td key={cIdx} className="py-2 px-3">
                                {activeReport.filaTotal[cIdx] ?? ''}
                              </td>
                            ))}
                          </tr>
                        </tfoot>
                      )}
                    </table>
                  </div>
                </div>
              )}

              {activeReport.notas && (
                <div className="text-[11px] text-gray-600 bg-slate-50 border border-gray-200 rounded-lg p-2.5 italic">
                  <strong>Nota:</strong> {activeReport.notas}
                </div>
              )}
            </div>
          </div>

          {/* Columna Derecha: Mensaje WhatsApp editable y envío directo */}
          <div className="lg:col-span-5 bg-white border border-emerald-200 rounded-xl shadow-2xs overflow-hidden flex flex-col print:hidden">
            <div className="px-4 py-3 bg-emerald-50 border-b border-emerald-200 flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <MessageCircle className="w-4 h-4 text-emerald-700" />
                <div>
                  <h3 className="font-bold text-xs text-emerald-950">
                    Mensaje listo para WhatsApp
                  </h3>
                  <p className="text-[10px] text-emerald-800">
                    {matchedClient
                      ? `Destinatario: ${matchedClient.nombre}${
                          matchedClient.telefono ? ` (${matchedClient.telefono})` : ' (sin teléfono)'
                        }`
                      : activeReport.destinatarioNombre
                      ? `Destinatario sugerido: ${activeReport.destinatarioNombre}`
                      : 'Puedes editar el texto antes de enviarlo'}
                  </p>
                </div>
              </div>
            </div>

            <div className="p-4 space-y-3 flex-1 flex flex-col">
              <textarea
                rows={12}
                value={editableWhatsapp}
                onChange={(e) => setEditableWhatsapp(e.target.value)}
                className="w-full flex-1 p-3 text-xs font-mono bg-slate-50 border border-gray-300 rounded-lg text-gray-900 focus:outline-hidden focus:ring-2 focus:ring-emerald-500 leading-relaxed"
              />

              <div className="flex flex-wrap items-center gap-2 pt-1">
                <button
                  type="button"
                  onClick={handleCopyWhatsapp}
                  className="flex-1 py-2 px-3 bg-slate-100 hover:bg-slate-200 text-slate-800 font-semibold text-xs rounded-lg border border-slate-300 flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                >
                  {copiedMsg ? (
                    <>
                      <Check className="w-3.5 h-3.5 text-emerald-600" />
                      <span>¡Copiado!</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-3.5 h-3.5" />
                      <span>Copiar mensaje</span>
                    </>
                  )}
                </button>

                <a
                  href={whatsappHref}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex-1 py-2 px-3 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-lg flex items-center justify-center gap-1.5 shadow-xs transition-colors"
                >
                  <MessageCircle className="w-3.5 h-3.5" />
                  <span>Enviar por WhatsApp</span>
                </a>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Historial reciente de reportes generados */}
      {history.length > 0 && (
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden shadow-2xs print:hidden">
          <div className="px-4 py-2.5 bg-slate-50 border-b border-gray-200 flex items-center justify-between">
            <div className="flex items-center gap-2 text-xs font-bold text-gray-800">
              <Clock className="w-3.5 h-3.5 text-amber-600" />
              <span>Reportes recientes ({history.length})</span>
            </div>
            <button
              type="button"
              onClick={handleClearHistory}
              className="text-[11px] text-gray-500 hover:text-rose-600 flex items-center gap-1 cursor-pointer"
            >
              <Trash2 className="w-3 h-3" />
              <span>Limpiar historial</span>
            </button>
          </div>
          <div className="divide-y divide-gray-100">
            {history.map((item) => {
              const isCurrent = activeReport?.id === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => handleSelectHistory(item)}
                  className={`w-full text-left px-4 py-2.5 flex items-center justify-between gap-3 hover:bg-slate-50 transition-colors cursor-pointer ${
                    isCurrent ? 'bg-amber-50/70' : ''
                  }`}
                >
                  <div className="min-w-0 flex items-center gap-2.5">
                    <FileText className="w-4 h-4 text-amber-600 shrink-0" />
                    <div className="min-w-0">
                      <div className="text-xs font-bold text-gray-900 truncate">
                        {item.titulo}
                      </div>
                      <div className="text-[11px] text-gray-500 truncate">{item.prompt}</div>
                    </div>
                  </div>
                  <span className="text-[10px] text-gray-400 shrink-0">
                    {new Date(item.createdAt).toLocaleString('es-CU', {
                      day: '2-digit',
                      month: '2-digit',
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};
