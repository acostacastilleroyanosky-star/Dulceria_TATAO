/**
 * Security Rules Verification Suite (Dirty Dozen Adversarial Payloads)
 * Intended for execution against Firebase Firestore Emulator with @firebase/rules-unit-testing.
 */
export const DIRTY_DOZEN_CASES = [
  {
    name: '1. Unauthenticated read on /ventas/vnt-1',
    auth: null,
    op: 'get',
    path: 'ventas/vnt-1',
    expected: 'PERMISSION_DENIED',
  },
  {
    name: '2. Unverified email token attempting write on /ventas/vnt-test',
    auth: { uid: 'u1', email: 'acostacastilleroyanosky@gmail.com', email_verified: false },
    op: 'create',
    path: 'ventas/vnt-test',
    expected: 'PERMISSION_DENIED',
  },
  {
    name: '3. Random signed-in Gmail attempting list on /ventas',
    auth: { uid: 'u2', email: 'stranger@gmail.com', email_verified: true },
    op: 'list',
    path: 'ventas',
    expected: 'PERMISSION_DENIED',
  },
  {
    name: '4. Lector role attempting create on /ventas/vnt-test',
    auth: { uid: 'u3', email: 'lector@gmail.com', email_verified: true },
    op: 'create',
    path: 'ventas/vnt-test',
    expected: 'PERMISSION_DENIED',
  },
  {
    name: '5. Operador role attempting update on /repartos/rep-1',
    auth: { uid: 'u4', email: 'operador@gmail.com', email_verified: true },
    op: 'update',
    path: 'repartos/rep-1',
    expected: 'PERMISSION_DENIED',
  },
  {
    name: '6. Operador role attempting create on /usuarios_autorizados/usr-rogue',
    auth: { uid: 'u4', email: 'operador@gmail.com', email_verified: true },
    op: 'create',
    path: 'usuarios_autorizados/usr-rogue',
    expected: 'PERMISSION_DENIED',
  },
  {
    name: '7. Non-admin attempting get on /usuarios_autorizados/usr-1 (PII isolation)',
    auth: { uid: 'u4', email: 'operador@gmail.com', email_verified: true },
    op: 'get',
    path: 'usuarios_autorizados/usr-1',
    expected: 'PERMISSION_DENIED',
  },
  {
    name: '8. Non-admin attempting update on /email_roles/other_gmail_com',
    auth: { uid: 'u4', email: 'operador@gmail.com', email_verified: true },
    op: 'update',
    path: 'email_roles/other_gmail_com',
    expected: 'PERMISSION_DENIED',
  },
  {
    name: '9. Shadow field injection on /ventas/vnt-999',
    auth: { uid: 'admin', email: 'acostacastilleroyanosky@gmail.com', email_verified: true },
    op: 'create',
    path: 'ventas/vnt-999',
    payload: { id: 'vnt-999', vale: '999', fecha: '2026-11-27', cliente: 'Otros', lineas: [{}], importeTotal: 100, allowedEmails: ['acostacastilleroyanosky@gmail.com'], isAdminBypass: true },
    expected: 'PERMISSION_DENIED',
  },
  {
    name: '10. Invalid ID poisoning (oversized or invalid characters)',
    auth: { uid: 'admin', email: 'acostacastilleroyanosky@gmail.com', email_verified: true },
    op: 'create',
    path: 'ventas/bad..id',
    expected: 'PERMISSION_DENIED',
  },
  {
    name: '11. Oversized string injection on /gastos/gst-999',
    auth: { uid: 'admin', email: 'acostacastilleroyanosky@gmail.com', email_verified: true },
    op: 'create',
    path: 'gastos/gst-999',
    expected: 'PERMISSION_DENIED',
  },
  {
    name: '12. Forged client timestamp (updatedAt != request.time)',
    auth: { uid: 'admin', email: 'acostacastilleroyanosky@gmail.com', email_verified: true },
    op: 'create',
    path: 'ventas/vnt-999',
    expected: 'PERMISSION_DENIED',
  },
];
