# Base de datos (Supabase)

Proyecto: `mesa-nego` (eu-west-1). Migraciones en `migrations/`, aplicadas en orden:

1. `20261125000000_modelo_base.sql`: tablas, restricciones, cálculo de `within_limit` y `audit_log` de solo escritura.
2. `20261125000100_rls.sql`: activación de RLS y políticas por empresa.
3. `20261125000200_fix_definer.sql`: corrección tras las pruebas (el trigger y la comprobación de la oferta necesitan `security definer`).
4. `20261125000300_seguridad_esquemas.sql`: funciones auxiliares movidas al esquema `private` (no expuesto por la API), vista definer sustituida por `my_supplier_invitations()`.

## Reglas que impone la base de datos

- El agente nunca adjudica: `decisions` solo acepta `counter`, `escalate` y `propose_award` como agente; `approve_award` y `reject` solo como humano.
- `within_limit` lo calcula un trigger; el cliente no puede enviarlo.
- `audit_log` no admite UPDATE, DELETE ni TRUNCATE, ni siquiera para superusuarios (triggers).
- Un proveedor no puede leer `purchase_requests` ni `invitations`; ve sus invitaciones con `my_supplier_invitations()`, que omite límite, suelo y precio de referencia.
- El token de invitación nunca se guarda en claro: solo su hash SHA-256. Se acepta con `accept_invitation(token)`.

## Pruebas

`tests/rls_test.sql` comprueba los accesos por rol (comprador, proveedor invitado y proveedor ajeno) y las reglas de auditoría. Se ejecuta como superusuario y termina sin error si todo pasa.

## Avisos de seguridad aceptados

Supabase marca dos funciones `SECURITY DEFINER` ejecutables por usuarios autenticados. Son intencionadas:

- `accept_invitation(text)`: única vía para que un proveedor cambie el estado de una invitación; valida token y empresa.
- `my_supplier_invitations()`: solo lectura, filtrada por la empresa del usuario.
