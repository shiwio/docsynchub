create table if not exists google_oauth_settings (
  id boolean primary key default true check (id),
  client_id text not null,
  client_secret text not null,
  app_url text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
