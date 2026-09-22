-- Ejecutar en Supabase > SQL Editor.
-- Esta migracion es idempotente y crea la auditoria que usa FastAPI.

create table if not exists public.recognition_events (
    id uuid primary key default gen_random_uuid(),
    user_id uuid references public.usuarios(id) on delete set null,
    event_type varchar(40) not null default 'face_login',
    similarity numeric(6,5),
    recognized boolean not null default false,
    success boolean not null default false,
    source varchar(60) not null default 'dashboard',
    message text,
    error_code varchar(80),
    metadata jsonb,
    created_at timestamptz not null default now()
);

alter table public.recognition_events
    add column if not exists event_type varchar(40) not null default 'face_login',
    add column if not exists similarity numeric(6,5),
    add column if not exists recognized boolean not null default false,
    add column if not exists success boolean not null default false,
    add column if not exists source varchar(60) not null default 'dashboard',
    add column if not exists message text,
    add column if not exists error_code varchar(80),
    add column if not exists metadata jsonb,
    add column if not exists created_at timestamptz not null default now();

create index if not exists recognition_events_created_at_idx
    on public.recognition_events (created_at desc);

create index if not exists recognition_events_user_id_idx
    on public.recognition_events (user_id);

-- El backend consulta Supabase mediante FastAPI y la tabla mantiene RLS activo.
alter table public.recognition_events enable row level security;

-- El backend actual usa SUPABASE_KEY para insertar y consultar mediante FastAPI.
-- Estas políticas evitan que RLS descarte silenciosamente los eventos.
drop policy if exists recognition_events_backend_insert on public.recognition_events;
create policy recognition_events_backend_insert
    on public.recognition_events
    for insert
    to anon, authenticated
    with check (true);

drop policy if exists recognition_events_backend_select on public.recognition_events;
create policy recognition_events_backend_select
    on public.recognition_events
    for select
    to anon, authenticated
    using (true);

notify pgrst, 'reload schema';

alter table public.usuarios
    add column if not exists imagenes_urls jsonb not null default '[]'::jsonb,
    add column if not exists face_embeddings jsonb not null default '[]'::jsonb,
    add column if not exists face_registration_metadata jsonb not null default '{}'::jsonb;

create unique index if not exists usuarios_email_normalized_unique_idx
    on public.usuarios (lower(trim(email)))
    where email is not null and trim(email) <> '';

create unique index if not exists usuarios_dni_unique_idx
    on public.usuarios (trim(dni))
    where dni is not null and trim(dni) <> '';

notify pgrst, 'reload schema';
