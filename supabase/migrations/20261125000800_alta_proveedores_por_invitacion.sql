-- Alta de proveedores por invitación.
-- 1) Cada invitación guarda el correo invitado.
-- 2) invite_supplier: el comprador invita a una empresa existente o crea una nueva por nombre.
-- 3) accept_invitation: si el usuario no tiene perfil, debe entrar con el correo invitado;
--    al aceptar se crea su perfil en la empresa proveedora.
-- 4) hook_before_user_created: solo permite registrarse a correos con invitación pendiente.

alter table public.invitations add column if not exists invited_email text;

create or replace function public.invite_supplier(
  p_request_id uuid,
  p_email text,
  p_supplier_company_id uuid default null,
  p_supplier_name text default null,
  p_days int default 7
)
returns text
language plpgsql
security definer
set search_path to ''
as $$
declare
  tok text := encode(extensions.gen_random_bytes(24), 'hex');
  supplier_id uuid := p_supplier_company_id;
  buyer uuid;
  email text := lower(trim(p_email));
begin
  if not private.owns_request(p_request_id) then
    raise exception 'compra no encontrada';
  end if;

  if email = '' or position('@' in email) = 0 then
    raise exception 'correo no válido';
  end if;

  if p_days < 1 or p_days > 30 then
    raise exception 'la caducidad debe estar entre 1 y 30 días';
  end if;

  if supplier_id is null then
    if coalesce(trim(p_supplier_name), '') = '' then
      raise exception 'indica la empresa proveedora';
    end if;
    insert into public.companies (name, kind)
    values (trim(p_supplier_name), 'supplier')
    returning id into supplier_id;
  elsif not exists (select 1 from public.companies where id = supplier_id and kind = 'supplier') then
    raise exception 'proveedor no válido';
  end if;

  insert into public.invitations (purchase_request_id, supplier_company_id, token_hash, expires_at, invited_email)
  values (
    p_request_id,
    supplier_id,
    encode(extensions.digest(tok, 'sha256'), 'hex'),
    now() + make_interval(days => p_days),
    email
  )
  on conflict (purchase_request_id, supplier_company_id) do update
    set token_hash = excluded.token_hash,
        status = 'pending',
        expires_at = excluded.expires_at,
        invited_email = excluded.invited_email
    where public.invitations.status <> 'accepted';

  if not found then
    raise exception 'el proveedor ya aceptó la invitación';
  end if;

  select buyer_company_id into buyer from public.purchase_requests where id = p_request_id;
  insert into public.audit_log (company_id, purchase_request_id, actor_type, actor_id, action, payload)
  values (buyer, p_request_id, 'human', (select auth.uid()), 'invitation_created',
          jsonb_build_object('supplier_company_id', supplier_id));

  return tok;
end;
$$;

revoke all on function public.invite_supplier(uuid, text, uuid, text, int) from public, anon;
grant execute on function public.invite_supplier(uuid, text, uuid, text, int) to authenticated;

create or replace function public.accept_invitation(p_token text)
returns uuid
language plpgsql
security definer
set search_path to ''
as $$
declare
  inv public.invitations;
  uid uuid := (select auth.uid());
  my_email text := lower(coalesce((select auth.jwt()) ->> 'email', ''));
  current_company uuid;
begin
  if uid is null then
    raise exception 'inicia sesión para aceptar la invitación';
  end if;

  select * into inv
  from public.invitations
  where token_hash = encode(extensions.digest(p_token, 'sha256'), 'hex')
  for update;

  if not found then
    raise exception 'invitación no válida';
  end if;

  if inv.status <> 'pending' or inv.expires_at < now() then
    raise exception 'invitación caducada o ya utilizada';
  end if;

  select company_id into current_company from public.profiles where id = uid;

  if current_company is null then
    -- Usuario nuevo: solo si entra con el correo invitado.
    if inv.invited_email is null or inv.invited_email <> my_email then
      raise exception 'invitación no válida';
    end if;
    insert into public.profiles (id, company_id, role)
    values (uid, inv.supplier_company_id, 'member');
  elsif current_company <> inv.supplier_company_id then
    raise exception 'invitación no válida';
  end if;

  update public.invitations
  set status = 'accepted', accepted_at = now()
  where id = inv.id;

  return inv.purchase_request_id;
end;
$$;

-- Hook "Before user created" de Supabase Auth: solo registra correos con invitación pendiente.
create or replace function public.hook_before_user_created(event jsonb)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $$
declare
  user_email text := lower(coalesce(event -> 'user' ->> 'email', ''));
begin
  if exists (
    select 1 from public.invitations
    where invited_email = user_email and status = 'pending' and expires_at > now()
  ) then
    return '{}'::jsonb;
  end if;

  return jsonb_build_object(
    'error',
    jsonb_build_object('http_code', 403, 'message', 'Solo puedes registrarte con una invitación de Mesa Nego')
  );
end;
$$;

grant usage on schema public to supabase_auth_admin;
grant execute on function public.hook_before_user_created(jsonb) to supabase_auth_admin;
revoke execute on function public.hook_before_user_created(jsonb) from authenticated, anon, public;
