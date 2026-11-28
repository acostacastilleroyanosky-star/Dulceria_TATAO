import React, { useState, useMemo } from 'react';
import { useApp } from '../context/AppContext';
import { formatNumber, formatDate } from '../lib/calculations';
import { toISODate } from '../utils/dateUtils';
import { AlmacenItem } from '../types';
import { ConfirmModal } from './ConfirmModal';
import { useEscToClose } from '../hooks/useEscToClose';
import { Plus, Minus, FileText, Edit2, Trash2, RotateCcw } from 'lucide-react';

// Extrae factor numérico y unidad de medida desde el texto de Presentación (ej. "Sacos de 25 kg" -> { factor: 25, unidad: "kg" })
function parsePresentacion(presentacion: string): {
  factor: number;
  unidad: string;
  hasParsedFactorAndUnit: boolean;
} {
  const text = presentacion.trim();
  if (!text) {
    return { factor: 1, unidad: 'u', hasParsedFactorAndUnit: false };
  }

  const matches = [...text.matchAll(/(\d+(?:[.,]\d+)?)\s*([a-zA-ZáéíóúÁÉÍÓÚñÑüÜ]+)?/g)];
  const withUnit = [...matches].reverse().find((m) => m[2] && m[2].trim().length > 0);
  const chosen = withUnit || matches[matches.length - 1];

  if (chosen) {
    const num = parseFloat(chosen[1].replace(',', '.'));
    const factor = !isNaN(num) && num > 0 ? num : 1;
    const rawUnit = (chosen[2] || '').trim();
    const unidad = rawUnit || text;
    return {
      factor,
      unidad,
      hasParsedFactorAndUnit: Boolean(withUnit && !isNaN(num) && num > 0),
    };
  }

  return { factor: 1, unidad: text, hasParsedFactorAndUnit: false };
}

function getItemPresentacionFactor(item: AlmacenItem): number {
  if (item.contenidoTotal && item.contenidoTotal > 0) return item.contenidoTotal;
  if (item.presentacion) {
    const parsed = parsePresentacion(item.presentacion);
    if (parsed.hasParsedFactorAndUnit) return parsed.factor;
  }
  return 1;
}

export const WarehouseView: React.FC = () => {
  const {
    data,
    addAlmacenItem,
    updateAlmacenItem,
    deleteAlmacenItem,
    addMovimientoAlmacen,
    revertirMovimientoAlmacen,
  } = useApp();

  // Create item modal
  const [isNewModalOpen, setIsNewModalOpen] = useState<boolean>(false);
  const [newProducto, setNewProducto] = useState<string>('');
  const [newMarca, setNewMarca] = useState<string>('');
  const [newPresentacion, setNewPresentacion] = useState<string>('');
  const [newCantidad, setNewCantidad] = useState<string>('');
  const [newPrecio, setNewPrecio] = useState<string>('');
  const [newFechaEntrada, setNewFechaEntrada] = useState<string>(toISODate(new Date()));

  // Edit item modal
  const [editingItem, setEditingItem] = useState<AlmacenItem | null>(null);
  const [editProducto, setEditProducto] = useState<string>('');
  const [editMarca, setEditMarca] = useState<string>('');
  const [editPresentacion, setEditPresentacion] = useState<string>('');
  const [editUnidad, setEditUnidad] = useState<string>('');
  const [editCantidad, setEditCantidad] = useState<string>('0');
  const [editPrecio, setEditPrecio] = useState<string>('0');
  const [editFechaEntrada, setEditFechaEntrada] = useState<string>(toISODate(new Date()));

  // Quick movement modal (+ Entrada / − Salida)
  const [movementModal, setMovementModal] = useState<{
    item: AlmacenItem;
    tipo: 'Entrada' | 'Salida';
  } | null>(null);
  const [movCantidad, setMovCantidad] = useState<string>('');
  const [movConcepto, setMovConcepto] = useState<string>('');
  const [movComprobante, setMovComprobante] = useState<string>('');
  const [movFecha, setMovFecha] = useState<string>(toISODate(new Date()));

  // Tarjeta de Estiba modal
  const [kardexItem, setKardexItem] = useState<AlmacenItem | null>(null);

  // Delete confirmation
  const [deletingId, setDeletingId] = useState<string | null>(null);

  useEscToClose(() => {
    if (movementModal) setMovementModal(null);
    else if (kardexItem) setKardexItem(null);
    else if (editingItem) setEditingItem(null);
    else if (isNewModalOpen) setIsNewModalOpen(false);
  });

  // Productos de almacén ordenados alfabéticamente
  const sortedAlmacen = useMemo(() => {
    return [...data.almacen].sort(
      (a, b) =>
        (a.producto || '').localeCompare(b.producto || '', 'es', { sensitivity: 'base' }) ||
        (a.marca || '').localeCompare(b.marca || '', 'es', { sensitivity: 'base' })
    );
  }, [data.almacen]);

  // Parsed presentation for Insert modal
  const parsedNewPresentacion = useMemo(() => {
    return parsePresentacion(newPresentacion);
  }, [newPresentacion]);

  // Cantidad Total autocalculada (Cantidad * factor de Presentación)
  const newCantidadTotalCalculada = useMemo(() => {
    const cant = parseFloat(newCantidad);
    if (isNaN(cant) || cant < 0) return 0;
    return cant * parsedNewPresentacion.factor;
  }, [newCantidad, parsedNewPresentacion.factor]);

  // Importe automático en modal Insertar Producto (Precio de la presentación * Cantidad)
  const newImporteCalculado = useMemo(() => {
    const cant = parseFloat(newCantidad);
    const price = parseFloat(newPrecio);
    if (isNaN(cant) || isNaN(price) || cant < 0 || price < 0) return 0;
    return cant * price;
  }, [newCantidad, newPrecio]);

  // Parsed presentation for Edit modal
  const parsedEditPresentacion = useMemo(() => {
    return parsePresentacion(editPresentacion);
  }, [editPresentacion]);

  const editFactorResuelto = useMemo(() => {
    if (editPresentacion.trim() && parsedEditPresentacion.hasParsedFactorAndUnit) {
      return parsedEditPresentacion.factor;
    }
    if (editingItem && editPresentacion.trim() === (editingItem.presentacion || '').trim()) {
      return getItemPresentacionFactor(editingItem);
    }
    return 1;
  }, [editingItem, editPresentacion, parsedEditPresentacion]);

  const editUnidadResuelta = useMemo(() => {
    if (editPresentacion.trim() && parsedEditPresentacion.hasParsedFactorAndUnit) {
      return parsedEditPresentacion.unidad;
    }
    return editUnidad.trim() || editingItem?.unidad || 'u';
  }, [editingItem, editPresentacion, parsedEditPresentacion, editUnidad]);

  // Cantidad Total autocalculada en modal Editar Producto
  const editCantidadTotalCalculada = useMemo(() => {
    const cant = parseFloat(editCantidad);
    if (isNaN(cant) || cant < 0) return 0;
    return cant * editFactorResuelto;
  }, [editCantidad, editFactorResuelto]);

  // Importe total de todo el almacén (suma de (existencia / factorPresentacion) * precio)
  const totalImporteAlmacen = useMemo(() => {
    return data.almacen.reduce((sum, item) => {
      const existencia = Number(item.existencia) || 0;
      const precio = Number(item.precio) || 0;
      const factor = getItemPresentacionFactor(item);
      return sum + (existencia / factor) * precio;
    }, 0);
  }, [data.almacen]);

  // Importe automático en modal Editar Producto (Cantidad * Precio)
  const editImporteCalculado = useMemo(() => {
    const cant = parseFloat(editCantidad);
    const price = parseFloat(editPrecio);
    if (isNaN(cant) || isNaN(price) || cant < 0 || price < 0) return 0;
    return cant * price;
  }, [editCantidad, editPrecio]);

  // Open Add modal
  const handleOpenAdd = () => {
    setNewProducto('');
    setNewMarca('');
    setNewPresentacion('');
    setNewCantidad('');
    setNewPrecio('');
    setNewFechaEntrada(toISODate(new Date()));
    setIsNewModalOpen(true);
  };

  const handleSaveNew = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newProducto.trim() || !newPresentacion.trim()) return;

    const cant = parseFloat(newCantidad);
    const price = parseFloat(newPrecio);
    if (isNaN(cant) || cant < 0 || isNaN(price) || price < 0) return;

    const { factor, unidad } = parsedNewPresentacion;
    const existenciaTotal = cant * factor;

    addAlmacenItem({
      producto: newProducto.trim(),
      marca: newMarca.trim() || undefined,
      presentacion: newPresentacion.trim(),
      unidad: unidad || 'u',
      contenidoTotal: factor,
      existencia: existenciaTotal,
      precio: price,
      fechaConteo: newFechaEntrada || toISODate(new Date()),
    });

    setIsNewModalOpen(false);
  };

  // Open Edit modal
  const handleOpenEdit = (item: AlmacenItem) => {
    const factor = getItemPresentacionFactor(item);
    const cant = (Number(item.existencia) || 0) / factor;
    setEditingItem(item);
    setEditProducto(item.producto);
    setEditMarca(item.marca || '');
    setEditPresentacion(item.presentacion || '');
    setEditUnidad(item.unidad);
    setEditCantidad(String(Number(cant.toFixed(4))));
    setEditPrecio(String(item.precio ?? 0));
    setEditFechaEntrada(item.fechaConteo || toISODate(new Date()));
  };

  const handleSaveEdit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingItem || !editProducto.trim()) return;

    const cant = parseFloat(editCantidad);
    const price = parseFloat(editPrecio);
    if (isNaN(cant) || cant < 0 || isNaN(price) || price < 0) return;

    const existenciaTotal = cant * editFactorResuelto;
    const resolvedFecha = editFechaEntrada || editingItem.fechaConteo || toISODate(new Date());

    updateAlmacenItem(editingItem.id, {
      producto: editProducto.trim(),
      marca: editMarca.trim() || undefined,
      presentacion: editPresentacion.trim() || undefined,
      unidad: editUnidadResuelta,
      contenidoTotal: editFactorResuelto,
      existencia: existenciaTotal,
      precio: price,
      fechaConteo: resolvedFecha,
      movimientos: (editingItem.movimientos || []).map((m) =>
        m.comprobante === 'INICIAL' ? { ...m, fecha: resolvedFecha } : m
      ),
    });

    setEditingItem(null);
  };

  // Open Movement modal
  const handleOpenMovement = (item: AlmacenItem, tipo: 'Entrada' | 'Salida') => {
    setMovementModal({ item, tipo });
    setMovCantidad('');
    setMovConcepto(tipo === 'Entrada' ? 'Compra de materia prima' : 'Consumo en producción');
    setMovComprobante('');
    setMovFecha(toISODate(new Date()));
  };

  const handleSaveMovement = (e: React.FormEvent) => {
    e.preventDefault();
    if (!movementModal) return;

    const cant = parseFloat(movCantidad);
    if (isNaN(cant) || cant <= 0) return;

    addMovimientoAlmacen(
      movementModal.item.id,
      movementModal.tipo,
      cant,
      movConcepto.trim() || (movementModal.tipo === 'Entrada' ? 'Entrada' : 'Salida'),
      movComprobante.trim(),
      movFecha
    );

    // If kardex is open for this item, refresh it
    if (kardexItem && kardexItem.id === movementModal.item.id) {
      const updated = data.almacen.find((a) => a.id === movementModal.item.id);
      if (updated) setKardexItem(updated);
    }

    setMovementModal(null);
  };

  // Keep kardexItem in sync with global state changes
  const activeKardexItem = kardexItem
    ? data.almacen.find((a) => a.id === kardexItem.id) || null
    : null;

  return (
    <div className="space-y-3 pb-2">
      {/* Action button bar with Total Warehouse Importe aligned left and Insertar Producto aligned right */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2 px-3 py-1.5 bg-amber-50 border border-amber-200 rounded-md shadow-2xs">
          <span className="text-xs font-semibold text-amber-900">
            Importe Total en Almacén:
          </span>
          <span className="text-sm font-black text-emerald-800 font-mono">
            {formatNumber(totalImporteAlmacen)}
          </span>
        </div>

        <button
          type="button"
          onClick={handleOpenAdd}
          className="px-3 py-1.5 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-md flex items-center gap-1.5 shadow-xs transition-colors shrink-0"
        >
          <Plus className="w-4 h-4" />
          <span>Insertar Producto</span>
        </button>
      </div>

      {/* Almacén Table */}
      <div className="bg-white border border-gray-200 rounded-lg overflow-hidden shadow-2xs">
        <div className="overflow-auto max-h-[calc(100dvh-11.5rem)]">
          <table className="w-full text-left border-collapse text-xs">
            <thead className="sticky top-0 z-20 bg-slate-50">
              <tr className="bg-slate-50 text-gray-600 font-semibold">
                <th className="py-2 px-3 sticky top-0 z-20 bg-slate-50 shadow-[inset_0_-1px_0_0_#e5e7eb]">Producto / Marca</th>
                <th className="py-2 px-3 sticky top-0 z-20 bg-slate-50 shadow-[inset_0_-1px_0_0_#e5e7eb]">Presentación</th>
                <th className="py-2 px-3 text-right w-24 sticky top-0 z-20 bg-slate-50 shadow-[inset_0_-1px_0_0_#e5e7eb]">Cantidad</th>
                <th className="py-2 px-3 text-right w-32 sticky top-0 z-20 bg-slate-50 shadow-[inset_0_-1px_0_0_#e5e7eb]">Cantidad Total</th>
                <th className="py-2 px-3 text-right w-28 sticky top-0 z-20 bg-slate-50 shadow-[inset_0_-1px_0_0_#e5e7eb]">Precio</th>
                <th className="py-2 px-3 text-right w-28 sticky top-0 z-20 bg-slate-50 shadow-[inset_0_-1px_0_0_#e5e7eb]">Importe</th>
                <th className="py-2 px-3 text-center w-52 sticky top-0 z-20 bg-slate-50 shadow-[inset_0_-1px_0_0_#e5e7eb]">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {sortedAlmacen.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-8 text-center text-gray-500">
                    <p className="text-xs">No hay materias primas registradas en el almacén.</p>
                    <button
                      type="button"
                      onClick={handleOpenAdd}
                      className="mt-2 text-xs font-medium text-emerald-700 hover:underline inline-flex items-center gap-1"
                    >
                      <Plus className="w-3.5 h-3.5" /> Registrar primera materia prima
                    </button>
                  </td>
                </tr>
              ) : (
                sortedAlmacen.map((item) => {
                  const itemPrecio = Number(item.precio) || 0;
                  const factor = getItemPresentacionFactor(item);
                  const existencia = Number(item.existencia) || 0;
                  const cantPresentaciones = existencia / factor;
                  const itemImporte = cantPresentaciones * itemPrecio;
                  const isAgotado = existencia <= 0;

                  return (
                    <tr
                      key={item.id}
                      className={`transition-colors ${
                        isAgotado
                          ? 'bg-rose-50/90 hover:bg-rose-100/75'
                          : 'hover:bg-slate-50'
                      }`}
                    >
                      <td className="py-2 px-3 relative z-10">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span
                            className={`font-semibold ${
                              isAgotado ? 'text-rose-950' : 'text-gray-900'
                            }`}
                          >
                            {item.producto}
                          </span>
                          {item.marca && (
                            <span
                              className={`text-[10px] font-medium px-1.5 py-0.5 rounded border ${
                                isAgotado
                                  ? 'bg-rose-100/80 text-rose-800 border-rose-200'
                                  : 'bg-slate-100 text-slate-700 border-slate-200'
                              }`}
                            >
                              {item.marca}
                            </span>
                          )}
                          {isAgotado && (
                            <span className="text-[10px] font-bold uppercase tracking-wider text-rose-700">
                              · Agotado
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="py-2 px-3 text-gray-700 relative z-10">
                        {item.presentacion ? (
                          <span className={isAgotado ? 'text-rose-900/90' : ''}>
                            {item.presentacion}
                          </span>
                        ) : (
                          <span className={isAgotado ? 'text-rose-700/80' : 'text-gray-500'}>
                            {item.unidad}
                          </span>
                        )}
                      </td>
                      <td className="py-2 px-3 text-right font-mono font-medium relative">
                        {isAgotado && (
                          <span
                            aria-hidden="true"
                            className="pointer-events-none select-none absolute inset-y-0 left-1/2 -translate-x-1/2 flex items-center justify-center text-sm sm:text-base font-black uppercase tracking-[0.5em] text-rose-500/20 -rotate-3 whitespace-nowrap z-0"
                          >
                            AGOTADO
                          </span>
                        )}
                        <span
                          className={`relative z-10 ${
                            isAgotado ? 'text-rose-700 font-bold' : 'text-gray-800'
                          }`}
                        >
                          {formatNumber(cantPresentaciones)}
                        </span>
                      </td>
                      <td className="py-2 px-3 text-right whitespace-nowrap relative z-10">
                        <span
                          className={`font-black text-sm font-mono ${
                            isAgotado ? 'text-rose-700' : 'text-gray-900'
                          }`}
                        >
                          {formatNumber(existencia)}
                        </span>
                        <span
                          className={`text-[11px] ml-1 font-medium ${
                            isAgotado ? 'text-rose-600' : 'text-gray-600'
                          }`}
                        >
                          {item.unidad}
                        </span>
                      </td>
                      <td
                        className={`py-2 px-3 text-right font-mono relative z-10 ${
                          isAgotado ? 'text-rose-900/80' : 'text-gray-700'
                        }`}
                      >
                        {formatNumber(itemPrecio)}
                      </td>
                      <td
                        className={`py-2 px-3 text-right font-bold font-mono relative z-10 ${
                          isAgotado ? 'text-rose-700' : 'text-emerald-800'
                        }`}
                      >
                        {formatNumber(itemImporte)}
                      </td>
                      <td className="py-2 px-3 text-center relative z-10">
                        <div className="flex items-center justify-center gap-1 flex-wrap">
                          {/* Botón + Entrada */}
                          <button
                            type="button"
                            onClick={() => handleOpenMovement(item, 'Entrada')}
                            className="px-2 py-1 text-[11px] font-semibold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 rounded flex items-center gap-1 transition-colors"
                            title="Registrar entrada de stock"
                          >
                            <Plus className="w-3 h-3" />
                            <span>Entrada</span>
                          </button>

                          {/* Botón − Salida */}
                          <button
                            type="button"
                            onClick={() => handleOpenMovement(item, 'Salida')}
                            className="px-2 py-1 text-[11px] font-semibold text-rose-700 bg-rose-50 hover:bg-rose-100 border border-rose-200 rounded flex items-center gap-1 transition-colors"
                            title="Registrar salida de stock"
                          >
                            <Minus className="w-3 h-3" />
                            <span>Salida</span>
                          </button>

                          {/* Tarjeta de Estiba (Kardex) */}
                          <button
                            type="button"
                            onClick={() => setKardexItem(item)}
                            className="p-1 text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded transition-colors"
                            title="Ver Tarjeta de Estiba (Kardex)"
                          >
                            <FileText className="w-3.5 h-3.5" />
                          </button>

                          {/* Editar */}
                          <button
                            type="button"
                            onClick={() => handleOpenEdit(item)}
                            className="p-1 text-gray-500 hover:text-amber-600 rounded transition-colors"
                            title="Editar materia prima"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                          </button>

                          {/* Eliminar */}
                          <button
                            type="button"
                            onClick={() => setDeletingId(item.id)}
                            className="p-1 text-gray-500 hover:text-rose-600 rounded transition-colors"
                            title="Eliminar materia prima"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal Tarjeta de Estiba (Kardex) */}
      {activeKardexItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 bg-black/50 backdrop-blur-xs">
          <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full p-4 space-y-3 animate-in fade-in duration-150 max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between border-b border-gray-100 pb-2">
              <div>
                <h3 className="font-bold text-sm text-gray-900 flex items-center gap-2">
                  <FileText className="w-4 h-4 text-amber-600" />
                  <span>Tarjeta de Estiba — {activeKardexItem.producto}</span>
                </h3>
                <p className="text-[11px] text-gray-500 mt-0.5">
                  Unidad: {activeKardexItem.unidad} | Existencia actual:{' '}
                  <span className="font-black text-gray-900">
                    {formatNumber(activeKardexItem.existencia)} {activeKardexItem.unidad}
                  </span>
                </p>
              </div>
              <button
                type="button"
                onClick={() => setKardexItem(null)}
                className="text-gray-400 hover:text-gray-600 text-sm"
              >
                ✕
              </button>
            </div>

            {/* Sub-actions: quick add movement right from Kardex */}
            <div className="flex items-center justify-between text-xs pt-1">
              <span className="font-semibold text-gray-700">Movimientos Históricos</span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => handleOpenMovement(activeKardexItem, 'Entrada')}
                  className="px-2 py-1 text-[11px] font-semibold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 rounded flex items-center gap-1"
                >
                  <Plus className="w-3 h-3" /> Entrada
                </button>
                <button
                  type="button"
                  onClick={() => handleOpenMovement(activeKardexItem, 'Salida')}
                  className="px-2 py-1 text-[11px] font-semibold text-rose-700 bg-rose-50 hover:bg-rose-100 border border-rose-200 rounded flex items-center gap-1"
                >
                  <Minus className="w-3 h-3" /> Salida
                </button>
              </div>
            </div>

            {/* Table of Movements */}
            <div className="border border-gray-200 rounded overflow-y-auto flex-1 min-h-[220px]">
              <table className="w-full text-left text-xs border-collapse">
                <thead className="sticky top-0 bg-slate-100 border-b border-gray-200 text-gray-600 font-semibold">
                  <tr>
                    <th className="py-1.5 px-2.5">Fecha</th>
                    <th className="py-1.5 px-2.5 text-center">Tipo</th>
                    <th className="py-1.5 px-2.5 text-right">Cantidad</th>
                    <th className="py-1.5 px-2.5 text-right">Saldo</th>
                    <th className="py-1.5 px-2.5">Concepto</th>
                    <th className="py-1.5 px-2.5">Comprobante</th>
                    <th className="py-1.5 px-2.5 text-center w-16">Acción</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {(!activeKardexItem.movimientos || activeKardexItem.movimientos.length === 0) ? (
                    <tr>
                      <td colSpan={7} className="py-6 text-center text-gray-500 text-xs">
                        No hay movimientos registrados.
                      </td>
                    </tr>
                  ) : (
                    activeKardexItem.movimientos.map((mov) => (
                      <tr key={mov.id} className="hover:bg-slate-50">
                        <td className="py-1.5 px-2.5 whitespace-nowrap text-gray-800">
                          {formatDate(mov.fecha)}
                        </td>
                        <td className="py-1.5 px-2.5 text-center">
                          <span
                            className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-bold ${
                              mov.tipo === 'Entrada'
                                ? 'bg-emerald-100 text-emerald-800'
                                : 'bg-rose-100 text-rose-800'
                            }`}
                          >
                            {mov.tipo === 'Entrada' ? '+ Entrada' : '− Salida'}
                          </span>
                        </td>
                        <td className="py-1.5 px-2.5 text-right font-medium text-gray-900">
                          {formatNumber(mov.cantidad)}
                        </td>
                        <td className="py-1.5 px-2.5 text-right font-black text-gray-900">
                          {formatNumber(mov.saldoResultante)}
                        </td>
                        <td className="py-1.5 px-2.5 text-gray-700">{mov.concepto}</td>
                        <td className="py-1.5 px-2.5 text-gray-500 font-mono text-[11px]">
                          {mov.comprobante || '—'}
                        </td>
                        <td className="py-1.5 px-2.5 text-center">
                          {mov.comprobante !== 'INICIAL' ? (
                            <button
                              type="button"
                              onClick={() =>
                                revertirMovimientoAlmacen(activeKardexItem.id, mov.id)
                              }
                              className="p-1 text-gray-400 hover:text-rose-600 rounded transition-colors"
                              title="Revertir movimiento de inventario"
                            >
                              <RotateCcw className="w-3.5 h-3.5" />
                            </button>
                          ) : (
                            <span className="text-[10px] text-gray-400">—</span>
                          )}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            <div className="flex justify-end pt-2 border-t border-gray-100">
              <button
                type="button"
                onClick={() => setKardexItem(null)}
                className="px-3 py-1.5 text-xs font-semibold text-gray-700 bg-gray-100 hover:bg-gray-200 rounded"
              >
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Registrar Movimiento (Entrada o Salida) */}
      {movementModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 bg-black/50 backdrop-blur-xs">
          <div className="bg-white rounded-lg shadow-xl max-w-sm w-full p-4 space-y-3 animate-in fade-in duration-150">
            <div className="flex items-center justify-between border-b border-gray-100 pb-2">
              <h3 className="font-bold text-sm text-gray-900 flex items-center gap-1.5">
                <span
                  className={
                    movementModal.tipo === 'Entrada' ? 'text-emerald-700' : 'text-rose-700'
                  }
                >
                  {movementModal.tipo === 'Entrada' ? '+ Entrada' : '− Salida'}
                </span>
                <span>de {movementModal.item.producto}</span>
              </h3>
              <button
                type="button"
                onClick={() => setMovementModal(null)}
                className="text-gray-400 hover:text-gray-600 text-sm"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSaveMovement} className="space-y-3 text-xs">
              <div className="p-2 bg-slate-50 border border-gray-200 rounded text-gray-600 flex justify-between">
                <span>Existencia actual:</span>
                <span className="font-black text-gray-900">
                  {formatNumber(movementModal.item.existencia)} {movementModal.item.unidad}
                </span>
              </div>

              <div>
                <label className="font-semibold text-gray-700 block mb-1">
                  Cantidad ({movementModal.item.unidad}):
                </label>
                <input
                  type="number"
                  step="any"
                  min="0.01"
                  required
                  autoFocus
                  value={movCantidad}
                  onChange={(e) => setMovCantidad(e.target.value)}
                  placeholder="0.00"
                  className="w-full h-8 px-2 border border-gray-300 rounded focus:ring-1 focus:ring-amber-500"
                />
              </div>

              <div>
                <label className="font-semibold text-gray-700 block mb-1">Fecha:</label>
                <input
                  type="date"
                  required
                  value={movFecha}
                  onChange={(e) => setMovFecha(e.target.value)}
                  className="w-full h-8 px-2 border border-gray-300 rounded focus:ring-1 focus:ring-amber-500"
                />
              </div>

              <div>
                <label className="font-semibold text-gray-700 block mb-1">Concepto:</label>
                <input
                  type="text"
                  required
                  value={movConcepto}
                  onChange={(e) => setMovConcepto(e.target.value)}
                  placeholder="Motivo del movimiento..."
                  className="w-full h-8 px-2 border border-gray-300 rounded focus:ring-1 focus:ring-amber-500"
                />
              </div>

              <div>
                <label className="font-semibold text-gray-700 block mb-1">
                  Comprobante / No. Factura (Opcional):
                </label>
                <input
                  type="text"
                  value={movComprobante}
                  onChange={(e) => setMovComprobante(e.target.value)}
                  placeholder="Ej. FAC-1204, VALE-22..."
                  className="w-full h-8 px-2 border border-gray-300 rounded focus:ring-1 focus:ring-amber-500"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-gray-100">
                <button
                  type="button"
                  onClick={() => setMovementModal(null)}
                  className="px-3 py-1.5 font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 rounded"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className={`px-4 py-1.5 font-semibold text-white rounded transition-colors ${
                    movementModal.tipo === 'Entrada'
                      ? 'bg-emerald-600 hover:bg-emerald-700'
                      : 'bg-rose-600 hover:bg-rose-700'
                  }`}
                >
                  Confirmar {movementModal.tipo}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Insertar Producto (Materia Prima) */}
      {isNewModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 bg-black/50 backdrop-blur-xs">
          <div className="bg-white rounded-lg shadow-xl max-w-lg w-full p-3.5 space-y-2.5 animate-in fade-in duration-150 max-h-[92vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-gray-100 pb-1.5">
              <h3 className="font-bold text-sm text-gray-900">Insertar Producto en Almacén</h3>
              <button
                type="button"
                onClick={() => setIsNewModalOpen(false)}
                className="text-gray-400 hover:text-gray-600 text-sm"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSaveNew} className="space-y-2 text-xs">
              <div className="flex flex-wrap sm:flex-nowrap gap-2">
                <div className="w-[126px] shrink-0">
                  <label className="font-semibold text-gray-700 text-[11px] block mb-0.5">
                    Fecha Entrada <span className="text-rose-500">*</span>:
                  </label>
                  <input
                    type="date"
                    required
                    value={newFechaEntrada}
                    onChange={(e) => setNewFechaEntrada(e.target.value)}
                    className="w-full h-7 px-1.5 border border-gray-300 rounded focus:ring-1 focus:ring-amber-500"
                  />
                </div>
                <div className="flex-1 min-w-[140px]">
                  <label className="font-semibold text-gray-700 text-[11px] block mb-0.5">
                    Materia Prima / Producto <span className="text-rose-500">*</span>:
                  </label>
                  <input
                    type="text"
                    required
                    autoFocus
                    placeholder="Ej. Harina, Azúcar..."
                    value={newProducto}
                    onChange={(e) => setNewProducto(e.target.value)}
                    className="w-full h-7 px-2 border border-gray-300 rounded focus:ring-1 focus:ring-amber-500"
                  />
                </div>
                <div className="w-full sm:w-28 shrink-0">
                  <label className="font-semibold text-gray-700 text-[11px] block mb-0.5">
                    Marca (Opc.):
                  </label>
                  <input
                    type="text"
                    placeholder="Ej. Bonoli"
                    value={newMarca}
                    onChange={(e) => setNewMarca(e.target.value)}
                    className="w-full h-7 px-2 border border-gray-300 rounded focus:ring-1 focus:ring-amber-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-12 gap-2">
                <div className="col-span-12 sm:col-span-7">
                  <label className="font-semibold text-gray-700 text-[11px] block mb-0.5">
                    Presentación <span className="text-rose-500">*</span>:
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="Ej. Sacos de 25 kg, Pomo 500 ml"
                    value={newPresentacion}
                    onChange={(e) => setNewPresentacion(e.target.value)}
                    className="w-full h-7 px-2 border border-gray-300 rounded focus:ring-1 focus:ring-amber-500"
                  />
                </div>
                <div className="col-span-12 sm:col-span-5">
                  <label className="font-semibold text-gray-700 text-[11px] block mb-0.5">
                    Cantidad Total (Calc.):
                  </label>
                  <div
                    title={
                      newPresentacion.trim() && parsedNewPresentacion.hasParsedFactorAndUnit
                        ? `${newCantidad || '0'} × ${formatNumber(parsedNewPresentacion.factor)} ${parsedNewPresentacion.unidad}`
                        : undefined
                    }
                    className="w-full h-7 px-2 border border-amber-200 rounded bg-amber-50 flex items-center justify-end gap-1 font-black text-amber-950 font-mono truncate"
                  >
                    <span>{formatNumber(newCantidadTotalCalculada)}</span>
                    {newPresentacion.trim() && (
                      <span className="text-[11px] font-semibold text-amber-800">
                        {parsedNewPresentacion.unidad}
                      </span>
                    )}
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-12 gap-2">
                <div className="col-span-3">
                  <label className="font-semibold text-gray-700 text-[11px] block mb-0.5">
                    Cantidad <span className="text-rose-500">*</span>:
                  </label>
                  <input
                    type="number"
                    step="any"
                    min="0"
                    required
                    placeholder="5"
                    value={newCantidad}
                    onChange={(e) => setNewCantidad(e.target.value)}
                    className="w-full h-7 px-2 border border-gray-300 rounded focus:ring-1 focus:ring-amber-500 font-mono text-right"
                  />
                </div>
                <div className="col-span-4">
                  <label className="font-semibold text-gray-700 text-[11px] block mb-0.5">
                    Precio <span className="text-rose-500">*</span>:
                  </label>
                  <input
                    type="number"
                    step="any"
                    min="0"
                    required
                    placeholder="0.00"
                    value={newPrecio}
                    onChange={(e) => setNewPrecio(e.target.value)}
                    className="w-full h-7 px-2 border border-gray-300 rounded focus:ring-1 focus:ring-amber-500 font-mono text-right"
                  />
                </div>
                <div className="col-span-5">
                  <label className="font-semibold text-gray-700 text-[11px] block mb-0.5">
                    Importe (Calc.):
                  </label>
                  <div className="w-full h-7 px-2 border border-emerald-200 rounded bg-emerald-50 flex items-center justify-end font-black text-emerald-800 font-mono truncate">
                    {formatNumber(newImporteCalculado)}
                  </div>
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-gray-100">
                <button
                  type="button"
                  onClick={() => setIsNewModalOpen(false)}
                  className="px-3 py-1 font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 rounded"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-3.5 py-1 font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded transition-colors"
                >
                  Insertar Producto
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Editar Producto (Materia Prima) */}
      {editingItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 bg-black/50 backdrop-blur-xs">
          <div className="bg-white rounded-lg shadow-xl max-w-lg w-full p-3.5 space-y-2.5 animate-in fade-in duration-150 max-h-[92vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-gray-100 pb-1.5">
              <h3 className="font-bold text-sm text-gray-900">Editar Producto en Almacén</h3>
              <button
                type="button"
                onClick={() => setEditingItem(null)}
                className="text-gray-400 hover:text-gray-600 text-sm"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSaveEdit} className="space-y-2 text-xs">
              <div className="flex flex-wrap sm:flex-nowrap gap-2">
                <div className="w-[126px] shrink-0">
                  <label className="font-semibold text-gray-700 text-[11px] block mb-0.5">
                    Fecha Entrada <span className="text-rose-500">*</span>:
                  </label>
                  <input
                    type="date"
                    required
                    value={editFechaEntrada}
                    onChange={(e) => setEditFechaEntrada(e.target.value)}
                    className="w-full h-7 px-1.5 border border-gray-300 rounded focus:ring-1 focus:ring-amber-500"
                  />
                </div>
                <div className="flex-1 min-w-[140px]">
                  <label className="font-semibold text-gray-700 text-[11px] block mb-0.5">
                    Materia Prima / Producto:
                  </label>
                  <input
                    type="text"
                    required
                    value={editProducto}
                    onChange={(e) => setEditProducto(e.target.value)}
                    className="w-full h-7 px-2 border border-gray-300 rounded focus:ring-1 focus:ring-amber-500"
                  />
                </div>
                <div className="w-full sm:w-28 shrink-0">
                  <label className="font-semibold text-gray-700 text-[11px] block mb-0.5">
                    Marca (Opc.):
                  </label>
                  <input
                    type="text"
                    placeholder="Ej. Bonoli"
                    value={editMarca}
                    onChange={(e) => setEditMarca(e.target.value)}
                    className="w-full h-7 px-2 border border-gray-300 rounded focus:ring-1 focus:ring-amber-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-12 gap-2">
                <div className="col-span-12 sm:col-span-7">
                  <label className="font-semibold text-gray-700 text-[11px] block mb-0.5">
                    Presentación:
                  </label>
                  <input
                    type="text"
                    placeholder="Ej. Sacos de 25 kg, Pomo 500 ml"
                    value={editPresentacion}
                    onChange={(e) => setEditPresentacion(e.target.value)}
                    className="w-full h-7 px-2 border border-gray-300 rounded focus:ring-1 focus:ring-amber-500"
                  />
                </div>
                <div className="col-span-12 sm:col-span-5">
                  <label className="font-semibold text-gray-700 text-[11px] block mb-0.5">
                    Cantidad Total (Calc.):
                  </label>
                  <div
                    title={
                      editPresentacion.trim() && parsedEditPresentacion.hasParsedFactorAndUnit
                        ? `${editCantidad || '0'} × ${formatNumber(editFactorResuelto)} ${editUnidadResuelta}`
                        : undefined
                    }
                    className="w-full h-7 px-2 border border-amber-200 rounded bg-amber-50 flex items-center justify-end gap-1 font-black text-amber-950 font-mono truncate"
                  >
                    <span>{formatNumber(editCantidadTotalCalculada)}</span>
                    <span className="text-[11px] font-semibold text-amber-800">
                      {editUnidadResuelta}
                    </span>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-12 gap-2">
                <div className="col-span-3">
                  <label className="font-semibold text-gray-700 text-[11px] block mb-0.5">
                    Cantidad <span className="text-rose-500">*</span>:
                  </label>
                  <input
                    type="number"
                    step="any"
                    min="0"
                    required
                    placeholder="5"
                    value={editCantidad}
                    onChange={(e) => setEditCantidad(e.target.value)}
                    className="w-full h-7 px-2 border border-gray-300 rounded focus:ring-1 focus:ring-amber-500 font-mono text-right"
                  />
                </div>
                <div className="col-span-4">
                  <label className="font-semibold text-gray-700 text-[11px] block mb-0.5">
                    Precio <span className="text-rose-500">*</span>:
                  </label>
                  <input
                    type="number"
                    step="any"
                    min="0"
                    required
                    value={editPrecio}
                    onChange={(e) => setEditPrecio(e.target.value)}
                    className="w-full h-7 px-2 border border-gray-300 rounded focus:ring-1 focus:ring-amber-500 font-mono text-right"
                  />
                </div>
                <div className="col-span-5">
                  <label className="font-semibold text-gray-700 text-[11px] block mb-0.5">
                    Importe (Calc.):
                  </label>
                  <div className="w-full h-7 px-2 border border-emerald-200 rounded bg-emerald-50 flex items-center justify-end font-black text-emerald-800 font-mono truncate">
                    {formatNumber(editImporteCalculado)}
                  </div>
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-gray-100">
                <button
                  type="button"
                  onClick={() => setEditingItem(null)}
                  className="px-3 py-1 font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 rounded"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-3.5 py-1 font-semibold text-white bg-amber-600 hover:bg-amber-700 rounded transition-colors"
                >
                  Guardar Cambios
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete confirmation */}
      <ConfirmModal
        isOpen={!!deletingId}
        title="Eliminar Materia Prima"
        message="¿Estás seguro de que deseas eliminar este producto de almacén junto con todo su historial de movimientos?"
        onConfirm={() => {
          if (deletingId) {
            deleteAlmacenItem(deletingId);
            setDeletingId(null);
          }
        }}
        onCancel={() => setDeletingId(null)}
      />
    </div>
  );
};
