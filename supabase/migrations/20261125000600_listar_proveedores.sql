-- Lista de empresas proveedoras (id y nombre) para compradores.
-- Permite mostrar nombres en vez de IDs. Solo usuarios con empresa compradora.

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
  order by c.name;
$$;

revoke all on function public.list_supplier_companies() from public, anon;
grant execute on function public.list_supplier_companies() to authenticated;
