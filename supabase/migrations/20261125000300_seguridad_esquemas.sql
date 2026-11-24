-- Corrección de seguridad tras los avisos de Supabase.
--   1. Las funciones auxiliares de RLS pasan a un esquema privado, que la API no expone.
--   2. La vista supplier_invitations (SECURITY DEFINER) se sustituye por una función
--      de solo lectura que filtra por la empresa del usuario.
--   3. accept_invitation sigue siendo SECURITY DEFINER a propósito: es la única vía
--      para que un proveedor cambie el estado de una invitación, y valida token y empresa.

create schema if not exists private;
revoke all on schema private from public, anon;
grant usage on schema private to authenticated;

-- Mover las funciones auxiliares. Las políticas RLS las referencian por OID, así que siguen funcionando.
alter function public.current_company_id() set schema private;
alter function public.current_company_kind() set schema private;
alter function public.owns_request(uuid) set schema private;
alter function public.supplier_can_offer(uuid) set schema private;

-- Recrear los cuerpos apuntando al nuevo esquema.
create or replace function private.current_company_id()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select p.company_id from public.profiles p where p.id = (select auth.uid());
$$;

create or replace function private.current_company_kind()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select c.kind from public.companies c where c.id = private.current_company_id();
$$;

create or replace function private.owns_request(p_request_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.purchase_requests pr
    where pr.id = p_request_id and pr.buyer_company_id = private.current_company_id()
  );
$$;

create or replace function private.supplier_can_offer(p_request_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.invitations i
    join public.purchase_requests pr on pr.id = i.purchase_request_id
    where i.purchase_request_id = p_request_id
      and i.supplier_company_id = private.current_company_id()
      and i.status = 'accepted'
      and pr.status = 'open'
  );
$$;

revoke execute on function private.current_company_id, private.current_company_kind,
  private.owns_request, private.supplier_can_offer from public, anon;
grant execute on function private.current_company_id, private.current_company_kind,
  private.owns_request, private.supplier_can_offer to authenticated;

-- accept_invitation pasa a usar el esquema privado.
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

  if not found or inv.supplier_company_id <> private.current_company_id() then
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

-- Vista definer sustituida por función de solo lectura, filtrada por empresa.
drop view if exists public.supplier_invitations;

create or replace function public.my_supplier_invitations()
returns table (
  id uuid,
  purchase_request_id uuid,
  supplier_company_id uuid,
  status text,
  expires_at timestamptz,
  product_name text,
  unit text,
  volume numeric
)
language sql
stable
security definer
set search_path = ''
as $$
  select i.id, i.purchase_request_id, i.supplier_company_id, i.status, i.expires_at,
         pr.product_name, pr.unit, pr.volume
  from public.invitations i
  join public.purchase_requests pr on pr.id = i.purchase_request_id
  where i.supplier_company_id = private.current_company_id();
$$;

revoke execute on function public.my_supplier_invitations() from public, anon;
grant execute on function public.my_supplier_invitations() to authenticated;
