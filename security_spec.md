# Security Specification & TDD Plan — Dulcería TATAO Firestore

## 1. Data Invariants
1. **Default-Deny Catch-All**: Every path not explicitly matched is denied (`allow read, write: if false`).
2. **Verified Identity**: All access requires `request.auth != null` and `request.auth.token.email_verified == true`.
3. **Role-Based Access Control (RBAC)**:
   - Primary Admin (`acostacastilleroyanosky@gmail.com`) is bootstrapped as `Administrador`.
   - Additional team members must exist in `/email_roles/{authEmailKey()}` with `activo == true` and `rol in ['Administrador', 'Operador', 'Lector']`.
   - `Lector` has read-only access (no writes to any collection).
   - `Operador` can create/update/delete operational records (`produccion`, `ventas`, `gastos`, `almacen`, `clientes`, `productos`, `facturas`, `justificaciones`, `recetas`, and `config/meta.siguienteVale`), but CANNOT modify `usuarios_autorizados`, `email_roles`, `repartos`, `config/caja`, or `config/meta.reparto` / `pagoPorDulceTrabajador` / `gananciaPorUnidad`.
   - `Administrador` has full operational & configuration control.
4. **PII Isolation**:
   - `/usuarios_autorizados/{usuarioId}` (contains `email`) is strictly readable and writable ONLY by `isAdmin()`.
   - `/email_roles/{emailKey}` contains ZERO PII (only `rol`, `activo`, `updatedAt`); users may only `get` their own key, while `list`/writes are `isAdmin()` only.
   - `/clientes/{clienteId}` (contains phone/email/CI/address) requires `isAdmin() || isOperator()` for `get` and `isPrimaryAdmin() || (request.auth.token.email in resource.data.allowedEmails)` for `list`.
5. **Query Security without O(n) Lookups**:
   - `allow list` rules NEVER invoke `get()` or `exists()`. Instead, every workspace collection validates `isPrimaryAdmin() || (request.auth.token.email in resource.data.allowedEmails)`.
6. **Path ID & Payload Integrity**:
   - All document IDs match `^[a-zA-Z0-9_\-]+$` (`<= 128` chars).
   - All strings enforce explicit `.size()` bounds.
   - All arrays enforce explicit `.size() <= MAX` bounds and first-element checks when non-empty.
   - All `create` and `update` operations validate `request.resource.data.keys().hasAll(...)` and `hasOnly(...)` plus `updatedAt == request.time`.

## 2. "Dirty Dozen" Adversarial Test Payloads (Expected: `PERMISSION_DENIED`)
1. Unauthenticated read on `/ventas/vnt-1` -> DENIED.
2. Unverified email token (`email_verified: false`) attempting read/write -> DENIED.
3. Authenticated non-member Gmail attempting `list` on `/ventas` -> DENIED.
4. `Lector` role attempting `create` on `/ventas/vnt-test` -> DENIED.
5. `Operador` role attempting `update` on `/repartos/rep-1` -> DENIED.
6. `Operador` role attempting `create` on `/usuarios_autorizados/usr-rogue` -> DENIED.
7. Non-admin attempting `get` on `/usuarios_autorizados/usr-1` (PII blanket test) -> DENIED.
8. Non-admin attempting `update` on `/email_roles/other_gmail_com` (privilege escalation) -> DENIED.
9. Shadow field injection: `create` `/ventas/vnt-999` with extra field `isAdminBypass: true` -> DENIED (`hasOnly` check).
10. Invalid ID poisoning: `create` `/ventas/bad..slash` or 200-char ID -> DENIED (`isValidId`).
11. Unbounded/oversized string injection: `create` `/gastos/gst-999` with 2,000-char `concepto` -> DENIED.
12. Client-forged timestamp: `create` `/ventas/vnt-999` with `updatedAt` != `request.time` -> DENIED.
