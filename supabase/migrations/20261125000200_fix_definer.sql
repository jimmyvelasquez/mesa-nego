-- Corrección tras las pruebas de RLS: el proveedor no puede leer purchase_requests
-- directamente, así que las comprobaciones que lo necesitan deben ejecutarse como
-- security definer. Afecta al trigger de within_limit y a la política de ofertas.

-- Trigger: calcula within_limit leyendo el límite aunque el usuario no pueda verlo.
create or replace function public.set_offer_within_limit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  lim numeric;
begin
  select price_limit into lim from public.purchase_requests where id = new.purchase_request_id;
  new.within_limit := new.price <= lim;
  return new;
end;
$$;

revoke execute on function public.set_offer_within_limit() from anon, authenticated, public;

-- Comprueba si el proveedor actual aceptó la invitación y la compra está abierta.
create or replace function public.supplier_can_offer(p_request_id uuid)
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
      and i.supplier_company_id = public.current_company_id()
      and i.status = 'accepted'
      and pr.status = 'open'
  );
$$;

revoke execute on function public.supplier_can_offer(uuid) from anon, public;
grant execute on function public.supplier_can_offer(uuid) to authenticated;

drop policy if exists offers_insert_invited_supplier on public.offers;

create policy offers_insert_invited_supplier on public.offers
  for insert to authenticated
  with check (
    supplier_company_id = public.current_company_id()
    and public.current_company_kind() = 'supplier'
    and public.supplier_can_offer(purchase_request_id)
  );
