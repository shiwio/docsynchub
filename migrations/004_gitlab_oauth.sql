-- GitLab OAuth settings (application credentials)
create table if not exists gitlab_oauth_settings (
  id boolean primary key default true check (id),
  app_id text not null,
  app_secret text not null,
  app_url text not null,
  gitlab_url text not null default 'https://gitlab.com',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- GitLab OAuth connection (user tokens)
create table if not exists gitlab_connections (
  id boolean primary key default true check (id),
  access_token text not null,
  refresh_token text,
  token_type text,
  scope text,
  expires_at timestamptz,
  connected_username text,
  connected_email text,
  gitlab_user_id bigint,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
