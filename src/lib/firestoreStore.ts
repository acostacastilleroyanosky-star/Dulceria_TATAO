import {
  collection,
  doc,
  FieldValue,
  getDocFromServer,
  getDocsFromServer,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  deleteDoc,
  where,
  writeBatch,
  Unsubscribe,
} from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from './firebase';
import {
  AppData,
  AlmacenItem,
  CajaConfig,
  Cliente,
  FacturaItem,
  GastoItem,
  JustificacionDiferencia,
  MetaConfig,
  ProduccionLote,
  Producto,
  Receta,
  RepartoSemanal,
  UsuarioAutorizado,
  VentaVale,
} from '../types';

export const PRIMARY_ADMIN_EMAIL = 'acostacastilleroyanosky@gmail.com';

export const WORKSPACE_COLLECTIONS = [
  'repartos',
  'clientes',
  'productos',
  'produccion',
  'ventas',
  'gastos',
  'almacen',
  'facturas',
  'justificaciones',
  'recetas',
] as const;

export type WorkspaceCollectionName = (typeof WORKSPACE_COLLECTIONS)[number];

export function isPrimaryAdminEmail(email?: string | null): boolean {
  return (email || '').trim().toLowerCase() === PRIMARY_ADMIN_EMAIL;
}

export function sanitizeDocId(id: string): string {
  const cleaned = String(id || '')
    .trim()
    .replace(/[^a-zA-Z0-9_-]/g, '_')
    .slice(0, 128);
  return cleaned || `doc-${Date.now()}`;
}

export function emailToKey(email: string): string {
  return email
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, '_')
    .slice(0, 128);
}

function clampStr(val: unknown, maxLen: number, fallback = ''): string {
  const raw = typeof val === 'string' ? val : val == null ? '' : String(val);
  const resolved = raw.trim() === '' && fallback !== '' ? fallback : raw;
  return resolved.slice(0, maxLen);
}

function clampOptStr(val: unknown, maxLen: number): string | undefined {
  if (val === undefined || val === null) return undefined;
  const s = String(val).slice(0, maxLen);
  return s;
}

function clampNonNegNum(val: unknown, fallback = 0): number {
  const n = Number(val);
  if (!Number.isFinite(n) || n < 0) return fallback;
  return n;
}

function clampNum(val: unknown, fallback = 0): number {
  const n = Number(val);
  return Number.isFinite(n) ? n : fallback;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== 'object') return false;
  if (value instanceof FieldValue) return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

function stripUndefined<T>(value: T): T {
  if (value instanceof FieldValue) {
    return value;
  }
  if (Array.isArray(value)) {
    return value.map((item) => stripUndefined(item)) as unknown as T;
  }
  if (isPlainObject(value)) {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) {
      if (v !== undefined) {
        out[k] = stripUndefined(v);
      }
    }
    return out as T;
  }
  return value;
}

export function buildAllowedEmails(usuarios: UsuarioAutorizado[] = []): string[] {
  const set = new Set<string>([PRIMARY_ADMIN_EMAIL]);
  for (const u of usuarios) {
    if (u && u.activo !== false && u.email) {
      const clean = u.email.trim().toLowerCase().slice(0, 150);
      if (clean && set.size < 20) {
        set.add(clean);
      }
    }
  }
  return Array.from(set);
}

// Payload sanitizers synced with firebase-blueprint.json & firestore.rules
function toMetaDoc(meta: MetaConfig, allowedEmails: string[], updatedBy?: string) {
  return stripUndefined({
    siguienteVale: Math.max(1, clampNum(meta.siguienteVale, 1)),
    periodo: {
      desde: clampStr(meta.periodo?.desde, 20, '2026-09-21'),
      hasta: clampStr(meta.periodo?.hasta, 20, '2026-11-03'),
    },
    pagoPorDulceTrabajador: meta.pagoPorDulceTrabajador || {},
    gananciaPorUnidad: Array.isArray(meta.gananciaPorUnidad)
      ? meta.gananciaPorUnidad.slice(0, 200)
      : [],
    reparto: {
      fondoPct: clampNum(meta.reparto?.fondoPct, 0.3),
      administradorPct: clampNum(meta.reparto?.administradorPct, 0.2),
      duenos: Array.isArray(meta.reparto?.duenos)
        ? meta.reparto.duenos.slice(0, 10).map((d) => clampStr(d, 80))
        : ['Tatao', 'Carlos'],
    },
    allowedEmails,
    updatedBy: clampOptStr(updatedBy, 150),
    updatedAt: serverTimestamp(),
  });
}

function toCajaDoc(caja: CajaConfig, allowedEmails: string[], updatedBy?: string) {
  return stripUndefined({
    saldoInicial: clampNum(caja.saldoInicial, 0),
    fechaInicio: clampStr(caja.fechaInicio, 20, '2026-09-21'),
    allowedEmails,
    updatedBy: clampOptStr(updatedBy, 150),
    updatedAt: serverTimestamp(),
  });
}

function toRepartoDoc(r: RepartoSemanal, allowedEmails: string[]) {
  const id = sanitizeDocId(r.id);
  return stripUndefined({
    id,
    desde: clampStr(r.desde, 20),
    hasta: clampStr(r.hasta, 20),
    ganancia: clampNum(r.ganancia, 0),
    administrador: clampNum(r.administrador, 0),
    tatao: clampNum(r.tatao, 0),
    carlos: clampNum(r.carlos, 0),
    fechaPago: r.fechaPago ? clampStr(r.fechaPago, 20) : null,
    estado: r.estado === 'Pagado' ? 'Pagado' : 'Pendiente',
    allowedEmails,
    updatedAt: serverTimestamp(),
  });
}

function toClienteDoc(c: Cliente, allowedEmails: string[]) {
  const id = sanitizeDocId(c.id);
  return stripUndefined({
    id,
    nombre: clampStr(c.nombre, 150, 'Cliente'),
    telefono: clampStr(c.telefono, 50, ''),
    email: clampOptStr(c.email, 150),
    ci: clampOptStr(c.ci, 50),
    direccion: clampOptStr(c.direccion, 300),
    allowedEmails,
    updatedAt: serverTimestamp(),
  });
}

function toProductoDoc(p: Producto, allowedEmails: string[]) {
  const id = sanitizeDocId(p.id);
  return stripUndefined({
    id,
    nombre: clampStr(p.nombre, 120, 'Producto'),
    costoUnitario: p.costoUnitario === null || p.costoUnitario === undefined ? null : clampNum(p.costoUnitario, 0),
    precioVigente: clampNonNegNum(p.precioVigente, 0),
    historicoPrecios: Array.isArray(p.historicoPrecios) ? p.historicoPrecios.slice(0, 100) : [],
    activo: p.activo !== false,
    allowedEmails,
    updatedAt: serverTimestamp(),
  });
}

function toProduccionDoc(l: ProduccionLote, allowedEmails: string[]) {
  const id = sanitizeDocId(l.id);
  return stripUndefined({
    id,
    fecha: clampStr(l.fecha, 20),
    producto: clampStr(l.producto, 120, 'Producto'),
    cantidad: clampNonNegNum(l.cantidad, 0),
    merma: clampNonNegNum(l.merma, 0),
    costo: clampNonNegNum(l.costo, 0),
    allowedEmails,
    updatedAt: serverTimestamp(),
  });
}

function toVentaDoc(v: VentaVale, allowedEmails: string[]) {
  const id = sanitizeDocId(v.id);
  const lineas =
    Array.isArray(v.lineas) && v.lineas.length > 0
      ? v.lineas.slice(0, 50)
      : [{ producto: 'Otros', cantidad: 0, importe: 0 }];
  return stripUndefined({
    id,
    vale: clampStr(v.vale, 40, '0'),
    fecha: clampStr(v.fecha, 20),
    cliente: clampStr(v.cliente, 150, 'Otros'),
    lineas,
    importeTotal: clampNonNegNum(v.importeTotal, 0),
    formaPago: v.formaPago === 'Transferencia' ? 'Transferencia' : 'Efectivo',
    nota: clampOptStr(v.nota, 500),
    allowedEmails,
    updatedAt: serverTimestamp(),
  });
}

function toGastoDoc(g: GastoItem, allowedEmails: string[]) {
  const id = sanitizeDocId(g.id);
  return stripUndefined({
    id,
    fecha: clampStr(g.fecha, 20),
    categoria: clampStr(g.categoria, 50, 'Otros'),
    concepto: clampStr(g.concepto, 250, ''),
    importe: clampNonNegNum(g.importe, 0),
    formaPago: g.formaPago === 'Banco/Transferencia' ? 'Banco/Transferencia' : 'Efectivo',
    tipoSalario: clampOptStr(g.tipoSalario, 30),
    loteId: g.loteId ? sanitizeDocId(g.loteId) : undefined,
    repartoId: g.repartoId ? sanitizeDocId(g.repartoId) : undefined,
    generadoPor: clampOptStr(g.generadoPor, 30),
    allowedEmails,
    updatedAt: serverTimestamp(),
  });
}

function toAlmacenDoc(a: AlmacenItem, allowedEmails: string[]) {
  const id = sanitizeDocId(a.id);
  return stripUndefined({
    id,
    codigo: clampStr(a.codigo, 40),
    producto: clampStr(a.producto, 150, 'Material'),
    marca: clampOptStr(a.marca, 120),
    presentacion: clampOptStr(a.presentacion, 120),
    unidad: clampStr(a.unidad, 40, 'Kg'),
    existencia: clampNonNegNum(a.existencia, 0),
    precio: clampNonNegNum(a.precio, 0),
    contenidoTotal: a.contenidoTotal !== undefined ? clampNonNegNum(a.contenidoTotal, 1) : undefined,
    fechaConteo: clampStr(a.fechaConteo, 20),
    stockMinimo: a.stockMinimo !== undefined ? clampNonNegNum(a.stockMinimo, 0) : undefined,
    movimientos: Array.isArray(a.movimientos) ? a.movimientos.slice(0, 500) : [],
    allowedEmails,
    updatedAt: serverTimestamp(),
  });
}

function toFacturaDoc(f: FacturaItem, allowedEmails: string[]) {
  const id = sanitizeDocId(f.id);
  return stripUndefined({
    id,
    numero: clampStr(f.numero, 40),
    cliente: clampStr(f.cliente, 150),
    telefono: clampStr(f.telefono, 50),
    ci: clampStr(f.ci, 50),
    direccion: clampStr(f.direccion, 300),
    fecha: clampStr(f.fecha, 20),
    periodoVales: clampStr(f.periodoVales, 80),
    valesIncluidos: Array.isArray(f.valesIncluidos)
      ? f.valesIncluidos.slice(0, 200).map((idStr) => sanitizeDocId(idStr))
      : [],
    valesDetalle: Array.isArray(f.valesDetalle) ? f.valesDetalle.slice(0, 200) : [],
    productosConsolidados: Array.isArray(f.productosConsolidados)
      ? f.productosConsolidados.slice(0, 200)
      : [],
    importeTotal: clampNonNegNum(f.importeTotal, 0),
    observaciones: clampOptStr(f.observaciones, 500),
    allowedEmails,
    updatedAt: serverTimestamp(),
  });
}

function toJustificacionDoc(j: JustificacionDiferencia, allowedEmails: string[]) {
  const id = sanitizeDocId(j.id);
  return stripUndefined({
    id,
    fecha: clampStr(j.fecha, 20),
    producto: clampOptStr(j.producto, 120),
    nota: clampStr(j.nota, 1000),
    fechaRegistro: clampStr(j.fechaRegistro, 40),
    allowedEmails,
    updatedAt: serverTimestamp(),
  });
}

function toRecetaDoc(r: Receta, allowedEmails: string[]) {
  const id = sanitizeDocId(r.id);
  return stripUndefined({
    id,
    nombre: clampStr(r.nombre, 150, 'Receta'),
    ingredientes: Array.isArray(r.ingredientes) ? r.ingredientes.slice(0, 100) : [],
    costoIngredientes: r.costoIngredientes !== undefined ? clampNonNegNum(r.costoIngredientes, 0) : undefined,
    unidadesRinde: r.unidadesRinde !== undefined ? clampNonNegNum(r.unidadesRinde, 1) : undefined,
    porcentajeAdicionalCostos:
      r.porcentajeAdicionalCostos !== undefined
        ? clampNonNegNum(r.porcentajeAdicionalCostos, 0)
        : undefined,
    porcentajeBeneficioEsperado:
      r.porcentajeBeneficioEsperado !== undefined
        ? clampNonNegNum(r.porcentajeBeneficioEsperado, 0)
        : undefined,
    costoTotal: clampNonNegNum(r.costoTotal, 0),
    costoUnitario: r.costoUnitario !== undefined ? clampNonNegNum(r.costoUnitario, 0) : undefined,
    precioSugeridoUnitario:
      r.precioSugeridoUnitario !== undefined
        ? clampNonNegNum(r.precioSugeridoUnitario, 0)
        : undefined,
    fechaCreacion: clampOptStr(r.fechaCreacion, 40),
    observaciones: clampOptStr(r.observaciones, 1000),
    notas: clampOptStr(r.notas, 1000),
    allowedEmails,
    updatedAt: serverTimestamp(),
  });
}

function normalizeRole(rol: unknown): 'Administrador' | 'Operador' | 'Lector' {
  if (rol === 'Administrador' || rol === 'Operador' || rol === 'Lector') return rol;
  return 'Lector';
}

function toUsuarioDoc(u: UsuarioAutorizado) {
  const id = sanitizeDocId(u.id);
  return stripUndefined({
    id,
    email: clampStr((u.email || '').trim().toLowerCase(), 150, PRIMARY_ADMIN_EMAIL),
    nombre: clampOptStr(u.nombre, 120),
    rol: normalizeRole(u.rol),
    fechaAgregado: clampStr(u.fechaAgregado, 30, new Date().toISOString().slice(0, 10)),
    activo: Boolean(u.activo),
    updatedAt: serverTimestamp(),
  });
}

function stripMetaFields<T>(raw: Record<string, unknown>): T {
  const copy = { ...raw };
  delete copy.allowedEmails;
  delete copy.updatedAt;
  delete copy.updatedBy;
  return copy as T;
}

export async function checkUserAccess(email: string): Promise<{
  authorized: boolean;
  rol: 'Administrador' | 'Operador' | 'Lector' | null;
}> {
  if (isPrimaryAdminEmail(email)) {
    return { authorized: true, rol: 'Administrador' };
  }
  const key = emailToKey(email);
  const path = `email_roles/${key}`;
  try {
    const snap = await getDocFromServer(doc(db, 'email_roles', key));
    if (!snap.exists()) {
      return { authorized: false, rol: null };
    }
    const data = snap.data();
    if (data?.activo === true && ['Administrador', 'Operador', 'Lector'].includes(data?.rol)) {
      return { authorized: true, rol: data.rol };
    }
    return { authorized: false, rol: null };
  } catch (error) {
    // Permission denied means user does not have an authorized role doc
    if (error instanceof Error && error.message.toLowerCase().includes('permission')) {
      return { authorized: false, rol: null };
    }
    handleFirestoreError(error, OperationType.GET, path);
  }
}

interface BatchWriteOp {
  type: 'set' | 'update' | 'delete';
  col: string;
  id: string;
  data?: Record<string, unknown>;
}

function dedupeOps(ops: BatchWriteOp[]): BatchWriteOp[] {
  const map = new Map<string, BatchWriteOp>();
  for (const op of ops) {
    map.set(`${op.col}/${op.id}`, op);
  }
  return Array.from(map.values());
}

async function commitInChunks(ops: BatchWriteOp[]) {
  const uniqueOps = dedupeOps(ops);
  const CHUNK_SIZE = 150;
  for (let i = 0; i < uniqueOps.length; i += CHUNK_SIZE) {
    const chunk = uniqueOps.slice(i, i + CHUNK_SIZE);
    const batch = writeBatch(db);
    for (const op of chunk) {
      const ref = doc(db, op.col, op.id);
      if (op.type === 'set' && op.data) {
        batch.set(ref, op.data);
      } else if (op.type === 'update' && op.data) {
        batch.update(ref, op.data);
      } else if (op.type === 'delete') {
        batch.delete(ref);
      }
    }
    try {
      await batch.commit();
    } catch (error) {
      const firstPath = chunk[0] ? `${chunk[0].col}/${chunk[0].id}` : 'batch';
      handleFirestoreError(error, OperationType.WRITE, firstPath);
    }
  }
}

function buildSeedOps(appData: AppData, userEmail: string, includeUsers: boolean): BatchWriteOp[] {
  const usuarios = (appData.usuariosAutorizados || []).filter(
    (u) => u && typeof u.email === 'string' && u.email.trim().length >= 3
  );
  const allowedEmails = buildAllowedEmails(usuarios);
  const ops: BatchWriteOp[] = [];

  ops.push({
    type: 'set',
    col: 'config',
    id: 'caja',
    data: toCajaDoc(appData.caja, allowedEmails, userEmail),
  });

  for (const r of appData.repartos || []) {
    const d = toRepartoDoc(r, allowedEmails);
    ops.push({ type: 'set', col: 'repartos', id: d.id, data: d });
  }
  for (const c of appData.clientes || []) {
    const d = toClienteDoc(c, allowedEmails);
    ops.push({ type: 'set', col: 'clientes', id: d.id, data: d });
  }
  for (const p of appData.productos || []) {
    const d = toProductoDoc(p, allowedEmails);
    ops.push({ type: 'set', col: 'productos', id: d.id, data: d });
  }
  for (const l of appData.produccion || []) {
    const d = toProduccionDoc(l, allowedEmails);
    ops.push({ type: 'set', col: 'produccion', id: d.id, data: d });
  }
  for (const v of appData.ventas || []) {
    const d = toVentaDoc(v, allowedEmails);
    ops.push({ type: 'set', col: 'ventas', id: d.id, data: d });
  }
  for (const g of appData.gastos || []) {
    const d = toGastoDoc(g, allowedEmails);
    ops.push({ type: 'set', col: 'gastos', id: d.id, data: d });
  }
  for (const a of appData.almacen || []) {
    const d = toAlmacenDoc(a, allowedEmails);
    ops.push({ type: 'set', col: 'almacen', id: d.id, data: d });
  }
  for (const f of (appData.facturas || []).filter((x) => !x.id?.startsWith('fac-vale-'))) {
    const d = toFacturaDoc(f, allowedEmails);
    ops.push({ type: 'set', col: 'facturas', id: d.id, data: d });
  }
  for (const j of appData.justificaciones || []) {
    const d = toJustificacionDoc(j, allowedEmails);
    ops.push({ type: 'set', col: 'justificaciones', id: d.id, data: d });
  }
  for (const rec of appData.recetas || []) {
    const d = toRecetaDoc(rec, allowedEmails);
    ops.push({ type: 'set', col: 'recetas', id: d.id, data: d });
  }

  if (includeUsers) {
    for (const u of usuarios) {
      const d = toUsuarioDoc(u);
      ops.push({ type: 'set', col: 'usuarios_autorizados', id: d.id, data: d });
      ops.push({
        type: 'set',
        col: 'email_roles',
        id: emailToKey(u.email),
        data: {
          rol: normalizeRole(u.rol),
          activo: Boolean(u.activo),
          updatedAt: serverTimestamp(),
        },
      });
    }
  }

  // Write config/meta LAST so incomplete seed attempts never mark the DB as seeded
  ops.push({
    type: 'set',
    col: 'config',
    id: 'meta',
    data: toMetaDoc(appData.meta, allowedEmails, userEmail),
  });

  return ops;
}

export async function seedFirestoreIfNeeded(
  getInitialDataset: () => Promise<AppData>,
  userEmail: string
): Promise<{ seeded: boolean }> {
  try {
    const metaSnap = await getDocFromServer(doc(db, 'config', 'meta'));
    if (metaSnap.exists()) {
      return { seeded: false };
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, 'config/meta');
  }

  // Only an admin can seed config/meta on an empty DB
  const dataset = await getInitialDataset();
  const ops = buildSeedOps(dataset, userEmail, isPrimaryAdminEmail(userEmail));
  await commitInChunks(ops);
  return { seeded: true };
}

export async function replaceAllFirestoreData(
  appData: AppData,
  userEmail: string
): Promise<void> {
  const isAdminUser = isPrimaryAdminEmail(userEmail);
  const qCol = (colName: string) =>
    isAdminUser
      ? collection(db, colName)
      : query(collection(db, colName), where('allowedEmails', 'array-contains', userEmail.toLowerCase()));

  const ops = buildSeedOps(appData, userEmail, isAdminUser);
  const newIdsByCol = new Map<string, Set<string>>();
  for (const op of ops) {
    if (!newIdsByCol.has(op.col)) newIdsByCol.set(op.col, new Set());
    newIdsByCol.get(op.col)!.add(op.id);
  }

  const deleteOps: BatchWriteOp[] = [];
  for (const colName of WORKSPACE_COLLECTIONS) {
    try {
      const snap = await getDocsFromServer(qCol(colName));
      const keepIds = newIdsByCol.get(colName) || new Set();
      snap.forEach((d) => {
        if (!keepIds.has(d.id)) {
          deleteOps.push({ type: 'delete', col: colName, id: d.id });
        }
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.LIST, colName);
    }
  }

  await commitInChunks([...ops, ...deleteOps]);
}

export async function fetchAllFirestoreFromServer(
  userEmail: string,
  isPrimaryAdmin: boolean
): Promise<Partial<AppData>> {
  const qCol = (colName: string) =>
    isPrimaryAdmin
      ? collection(db, colName)
      : query(collection(db, colName), where('allowedEmails', 'array-contains', userEmail.toLowerCase()));

  const result: Partial<AppData> = {};

  try {
    const [metaSnap, cajaSnap] = await Promise.all([
      getDocFromServer(doc(db, 'config', 'meta')),
      getDocFromServer(doc(db, 'config', 'caja')),
    ]);
    if (metaSnap.exists()) result.meta = stripMetaFields<MetaConfig>(metaSnap.data());
    if (cajaSnap.exists()) result.caja = stripMetaFields<CajaConfig>(cajaSnap.data());
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, 'config');
  }

  for (const colName of WORKSPACE_COLLECTIONS) {
    try {
      const snap = await getDocsFromServer(qCol(colName));
      const items = snap.docs.map((d) => stripMetaFields<any>(d.data()));
      (result as any)[colName] = items;
    } catch (error) {
      handleFirestoreError(error, OperationType.LIST, colName);
    }
  }

  if (isPrimaryAdmin) {
    try {
      const usrSnap = await getDocsFromServer(collection(db, 'usuarios_autorizados'));
      result.usuariosAutorizados = usrSnap.docs.map((d) => stripMetaFields<UsuarioAutorizado>(d.data()));
    } catch (error) {
      handleFirestoreError(error, OperationType.LIST, 'usuarios_autorizados');
    }
  }

  return result;
}

export function subscribeToFirestoreData(
  userEmail: string,
  isPrimaryAdmin: boolean,
  onPatch: (patch: Partial<AppData>) => void
): Unsubscribe {
  const unsubs: Unsubscribe[] = [];
  const qCol = (colName: string) =>
    isPrimaryAdmin
      ? collection(db, colName)
      : query(collection(db, colName), where('allowedEmails', 'array-contains', userEmail.toLowerCase()));

  const handleSnapshotError = (error: unknown, op: OperationType, path: string) => {
    const code = (error as { code?: string })?.code || '';
    const msg = (error instanceof Error ? error.message : String(error)).toLowerCase();
    if (code === 'unavailable' || msg.includes('offline') || msg.includes('unavailable')) {
      console.warn(`Firestore listener temporarily offline (${path})`);
      return;
    }
    handleFirestoreError(error, op, path);
  };

  unsubs.push(
    onSnapshot(
      doc(db, 'config', 'meta'),
      (snap) => {
        if (snap.exists()) {
          onPatch({ meta: stripMetaFields<MetaConfig>(snap.data()) });
        }
      },
      (error) => handleSnapshotError(error, OperationType.GET, 'config/meta')
    )
  );

  unsubs.push(
    onSnapshot(
      doc(db, 'config', 'caja'),
      (snap) => {
        if (snap.exists()) {
          onPatch({ caja: stripMetaFields<CajaConfig>(snap.data()) });
        }
      },
      (error) => handleSnapshotError(error, OperationType.GET, 'config/caja')
    )
  );

  for (const colName of WORKSPACE_COLLECTIONS) {
    unsubs.push(
      onSnapshot(
        qCol(colName),
        (snap) => {
          const items = snap.docs.map((d) => stripMetaFields<any>(d.data()));
          onPatch({ [colName]: items } as Partial<AppData>);
        },
        (error) => handleSnapshotError(error, OperationType.LIST, colName)
      )
    );
  }

  if (isPrimaryAdmin) {
    unsubs.push(
      onSnapshot(
        collection(db, 'usuarios_autorizados'),
        (snap) => {
          const items = snap.docs.map((d) => stripMetaFields<UsuarioAutorizado>(d.data()));
          onPatch({ usuariosAutorizados: items });
        },
        (error) => handleSnapshotError(error, OperationType.LIST, 'usuarios_autorizados')
      )
    );
  }

  return () => {
    unsubs.forEach((u) => u());
  };
}

// Granular Firestore Write Operations
export async function fsSaveConfigMeta(meta: MetaConfig, allowedEmails: string[], updatedBy?: string) {
  try {
    await setDoc(doc(db, 'config', 'meta'), toMetaDoc(meta, allowedEmails, updatedBy));
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, 'config/meta');
  }
}

export async function fsUpdateSiguienteVale(siguienteVale: number, updatedBy?: string) {
  try {
    await updateDoc(doc(db, 'config', 'meta'), stripUndefined({
      siguienteVale: Math.max(1, clampNum(siguienteVale, 1)),
      updatedBy: clampOptStr(updatedBy, 150),
      updatedAt: serverTimestamp(),
    }));
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, 'config/meta');
  }
}

export async function fsSaveProduccionAndGasto(
  lote: ProduccionLote,
  gasto: GastoItem,
  allowedEmails: string[]
) {
  const loteDoc = toProduccionDoc(lote, allowedEmails);
  const gastoDoc = toGastoDoc(gasto, allowedEmails);
  await commitInChunks([
    { type: 'set', col: 'produccion', id: loteDoc.id, data: loteDoc },
    { type: 'set', col: 'gastos', id: gastoDoc.id, data: gastoDoc },
  ]);
}

export async function fsDeleteProduccionAndGastos(loteId: string, linkedGastoIds: string[]) {
  const ops: BatchWriteOp[] = [{ type: 'delete', col: 'produccion', id: sanitizeDocId(loteId) }];
  for (const gid of linkedGastoIds) {
    ops.push({ type: 'delete', col: 'gastos', id: sanitizeDocId(gid) });
  }
  await commitInChunks(ops);
}

export async function fsSaveVentaAndNextVale(
  venta: VentaVale,
  nextSiguienteVale: number,
  allowedEmails: string[],
  updatedBy?: string
) {
  const ventaDoc = toVentaDoc(venta, allowedEmails);
  await commitInChunks([
    { type: 'set', col: 'ventas', id: ventaDoc.id, data: ventaDoc },
    {
      type: 'update',
      col: 'config',
      id: 'meta',
      data: stripUndefined({
        siguienteVale: Math.max(1, clampNum(nextSiguienteVale, 1)),
        updatedBy: clampOptStr(updatedBy, 150),
        updatedAt: serverTimestamp(),
      }),
    },
  ]);
}

export async function fsSaveRepartoPagado(
  reparto: RepartoSemanal,
  gastos: GastoItem[],
  allowedEmails: string[]
) {
  const repDoc = toRepartoDoc(reparto, allowedEmails);
  const ops: BatchWriteOp[] = [{ type: 'set', col: 'repartos', id: repDoc.id, data: repDoc }];
  for (const g of gastos) {
    const gDoc = toGastoDoc(g, allowedEmails);
    ops.push({ type: 'set', col: 'gastos', id: gDoc.id, data: gDoc });
  }
  await commitInChunks(ops);
}

export async function fsDeshacerRepartoPagado(
  reparto: RepartoSemanal,
  linkedGastoIds: string[],
  allowedEmails: string[]
) {
  const repDoc = toRepartoDoc(reparto, allowedEmails);
  const ops: BatchWriteOp[] = [{ type: 'set', col: 'repartos', id: repDoc.id, data: repDoc }];
  for (const gid of linkedGastoIds) {
    ops.push({ type: 'delete', col: 'gastos', id: sanitizeDocId(gid) });
  }
  await commitInChunks(ops);
}

export async function fsSaveReglasReparto(
  meta: MetaConfig,
  updatedRepartos: RepartoSemanal[],
  allowedEmails: string[],
  updatedBy?: string
) {
  const ops: BatchWriteOp[] = [
    { type: 'set', col: 'config', id: 'meta', data: toMetaDoc(meta, allowedEmails, updatedBy) },
  ];
  for (const r of updatedRepartos) {
    const d = toRepartoDoc(r, allowedEmails);
    ops.push({ type: 'set', col: 'repartos', id: d.id, data: d });
  }
  await commitInChunks(ops);
}

export async function fsSaveClienteAndRefs(
  cliente: Cliente,
  updatedVentas: VentaVale[],
  updatedFacturas: FacturaItem[],
  allowedEmails: string[]
) {
  const ops: BatchWriteOp[] = [];
  const cliDoc = toClienteDoc(cliente, allowedEmails);
  ops.push({ type: 'set', col: 'clientes', id: cliDoc.id, data: cliDoc });
  for (const v of updatedVentas) {
    const d = toVentaDoc(v, allowedEmails);
    ops.push({ type: 'set', col: 'ventas', id: d.id, data: d });
  }
  for (const f of updatedFacturas) {
    const d = toFacturaDoc(f, allowedEmails);
    ops.push({ type: 'set', col: 'facturas', id: d.id, data: d });
  }
  await commitInChunks(ops);
}

export async function fsSetEntity(
  col: WorkspaceCollectionName,
  entity: any,
  allowedEmails: string[]
) {
  let docData: Record<string, unknown>;
  switch (col) {
    case 'repartos':
      docData = toRepartoDoc(entity, allowedEmails);
      break;
    case 'clientes':
      docData = toClienteDoc(entity, allowedEmails);
      break;
    case 'productos':
      docData = toProductoDoc(entity, allowedEmails);
      break;
    case 'produccion':
      docData = toProduccionDoc(entity, allowedEmails);
      break;
    case 'ventas':
      docData = toVentaDoc(entity, allowedEmails);
      break;
    case 'gastos':
      docData = toGastoDoc(entity, allowedEmails);
      break;
    case 'almacen':
      docData = toAlmacenDoc(entity, allowedEmails);
      break;
    case 'facturas':
      docData = toFacturaDoc(entity, allowedEmails);
      break;
    case 'justificaciones':
      docData = toJustificacionDoc(entity, allowedEmails);
      break;
    case 'recetas':
      docData = toRecetaDoc(entity, allowedEmails);
      break;
  }
  const id = String(docData.id);
  try {
    await setDoc(doc(db, col, id), docData);
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `${col}/${id}`);
  }
}

export async function fsDeleteEntity(col: WorkspaceCollectionName, id: string) {
  const safeId = sanitizeDocId(id);
  try {
    await deleteDoc(doc(db, col, safeId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, `${col}/${safeId}`);
  }
}

export async function fsSaveUsuarioAndSyncAllowedEmails(
  action: 'upsert' | 'delete',
  usuario: UsuarioAutorizado,
  nextUsuariosList: UsuarioAutorizado[]
) {
  const allowedEmails = buildAllowedEmails(nextUsuariosList);
  const ops: BatchWriteOp[] = [];
  const safeId = sanitizeDocId(usuario.id);
  const emailKey = emailToKey(usuario.email);

  if (action === 'upsert') {
    ops.push({ type: 'set', col: 'usuarios_autorizados', id: safeId, data: toUsuarioDoc(usuario) });
    ops.push({
      type: 'set',
      col: 'email_roles',
      id: emailKey,
      data: {
        rol: usuario.rol,
        activo: Boolean(usuario.activo),
        updatedAt: serverTimestamp(),
      },
    });
  } else {
    ops.push({ type: 'delete', col: 'usuarios_autorizados', id: safeId });
    ops.push({ type: 'delete', col: 'email_roles', id: emailKey });
  }

  // Propagate allowedEmails across config and workspace docs so queries stay in sync
  ops.push({
    type: 'update',
    col: 'config',
    id: 'meta',
    data: { allowedEmails, updatedAt: serverTimestamp() },
  });
  ops.push({
    type: 'update',
    col: 'config',
    id: 'caja',
    data: { allowedEmails, updatedAt: serverTimestamp() },
  });

  for (const colName of WORKSPACE_COLLECTIONS) {
    try {
      const snap = await getDocsFromServer(collection(db, colName));
      snap.forEach((d) => {
        ops.push({
          type: 'update',
          col: colName,
          id: d.id,
          data: { allowedEmails, updatedAt: serverTimestamp() },
        });
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.LIST, colName);
    }
  }

  await commitInChunks(ops);
}
