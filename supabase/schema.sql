-- ============================================================
-- FlowForge AI — Supabase PostgreSQL schema
-- SHARED-PROJECT SAFE: all 5 portfolio apps share ONE Supabase project.
-- Run this in the Supabase SQL editor (or via the CLI). Safe in ANY order.
-- ============================================================

-- Required for gen_random_uuid()
create extension if not exists "pgcrypto";

-- ---------------- profiles (SHARED across all 5 apps — DO NOT diverge) ----------------
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  full_name text default '',
  headline text default '',
  display_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Migrate a shared DB created by an older per-app schema:
alter table public.profiles add column if not exists email text;
alter table public.profiles add column if not exists full_name text default '';
alter table public.profiles add column if not exists headline text default '';
alter table public.profiles add column if not exists display_name text;
alter table public.profiles add column if not exists created_at timestamptz not null default now();
alter table public.profiles add column if not exists updated_at timestamptz not null default now();

-- ---------------- workflows ----------------
create table if not exists public.workflows (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  description text not null default '',
  definition jsonb not null default '{"nodes":[],"connections":[]}',
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists workflows_user_id_idx on public.workflows(user_id);

-- ---------------- workflow_nodes (mirror of definition.nodes) ----------------
create table if not exists public.workflow_nodes (
  id uuid primary key default gen_random_uuid(),
  workflow_id uuid not null references public.workflows(id) on delete cascade,
  node_id text not null,
  type text not null,
  config jsonb not null default '{}',
  input_mapping jsonb not null default '{}',
  output_mapping jsonb not null default '{}',
  position jsonb not null default '{"x":0,"y":0}',
  error_handling jsonb not null default '{"onError":"stop","retryCount":0,"retryDelayMs":0}',
  created_at timestamptz not null default now(),
  unique (workflow_id, node_id)
);
create index if not exists workflow_nodes_workflow_idx on public.workflow_nodes(workflow_id);

-- ---------------- workflow_connections (mirror of definition.connections) ----------------
create table if not exists public.workflow_connections (
  id uuid primary key default gen_random_uuid(),
  workflow_id uuid not null references public.workflows(id) on delete cascade,
  from_node text not null,
  to_node text not null,
  source_handle text,
  label text,
  created_at timestamptz not null default now()
);
create index if not exists workflow_connections_workflow_idx on public.workflow_connections(workflow_id);

-- ---------------- workflow_executions ----------------
create table if not exists public.workflow_executions (
  id uuid primary key default gen_random_uuid(),
  workflow_id uuid not null references public.workflows(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  status text not null default 'running' check (status in ('running','success','failed')),
  trigger_type text not null default 'manual',
  input jsonb not null default '{}',
  output jsonb,
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  duration_ms integer,
  error text
);
create index if not exists workflow_executions_user_idx on public.workflow_executions(user_id, started_at desc);
create index if not exists workflow_executions_workflow_idx on public.workflow_executions(workflow_id, started_at desc);

-- ---------------- workflow_execution_nodes ----------------
create table if not exists public.workflow_execution_nodes (
  id uuid primary key default gen_random_uuid(),
  execution_id uuid not null references public.workflow_executions(id) on delete cascade,
  node_id text not null,
  node_type text not null,
  status text not null default 'success' check (status in ('success','failed','skipped')),
  output jsonb,
  error text,
  attempts integer not null default 1,
  duration_ms integer not null default 0,
  started_at timestamptz not null default now(),
  ended_at timestamptz not null default now()
);
create index if not exists workflow_execution_nodes_exec_idx on public.workflow_execution_nodes(execution_id);

-- ---------------- webhook_endpoints ----------------
create table if not exists public.webhook_endpoints (
  id uuid primary key default gen_random_uuid(),
  workflow_id uuid not null unique references public.workflows(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  secret text,
  enabled boolean not null default true,
  created_at timestamptz not null default now()
);

-- ---------------- workflow_schedules ----------------
create table if not exists public.workflow_schedules (
  id uuid primary key default gen_random_uuid(),
  workflow_id uuid not null references public.workflows(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  cron text not null default '60',
  every_minutes integer not null default 60,
  enabled boolean not null default true,
  last_run_at timestamptz,
  next_run_at timestamptz,
  created_at timestamptz not null default now(),
  unique (workflow_id)
);

-- ---------------- workflow_records (Save to Database node) ----------------
create table if not exists public.workflow_records (
  id uuid primary key default gen_random_uuid(),
  workflow_id uuid not null references public.workflows(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  node_id text not null,
  execution_id uuid references public.workflow_executions(id) on delete set null,
  data jsonb not null default '{}',
  created_at timestamptz not null default now()
);
create index if not exists workflow_records_workflow_idx on public.workflow_records(workflow_id, created_at desc);

-- ============================================================
-- Row Level Security — users only ever touch their own rows.
-- ============================================================
alter table public.profiles enable row level security;
alter table public.workflows enable row level security;
alter table public.workflow_nodes enable row level security;
alter table public.workflow_connections enable row level security;
alter table public.workflow_executions enable row level security;
alter table public.workflow_execution_nodes enable row level security;
alter table public.webhook_endpoints enable row level security;
alter table public.workflow_schedules enable row level security;
alter table public.workflow_records enable row level security;

-- profiles: owners only
drop policy if exists "profiles_owner" on public.profiles;
create policy "profiles_owner" on public.profiles
  for all using (auth.uid() = id) with check (auth.uid() = id);

-- workflows: owners only
drop policy if exists "workflows_owner" on public.workflows;
create policy "workflows_owner" on public.workflows
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- workflow_nodes / connections: via parent workflow ownership
drop policy if exists "workflow_nodes_owner" on public.workflow_nodes;
create policy "workflow_nodes_owner" on public.workflow_nodes
  for all using (
    exists (select 1 from public.workflows w where w.id = workflow_id and w.user_id = auth.uid())
  ) with check (
    exists (select 1 from public.workflows w where w.id = workflow_id and w.user_id = auth.uid())
  );

drop policy if exists "workflow_connections_owner" on public.workflow_connections;
create policy "workflow_connections_owner" on public.workflow_connections
  for all using (
    exists (select 1 from public.workflows w where w.id = workflow_id and w.user_id = auth.uid())
  ) with check (
    exists (select 1 from public.workflows w where w.id = workflow_id and w.user_id = auth.uid())
  );

-- executions: owners only
drop policy if exists "executions_owner" on public.workflow_executions;
create policy "executions_owner" on public.workflow_executions
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- execution nodes: via parent execution ownership
drop policy if exists "execution_nodes_owner" on public.workflow_execution_nodes;
create policy "execution_nodes_owner" on public.workflow_execution_nodes
  for all using (
    exists (select 1 from public.workflow_executions e where e.id = execution_id and e.user_id = auth.uid())
  ) with check (
    exists (select 1 from public.workflow_executions e where e.id = execution_id and e.user_id = auth.uid())
  );

-- webhook endpoints: owners only
drop policy if exists "webhook_endpoints_owner" on public.webhook_endpoints;
create policy "webhook_endpoints_owner" on public.webhook_endpoints
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- schedules: owners only
drop policy if exists "schedules_owner" on public.workflow_schedules;
create policy "schedules_owner" on public.workflow_schedules
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- records: owners only
drop policy if exists "records_owner" on public.workflow_records;
create policy "records_owner" on public.workflow_records
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Auto-create a profile row for every new auth user.
-- (SHARED — identical in all 5 schemas so any run order converges.)
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email, display_name, full_name)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'display_name', split_part(new.email, '@', 1)),
    coalesce(new.raw_user_meta_data->>'full_name', '')
  )
  on conflict (id) do update set email = excluded.email;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
