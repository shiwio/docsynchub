import { randomBytes } from "node:crypto";
import type { StateStore, GitLabConnection, GitLabOauthSettings } from "../server/state.js";

export function createGitLabAuthRequest(settings: GitLabOauthSettings): { url: string; state: string } {
  const state = randomBytes(18).toString("hex");
  const baseUrl = settings.gitlabUrl.replace(/\/$/, "");
  const url = new URL(`${baseUrl}/oauth/authorize`);
  url.searchParams.set("client_id", settings.appId);
  url.searchParams.set("redirect_uri", `${settings.appUrl}/api/integrations/gitlab/callback`);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", "api read_user read_repository write_repository");
  url.searchParams.set("state", state);
  return { url: url.toString(), state };
}

export async function exchangeGitLabCode(code: string, settings: GitLabOauthSettings): Promise<GitLabConnection> {
  const baseUrl = settings.gitlabUrl.replace(/\/$/, "");
  const response = await fetch(`${baseUrl}/oauth/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: settings.appId,
      client_secret: settings.appSecret,
      code,
      grant_type: "authorization_code",
      redirect_uri: `${settings.appUrl}/api/integrations/gitlab/callback`,
    }),
  });
  if (!response.ok) throw new Error(`GitLab token exchange failed: ${response.status}`);
  const token = await response.json() as any;
  const connection: GitLabConnection = {
    accessToken: token.access_token,
    refreshToken: token.refresh_token,
    tokenType: token.token_type,
    scope: token.scope,
    expiresAt: token.expires_in
      ? new Date(Date.now() + token.expires_in * 1000).toISOString()
      : undefined,
  };
  // Fetch user info
  try {
    const user = await fetchGitLabUser(connection.accessToken, baseUrl);
    connection.connectedUsername = user.username;
    connection.connectedEmail = user.email;
    connection.gitlabUserId = user.id;
  } catch { /* non-fatal */ }
  return connection;
}

export async function refreshGitLabToken(connection: GitLabConnection, settings: GitLabOauthSettings): Promise<GitLabConnection> {
  if (!connection.refreshToken) throw new Error("GitLab refresh token is missing");
  const baseUrl = settings.gitlabUrl.replace(/\/$/, "");
  const response = await fetch(`${baseUrl}/oauth/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: settings.appId,
      client_secret: settings.appSecret,
      refresh_token: connection.refreshToken,
      grant_type: "refresh_token",
      redirect_uri: `${settings.appUrl}/api/integrations/gitlab/callback`,
    }),
  });
  if (!response.ok) throw new Error(`GitLab token refresh failed: ${response.status}`);
  const token = await response.json() as any;
  return {
    ...connection,
    accessToken: token.access_token,
    refreshToken: token.refresh_token ?? connection.refreshToken,
    expiresAt: token.expires_in ? new Date(Date.now() + token.expires_in * 1000).toISOString() : undefined,
  };
}

export async function getValidGitLabToken(store: StateStore): Promise<string> {
  const connection = await store.getGitLabConnection();
  if (!connection) throw new Error("GitLab is not connected via OAuth");
  // Check expiry with 60s buffer
  if (!connection.expiresAt || new Date(connection.expiresAt).getTime() > Date.now() + 60_000) {
    return connection.accessToken;
  }
  const settings = await store.getGitLabOauthSettings();
  if (!settings) throw new Error("GitLab OAuth is not configured");
  const refreshed = await refreshGitLabToken(connection, settings);
  await store.saveGitLabConnection(refreshed);
  return refreshed.accessToken;
}

async function fetchGitLabUser(token: string, baseUrl: string): Promise<{ id: number; username: string; email: string }> {
  const res = await fetch(`${baseUrl}/api/v4/user`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error("Failed to fetch GitLab user info");
  return res.json() as Promise<any>;
}
