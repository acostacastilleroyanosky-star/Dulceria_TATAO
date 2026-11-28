import React from 'react';
import { useApp } from '../context/AppContext';
import {
  Cloud,
  RefreshCw,
  Database,
  UploadCloud,
  DownloadCloud,
  Clock,
  X,
  CheckCircle2,
} from 'lucide-react';

export const CloudSyncModal: React.FC = () => {
  const {
    isCloudSyncModalOpen,
    setIsCloudSyncModalOpen,
    data,
    isSyncing,
    isFirestoreReady,
    lastCloudSync,
    syncWithCloud,
  } = useApp();

  if (!isCloudSyncModalOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/45 backdrop-blur-xs animate-in fade-in duration-150">
      <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full p-5 space-y-4 border border-slate-200 animate-in zoom-in-95 duration-150 max-h-[90vh] overflow-y-auto">
        {/* Encabezado */}
        <div className="flex items-center justify-between border-b border-gray-100 pb-3">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-amber-600 text-white flex items-center justify-center shadow-xs">
              <Cloud className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-black text-gray-900 text-base">
                Sincronización en la Nube
              </h3>
              <p className="text-xs text-gray-500">
                Firebase Firestore • Tiempo Real
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setIsCloudSyncModalOpen(false)}
            className="text-gray-400 hover:text-gray-600 p-1.5 rounded-lg hover:bg-gray-100 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Estado del Servidor y Base de Datos */}
        <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-xl space-y-2">
          <div className="flex items-center justify-between text-xs">
            <span className="text-gray-600 font-semibold flex items-center gap-1.5">
              <Database className="w-3.5 h-3.5 text-amber-700" />
              Estado Base de Datos:
            </span>
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-200">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-600 animate-pulse"></span>
              {isFirestoreReady ? 'Firestore Conectado' : 'Conectando...'}
            </span>
          </div>

          <div className="flex items-center justify-between text-xs">
            <span className="text-gray-600 font-semibold flex items-center gap-1.5">
              <Clock className="w-3.5 h-3.5 text-slate-500" />
              Última actualización:
            </span>
            <span className="font-bold text-gray-800">
              {lastCloudSync
                ? lastCloudSync.toLocaleTimeString('es-CU', {
                    hour: '2-digit',
                    minute: '2-digit',
                    second: '2-digit',
                  }) +
                  ' (' +
                  lastCloudSync.toLocaleDateString('es-CU') +
                  ')'
                : 'Pendiente'}
            </span>
          </div>

          <div className="pt-2 border-t border-slate-200/60 grid grid-cols-4 gap-2 text-center text-[11px]">
            <div className="bg-white p-1.5 rounded-lg border border-slate-200">
              <span className="text-gray-500 block text-[10px]">Ventas</span>
              <span className="font-black text-amber-700 text-xs">
                {data.ventas.length}
              </span>
            </div>
            <div className="bg-white p-1.5 rounded-lg border border-slate-200">
              <span className="text-gray-500 block text-[10px]">Producción</span>
              <span className="font-black text-amber-700 text-xs">
                {data.produccion.length}
              </span>
            </div>
            <div className="bg-white p-1.5 rounded-lg border border-slate-200">
              <span className="text-gray-500 block text-[10px]">Gastos</span>
              <span className="font-black text-amber-700 text-xs">
                {data.gastos.length}
              </span>
            </div>
            <div className="bg-white p-1.5 rounded-lg border border-slate-200">
              <span className="text-gray-500 block text-[10px]">Facturas</span>
              <span className="font-black text-amber-700 text-xs">
                {data.facturas?.length || 0}
              </span>
            </div>
          </div>
        </div>

        {/* Estado de Tiempo Real */}
        <div className="p-3 bg-emerald-50/70 border border-emerald-200 rounded-xl flex items-start gap-2.5 text-xs text-emerald-900">
          <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
          <p className="text-[11px] leading-relaxed">
            <strong>Sincronización automática en tiempo real activa:</strong> cada venta, lote de
            producción, gasto, movimiento de almacén o receta se guarda directamente en Firebase
            Firestore y se refleja al instante en Vercel y en cualquier navegador autorizado.
          </p>
        </div>

        {/* Acciones de Sincronización Manual */}
        <div className="space-y-3">
          <div className="p-3.5 bg-amber-50/60 border border-amber-200/70 rounded-xl flex items-center justify-between gap-3">
            <div className="space-y-0.5">
              <h4 className="font-black text-gray-900 text-xs flex items-center gap-1.5">
                <DownloadCloud className="w-4 h-4 text-amber-700" />
                Actualizar desde Firestore
              </h4>
              <p className="text-[11px] text-gray-600 leading-normal">
                Fuerza una lectura directa del servidor de Firestore para verificar los registros más recientes.
              </p>
            </div>
            <button
              type="button"
              onClick={() => syncWithCloud('pull')}
              disabled={isSyncing}
              className="px-3 py-2 bg-amber-600 hover:bg-amber-700 active:bg-amber-800 disabled:opacity-50 text-white font-bold rounded-lg text-xs shrink-0 flex items-center gap-1.5 transition-colors shadow-2xs cursor-pointer"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isSyncing ? 'animate-spin' : ''}`} />
              <span>{isSyncing ? 'Cargando...' : 'Actualizar'}</span>
            </button>
          </div>

          <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-xl flex items-center justify-between gap-3">
            <div className="space-y-0.5">
              <h4 className="font-black text-gray-900 text-xs flex items-center gap-1.5">
                <UploadCloud className="w-4 h-4 text-slate-700" />
                Respaldar vista actual en Firestore
              </h4>
              <p className="text-[11px] text-gray-600 leading-normal">
                Sobrescribe Firestore con todos los registros cargados actualmente en pantalla (útil tras importar un respaldo).
              </p>
            </div>
            <button
              type="button"
              onClick={() => syncWithCloud('push')}
              disabled={isSyncing}
              className="px-3 py-2 bg-slate-800 hover:bg-slate-900 active:bg-black disabled:opacity-50 text-white font-bold rounded-lg text-xs shrink-0 flex items-center gap-1.5 transition-colors shadow-2xs cursor-pointer"
            >
              <UploadCloud className="w-3.5 h-3.5" />
              <span>Subir</span>
            </button>
          </div>
        </div>

        {/* Footer */}
        <div className="flex justify-end pt-2 border-t border-gray-100">
          <button
            type="button"
            onClick={() => setIsCloudSyncModalOpen(false)}
            className="px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 font-bold text-xs rounded-lg transition-colors cursor-pointer"
          >
            Cerrar
          </button>
        </div>
      </div>
    </div>
  );
};
