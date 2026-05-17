create table if not exists app_settings (
  id boolean primary key default true check (id),
  session_secret text not null,
  created_at timestamptz not null default now()
);

create table if not exists users (
  id text primary key,
  username text not null unique,
  password_hash text not null,
  salt text not null,
  role text not null check (role in ('admin')),
  created_at timestamptz not null
);

create table if not exists projects (
  id text primary key,
  name text not null,
  description text,
  workspace text not null,
  config_path text not null,
  folder text not null,
  schedule_minutes integer not null check (schedule_minutes > 0),
  commit_mode text not null check (commit_mode in ('auto_commit', 'alert_only')),
  destination jsonb not null,
  notifications jsonb not null,
  created_at timestamptz not null,
  updated_at timestamptz not null,
  last_checked_at timestamptz,
  last_run_at timestamptz,
  last_run_status text check (last_run_status in ('success', 'failed')),
  last_run_message text
);

create table if not exists document_mappings (
  id text primary key,
  project_id text not null references projects(id) on delete cascade,
  name text not null,
  source_type text not null check (source_type in ('google_doc', 'lark_doc')),
  source_id text not null,
  output_file text not null
);

create index if not exists document_mappings_project_id_idx on document_mappings(project_id);

create table if not exists sync_runs (
  id bigserial primary key,
  project_id text not null references projects(id) on delete cascade,
  status text not null check (status in ('success', 'failed')),
  message text,
  created_at timestamptz not null default now()
);

create index if not exists sync_runs_project_id_created_at_idx on sync_runs(project_id, created_at desc);
