create table if not exists google_connections (
  id boolean primary key default true check (id),
  access_token text not null,
  refresh_token text,
  scope text,
  token_type text,
  expires_at timestamptz,
  connected_email text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
