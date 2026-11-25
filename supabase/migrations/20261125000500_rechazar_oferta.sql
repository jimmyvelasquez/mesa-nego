-- Rechazo de ofertas por el comprador (decisión humana).
-- 1) Admite el estado 'rejected' en offers.
-- 2) Función reject_offer: solo el dueño de la compra, solo ofertas 'submitted',
--    deja rastro en decisions (kind 'reject') y en audit_log.

do $$
declare
  c record;
begin
  for c in
    select conname from pg_constraint
    where conrelid = 'public.offers'::regclass and contype = 'c'
      and pg_get_constraintdef(oid) like '%status%'
  loop
    execute format('alter table public.offers drop constraint %I', c.conname);
  end loop;
end $$;

alter table public.offers
  add constraint offers_status_check
  check (status in ('submitted', 'countered', 'withdrawn', 'rejected'));

create or replace function public.reject_offer(p_request_id uuid, p_offer_id uuid)
returns void
language plpgsql
security definer
set search_path to ''
as $$
declare
  found_id uuid;
begin
  if not private.owns_request(p_request_id) then
    raise exception 'compra no encontrada';
  end if;

  update public.offers
     set status = 'rejected'
   where id = p_offer_id
     and purchase_request_id = p_request_id
     and status = 'submitted'
  returning id into found_id;

  if found_id is null then
    raise exception 'oferta no válida para rechazar';
  end if;

  insert into public.decisions (purchase_request_id, offer_id, kind, actor_type, actor_id)
  values (p_request_id, p_offer_id, 'reject', 'human', (select auth.uid()));

  insert into public.audit_log (company_id, purchase_request_id, actor_type, actor_id, action, payload)
  values (private.current_company_id(), p_request_id, 'human', (select auth.uid()), 'offer_rejected',
          jsonb_build_object('offer_id', p_offer_id));
end;
$$;

revoke all on function public.reject_offer(uuid, uuid) from public, anon;
grant execute on function public.reject_offer(uuid, uuid) to authenticated;
