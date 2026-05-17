import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import type { Pool } from "pg";

const scrypt = promisify(scryptCallback);

export interface ProjectRecord {
  id: string;
  name: string;
  description?: string;
  folder: string;
  scheduleMinutes: number;
  commitMode: "auto_commit" | "alert_only";
  destination: {
    provider: "github" | "gitlab";
    branch: string;
    baseBranch: string;
    github?: { owner: string; repo: string };
    gitlab?: { projectId: string; baseUrl?: string };
  };
  mappings: ProjectMapping[];
  notifications: ProjectNotifications;
  createdAt: string;
  updatedAt: string;
  lastCheckedAt?: string;
  lastRunAt?: string;
  lastRunStatus?: "success" | "failed";
  lastRunMessage?: string;
}

export interface ProjectMapping {
  id: string;
  name: string;
  sourceType: "google_doc" | "lark_doc";
  sourceId: string;
  outputFile: string;
  lastChecksum?: string;
}

export interface ProjectNotifications {
  telegram: { enabled: boolean; botToken: string; chatId: string; groupName?: string };
  discord: { enabled: boolean; webhookUrl: string; groupName?: string };
  whatsapp: { enabled: boolean; accessToken: string; phoneNumberId: string; groupName?: string };
  zalo: { enabled: boolean; accessToken: string; groupId: string; groupName?: string };
}

export interface AdminRecord {
  passwordHash: string;
  salt: string;
  createdAt: string;
}
export interface GoogleConnection {
  accessToken: string;
  refreshToken?: string;
  scope?: string;
  tokenType?: string;
  expiresAt?: string;
  connectedEmail?: string;
}
export interface GoogleOauthSettings {
  clientId: string;
  clientSecret: string;
  appUrl: string;
}

export interface GitLabConnection {
  accessToken: string;
  refreshToken?: string;
  tokenType?: string;
  scope?: string;
  expiresAt?: string;
  connectedUsername?: string;
  connectedEmail?: string;
  gitlabUserId?: number;
}

export interface GitLabOauthSettings {
  appId: string;
  appSecret: string;
  appUrl: string;
  gitlabUrl: string;
}

export class StateStore {
  constructor(private readonly pool: Pool) {}

  async getSessionSecret(): Promise<string> {
    const result = await this.pool.query<{ session_secret: string }>("select session_secret from app_settings where id = true");
    if (result.rows[0]) return result.rows[0].session_secret;
    const sessionSecret = randomToken();
    await this.pool.query("insert into app_settings (id, session_secret) values (true, $1)", [sessionSecret]);
    return sessionSecret;
  }

  async getAdmin(): Promise<AdminRecord | undefined> {
    const result = await this.pool.query<{ password_hash: string; salt: string; created_at: Date }>(
      "select password_hash, salt, created_at from users where role = 'admin' order by created_at asc limit 1"
    );
    const row = result.rows[0];
    return row ? { passwordHash: row.password_hash, salt: row.salt, createdAt: row.created_at.toISOString() } : undefined;
  }

  async createAdmin(admin: AdminRecord): Promise<void> {
    await this.pool.query(
      `insert into users (id, username, password_hash, salt, role, created_at)
       values ('admin', 'admin', $1, $2, 'admin', $3)`,
      [admin.passwordHash, admin.salt, admin.createdAt]
    );
  }

  async listProjects(): Promise<ProjectRecord[]> {
    const rows = await this.pool.query<ProjectRow>("select * from projects order by created_at desc");
    const mappings = await this.pool.query<ProjectMappingRow>("select * from document_mappings order by name asc");
    return rows.rows.map((row) => projectFromRow(row, mappings.rows.filter((m) => m.project_id === row.id)));
  }

  async getProject(id: string): Promise<ProjectRecord | undefined> {
    const row = await this.pool.query<ProjectRow>("select * from projects where id = $1", [id]);
    if (!row.rows[0]) return undefined;
    const mappings = await this.pool.query<ProjectMappingRow>("select * from document_mappings where project_id = $1 order by name asc", [id]);
    return projectFromRow(row.rows[0], mappings.rows);
  }

  async createProject(project: ProjectRecord): Promise<void> {
    await this.upsertProject(project);
  }

  async updateProject(project: ProjectRecord): Promise<void> {
    await this.upsertProject(project);
  }

  async deleteProject(id: string): Promise<void> {
    await this.pool.query("delete from projects where id = $1", [id]);
  }

  async addMapping(projectId: string, mapping: ProjectMapping): Promise<void> {
    await this.pool.query(
      `insert into document_mappings (id, project_id, name, source_type, source_id, output_file, last_checksum)
       values ($1,$2,$3,$4,$5,$6,$7)`,
      [mapping.id, projectId, mapping.name, mapping.sourceType, mapping.sourceId, mapping.outputFile, mapping.lastChecksum ?? null]
    );
  }

  async updateMapping(projectId: string, mapping: ProjectMapping): Promise<void> {
    await this.pool.query(
      `update document_mappings set name=$3, source_type=$4, source_id=$5, output_file=$6, last_checksum=$7
       where id=$1 and project_id=$2`,
      [mapping.id, projectId, mapping.name, mapping.sourceType, mapping.sourceId, mapping.outputFile, mapping.lastChecksum ?? null]
    );
  }

  async deleteMapping(projectId: string, mappingId: string): Promise<void> {
    await this.pool.query("delete from document_mappings where id=$1 and project_id=$2", [mappingId, projectId]);
  }

  async recordSyncRun(project: ProjectRecord): Promise<void> {
    await this.updateProject(project);
    if (project.lastRunStatus) {
      await this.pool.query(
        "insert into sync_runs (project_id, status, message, created_at) values ($1,$2,$3,$4)",
        [project.id, project.lastRunStatus, project.lastRunMessage ?? null, project.lastRunAt ?? new Date().toISOString()]
      );
    }
  }

  async getGoogleConnection(): Promise<GoogleConnection | undefined> {
    const result = await this.pool.query<any>("select * from google_connections where id = true");
    const row = result.rows[0];
    return row ? { accessToken: row.access_token, refreshToken: row.refresh_token ?? undefined, scope: row.scope ?? undefined, tokenType: row.token_type ?? undefined, expiresAt: row.expires_at?.toISOString(), connectedEmail: row.connected_email ?? undefined } : undefined;
  }

  async saveGoogleConnection(connection: GoogleConnection): Promise<void> {
    await this.pool.query(
      `insert into google_connections (id, access_token, refresh_token, scope, token_type, expires_at, connected_email)
       values (true,$1,$2,$3,$4,$5,$6)
       on conflict (id) do update set access_token=excluded.access_token, refresh_token=coalesce(excluded.refresh_token,google_connections.refresh_token), scope=excluded.scope, token_type=excluded.token_type, expires_at=excluded.expires_at, connected_email=excluded.connected_email, updated_at=now()`,
      [connection.accessToken, connection.refreshToken ?? null, connection.scope ?? null, connection.tokenType ?? null, connection.expiresAt ?? null, connection.connectedEmail ?? null]
    );
  }

  async deleteGoogleConnection(): Promise<void> {
    await this.pool.query("delete from google_connections where id = true");
  }

  async getGoogleOauthSettings(): Promise<GoogleOauthSettings | undefined> {
    const result = await this.pool.query<any>("select client_id, client_secret, app_url from google_oauth_settings where id = true");
    const row = result.rows[0];
    return row ? { clientId: row.client_id, clientSecret: row.client_secret, appUrl: row.app_url } : undefined;
  }

  async saveGoogleOauthSettings(settings: GoogleOauthSettings): Promise<void> {
    await this.pool.query(
      `insert into google_oauth_settings (id, client_id, client_secret, app_url)
       values (true,$1,$2,$3)
       on conflict (id) do update set client_id=excluded.client_id, client_secret=excluded.client_secret, app_url=excluded.app_url, updated_at=now()`,
      [settings.clientId, settings.clientSecret, settings.appUrl]
    );
  }

  async getGitLabConnection(): Promise<GitLabConnection | undefined> {
    const result = await this.pool.query<any>("select * from gitlab_connections where id = true");
    const row = result.rows[0];
    return row ? {
      accessToken: row.access_token,
      refreshToken: row.refresh_token ?? undefined,
      tokenType: row.token_type ?? undefined,
      scope: row.scope ?? undefined,
      expiresAt: row.expires_at?.toISOString(),
      connectedUsername: row.connected_username ?? undefined,
      connectedEmail: row.connected_email ?? undefined,
      gitlabUserId: row.gitlab_user_id ?? undefined,
    } : undefined;
  }

  async saveGitLabConnection(connection: GitLabConnection): Promise<void> {
    await this.pool.query(
      `insert into gitlab_connections (id, access_token, refresh_token, token_type, scope, expires_at, connected_username, connected_email, gitlab_user_id)
       values (true,$1,$2,$3,$4,$5,$6,$7,$8)
       on conflict (id) do update set
         access_token=excluded.access_token,
         refresh_token=coalesce(excluded.refresh_token, gitlab_connections.refresh_token),
         token_type=excluded.token_type, scope=excluded.scope, expires_at=excluded.expires_at,
         connected_username=excluded.connected_username, connected_email=excluded.connected_email,
         gitlab_user_id=excluded.gitlab_user_id, updated_at=now()`,
      [
        connection.accessToken, connection.refreshToken ?? null, connection.tokenType ?? null,
        connection.scope ?? null, connection.expiresAt ?? null, connection.connectedUsername ?? null,
        connection.connectedEmail ?? null, connection.gitlabUserId ?? null,
      ]
    );
  }

  async deleteGitLabConnection(): Promise<void> {
    await this.pool.query("delete from gitlab_connections where id = true");
  }

  async getGitLabOauthSettings(): Promise<GitLabOauthSettings | undefined> {
    const result = await this.pool.query<any>("select app_id, app_secret, app_url, gitlab_url from gitlab_oauth_settings where id = true");
    const row = result.rows[0];
    return row ? { appId: row.app_id, appSecret: row.app_secret, appUrl: row.app_url, gitlabUrl: row.gitlab_url } : undefined;
  }

  async saveGitLabOauthSettings(settings: GitLabOauthSettings): Promise<void> {
    await this.pool.query(
      `insert into gitlab_oauth_settings (id, app_id, app_secret, app_url, gitlab_url)
       values (true,$1,$2,$3,$4)
       on conflict (id) do update set app_id=excluded.app_id, app_secret=excluded.app_secret, app_url=excluded.app_url, gitlab_url=excluded.gitlab_url, updated_at=now()`,
      [settings.appId, settings.appSecret, settings.appUrl, settings.gitlabUrl]
    );
  }

  private async upsertProject(project: ProjectRecord): Promise<void> {
    await this.pool.query(
      `insert into projects (
         id,name,description,folder,schedule_minutes,commit_mode,
         destination,notifications,created_at,updated_at,last_checked_at,last_run_at,last_run_status,last_run_message
       ) values ($1,$2,$3,$4,$5,$6,$7::jsonb,$8::jsonb,$9,$10,$11,$12,$13,$14)
       on conflict (id) do update set
         name=excluded.name, description=excluded.description,
         folder=excluded.folder, schedule_minutes=excluded.schedule_minutes,
         commit_mode=excluded.commit_mode, destination=excluded.destination, notifications=excluded.notifications,
         updated_at=excluded.updated_at, last_checked_at=excluded.last_checked_at, last_run_at=excluded.last_run_at,
         last_run_status=excluded.last_run_status, last_run_message=excluded.last_run_message`,
      [
        project.id, project.name, project.description ?? null,
        project.folder, project.scheduleMinutes, project.commitMode, JSON.stringify(project.destination),
        JSON.stringify(project.notifications), project.createdAt, project.updatedAt, project.lastCheckedAt ?? null,
        project.lastRunAt ?? null, project.lastRunStatus ?? null, project.lastRunMessage ?? null
      ]
    );
  }
}

export async function hashPassword(password: string, salt = randomBytes(16).toString("hex")): Promise<{ passwordHash: string; salt: string }> {
  const derived = (await scrypt(password, salt, 64)) as Buffer;
  return { passwordHash: derived.toString("hex"), salt };
}

export async function verifyPassword(password: string, salt: string, expectedHash: string): Promise<boolean> {
  const actual = Buffer.from((await hashPassword(password, salt)).passwordHash, "hex");
  const expected = Buffer.from(expectedHash, "hex");
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

export function createProjectId(): string { return randomBytes(10).toString("hex"); }
export function createMappingId(): string { return randomBytes(8).toString("hex"); }
export function defaultNotifications(): ProjectNotifications {
  return {
    telegram: { enabled:false, botToken:"", chatId:"" },
    discord: { enabled:false, webhookUrl:"" },
    whatsapp: { enabled:false, accessToken:"", phoneNumberId:"" },
    zalo: { enabled:false, accessToken:"", groupId:"" }
  };
}

interface ProjectRow {
  id:string; name:string; description:string|null; folder:string;
  schedule_minutes:number; commit_mode:"auto_commit"|"alert_only"; destination:ProjectRecord["destination"];
  notifications:ProjectNotifications; created_at:Date; updated_at:Date; last_checked_at:Date|null;
  last_run_at:Date|null; last_run_status:"success"|"failed"|null; last_run_message:string|null;
}
interface ProjectMappingRow { id:string; project_id:string; name:string; source_type:"google_doc"|"lark_doc"; source_id:string; output_file:string; last_checksum:string|null; }
function projectFromRow(row: ProjectRow, mappings: ProjectMappingRow[]): ProjectRecord {
  return {
    id:row.id, name:row.name, description:row.description ?? undefined,
    folder:row.folder, scheduleMinutes:row.schedule_minutes, commitMode:row.commit_mode,
    destination:row.destination, notifications:row.notifications, createdAt:row.created_at.toISOString(), updatedAt:row.updated_at.toISOString(),
    lastCheckedAt:row.last_checked_at?.toISOString(), lastRunAt:row.last_run_at?.toISOString(),
    lastRunStatus:row.last_run_status ?? undefined, lastRunMessage:row.last_run_message ?? undefined,
    mappings:mappings.map((m)=>({id:m.id,name:m.name,sourceType:m.source_type,sourceId:m.source_id,outputFile:m.output_file,lastChecksum:m.last_checksum??undefined}))
  };
}
function randomToken(): string { return randomBytes(32).toString("hex"); }
