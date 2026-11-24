-- Fase 3: API del flujo de compra. Toda acción pasa por una función que valida
-- el rol, la pertenencia y el estado, y deja registro en audit_log.

-- Abre una compra para ofertas (solo el comprador dueño, solo desde 'draft').
create or replace function public.open_purchase_request(p_request_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  buyer uuid;
begin
  if not private.owns_request(p_request_id) then
    raise exception 'compra no encontrada';
  end if;

  update public.purchase_requests
  set status = 'open'
  where id = p_request_id and status = 'draft'
  returning buyer_company_id into buyer;

  if buyer is null then
    raise exception 'la compra no está en borrador';
  end if;

  insert into public.audit_log (company_id, purchase_request_id, actor_type, actor_id, action)
  values (buyer, p_request_id, 'human', (select auth.uid()), 'request_opened');
end;
$$;

-- Crea (o reenvía) una invitación. Devuelve el token en claro una sola vez.
create or replace function public.create_invitation(
  p_request_id uuid,
  p_supplier_company_id uuid,
  p_days int default 7
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  tok text := encode(extensions.gen_random_bytes(24), 'hex');
  buyer uuid;
begin
  if not private.owns_request(p_request_id) then
    raise exception 'compra no encontrada';
  end if;

  if not exists (select 1 from public.companies where id = p_supplier_company_id and kind = 'supplier') then
    raise exception 'proveedor no válido';
  end if;

  if p_days < 1 or p_days > 30 then
    raise exception 'la caducidad debe estar entre 1 y 30 días';
  end if;

  insert into public.invitations (purchase_request_id, supplier_company_id, token_hash, expires_at)
  values (
    p_request_id,
    p_supplier_company_id,
    encode(extensions.digest(tok, 'sha256'), 'hex'),
    now() + make_interval(days => p_days)
  )
  on conflict (purchase_request_id, supplier_company_id) do update
    set token_hash = excluded.token_hash,
        status = 'pending',
        expires_at = excluded.expires_at
    where public.invitations.status <> 'accepted';

  if not found then
    raise exception 'el proveedor ya aceptó la invitación';
  end if;

  select buyer_company_id into buyer from public.purchase_requests where id = p_request_id;
  insert into public.audit_log (company_id, purchase_request_id, actor_type, actor_id, action, payload)
  values (buyer, p_request_id, 'human', (select auth.uid()), 'invitation_created',
          jsonb_build_object('supplier_company_id', p_supplier_company_id));

  return tok;
end;
$$;

-- El proveedor envía o corrige su oferta mientras la compra esté abierta y su oferta no se haya retirado.
create or replace function public.submit_offer(p_request_id uuid, p_price numeric)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  offer_id uuid;
  buyer uuid;
begin
  if private.current_company_kind() is distinct from 'supplier' then
    raise exception 'solo un proveedor puede enviar ofertas';
  end if;

  if not private.supplier_can_offer(p_request_id) then
    raise exception 'no tienes una invitación aceptada para esta compra o la compra está cerrada';
  end if;

  insert into public.offers (purchase_request_id, supplier_company_id, price)
  values (p_request_id, private.current_company_id(), p_price)
  on conflict (purchase_request_id, supplier_company_id) do update
    set price = excluded.price
    where public.offers.status = 'submitted'
  returning id into offer_id;

  if offer_id is null then
    raise exception 'la oferta ya no se puede modificar';
  end if;

  select buyer_company_id into buyer from public.purchase_requests where id = p_request_id;
  insert into public.audit_log (company_id, purchase_request_id, actor_type, actor_id, action, payload)
  values (private.current_company_id(), p_request_id, 'human', (select auth.uid()), 'offer_submitted',
          jsonb_build_object('offer_id', offer_id, 'price', p_price, 'buyer_company_id', buyer));

  return offer_id;
end;
$$;

-- El proveedor retira su oferta mientras esté en estado 'submitted'.
create or replace function public.withdraw_offer(p_request_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  offer_id uuid;
begin
  update public.offers
  set status = 'withdrawn'
  where purchase_request_id = p_request_id
    and supplier_company_id = private.current_company_id()
    and status = 'submitted'
  returning id into offer_id;

  if offer_id is null then
    raise exception 'no hay una oferta retirable para esta compra';
  end if;

  insert into public.audit_log (company_id, purchase_request_id, actor_type, actor_id, action, payload)
  values (private.current_company_id(), p_request_id, 'human', (select auth.uid()), 'offer_withdrawn',
          jsonb_build_object('offer_id', offer_id));
end;
$$;

-- Adjudicación: el comprador aprueba una oferta. Es la única vía a 'awarded'.
-- Solo se permite si la oferta está dentro del límite: lo fuera de límite no se adjudica.
create or replace function public.approve_award(p_request_id uuid, p_offer_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  ok boolean;
  supplier uuid;
begin
  if not private.owns_request(p_request_id) then
    raise exception 'compra no encontrada';
  end if;

  select within_limit, supplier_company_id into ok, supplier
  from public.offers
  where id = p_offer_id and purchase_request_id = p_request_id and status = 'submitted';

  if supplier is null then
    raise exception 'oferta no válida para esta compra';
  end if;

  if not ok then
    raise exception 'una oferta fuera de límite no se puede adjudicar';
  end if;

  insert into public.decisions (purchase_request_id, offer_id, kind, actor_type, actor_id)
  values (p_request_id, p_offer_id, 'approve_award', 'human', (select auth.uid()));

  update public.purchase_requests set status = 'awarded' where id = p_request_id and status = 'open';

  insert into public.audit_log (company_id, purchase_request_id, actor_type, actor_id, action, payload)
  values (private.current_company_id(), p_request_id, 'human', (select auth.uid()), 'award_approved',
          jsonb_build_object('offer_id', p_offer_id, 'supplier_company_id', supplier));
end;
$$;

-- Permisos: solo usuarios autenticados llaman a estas funciones.
revoke execute on function public.open_purchase_request(uuid), public.create_invitation(uuid, uuid, int),
  public.submit_offer(uuid, numeric), public.withdraw_offer(uuid), public.approve_award(uuid, uuid)
  from public, anon;
grant execute on function public.open_purchase_request(uuid), public.create_invitation(uuid, uuid, int),
  public.submit_offer(uuid, numeric), public.withdraw_offer(uuid), public.approve_award(uuid, uuid)
  to authenticated;
