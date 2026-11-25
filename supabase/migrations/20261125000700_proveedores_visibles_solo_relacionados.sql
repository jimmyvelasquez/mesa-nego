-- El comprador solo ve proveedores con los que ya tiene relación:
-- invitaciones o ofertas en sus compras.

create or replace function public.list_supplier_companies()
returns table (id uuid, name text)
language sql
stable
security definer
set search_path to ''
as $$
  select c.id, c.name
  from public.companies c
  where c.kind = 'supplier'
    and private.current_company_kind() = 'buyer'
    and (
      exists (
        select 1 from public.invitations i
        where i.supplier_company_id = c.id and private.owns_request(i.purchase_request_id)
      )
      or exists (
        select 1 from public.offers o
        where o.supplier_company_id = c.id and private.owns_request(o.purchase_request_id)
      )
    )
  order by c.name;
$$;
