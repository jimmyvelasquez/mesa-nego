-- Fase 2: políticas de acceso por fila (RLS).
-- Principios:
--   * cada empresa ve solo sus datos;
--   * un proveedor NUNCA ve el límite, el suelo ni el precio de referencia del comprador
--     (solo accede a la vista supplier_invitations, que los omite);
--   * un proveedor solo ve sus propias ofertas;
--   * las decisiones del agente se escriben con service_role (sin política de inserción para usuarios).

-- ---------------------------------------------------------------------------
-- Funciones auxiliares
-- ---------------------------------------------------------------------------

create or replace function public.current_company_id()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select p.company_id from public.profiles p where p.id = (select auth.uid());
$$;

create or replace function public.current_company_kind()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select c.kind from public.companies c where c.id = public.current_company_id();
$$;

create or replace function public.owns_request(p_request_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.purchase_requests pr
    where pr.id = p_request_id and pr.buyer_company_id = public.current_company_id()
  );
$$;

revoke execute on function public.current_company_id, public.current_company_kind, public.owns_request from anon, public;
grant execute on function public.current_company_id, public.current_company_kind, public.owns_request to authenticated;

-- ---------------------------------------------------------------------------
-- Activar RLS en todas las tablas
-- ---------------------------------------------------------------------------

alter table public.companies enable row level security;
alter table public.profiles enable row level security;
alter table public.purchase_requests enable row level security;
alter table public.invitations enable row level security;
alter table public.offers enable row level security;
alter table public.decisions enable row level security;
alter table public.audit_log enable row level security;

-- ---------------------------------------------------------------------------
-- companies
-- ---------------------------------------------------------------------------

create policy companies_select_own on public.companies
  for select to authenticated
  using (id = public.current_company_id());

-- ---------------------------------------------------------------------------
-- profiles
-- ---------------------------------------------------------------------------

create policy profiles_select_same_company on public.profiles
  for select to authenticated
  using (company_id = public.current_company_id());

-- ---------------------------------------------------------------------------
-- purchase_requests: solo el comprador dueño ve y gestiona sus compras
-- ---------------------------------------------------------------------------

create policy requests_select_buyer on public.purchase_requests
  for select to authenticated
  using (buyer_company_id = public.current_company_id());

create policy requests_insert_buyer on public.purchase_requests
  for insert to authenticated
  with check (
    buyer_company_id = public.current_company_id()
    and public.current_company_kind() = 'buyer'
    and created_by = (select auth.uid())
  );

create policy requests_update_buyer on public.purchase_requests
  for update to authenticated
  using (buyer_company_id = public.current_company_id())
  with check (buyer_company_id = public.current_company_id());

-- Sin política de DELETE: las compras no se borran desde la API.

-- ---------------------------------------------------------------------------
-- invitations: el comprador las gestiona; el proveedor NO lee la tabla
-- (ve sus invitaciones a través de la vista supplier_invitations)
-- ---------------------------------------------------------------------------

create policy invitations_select_buyer on public.invitations
  for select to authenticated
  using (public.owns_request(purchase_request_id));

create policy invitations_insert_buyer on public.invitations
  for insert to authenticated
  with check (public.owns_request(purchase_request_id));

create policy invitations_update_buyer on public.invitations
  for update to authenticated
  using (public.owns_request(purchase_request_id))
  with check (public.owns_request(purchase_request_id));

-- ---------------------------------------------------------------------------
-- offers
-- ---------------------------------------------------------------------------

create policy offers_select on public.offers
  for select to authenticated
  using (supplier_company_id = public.current_company_id() or public.owns_request(purchase_request_id));

-- Un proveedor solo envía oferta si aceptó la invitación y la compra está abierta.
create policy offers_insert_invited_supplier on public.offers
  for insert to authenticated
  with check (
    supplier_company_id = public.current_company_id()
    and public.current_company_kind() = 'supplier'
    and exists (
      select 1
      from public.invitations i
      join public.purchase_requests pr on pr.id = i.purchase_request_id
      where i.purchase_request_id = offers.purchase_request_id
        and i.supplier_company_id = public.current_company_id()
        and i.status = 'accepted'
        and pr.status = 'open'
    )
  );

-- Sin UPDATE ni DELETE directos: retirar o cambiar una oferta irá por una función dedicada.

-- ---------------------------------------------------------------------------
-- decisions: el comprador ve las decisiones de sus compras y solo él aprueba o rechaza
-- ---------------------------------------------------------------------------

create policy decisions_select_buyer on public.decisions
  for select to authenticated
  using (public.owns_request(purchase_request_id));

create policy decisions_insert_human_buyer on public.decisions
  for insert to authenticated
  with check (
    kind in ('approve_award', 'reject')
    and actor_type = 'human'
    and actor_id = (select auth.uid())
    and public.owns_request(purchase_request_id)
  );

-- ---------------------------------------------------------------------------
-- audit_log: cada empresa lee sus entradas; se puede insertar, nunca modificar
-- ---------------------------------------------------------------------------

create policy audit_select_own on public.audit_log
  for select to authenticated
  using (company_id = public.current_company_id());

create policy audit_insert_own on public.audit_log
  for insert to authenticated
  with check (
    company_id = public.current_company_id()
    and actor_type = 'human'
    and actor_id = (select auth.uid())
  );

-- ---------------------------------------------------------------------------
-- Vista del proveedor: datos de la compra SIN límite, suelo ni precio de referencia
-- ---------------------------------------------------------------------------

create view public.supplier_invitations as
select
  i.id,
  i.purchase_request_id,
  i.supplier_company_id,
  i.status,
  i.expires_at,
  pr.product_name,
  pr.unit,
  pr.volume
from public.invitations i
join public.purchase_requests pr on pr.id = i.purchase_request_id
where i.supplier_company_id = public.current_company_id();

revoke all on public.supplier_invitations from anon, public;
grant select on public.supplier_invitations to authenticated;

-- ---------------------------------------------------------------------------
-- Aceptar una invitación con su token (el token nunca se guarda en claro)
-- ---------------------------------------------------------------------------

create or replace function public.accept_invitation(p_token text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  inv public.invitations;
begin
  select * into inv
  from public.invitations
  where token_hash = encode(extensions.digest(p_token, 'sha256'), 'hex')
  for update;

  if not found or inv.supplier_company_id <> public.current_company_id() then
    raise exception 'invitación no válida';
  end if;

  if inv.status <> 'pending' or inv.expires_at < now() then
    raise exception 'invitación caducada o ya utilizada';
  end if;

  update public.invitations
  set status = 'accepted', accepted_at = now()
  where id = inv.id;

  return inv.purchase_request_id;
end;
$$;

revoke execute on function public.accept_invitation(text) from anon, public;
grant execute on function public.accept_invitation(text) to authenticated;
