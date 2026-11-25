-- Las invitaciones del proveedor incluyen el estado de la compra,
-- para ocultar ofertas cuando la compra ya no está abierta.

drop function if exists public.my_supplier_invitations();

create function public.my_supplier_invitations()
returns table (
  id uuid,
  purchase_request_id uuid,
  supplier_company_id uuid,
  status text,
  expires_at timestamptz,
  product_name text,
  unit text,
  volume numeric,
  request_status text
)
language sql
stable
security definer
set search_path to ''
as $$
  select i.id, i.purchase_request_id, i.supplier_company_id, i.status, i.expires_at,
         pr.product_name, pr.unit, pr.volume, pr.status as request_status
  from public.invitations i
  join public.purchase_requests pr on pr.id = i.purchase_request_id
  where i.supplier_company_id = private.current_company_id()
    and private.current_company_kind() = 'supplier'
  order by i.created_at desc;
$$;

revoke all on function public.my_supplier_invitations() from public, anon;
grant execute on function public.my_supplier_invitations() to authenticated;
