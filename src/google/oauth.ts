import { randomBytes } from "node:crypto";
import type { StateStore, GoogleConnection, GoogleOauthSettings } from "../server/state.js";

const DRIVE_SCOPE = "https://www.googleapis.com/auth/drive.readonly";

export function createGoogleAuthRequest(settings: GoogleOauthSettings): { url: string; state: string } {
  const state = randomBytes(18).toString("hex");
  const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  url.searchParams.set("client_id", settings.clientId);
  url.searchParams.set("redirect_uri", `${settings.appUrl}/api/integrations/google/callback`);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", DRIVE_SCOPE);
  url.searchParams.set("access_type", "offline");
  url.searchParams.set("prompt", "consent");
  url.searchParams.set("state", state);
  return { url: url.toString(), state };
}

export async function exchangeCode(code: string, settings: GoogleOauthSettings): Promise<GoogleConnection> {
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: settings.clientId,
      client_secret: settings.clientSecret,
      redirect_uri: `${settings.appUrl}/api/integrations/google/callback`,
      grant_type: "authorization_code"
    })
  });
  if (!response.ok) throw new Error(`Google token exchange failed: ${response.status}`);
  const token = await response.json() as any;
  return { accessToken: token.access_token, refreshToken: token.refresh_token, scope: token.scope, tokenType: token.token_type, expiresAt: new Date(Date.now() + token.expires_in * 1000).toISOString() };
}

export async function getValidAccessToken(store: StateStore): Promise<string> {
  const connection = await store.getGoogleConnection();
  const settings = await getSettings(store);
  if (!connection) throw new Error("Google is not connected");
  if (!connection.expiresAt || new Date(connection.expiresAt).getTime() > Date.now() + 60_000) return connection.accessToken;
  if (!connection.refreshToken) throw new Error("Google refresh token is missing");
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: settings.clientId, client_secret: settings.clientSecret, refresh_token: connection.refreshToken, grant_type: "refresh_token" })
  });
  if (!response.ok) throw new Error(`Google token refresh failed: ${response.status}`);
  const token = await response.json() as any;
  const next = { ...connection, accessToken: token.access_token, scope: token.scope ?? connection.scope, tokenType: token.token_type ?? connection.tokenType, expiresAt: new Date(Date.now() + token.expires_in * 1000).toISOString() };
  await store.saveGoogleConnection(next); return next.accessToken;
}

export async function listGoogleDocs(store: StateStore, query = ""): Promise<any[]> {
  const token = await getValidAccessToken(store);
  const url = new URL("https://www.googleapis.com/drive/v3/files");
  const escaped = query.replace(/'/g, "\\'");
  url.searchParams.set("q", `mimeType='application/vnd.google-apps.document' and trashed=false${query ? ` and name contains '${escaped}'` : ""}`);
  url.searchParams.set("fields", "files(id,name,modifiedTime)");
  url.searchParams.set("orderBy", "modifiedTime desc");
  url.searchParams.set("pageSize", "50");
  const response = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!response.ok) throw new Error(await googleError(response, "Google Drive list failed"));
  return ((await response.json()) as any).files ?? [];
}
export async function listGoogleDriveChildren(store: StateStore, parentId = "root"): Promise<any[]> {
  const token = await getValidAccessToken(store);
  const url = new URL("https://www.googleapis.com/drive/v3/files");
  url.searchParams.set("q", `'${escapeQuery(parentId)}' in parents and trashed=false and (mimeType='application/vnd.google-apps.folder' or mimeType='application/vnd.google-apps.document')`);
  url.searchParams.set("fields", "files(id,name,mimeType,modifiedTime)");
  url.searchParams.set("orderBy", "folder,name");
  url.searchParams.set("pageSize", "200");
  const response = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!response.ok) throw new Error(await googleError(response, "Google Drive browse failed"));
  return ((await response.json()) as any).files ?? [];
}
async function getSettings(store: StateStore): Promise<GoogleOauthSettings> {
  const settings = await store.getGoogleOauthSettings();
  if (!settings) throw new Error("Google OAuth is not configured");
  return settings;
}
async function googleError(response: Response, fallback: string): Promise<string> {
  const body = await response.json().catch(() => undefined) as any;
  return body?.error?.message ?? `${fallback}: ${response.status}`;
}
function escapeQuery(value: string): string {
  return value.replace(/'/g, "\\'");
}
