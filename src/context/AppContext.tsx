import React, { createContext, useContext, useState, useEffect, useMemo, useRef, ReactNode } from 'react';
import initialJson from '../data/datos_tatao.json';
import {
  AppData,
  ModuleName,
  ProduccionLote,
  VentaVale,
  GastoItem,
  AlmacenItem,
  Cliente,
  Producto,
  FacturaItem,
  RepartoSemanal,
  JustificacionDiferencia,
  Receta,
  UsuarioAutorizado,
  MetaConfig,
} from '../types';
import { getDefaultDateRange, getQuickRange, QuickDatePreset } from '../utils/dateUtils';
import {
  getPrecioVigente,
  getPagoPorDulce,
  calculateReparto,
  calculateReconciliation,
  getRecetaAgotados,
} from '../lib/calculations';
import { useAuth } from './AuthContext';
import {
  buildAllowedEmails,
  checkUserAccess,
  fetchAllFirestoreFromServer,
  fsDeleteEntity,
  fsDeleteProduccionAndGastos,
  fsDeshacerRepartoPagado,
  fsSaveClienteAndRefs,
  fsSaveConfigMeta,
  fsSaveProduccionAndGasto,
  fsSaveReglasReparto,
  fsSaveRepartoPagado,
  fsSaveUsuarioAndSyncAllowedEmails,
  fsSaveVentaAndNextVale,
  fsSetEntity,
  isPrimaryAdminEmail,
  replaceAllFirestoreData,
  seedFirestoreIfNeeded,
  subscribeToFirestoreData,
} from '../lib/firestoreStore';

const STORAGE_KEY = 'dulceria_tatao_data_v2';
const NOTES_KEY = 'dulceria_tatao_reconciliation_note';

type AccessStatus = 'loading' | 'unauthenticated' | 'authorized' | 'denied';
type UserRole = 'Administrador' | 'Operador' | 'Lector';

interface AppContextType {
  data: AppData;
  currentModule: ModuleName;
  setCurrentModule: (mod: ModuleName) => void;
  fechaDesde: string;
  fechaHasta: string;
  setDateRange: (desde: string, hasta: string) => void;
  applyQuickPreset: (preset: QuickDatePreset) => void;
  reconciliationNote: string;
  saveReconciliationNote: (note: string) => void;

  // Estado de acceso y Firestore
  accessStatus: AccessStatus;
  currentUserRole: UserRole | null;
  isFirestoreReady: boolean;

  // Contador global de alertas pendientes, repartos pendientes y recetas con material agotado
  pendingAlertsCount: number;
  pendingRepartosCount: number;
  outOfStockRecetasCount: number;

  // Justificaciones de diferencias
  justificaciones: JustificacionDiferencia[];
  addJustificacion: (fecha: string, nota: string, producto?: string) => void;
  updateJustificacion: (id: string, nota: string) => void;
  deleteJustificacion: (id: string) => void;

  // Producción
  addProduccion: (lote: Omit<ProduccionLote, 'id' | 'costo'>) => void;
  updateProduccion: (id: string, lote: Partial<ProduccionLote>) => void;
  deleteProduccion: (id: string) => void;

  // Ventas
  getNextValeNumber: () => string;
  addVenta: (venta: Omit<VentaVale, 'id' | 'vale'>) => void;
  updateVenta: (id: string, venta: Partial<VentaVale>) => void;
  deleteVenta: (id: string) => void;

  // Gastos
  addGasto: (gasto: Omit<GastoItem, 'id'>) => void;
  updateGasto: (id: string, gasto: Partial<GastoItem>) => void;
  deleteGasto: (id: string) => void;

  // Caja & Repartos
  marcarRepartoPagado: (repartoId: string, fechaPago: string) => void;
  deshacerRepartoPagado: (repartoId: string) => void;
  updateReglasReparto: (fondoPct: number, administradorPct: number, duenos: string[]) => void;

  // Almacén
  addAlmacenItem: (item: Omit<AlmacenItem, 'id' | 'codigo' | 'movimientos'>) => void;
  updateAlmacenItem: (id: string, item: Partial<AlmacenItem>) => void;
  deleteAlmacenItem: (id: string) => void;
  addMovimientoAlmacen: (
    itemId: string,
    tipo: 'Entrada' | 'Salida',
    cantidad: number,
    concepto: string,
    comprobante?: string,
    fecha?: string
  ) => void;
  revertirMovimientoAlmacen: (itemId: string, movId: string) => void;

  // Clientes
  addCliente: (cli: Omit<Cliente, 'id'>) => void;
  updateCliente: (id: string, cli: Partial<Cliente>) => void;
  deleteCliente: (id: string) => void;

  // Productos & Precios
  addProducto: (prod: {
    nombre: string;
    precioVenta: number;
    fechaInicio: string;
    vigenteHasta?: string | null;
    activo?: boolean;
  }) => void;
  updateProductoActivo: (id: string, activo: boolean) => void;
  updatePrecioProducto: (
    id: string,
    nuevoPrecio: number,
    fechaInicio: string,
    vigenteHasta?: string | null
  ) => void;
  updateCostoUnitario: (id: string, costoUnitario: number | null) => void;
  updateParametrosProducto: (
    productoNombre: string,
    pagoTrabajador: number,
    gananciaUnidad: number,
    desde: string
  ) => void;

  // Submenú 2: Recetas
  addReceta: (rec: Omit<Receta, 'id'>) => void;
  updateReceta: (id: string, rec: Partial<Receta>) => void;
  deleteReceta: (id: string) => void;

  // Ajustes -> Usuarios
  usuariosAutorizados: UsuarioAutorizado[];
  addUsuarioAutorizado: (usr: Omit<UsuarioAutorizado, 'id' | 'fechaAgregado'>) => void;
  updateUsuarioAutorizado: (id: string, usr: Partial<UsuarioAutorizado>) => void;
  deleteUsuarioAutorizado: (id: string) => void;

  // Facturas
  getNextFacturaNumber: () => string;
  addFactura: (factura: Omit<FacturaItem, 'id'>) => void;
  deleteFactura: (id: string) => void;

  // Respaldos
  importBackup: (backupContent: string) => boolean;
  exportBackup: () => void;

  // Sincronización en la Nube & Auto-sync
  isSyncing: boolean;
  lastCloudSync: Date | null;
  syncStatusMessage: { type: 'success' | 'error' | 'info'; text: string } | null;
  setSyncStatusMessage: (msg: { type: 'success' | 'error' | 'info'; text: string } | null) => void;
  autoSyncWarning: { active: boolean; secondsLeft: number } | null;
  isAutoSyncEnabled: boolean;
  setIsAutoSyncEnabled: (enabled: boolean) => void;
  isCloudSyncModalOpen: boolean;
  setIsCloudSyncModalOpen: (open: boolean) => void;
  syncWithCloud: (mode?: 'pull' | 'push') => Promise<{ success: boolean; message: string }>;
  postponeAutoSync: (minutes?: number) => void;
  dismissAutoSyncWarning: () => void;
  triggerManualAutoSyncTest: () => void;
}

const AppContext = createContext<AppContextType | undefined>(undefined);

function datasetScore(d: Partial<AppData> | null | undefined): number {
  if (!d) return 0;
  return (
    (d.ventas?.length || 0) +
    (d.produccion?.length || 0) +
    (d.gastos?.length || 0) +
    (d.almacen?.length || 0) +
    (d.recetas?.length || 0) * 3 +
    (d.facturas?.filter((f) => !f.id?.startsWith('fac-vale-')).length || 0) * 2
  );
}

// Normalization helper
function normalizeData(raw: Partial<AppData> | null | undefined): AppData {
  const init = initialJson as unknown as AppData;
  if (!raw || typeof raw !== 'object') {
    return normalizeData(init);
  }

  const rawClients = Array.isArray(raw.clientes) ? raw.clientes : init.clientes || [];
  const rawVentas = Array.isArray(raw.ventas) ? raw.ventas : init.ventas || [];

  const normalizeClientName = (name: string) => {
    if (name === 'Mostrador / Público general') return 'Otros';
    if (name === 'Nuevo') return 'Deisy';
    return name;
  };

  const normClients = [...rawClients]
    .map((c) => ({
      ...c,
      nombre: normalizeClientName(c.nombre),
    }))
    .sort((a, b) => (a.nombre || '').localeCompare(b.nombre || '', 'es', { sensitivity: 'base' }));

  const normVentas = [...rawVentas]
    .map((v) => ({
      ...v,
      cliente: normalizeClientName(v.cliente),
      formaPago: v.formaPago || 'Efectivo',
    }))
    .sort((a, b) => {
      const fCmp = (b.fecha || '').localeCompare(a.fecha || '');
      if (fCmp !== 0) return fCmp;
      return (parseInt(b.vale, 10) || 0) - (parseInt(a.vale, 10) || 0);
    });

  const normFacturas: FacturaItem[] = (Array.isArray(raw.facturas) ? raw.facturas : [])
    .filter((f) => !f.id?.startsWith('fac-vale-'))
    .map((f) => ({
      ...f,
      cliente: normalizeClientName(f.cliente),
    }))
    .sort((a, b) => (b.fecha || '').localeCompare(a.fecha || '') || (b.numero || '').localeCompare(a.numero || ''));

  const normProduccion = [...(Array.isArray(raw.produccion) ? raw.produccion : init.produccion || [])].sort(
    (a, b) => (b.fecha || '').localeCompare(a.fecha || '') || (b.id || '').localeCompare(a.id || '')
  );

  const normGastos = [...(Array.isArray(raw.gastos) ? raw.gastos : init.gastos || [])].sort(
    (a, b) => (b.fecha || '').localeCompare(a.fecha || '') || (b.id || '').localeCompare(a.id || '')
  );

  const normRepartos = [...(Array.isArray(raw.repartos) ? raw.repartos : init.repartos || [])].sort((a, b) =>
    (a.desde || '').localeCompare(b.desde || '')
  );

  const normRecetas = [...(Array.isArray(raw.recetas) ? raw.recetas : [])].sort((a, b) =>
    (b.fechaCreacion || '').localeCompare(a.fechaCreacion || '') ||
    (a.nombre || '').localeCompare(b.nombre || '', 'es', { sensitivity: 'base' })
  );

  // Migrate Almacen to include price
  const normAlmacen: AlmacenItem[] = [...(Array.isArray(raw.almacen) ? raw.almacen : init.almacen || [])]
    .map((a) => ({
      ...a,
      precio: a.precio || 0,
    }))
    .sort((a, b) => (a.codigo || '').localeCompare(b.codigo || ''));

  const defaultUsuarios: UsuarioAutorizado[] = [
    {
      id: 'usr-admin-yanosky',
      email: 'acostacastilleroyanosky@gmail.com',
      nombre: 'Yanosky Acosta (Admin)',
      rol: 'Administrador',
      fechaAgregado: '2026-11-10',
      activo: true,
    },
  ];

  const normUsuarios: UsuarioAutorizado[] =
    Array.isArray(raw.usuariosAutorizados) && raw.usuariosAutorizados.length > 0
      ? raw.usuariosAutorizados
      : defaultUsuarios;

  const rawProductos = Array.isArray(raw.productos) ? raw.productos : init.productos || [];
  const normProductos: Producto[] = [...rawProductos]
    .map((p) => ({
      ...p,
      activo: p.activo !== false,
    }))
    .sort((a, b) => (a.nombre || '').localeCompare(b.nombre || '', 'es', { sensitivity: 'base' }));

  const normJustificaciones = [...(Array.isArray(raw.justificaciones) ? raw.justificaciones : [])].sort((a, b) =>
    (b.fechaRegistro || '').localeCompare(a.fechaRegistro || '')
  );

  return {
    meta: raw.meta || init.meta,
    repartos: normRepartos,
    clientes: normClients,
    productos: normProductos,
    produccion: normProduccion,
    ventas: normVentas,
    gastos: normGastos,
    almacen: normAlmacen,
    facturas: normFacturas,
    caja: raw.caja || init.caja,
    justificaciones: normJustificaciones,
    recetas: normRecetas,
    usuariosAutorizados: normUsuarios,
  };
}

export const AppProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const { user, loading: authLoading } = useAuth();

  const [accessStatus, setAccessStatus] = useState<AccessStatus>('loading');
  const [currentUserRole, setCurrentUserRole] = useState<UserRole | null>(null);
  const [isFirestoreReady, setIsFirestoreReady] = useState<boolean>(false);
  const [fatalError, setFatalError] = useState<Error | null>(null);

  if (fatalError) {
    throw fatalError;
  }

  // Cloud Sync State
  const [isSyncing, setIsSyncing] = useState<boolean>(false);
  const [lastCloudSync, setLastCloudSync] = useState<Date | null>(() => {
    try {
      const s = localStorage.getItem('dulceria_tatao_last_sync');
      return s ? new Date(s) : null;
    } catch {
      return null;
    }
  });
  const [syncStatusMessage, setSyncStatusMessage] = useState<{
    type: 'success' | 'error' | 'info';
    text: string;
  } | null>(null);
  const [autoSyncWarning, setAutoSyncWarning] = useState<{
    active: boolean;
    secondsLeft: number;
  } | null>(null);
  const [isAutoSyncEnabled, setIsAutoSyncEnabledState] = useState<boolean>(true);
  const [isCloudSyncModalOpen, setIsCloudSyncModalOpen] = useState<boolean>(false);

  const setIsAutoSyncEnabled = (enabled: boolean) => {
    setIsAutoSyncEnabledState(enabled);
  };

  // Initial local cache load for instant paint
  const [data, setData] = useState<AppData>(() => {
    let result: AppData;
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        result = normalizeData(parsed);
      } else {
        result = normalizeData(initialJson as unknown as AppData);
      }
    } catch (e) {
      console.error('Error loading data from localStorage', e);
      result = normalizeData(initialJson as unknown as AppData);
    }

    try {
      const savedJust = localStorage.getItem('dulceria_tatao_justificaciones');
      if (savedJust) {
        const parsedJust = JSON.parse(savedJust);
        if (Array.isArray(parsedJust) && parsedJust.length > 0 && (!result.justificaciones || result.justificaciones.length === 0)) {
          result.justificaciones = parsedJust;
        }
      }
    } catch {}

    return result;
  });

  const dataRef = useRef<AppData>(data);
  dataRef.current = data;

  const showToast = (type: 'success' | 'error' | 'info', text: string, ms = 4500) => {
    setSyncStatusMessage({ type, text });
    window.setTimeout(() => setSyncStatusMessage(null), ms);
  };

  // Gather richest available local/legacy dataset when seeding an empty Firestore DB
  const gatherBestInitialDataset = async (): Promise<AppData> => {
    let best = normalizeData(initialJson as unknown as AppData);

    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = normalizeData(JSON.parse(saved));
        if (datasetScore(parsed) >= datasetScore(best)) {
          best = parsed;
        }
      }
    } catch {}

    // If running inside AI Studio with legacy PostgreSQL backend, pull richer state once
    try {
      const controller = new AbortController();
      const timeout = window.setTimeout(() => controller.abort(), 2500);
      const res = await fetch('/api/data', { signal: controller.signal });
      window.clearTimeout(timeout);
      const ct = res.headers.get('content-type') || '';
      if (res.ok && ct.includes('application/json')) {
        const json = await res.json();
        if (json?.data) {
          const remote = normalizeData(json.data);
          if (datasetScore(remote) > datasetScore(best)) {
            best = remote;
          }
        }
      }
    } catch {
      // Expected on Vercel / static hosting where /api/data does not exist
    }

    return best;
  };

  // Save data mirror to localStorage
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    } catch (e) {
      console.error('Error saving data to localStorage', e);
    }
  }, [data]);

  // Firestore Auth Gate + Seed + Real-Time Listener
  useEffect(() => {
    if (authLoading) {
      setAccessStatus('loading');
      return;
    }

    if (!user || !user.email) {
      setAccessStatus('unauthenticated');
      setCurrentUserRole(null);
      setIsFirestoreReady(false);
      return;
    }

    let isMounted = true;
    let unsubscribe: (() => void) | null = null;
    let retryTimer: number | null = null;
    const userEmail = user.email.trim().toLowerCase();
    const isAdminUser = isPrimaryAdminEmail(userEmail);

    const isOfflineOrNetworkError = (err: unknown): boolean => {
      const msg = (err instanceof Error ? err.message : String(err)).toLowerCase();
      return (
        msg.includes('client is offline') ||
        msg.includes('unavailable') ||
        msg.includes('could not reach') ||
        msg.includes('network') ||
        msg.includes('timeout')
      );
    };

    const attachRealtimeListeners = () => {
      if (unsubscribe || !isMounted) return;
      unsubscribe = subscribeToFirestoreData(userEmail, isAdminUser, (patch) => {
        if (!isMounted) return;
        setData((prev) => {
          const merged = normalizeData({ ...prev, ...patch });
          dataRef.current = merged;
          return merged;
        });
        const now = new Date();
        setLastCloudSync(now);
        try {
          localStorage.setItem('dulceria_tatao_last_sync', now.toISOString());
        } catch {}
        setIsFirestoreReady(true);
      });
    };

    async function initFirestoreSession() {
      setAccessStatus('loading');
      setIsSyncing(true);
      try {
        const access = await checkUserAccess(userEmail);
        if (!isMounted) return;

        if (!access.authorized || !access.rol) {
          setAccessStatus('denied');
          setCurrentUserRole(null);
          setIsFirestoreReady(false);
          setIsSyncing(false);
          return;
        }

        setCurrentUserRole(access.rol);
        setAccessStatus('authorized');

        if (isAdminUser) {
          const seedResult = await seedFirestoreIfNeeded(gatherBestInitialDataset, userEmail);
          if (seedResult.seeded && isMounted) {
            showToast('success', 'Base de datos migrada y sincronizada en Firebase Firestore.');
          }
        }

        if (!isMounted) return;
        attachRealtimeListeners();
      } catch (err) {
        if (!isMounted) return;
        console.error('Error initializing Firestore session:', err);

        if (isOfflineOrNetworkError(err)) {
          setIsFirestoreReady(false);
          showToast(
            'error',
            'Sin respuesta de Firestore (modo local activo). Reintentando conexión automáticamente...',
            7000
          );
          attachRealtimeListeners();
          if (retryTimer === null) {
            retryTimer = window.setTimeout(() => {
              retryTimer = null;
              if (isMounted && isAdminUser) {
                seedFirestoreIfNeeded(gatherBestInitialDataset, userEmail)
                  .then((res) => {
                    if (res.seeded && isMounted) {
                      showToast('success', 'Base de datos sincronizada con Firebase Firestore.');
                    }
                  })
                  .catch(() => {});
              }
            }, 8000);
          }
        } else {
          setFatalError(err instanceof Error ? err : new Error(String(err)));
        }
      } finally {
        if (isMounted) setIsSyncing(false);
      }
    }

    initFirestoreSession();

    const handleOnline = () => {
      if (isMounted && isAdminUser) {
        seedFirestoreIfNeeded(gatherBestInitialDataset, userEmail)
          .then((res) => {
            if (res.seeded && isMounted) {
              showToast('success', 'Conexión restaurada: datos sincronizados con Firestore.');
            }
          })
          .catch(() => {});
      }
    };
    window.addEventListener('online', handleOnline);

    return () => {
      isMounted = false;
      window.removeEventListener('online', handleOnline);
      if (retryTimer !== null) window.clearTimeout(retryTimer);
      if (unsubscribe) unsubscribe();
    };
  }, [authLoading, user]);

  // Manual Sync with Firestore (pull fresh from server or push current local dataset)
  const syncWithCloud = async (
    mode: 'pull' | 'push' = 'pull'
  ): Promise<{ success: boolean; message: string }> => {
    if (!user?.email) {
      return { success: false, message: 'Debes iniciar sesión con Google para sincronizar.' };
    }
    const userEmail = user.email.trim().toLowerCase();
    setIsSyncing(true);
    try {
      if (mode === 'push') {
        await replaceAllFirestoreData(dataRef.current, userEmail);
        const syncDate = new Date();
        setLastCloudSync(syncDate);
        try {
          localStorage.setItem('dulceria_tatao_last_sync', syncDate.toISOString());
        } catch {}
        const msg = `Datos guardados en Firebase Firestore a las ${syncDate.toLocaleTimeString('es-CU')}.`;
        showToast('success', msg, 5000);
        return { success: true, message: msg };
      } else {
        const fetched = await fetchAllFirestoreFromServer(userEmail, isPrimaryAdminEmail(userEmail));
        const normalized = normalizeData({ ...dataRef.current, ...fetched });
        setData(normalized);
        dataRef.current = normalized;
        const syncDate = new Date();
        setLastCloudSync(syncDate);
        try {
          localStorage.setItem('dulceria_tatao_last_sync', syncDate.toISOString());
        } catch {}
        const vCount = normalized.ventas?.length || 0;
        const pCount = normalized.produccion?.length || 0;
        const gCount = normalized.gastos?.length || 0;
        const msg = `Sincronización en Firestore al día: ${vCount} ventas, ${pCount} lotes y ${gCount} gastos.`;
        showToast('success', msg, 5000);
        return { success: true, message: msg };
      }
    } catch (err: any) {
      const errorMsg = `Error al sincronizar con Firestore: ${err?.message || 'Error de conexión'}`;
      showToast('error', errorMsg, 6000);
      return { success: false, message: errorMsg };
    } finally {
      setIsSyncing(false);
    }
  };

  const postponeAutoSync = () => {
    setAutoSyncWarning(null);
  };

  const dismissAutoSyncWarning = () => {
    setAutoSyncWarning(null);
  };

  const triggerManualAutoSyncTest = () => {
    syncWithCloud('pull');
  };

  // Reconciliation note
  const [reconciliationNote, setReconciliationNote] = useState<string>(() => {
    try {
      return localStorage.getItem(NOTES_KEY) || '';
    } catch {
      return '';
    }
  });

  const saveReconciliationNote = (note: string) => {
    setReconciliationNote(note);
    try {
      localStorage.setItem(NOTES_KEY, note);
    } catch (e) {
      console.error('Error saving note', e);
    }
  };

  // Global Navigation: starts on 'Panel'
  const [currentModule, setCurrentModule] = useState<ModuleName>('Panel');

  // Global Date State
  const defaultRange = useMemo(() => getDefaultDateRange(), []);
  const [fechaDesde, setFechaDesde] = useState<string>(defaultRange.desde);
  const [fechaHasta, setFechaHasta] = useState<string>(defaultRange.hasta);

  const setDateRange = (desde: string, hasta: string) => {
    setFechaDesde(desde);
    setFechaHasta(hasta);
  };

  const applyQuickPreset = (preset: QuickDatePreset) => {
    const range = getQuickRange(preset, data.caja.fechaInicio || '2026-09-21');
    setDateRange(range.desde, range.hasta);
  };

  const getAllowedEmails = () => buildAllowedEmails(dataRef.current.usuariosAutorizados || []);

  const runCloudWrite = (op: Promise<unknown>) => {
    if (!user?.email) return;
    op
      .then(() => {
        const now = new Date();
        setLastCloudSync(now);
        try {
          localStorage.setItem('dulceria_tatao_last_sync', now.toISOString());
        } catch {}
      })
      .catch((err) => {
        console.error('Firestore write failed:', err);
        showToast('error', 'No se pudo guardar el cambio en Firestore. Verifica tu conexión o permisos.', 6000);
      });
  };

  // ----------------------------------------------------
  // PRODUCCIÓN
  // ----------------------------------------------------
  const addProduccion = (lote: Omit<ProduccionLote, 'id' | 'costo'>) => {
    const current = dataRef.current;
    const prodObj = current.productos.find((p) => p.nombre === lote.producto);
    const precioVigente = prodObj ? getPrecioVigente(prodObj, lote.fecha) : 0;
    const costo = lote.cantidad * precioVigente;
    const newLoteId = `lote-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

    const newLote: ProduccionLote = {
      ...lote,
      id: newLoteId,
      costo,
    };

    const pagoUnit = getPagoPorDulce(lote.producto, current.meta);
    const importeSalario = lote.cantidad * pagoUnit;

    const newSalaryGasto: GastoItem = {
      id: `gst-prod-${newLoteId}`,
      fecha: lote.fecha,
      categoria: 'Salarios',
      concepto: `Salario ${lote.producto}`,
      importe: importeSalario,
      formaPago: 'Efectivo',
      tipoSalario: 'Trabajadores',
      loteId: newLoteId,
      generadoPor: 'Producción',
    };

    setData((prev) => ({
      ...prev,
      produccion: [newLote, ...prev.produccion],
      gastos: [newSalaryGasto, ...prev.gastos],
    }));

    runCloudWrite(fsSaveProduccionAndGasto(newLote, newSalaryGasto, getAllowedEmails()));
  };

  const updateProduccion = (id: string, lote: Partial<ProduccionLote>) => {
    const current = dataRef.current;
    const target = current.produccion.find((p) => p.id === id);
    if (!target) return;

    const merged: ProduccionLote = { ...target, ...lote };
    const prodObj = current.productos.find((prod) => prod.nombre === merged.producto);
    const precioVigente = prodObj ? getPrecioVigente(prodObj, merged.fecha) : 0;
    merged.costo = merged.cantidad * precioVigente;

    const linkedGasto = current.gastos.find((g) => g.loteId === id);
    const pagoUnit = getPagoPorDulce(merged.producto, current.meta);
    const updatedGasto: GastoItem | null = linkedGasto
      ? {
          ...linkedGasto,
          fecha: merged.fecha,
          concepto: `Salario ${merged.producto}`,
          importe: merged.cantidad * pagoUnit,
        }
      : null;

    setData((prev) => ({
      ...prev,
      produccion: prev.produccion.map((p) => (p.id === id ? merged : p)),
      gastos: updatedGasto
        ? prev.gastos.map((g) => (g.id === updatedGasto.id ? updatedGasto : g))
        : prev.gastos,
    }));

    const allowed = getAllowedEmails();
    if (updatedGasto) {
      runCloudWrite(fsSaveProduccionAndGasto(merged, updatedGasto, allowed));
    } else {
      runCloudWrite(fsSetEntity('produccion', merged, allowed));
    }
  };

  const deleteProduccion = (id: string) => {
    const linkedGastoIds = dataRef.current.gastos.filter((g) => g.loteId === id).map((g) => g.id);
    setData((prev) => ({
      ...prev,
      produccion: prev.produccion.filter((p) => p.id !== id),
      gastos: prev.gastos.filter((g) => g.loteId !== id),
    }));
    runCloudWrite(fsDeleteProduccionAndGastos(id, linkedGastoIds));
  };

  // ----------------------------------------------------
  // VENTAS
  // ----------------------------------------------------
  const getNextValeNumber = (): string => {
    let maxInt = 0;
    dataRef.current.ventas.forEach((v) => {
      const match = v.vale.match(/^\d+/);
      if (match) {
        const val = parseInt(match[0], 10);
        if (!isNaN(val) && val > maxInt) {
          maxInt = val;
        }
      }
    });
    return String(maxInt + 1);
  };

  const addVenta = (venta: Omit<VentaVale, 'id' | 'vale'>) => {
    const nextVale = getNextValeNumber();
    const newId = `vnt-${Date.now()}`;
    const cleanCliente = venta.cliente === 'Mostrador / Público general' ? 'Otros' : venta.cliente;

    const newVenta: VentaVale = {
      ...venta,
      id: newId,
      vale: nextVale,
      cliente: cleanCliente,
      formaPago: venta.formaPago || 'Efectivo',
    };

    const numericNext = parseInt(nextVale, 10);
    const nextSiguiente = !isNaN(numericNext) ? numericNext + 1 : dataRef.current.meta.siguienteVale;

    setData((prev) => ({
      ...prev,
      meta: {
        ...prev.meta,
        siguienteVale: nextSiguiente,
      },
      ventas: [newVenta, ...prev.ventas],
    }));

    runCloudWrite(
      fsSaveVentaAndNextVale(newVenta, nextSiguiente, getAllowedEmails(), user?.email || undefined)
    );
  };

  const updateVenta = (id: string, patch: Partial<VentaVale>) => {
    const target = dataRef.current.ventas.find((v) => v.id === id);
    if (!target) return;
    const updated: VentaVale = { ...target, ...patch };
    if (updated.cliente === 'Mostrador / Público general') {
      updated.cliente = 'Otros';
    }

    setData((prev) => ({
      ...prev,
      ventas: prev.ventas.map((v) => (v.id === id ? updated : v)),
    }));
    runCloudWrite(fsSetEntity('ventas', updated, getAllowedEmails()));
  };

  const deleteVenta = (id: string) => {
    setData((prev) => ({
      ...prev,
      ventas: prev.ventas.filter((v) => v.id !== id),
    }));
    runCloudWrite(fsDeleteEntity('ventas', id));
  };

  // ----------------------------------------------------
  // GASTOS
  // ----------------------------------------------------
  const addGasto = (gasto: Omit<GastoItem, 'id'>) => {
    const newId = `gst-${Date.now()}`;
    const newGasto: GastoItem = {
      ...gasto,
      id: newId,
    };
    setData((prev) => ({
      ...prev,
      gastos: [newGasto, ...prev.gastos],
    }));
    runCloudWrite(fsSetEntity('gastos', newGasto, getAllowedEmails()));
  };

  const updateGasto = (id: string, patch: Partial<GastoItem>) => {
    const target = dataRef.current.gastos.find((g) => g.id === id);
    if (!target) return;
    const updated: GastoItem = target.generadoPor
      ? { ...target, fecha: patch.fecha || target.fecha, importe: patch.importe ?? target.importe }
      : { ...target, ...patch };

    setData((prev) => ({
      ...prev,
      gastos: prev.gastos.map((g) => (g.id === id ? updated : g)),
    }));
    runCloudWrite(fsSetEntity('gastos', updated, getAllowedEmails()));
  };

  const deleteGasto = (id: string) => {
    setData((prev) => ({
      ...prev,
      gastos: prev.gastos.filter((g) => g.id !== id),
    }));
    runCloudWrite(fsDeleteEntity('gastos', id));
  };

  // ----------------------------------------------------
  // CAJA & REPARTOS
  // ----------------------------------------------------
  const marcarRepartoPagado = (repartoId: string, fechaPago: string) => {
    const reparto = dataRef.current.repartos.find((r) => r.id === repartoId);
    if (!reparto) return;

    const ts = Date.now();
    const adminExpense: GastoItem = {
      id: `gst-rep-${repartoId}-adm-${ts}`,
      fecha: fechaPago,
      categoria: 'Salarios',
      concepto: 'Salario Administrador',
      importe: reparto.administrador,
      formaPago: 'Efectivo',
      tipoSalario: 'Administrador',
      repartoId,
      generadoPor: 'Reparto',
    };

    const tataoExpense: GastoItem = {
      id: `gst-rep-${repartoId}-tat-${ts}`,
      fecha: fechaPago,
      categoria: 'Salarios',
      concepto: 'Salario Tatao',
      importe: reparto.tatao,
      formaPago: 'Efectivo',
      tipoSalario: 'Dueños',
      repartoId,
      generadoPor: 'Reparto',
    };

    const carlosExpense: GastoItem = {
      id: `gst-rep-${repartoId}-car-${ts}`,
      fecha: fechaPago,
      categoria: 'Salarios',
      concepto: 'Salario Carlos',
      importe: reparto.carlos,
      formaPago: 'Efectivo',
      tipoSalario: 'Dueños',
      repartoId,
      generadoPor: 'Reparto',
    };

    const updatedReparto: RepartoSemanal = { ...reparto, estado: 'Pagado', fechaPago };

    setData((prev) => ({
      ...prev,
      repartos: prev.repartos.map((r) => (r.id === repartoId ? updatedReparto : r)),
      gastos: [adminExpense, tataoExpense, carlosExpense, ...prev.gastos],
    }));

    runCloudWrite(
      fsSaveRepartoPagado(updatedReparto, [adminExpense, tataoExpense, carlosExpense], getAllowedEmails())
    );
  };

  const deshacerRepartoPagado = (repartoId: string) => {
    const reparto = dataRef.current.repartos.find((r) => r.id === repartoId);
    if (!reparto) return;
    const updatedReparto: RepartoSemanal = { ...reparto, estado: 'Pendiente', fechaPago: null };
    const linkedGastoIds = dataRef.current.gastos.filter((g) => g.repartoId === repartoId).map((g) => g.id);

    setData((prev) => ({
      ...prev,
      repartos: prev.repartos.map((r) => (r.id === repartoId ? updatedReparto : r)),
      gastos: prev.gastos.filter((g) => g.repartoId !== repartoId),
    }));

    runCloudWrite(fsDeshacerRepartoPagado(updatedReparto, linkedGastoIds, getAllowedEmails()));
  };

  const updateReglasReparto = (fondoPct: number, administradorPct: number, duenos: string[]) => {
    const current = dataRef.current;
    const newMeta: MetaConfig = {
      ...current.meta,
      reparto: { fondoPct, administradorPct, duenos },
    };

    const updatedPending: RepartoSemanal[] = [];
    const updatedRepartos = current.repartos.map((r) => {
      if (r.estado === 'Pendiente') {
        const calc = calculateReparto(r.ganancia, fondoPct, administradorPct, duenos.length);
        const upd = {
          ...r,
          administrador: calc.administrador,
          tatao: calc.cadaDueno,
          carlos: calc.cadaDueno,
        };
        updatedPending.push(upd);
        return upd;
      }
      return r;
    });

    setData((prev) => ({
      ...prev,
      meta: newMeta,
      repartos: updatedRepartos,
    }));

    runCloudWrite(fsSaveReglasReparto(newMeta, updatedPending, getAllowedEmails(), user?.email || undefined));
  };

  // ----------------------------------------------------
  // ALMACÉN
  // ----------------------------------------------------
  const addAlmacenItem = (item: Omit<AlmacenItem, 'id' | 'codigo' | 'movimientos'>) => {
    const currentAlmacen = dataRef.current.almacen;
    const maxNum = currentAlmacen.reduce((max, a) => {
      const match = /^MP-(\d+)$/i.exec(a.codigo || '');
      const n = match ? parseInt(match[1], 10) : 0;
      return n > max ? n : max;
    }, currentAlmacen.length);
    const nextNum = maxNum + 1;
    const codigo = `MP-${String(nextNum).padStart(4, '0')}`;
    const newId = `alm-${Date.now()}`;

    const initialMovement = {
      id: `mov-${Date.now()}-init`,
      fecha: item.fechaConteo,
      tipo: 'Entrada' as const,
      cantidad: item.existencia,
      saldoResultante: item.existencia,
      concepto: 'Inventario Inicial',
      comprobante: 'INICIAL',
    };

    const newItem: AlmacenItem = {
      ...item,
      id: newId,
      codigo,
      movimientos: [initialMovement],
    };

    setData((prev) => ({
      ...prev,
      almacen: [newItem, ...prev.almacen],
    }));

    runCloudWrite(fsSetEntity('almacen', newItem, getAllowedEmails()));
  };

  const updateAlmacenItem = (id: string, patch: Partial<AlmacenItem>) => {
    const target = dataRef.current.almacen.find((a) => a.id === id);
    if (!target) return;
    const updated = { ...target, ...patch };

    setData((prev) => ({
      ...prev,
      almacen: prev.almacen.map((a) => (a.id === id ? updated : a)),
    }));
    runCloudWrite(fsSetEntity('almacen', updated, getAllowedEmails()));
  };

  const deleteAlmacenItem = (id: string) => {
    setData((prev) => ({
      ...prev,
      almacen: prev.almacen.filter((a) => a.id !== id),
    }));
    runCloudWrite(fsDeleteEntity('almacen', id));
  };

  const addMovimientoAlmacen = (
    itemId: string,
    tipo: 'Entrada' | 'Salida',
    cantidad: number,
    concepto: string,
    comprobante = '',
    fecha?: string
  ) => {
    const item = dataRef.current.almacen.find((a) => a.id === itemId);
    if (!item) return;

    const newStock =
      tipo === 'Entrada' ? item.existencia + cantidad : Math.max(0, item.existencia - cantidad);

    const newMov = {
      id: `mov-${Date.now()}`,
      fecha: fecha || new Date().toISOString().slice(0, 10),
      tipo,
      cantidad,
      saldoResultante: newStock,
      concepto,
      comprobante,
    };

    const updatedItem: AlmacenItem = {
      ...item,
      existencia: newStock,
      movimientos: [newMov, ...item.movimientos],
    };

    setData((prev) => ({
      ...prev,
      almacen: prev.almacen.map((a) => (a.id === itemId ? updatedItem : a)),
    }));
    runCloudWrite(fsSetEntity('almacen', updatedItem, getAllowedEmails()));
  };

  const revertirMovimientoAlmacen = (itemId: string, movId: string) => {
    const item = dataRef.current.almacen.find((a) => a.id === itemId);
    if (!item) return;
    const targetMov = item.movimientos.find((m) => m.id === movId);
    if (!targetMov) return;

    const newStock =
      targetMov.tipo === 'Entrada'
        ? Math.max(0, item.existencia - targetMov.cantidad)
        : item.existencia + targetMov.cantidad;

    const updatedItem: AlmacenItem = {
      ...item,
      existencia: newStock,
      movimientos: item.movimientos.filter((m) => m.id !== movId),
    };

    setData((prev) => ({
      ...prev,
      almacen: prev.almacen.map((a) => (a.id === itemId ? updatedItem : a)),
    }));
    runCloudWrite(fsSetEntity('almacen', updatedItem, getAllowedEmails()));
  };

  // ----------------------------------------------------
  // CLIENTES
  // ----------------------------------------------------
  const addCliente = (cli: Omit<Cliente, 'id'>) => {
    const newId = `cli-${Date.now()}`;
    const cleanNombre = cli.nombre === 'Mostrador / Público general' ? 'Otros' : cli.nombre;
    const newCliente: Cliente = {
      ...cli,
      nombre: cleanNombre,
      id: newId,
    };
    setData((prev) => ({
      ...prev,
      clientes: [...prev.clientes, newCliente],
    }));
    runCloudWrite(fsSetEntity('clientes', newCliente, getAllowedEmails()));
  };

  const updateCliente = (id: string, patch: Partial<Cliente>) => {
    const current = dataRef.current;
    const target = current.clientes.find((c) => c.id === id);
    if (!target) return;

    const oldName = target.nombre;
    const nextRawName = patch.nombre ?? oldName ?? '';
    const cleanNewName = nextRawName === 'Mostrador / Público general' ? 'Otros' : nextRawName;
    const updatedCli: Cliente = { ...target, ...patch, nombre: cleanNewName };

    const shouldRenameRefs = Boolean(oldName && cleanNewName && oldName !== cleanNewName);
    const affectedVentas = shouldRenameRefs
      ? current.ventas.filter((v) => v.cliente === oldName).map((v) => ({ ...v, cliente: cleanNewName }))
      : [];
    const affectedFacturas = shouldRenameRefs
      ? (current.facturas || [])
          .filter((f) => f.cliente === oldName)
          .map((f) => ({ ...f, cliente: cleanNewName }))
      : [];

    setData((prev) => ({
      ...prev,
      clientes: prev.clientes.map((c) => (c.id === id ? updatedCli : c)),
      ventas: shouldRenameRefs
        ? prev.ventas.map((v) => (v.cliente === oldName ? { ...v, cliente: cleanNewName } : v))
        : prev.ventas,
      facturas: shouldRenameRefs
        ? (prev.facturas || []).map((f) => (f.cliente === oldName ? { ...f, cliente: cleanNewName } : f))
        : prev.facturas,
    }));

    runCloudWrite(fsSaveClienteAndRefs(updatedCli, affectedVentas, affectedFacturas, getAllowedEmails()));
  };

  const deleteCliente = (id: string) => {
    setData((prev) => ({
      ...prev,
      clientes: prev.clientes.filter((c) => c.id !== id),
    }));
    runCloudWrite(fsDeleteEntity('clientes', id));
  };

  // ----------------------------------------------------
  // PRODUCTOS & PRECIOS
  // ----------------------------------------------------
  const addProducto = (prod: {
    nombre: string;
    precioVenta: number;
    fechaInicio: string;
    vigenteHasta?: string | null;
    activo?: boolean;
  }) => {
    const newId = `prod-${Date.now()}`;
    const newProd: Producto = {
      id: newId,
      nombre: prod.nombre,
      costoUnitario: null,
      precioVigente: prod.precioVenta,
      activo: prod.activo !== false,
      historicoPrecios: [
        {
          precio: prod.precioVenta,
          desde: prod.fechaInicio,
          hasta: prod.vigenteHasta || null,
        },
      ],
    };
    setData((prev) => ({
      ...prev,
      productos: [...prev.productos, newProd],
    }));
    runCloudWrite(fsSetEntity('productos', newProd, getAllowedEmails()));
  };

  const updateProductoActivo = (id: string, activo: boolean) => {
    const target = dataRef.current.productos.find((p) => p.id === id);
    if (!target) return;
    const updated = { ...target, activo };
    setData((prev) => ({
      ...prev,
      productos: prev.productos.map((p) => (p.id === id ? updated : p)),
    }));
    runCloudWrite(fsSetEntity('productos', updated, getAllowedEmails()));
  };

  const updatePrecioProducto = (
    id: string,
    nuevoPrecio: number,
    fechaInicio: string,
    vigenteHasta: string | null = null
  ) => {
    const prod = dataRef.current.productos.find((p) => p.id === id);
    if (!prod) return;

    const startDate = new Date(fechaInicio + 'T12:00:00');
    startDate.setDate(startDate.getDate() - 1);
    const y = startDate.getFullYear();
    const m = String(startDate.getMonth() + 1).padStart(2, '0');
    const d = String(startDate.getDate()).padStart(2, '0');
    const dayBefore = `${y}-${m}-${d}`;

    const updatedHistory = prod.historicoPrecios.map((h) =>
      h.hasta === null ? { ...h, hasta: dayBefore } : h
    );
    updatedHistory.push({
      precio: nuevoPrecio,
      desde: fechaInicio,
      hasta: vigenteHasta || null,
    });

    const updatedProd: Producto = {
      ...prod,
      precioVigente: nuevoPrecio,
      historicoPrecios: updatedHistory,
    };

    setData((prev) => ({
      ...prev,
      productos: prev.productos.map((p) => (p.id === id ? updatedProd : p)),
    }));
    runCloudWrite(fsSetEntity('productos', updatedProd, getAllowedEmails()));
  };

  const updateCostoUnitario = (id: string, costoUnitario: number | null) => {
    const target = dataRef.current.productos.find((p) => p.id === id);
    if (!target) return;
    const updated = { ...target, costoUnitario };
    setData((prev) => ({
      ...prev,
      productos: prev.productos.map((p) => (p.id === id ? updated : p)),
    }));
    runCloudWrite(fsSetEntity('productos', updated, getAllowedEmails()));
  };

  const updateParametrosProducto = (
    productoNombre: string,
    pagoTrabajador: number,
    gananciaUnidad: number,
    desde: string
  ) => {
    const current = dataRef.current;
    const newPagos = {
      ...current.meta.pagoPorDulceTrabajador,
      [productoNombre]: pagoTrabajador,
    };
    const existingGanancias = current.meta.gananciaPorUnidad || [];
    const newGananciaEntry = {
      producto: productoNombre,
      desde,
      valor: productoNombre === 'Masas' ? 0 : gananciaUnidad,
    };
    const newMeta: MetaConfig = {
      ...current.meta,
      pagoPorDulceTrabajador: newPagos,
      gananciaPorUnidad: [...existingGanancias, newGananciaEntry],
    };

    setData((prev) => ({
      ...prev,
      meta: newMeta,
    }));
    runCloudWrite(fsSaveConfigMeta(newMeta, getAllowedEmails(), user?.email || undefined));
  };

  // ----------------------------------------------------
  // FACTURAS
  // ----------------------------------------------------
  const getNextFacturaNumber = (): string => {
    const list = dataRef.current.facturas || [];
    let max = 0;
    list.forEach((f) => {
      const match = f.numero.match(/FAC-(\d+)/);
      if (match) {
        const n = parseInt(match[1], 10);
        if (!isNaN(n) && n > max) max = n;
      }
    });
    return `FAC-${String(max + 1).padStart(3, '0')}`;
  };

  const addFactura = (factura: Omit<FacturaItem, 'id'>) => {
    const newId = `fac-${Date.now()}`;
    const newFactura: FacturaItem = {
      ...factura,
      id: newId,
    };
    setData((prev) => ({
      ...prev,
      facturas: [newFactura, ...(prev.facturas || [])],
    }));
    runCloudWrite(fsSetEntity('facturas', newFactura, getAllowedEmails()));
  };

  const deleteFactura = (id: string) => {
    setData((prev) => ({
      ...prev,
      facturas: (prev.facturas || []).filter((f) => f.id !== id),
    }));
    runCloudWrite(fsDeleteEntity('facturas', id));
  };

  // ----------------------------------------------------
  // JUSTIFICACIONES DE CONCILIACIÓN
  // ----------------------------------------------------
  const addJustificacion = (fecha: string, nota: string, producto?: string) => {
    const newId = `just-${Date.now()}`;
    const newJust: JustificacionDiferencia = {
      id: newId,
      fecha,
      producto: producto || undefined,
      nota,
      fechaRegistro: new Date().toISOString(),
    };

    const existing = dataRef.current.justificaciones || [];
    const replacedIds = existing
      .filter((j) => j.fecha === fecha && (j.producto || '') === (producto || ''))
      .map((j) => j.id);
    const updated = [
      newJust,
      ...existing.filter((j) => !(j.fecha === fecha && (j.producto || '') === (producto || ''))),
    ];

    try {
      localStorage.setItem('dulceria_tatao_justificaciones', JSON.stringify(updated));
    } catch {}

    setData((prev) => ({
      ...prev,
      justificaciones: updated,
    }));

    const allowed = getAllowedEmails();
    runCloudWrite(
      Promise.all([
        fsSetEntity('justificaciones', newJust, allowed),
        ...replacedIds.map((rid) => fsDeleteEntity('justificaciones', rid)),
      ])
    );
  };

  const updateJustificacion = (id: string, nota: string) => {
    const target = (dataRef.current.justificaciones || []).find((j) => j.id === id);
    if (!target) return;
    const updatedJust = { ...target, nota, fechaRegistro: new Date().toISOString() };
    const updated = (dataRef.current.justificaciones || []).map((j) => (j.id === id ? updatedJust : j));

    try {
      localStorage.setItem('dulceria_tatao_justificaciones', JSON.stringify(updated));
    } catch {}

    setData((prev) => ({ ...prev, justificaciones: updated }));
    runCloudWrite(fsSetEntity('justificaciones', updatedJust, getAllowedEmails()));
  };

  const deleteJustificacion = (id: string) => {
    const updated = (dataRef.current.justificaciones || []).filter((j) => j.id !== id);
    try {
      localStorage.setItem('dulceria_tatao_justificaciones', JSON.stringify(updated));
    } catch {}
    setData((prev) => ({ ...prev, justificaciones: updated }));
    runCloudWrite(fsDeleteEntity('justificaciones', id));
  };

  // ----------------------------------------------------
  // SUBMENÚ 2: RECETAS
  // ----------------------------------------------------
  const addReceta = (rec: Omit<Receta, 'id'>) => {
    const newId = `rec-${Date.now()}`;
    const newRec: Receta = {
      ...rec,
      id: newId,
      fechaCreacion: new Date().toISOString(),
    };
    setData((prev) => ({
      ...prev,
      recetas: [newRec, ...(prev.recetas || [])],
    }));
    runCloudWrite(fsSetEntity('recetas', newRec, getAllowedEmails()));
  };

  const updateReceta = (id: string, patch: Partial<Receta>) => {
    const target = (dataRef.current.recetas || []).find((r) => r.id === id);
    if (!target) return;
    const updated = { ...target, ...patch };
    setData((prev) => ({
      ...prev,
      recetas: (prev.recetas || []).map((r) => (r.id === id ? updated : r)),
    }));
    runCloudWrite(fsSetEntity('recetas', updated, getAllowedEmails()));
  };

  const deleteReceta = (id: string) => {
    setData((prev) => ({
      ...prev,
      recetas: (prev.recetas || []).filter((r) => r.id !== id),
    }));
    runCloudWrite(fsDeleteEntity('recetas', id));
  };

  // ----------------------------------------------------
  // AJUSTES: USUARIOS AUTORIZADOS (GMAIL / CUENTAS)
  // ----------------------------------------------------
  const addUsuarioAutorizado = (usr: Omit<UsuarioAutorizado, 'id' | 'fechaAgregado'>) => {
    const newId = `usr-${Date.now()}`;
    const newUsr: UsuarioAutorizado = {
      ...usr,
      email: usr.email.trim().toLowerCase(),
      id: newId,
      fechaAgregado: new Date().toISOString().slice(0, 10),
    };
    const nextList = [...(dataRef.current.usuariosAutorizados || []), newUsr];
    setData((prev) => ({
      ...prev,
      usuariosAutorizados: nextList,
    }));
    runCloudWrite(fsSaveUsuarioAndSyncAllowedEmails('upsert', newUsr, nextList));
  };

  const updateUsuarioAutorizado = (id: string, patch: Partial<UsuarioAutorizado>) => {
    const currentList = dataRef.current.usuariosAutorizados || [];
    const target = currentList.find((u) => u.id === id);
    if (!target) return;
    const updatedUsr: UsuarioAutorizado = {
      ...target,
      ...patch,
      email: (patch.email ?? target.email).trim().toLowerCase(),
    };
    const nextList = currentList.map((u) => (u.id === id ? updatedUsr : u));
    setData((prev) => ({
      ...prev,
      usuariosAutorizados: nextList,
    }));
    runCloudWrite(fsSaveUsuarioAndSyncAllowedEmails('upsert', updatedUsr, nextList));
  };

  const deleteUsuarioAutorizado = (id: string) => {
    const currentList = dataRef.current.usuariosAutorizados || [];
    const target = currentList.find((u) => u.id === id);
    if (!target) return;
    const nextList = currentList.filter((u) => u.id !== id);
    setData((prev) => ({
      ...prev,
      usuariosAutorizados: nextList,
    }));
    runCloudWrite(fsSaveUsuarioAndSyncAllowedEmails('delete', target, nextList));
  };

  // Exportar respaldo de datos compatible con localStorage
  const exportBackup = () => {
    try {
      const dump: Record<string, string> = {
        [STORAGE_KEY]: JSON.stringify(dataRef.current),
      };
      const blob = new Blob([JSON.stringify(dump, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `respaldo-datos-tatao-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      console.error('Error exportando respaldo', e);
    }
  };

  // Importar y aplicar respaldo de datos directo a Firestore
  const importBackup = (backupContent: string): boolean => {
    try {
      const parsed = JSON.parse(backupContent);
      let targetData: AppData | null = null;

      if (parsed && typeof parsed === 'object') {
        if (parsed[STORAGE_KEY]) {
          targetData =
            typeof parsed[STORAGE_KEY] === 'string'
              ? JSON.parse(parsed[STORAGE_KEY])
              : parsed[STORAGE_KEY];
        } else if (parsed.meta && parsed.ventas) {
          targetData = parsed;
        }
      }

      if (targetData) {
        const normalized = normalizeData(targetData);
        setData(normalized);
        dataRef.current = normalized;
        try {
          localStorage.setItem(STORAGE_KEY, JSON.stringify(normalized));
        } catch (e) {
          console.error('Error guardando en localStorage', e);
        }

        if (user?.email) {
          setIsSyncing(true);
          replaceAllFirestoreData(normalized, user.email.trim().toLowerCase())
            .then(() => {
              const now = new Date();
              setLastCloudSync(now);
              try {
                localStorage.setItem('dulceria_tatao_last_sync', now.toISOString());
              } catch {}
              showToast('success', 'Respaldo importado y subido a Firebase Firestore.');
            })
            .catch((err) => {
              console.error('Error syncing imported backup to Firestore:', err);
              showToast('error', 'El respaldo se cargó localmente pero falló la subida a Firestore.', 6000);
            })
            .finally(() => setIsSyncing(false));
        }

        return true;
      }
      return false;
    } catch (e) {
      console.error('Error importando respaldo', e);
      return false;
    }
  };

  // Contador global de alertas pendientes
  const pendingAlertsCount = useMemo(() => {
    const conc = calculateReconciliation(
      data.produccion,
      data.ventas,
      data.justificaciones || []
    );
    return conc.totalPendientes;
  }, [data.produccion, data.ventas, data.justificaciones]);

  // Contador global de repartos semanales pendientes de pago
  const pendingRepartosCount = useMemo(() => {
    return (data.repartos || []).filter((r) => r.estado === 'Pendiente').length;
  }, [data.repartos]);

  // Contador global de recetas con algún material agotado en almacén
  const outOfStockRecetasCount = useMemo(() => {
    const recetasList = data.recetas || [];
    const almacenList = data.almacen || [];
    return recetasList.filter((rec) => getRecetaAgotados(rec, almacenList, recetasList).length > 0).length;
  }, [data.recetas, data.almacen]);

  const value = {
    data,
    currentModule,
    setCurrentModule,
    fechaDesde,
    fechaHasta,
    setDateRange,
    applyQuickPreset,
    reconciliationNote,
    saveReconciliationNote,

    accessStatus,
    currentUserRole,
    isFirestoreReady,

    pendingAlertsCount,
    pendingRepartosCount,
    outOfStockRecetasCount,

    justificaciones: data.justificaciones || [],
    addJustificacion,
    updateJustificacion,
    deleteJustificacion,

    addProduccion,
    updateProduccion,
    deleteProduccion,

    getNextValeNumber,
    addVenta,
    updateVenta,
    deleteVenta,

    addGasto,
    updateGasto,
    deleteGasto,

    marcarRepartoPagado,
    deshacerRepartoPagado,
    updateReglasReparto,

    addAlmacenItem,
    updateAlmacenItem,
    deleteAlmacenItem,
    addMovimientoAlmacen,
    revertirMovimientoAlmacen,

    addCliente,
    updateCliente,
    deleteCliente,

    addProducto,
    updateProductoActivo,
    updatePrecioProducto,
    updateCostoUnitario,
    updateParametrosProducto,

    addReceta,
    updateReceta,
    deleteReceta,

    usuariosAutorizados: data.usuariosAutorizados || [],
    addUsuarioAutorizado,
    updateUsuarioAutorizado,
    deleteUsuarioAutorizado,

    getNextFacturaNumber,
    addFactura,
    deleteFactura,

    importBackup,
    exportBackup,

    isSyncing,
    lastCloudSync,
    syncStatusMessage,
    setSyncStatusMessage,
    autoSyncWarning,
    isAutoSyncEnabled,
    setIsAutoSyncEnabled,
    isCloudSyncModalOpen,
    setIsCloudSyncModalOpen,
    syncWithCloud,
    postponeAutoSync,
    dismissAutoSyncWarning,
    triggerManualAutoSyncTest,
  };

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
};

export const useApp = () => {
  const context = useContext(AppContext);
  if (!context) {
    throw new Error('useApp must be used within an AppProvider');
  }
  return context;
};
