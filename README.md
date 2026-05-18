# DocSyncHub

**DocSyncHub** is a self-hosted web application that automatically syncs documents from Google Docs or Lark Docs into a Git repository (GitLab or GitHub) as Markdown files — **no local Git installation required, no .env files needed**.

All configuration — OAuth tokens, repository settings, notification credentials — is stored securely in the database and managed through the web UI.

## How It Works

```
Google Docs / Lark Docs
        ↓  (fetch via API — token from DB)
   Convert to Markdown
        ↓  (SHA-256 checksum compare)
   GitLab / GitHub API  (token from DB)
        ↓  (commit only if content changed)
   Your Repository
```

1. Fetch document content from the source (Google Docs / Lark Docs) using OAuth token stored in DB
2. Convert HTML to clean Markdown
3. Compare SHA-256 checksum against the last sync — **skip if unchanged**
4. Push directly to GitLab/GitHub via API — **no local Git required**
5. Send notifications to Telegram / Discord (credentials stored in DB)

## Features

- 🔄 **Smart sync** — only commits when content actually changes (checksum-based deduplication)
- 🌿 **Branch-aware** — auto-creates target branch from a base branch if it doesn't exist
- 🔗 **No local Git** — pushes files directly via GitLab/GitHub API
- 📋 **Multi-project** — manage multiple projects, each with its own repo and document mappings
- 🔒 **OAuth** — connect Google Docs and GitLab via OAuth, tokens stored securely in DB
- 🔔 **Notifications** — Telegram and Discord alerts when documents are synced
- ⏱ **Scheduler** — auto-sync on configurable intervals (5 / 15 / 30 / 60 min)
- 🐳 **Docker-ready** — single `docker compose up` to run

## Quick Start

### 1. Clone the repo

```bash
git clone https://github.com/your-org/docsynchub.git
cd docsynchub
```

### 2. Start with Docker Compose

```bash
docker compose up -d
```

Open [http://localhost:8080](http://localhost:8080) — you'll be prompted to create an admin account on first run.

### 3. Connect your services (in the UI)

Go to **Settings** and connect:

- **Google** — OAuth via Google Cloud Console
- **GitLab** — OAuth via GitLab Applications

That's it. No `.env` file needed — all credentials are stored in the database.

## Project Setup

### 1. Create a project

Go to **Projects → New project**, give it a name.

### 2. Configure Git destination

In **Project Settings → Git configuration**:

| Field | Description |
|---|---|
| **Git provider** | `gitlab` or `github` |
| **Sync branch** | Branch to commit synced docs to |
| **Base branch** | Branch to fork from when creating the sync branch |
| **GitLab Project ID** | Numeric project ID from GitLab |
| **Output folder** | Folder inside repo (e.g. `docs`) |

### 3. Add document mappings

In **Document Mapping → Add mapping**:

| Field | Description |
|---|---|
| **Source type** | `Google Docs` |
| **Source ID** | Google Doc ID (from the doc URL) |
| **Output file** | Path relative to the output folder (e.g. `my-spec.md`) |

### 4. Configure notifications (optional)

In **Project Settings → Notifications**, enter your Telegram Bot Token + Chat ID or Discord Webhook URL directly in the UI.

### 5. Sync

Click **Sync** on any document mapping, or set a schedule for automatic syncing.

## OAuth Setup

### Google Docs

1. Go to [Google Cloud Console](https://console.cloud.google.com/) → APIs & Services → Credentials
2. Create an OAuth 2.0 Client ID (Web application)
3. Add redirect URI: `http://your-docsynchub-url/api/integrations/google/callback`
4. In DocSyncHub → **Settings → Google**: enter Client ID & Secret, click **Connect**

### GitLab

1. Go to GitLab → Profile → Applications
2. Scopes: `api read_user read_repository write_repository`
3. Redirect URI: `http://your-docsynchub-url/api/integrations/gitlab/callback`
4. In DocSyncHub → **Settings → GitLab**: enter App ID & Secret, click **Connect**

## Docker Compose

```yaml
services:
  postgres:
    image: postgres:17-alpine
    environment:
      POSTGRES_DB: docsynchub
      POSTGRES_USER: docsynchub
      POSTGRES_PASSWORD: docsynchub
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U docsynchub -d docsynchub"]
      interval: 5s
      timeout: 5s
      retries: 10
    volumes:
      - postgres_data:/var/lib/postgresql/data

  docsynchub:
    image: ghcr.io/your-org/docsynchub:latest
    ports:
      - "8080:8080"
    environment:
      DATABASE_URL: postgresql://docsynchub:docsynchub@postgres:5432/docsynchub
    depends_on:
      postgres:
        condition: service_healthy

volumes:
  postgres_data:
```

The only required environment variable is `DATABASE_URL`.

## Development

```bash
npm install
npm run build     # TypeScript + Vite
npm run dev       # Run server locally
```

Requires a local PostgreSQL instance:

```bash
DATABASE_URL=postgresql://docsynchub:docsynchub@localhost:5432/docsynchub node dist/index.js serve
```

## Tech Stack

- **Backend**: Node.js 22, TypeScript, PostgreSQL
- **Frontend**: React 19, shadcn/ui, Tailwind CSS, Vite
- **APIs**: Google Drive API, GitLab API, GitHub API, Lark Open API

## License

MIT
