-- Fase 2: modelo de datos base de Mesa Nego.
-- Las reglas de negocio críticas se imponen en la base de datos:
--   * el agente nunca adjudica (kind 'award' no existe; 'propose_award' requiere agente),
--   * una adjudicación final requiere aprobación humana ('approve_award'),
--   * audit_log es de solo escritura (triggers que impiden UPDATE, DELETE y TRUNCATE).

create extension if not exists pgcrypto with schema extensions;

-- ---------------------------------------------------------------------------
-- Empresas y perfiles
-- ---------------------------------------------------------------------------

create table public.companies (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  kind text not null check (kind in ('buyer', 'supplier')),
  created_at timestamptz not null default now()
);

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  company_id uuid not null references public.companies (id) on delete restrict,
  role text not null default 'member' check (role in ('member', 'admin')),
  full_name text,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Compras y proveedores
-- ---------------------------------------------------------------------------

create table public.purchase_requests (
  id uuid primary key default gen_random_uuid(),
  buyer_company_id uuid not null references public.companies (id) on delete restrict,
  created_by uuid not null references public.profiles (id) on delete restrict,
  product_name text not null,
  unit text not null,
  volume numeric not null check (volume > 0),
  baseline_price numeric not null check (baseline_price > 0),
  price_limit numeric not null check (price_limit > 0),
  floor_price numeric check (floor_price >= 0),
  counter_pct numeric not null check (counter_pct >= 0 and counter_pct < 1),
  status text not null default 'draft' check (status in ('draft', 'open', 'awarded', 'cancelled')),
  created_at timestamptz not null default now(),
  check (floor_price is null or floor_price <= price_limit)
);

-- El token en claro nunca se guarda: solo su hash SHA-256.
create table public.invitations (
  id uuid primary key default gen_random_uuid(),
  purchase_request_id uuid not null references public.purchase_requests (id) on delete cascade,
  supplier_company_id uuid not null references public.companies (id) on delete restrict,
  token_hash text not null unique,
  status text not null default 'pending' check (status in ('pending', 'accepted', 'expired', 'revoked')),
  expires_at timestamptz not null,
  accepted_at timestamptz,
  created_at timestamptz not null default now(),
  unique (purchase_request_id, supplier_company_id)
);

create table public.offers (
  id uuid primary key default gen_random_uuid(),
  purchase_request_id uuid not null references public.purchase_requests (id) on delete cascade,
  supplier_company_id uuid not null references public.companies (id) on delete restrict,
  price numeric not null check (price > 0),
  within_limit boolean not null default false,
  status text not null default 'submitted' check (status in ('submitted', 'countered', 'withdrawn')),
  created_at timestamptz not null default now(),
  unique (purchase_request_id, supplier_company_id)
);

-- within_limit se calcula en la base de datos, nunca lo envía el cliente.
create function public.set_offer_within_limit()
returns trigger
language plpgsql
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

create trigger offers_within_limit
  before insert or update of price, purchase_request_id on public.offers
  for each row execute function public.set_offer_within_limit();

-- ---------------------------------------------------------------------------
-- Decisiones (agente y personas)
-- ---------------------------------------------------------------------------

create table public.decisions (
  id uuid primary key default gen_random_uuid(),
  purchase_request_id uuid not null references public.purchase_requests (id) on delete cascade,
  offer_id uuid references public.offers (id) on delete set null,
  kind text not null check (kind in ('counter', 'escalate', 'propose_award', 'approve_award', 'reject')),
  actor_type text not null check (actor_type in ('agent', 'human')),
  actor_id uuid references public.profiles (id) on delete restrict,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  -- El agente solo contraofrece, escala o propone; la aprobación y el rechazo son humanos.
  check (
    (kind in ('counter', 'escalate', 'propose_award') and actor_type = 'agent' and actor_id is null)
    or
    (kind in ('approve_award', 'reject') and actor_type = 'human' and actor_id is not null)
  )
);

-- ---------------------------------------------------------------------------
-- Auditoría de solo escritura
-- ---------------------------------------------------------------------------

create table public.audit_log (
  id bigint generated always as identity primary key,
  occurred_at timestamptz not null default now(),
  company_id uuid references public.companies (id) on delete restrict,
  purchase_request_id uuid,
  actor_type text not null check (actor_type in ('agent', 'human', 'system')),
  actor_id uuid references public.profiles (id) on delete set null,
  action text not null,
  payload jsonb not null default '{}'::jsonb
);

create function public.forbid_audit_mutation()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'audit_log es de solo escritura';
end;
$$;

create trigger audit_log_no_update_delete
  before update or delete on public.audit_log
  for each row execute function public.forbid_audit_mutation();

create trigger audit_log_no_truncate
  before truncate on public.audit_log
  for each statement execute function public.forbid_audit_mutation();

-- Defensa adicional: ni siquiera el rol de la API puede modificarlo.
revoke update, delete, truncate on public.audit_log from anon, authenticated;
