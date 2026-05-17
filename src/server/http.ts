import http, { type IncomingMessage, type ServerResponse } from "node:http";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { loadEnvFile } from "../utils/env.js";
import { sync } from "../core/syncEngine.js";
import { notify } from "../notify/notifier.js";
import {
  clearGoogleOauthStateCookie,
  clearSessionCookie,
  createGoogleOauthStateCookie,
  createSessionCookie,
  getGoogleOauthState,
  isAuthenticated,
  createGitLabOauthStateCookie,
  clearGitLabOauthStateCookie,
  getGitLabOauthState,
} from "./session.js";
import {
  createMappingId,
  createProjectId,
  defaultNotifications,
  hashPassword,
  type ProjectRecord,
  StateStore,
  verifyPassword
} from "./state.js";
import { createDatabasePool, runMigrations } from "../db/client.js";
import { createGoogleAuthRequest, exchangeCode, getValidAccessToken, listGoogleDocs, listGoogleDriveChildren } from "../google/oauth.js";
import { createGitLabAuthRequest, exchangeGitLabCode, getValidGitLabToken } from "../gitlab/oauth.js";

export interface ServeOptions {
  host: string;
  port: number;
  databaseUrl: string;
  envFile?: string;
}

export async function serve(options: ServeOptions): Promise<void> {
  const pool = await createDatabasePool(options.databaseUrl);
  await runMigrations(pool);
  const store = new StateStore(pool);
  if (options.envFile) {
    await loadEnvFile(options.envFile);
  }

  const server = http.createServer((request, response) => {
    void handleRequest(request, response, store);
  });

  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(options.port, options.host, () => {
      server.off("error", reject);
      resolve();
    });
  });

  console.log(`DocSyncHub UI listening on http://${options.host}:${options.port}`);
  startScheduler(store);
}

async function handleRequest(request: IncomingMessage, response: ServerResponse, store: StateStore): Promise<void> {
  try {
    const url = new URL(request.url ?? "/", "http://localhost");
    const admin = await store.getAdmin();
    const sessionSecret = await store.getSessionSecret();
    const adminReady = Boolean(admin);
    const authed = adminReady && isAuthenticated(request.headers.cookie, sessionSecret);

    if (request.method === "GET" && url.pathname === "/healthz") {
      return sendText(response, 200, "ok");
    }
    if (url.pathname.startsWith("/api/")) {
      return await handleApi(request, response, store, url, admin, sessionSecret, authed);
    }

    if (request.method === "GET") {
      return sendWebAsset(response, url.pathname);
    }
    return sendJson(response, 404, { error: "Not found" });
  } catch (error) {
    return sendJson(response, 500, { error: error instanceof Error ? error.message : "Unexpected server error" });
  }
}

async function handleApi(
  request: IncomingMessage,
  response: ServerResponse,
  store: StateStore,
  url: URL,
  admin: Awaited<ReturnType<StateStore["getAdmin"]>>,
  sessionSecret: string,
  authed: boolean
): Promise<void> {
  if (request.method === "GET" && url.pathname === "/api/auth/status") {
    return sendJson(response, 200, { setupRequired: !admin, authenticated: authed });
  }
  if (request.method === "GET" && url.pathname === "/api/integrations/google/callback") {
    return handleGoogleCallback(request, response, store, url);
  }
  if (request.method === "GET" && url.pathname === "/api/integrations/gitlab/callback") {
    return handleGitLabCallback(request, response, store, url);
  }
  if (!admin && request.method === "POST" && url.pathname === "/api/setup") {
    const body = await readJson(request);
    if (String(body.password ?? "").length < 10) return sendJson(response, 400, { error: "Password must be at least 10 characters." });
    if (body.password !== body.confirmPassword) return sendJson(response, 400, { error: "Passwords do not match." });
    const hashed = await hashPassword(String(body.password));
    await store.createAdmin({ ...hashed, createdAt: new Date().toISOString() });
    return sendJson(response, 200, { ok: true });
  }
  if (request.method === "POST" && url.pathname === "/api/login") {
    const body = await readJson(request);
    if (!admin || !(await verifyPassword(String(body.password ?? ""), admin.salt, admin.passwordHash))) {
      return sendJson(response, 401, { error: "Invalid password." });
    }
    response.setHeader("Set-Cookie", createSessionCookie(sessionSecret));
    return sendJson(response, 200, { ok: true });
  }
  if (!authed) return sendJson(response, 401, { error: "Unauthorized" });
  if (request.method === "POST" && url.pathname === "/api/logout") {
    response.setHeader("Set-Cookie", clearSessionCookie());
    return sendJson(response, 200, { ok: true });
  }
  if (request.method === "GET" && url.pathname === "/api/projects") return sendJson(response, 200, await store.listProjects());
  if (request.method === "GET" && url.pathname === "/api/integrations/google/status") {
    const connection = await store.getGoogleConnection();
    const settings = await store.getGoogleOauthSettings();
    return sendJson(response, 200, {
      connected: Boolean(connection),
      configured: Boolean(settings),
      email: connection?.connectedEmail
    });
  }
  if (request.method === "GET" && url.pathname === "/api/settings/integrations/google") {
    const settings = await store.getGoogleOauthSettings();
    return sendJson(response, 200, settings ? { ...settings, clientSecret: "" } : { clientId: "", clientSecret: "", appUrl: baseUrl(request) });
  }
  if (request.method === "PUT" && url.pathname === "/api/settings/integrations/google") {
    const body = await readJson(request);
    const current = await store.getGoogleOauthSettings();
    const clientId = cleanText(body.clientId);
    const clientSecret = cleanText(body.clientSecret) || current?.clientSecret || "";
    const appUrl = cleanText(body.appUrl).replace(/\/$/, "");
    if (!clientId || !clientSecret || !appUrl) return sendJson(response, 400, { error: "Client ID, client secret, and app URL are required." });
    await store.saveGoogleOauthSettings({ clientId, clientSecret, appUrl });
    return sendJson(response, 200, { clientId, clientSecret: "", appUrl });
  }
  if (request.method === "GET" && url.pathname === "/api/integrations/google/connect") {
    const settings = await store.getGoogleOauthSettings();
    if (!settings) return sendJson(response, 400, { error: "Google OAuth is not configured." });
    const auth = createGoogleAuthRequest(settings);
    response.writeHead(302, {
      Location: auth.url,
      "Set-Cookie": createGoogleOauthStateCookie(auth.state)
    });
    response.end();
    return;
  }
  if (request.method === "POST" && url.pathname === "/api/integrations/google/disconnect") {
    await store.deleteGoogleConnection(); return sendJson(response, 200, { ok: true });
  }
  if (request.method === "GET" && url.pathname === "/api/google/docs") {
    return sendJson(response, 200, await listGoogleDocs(store, url.searchParams.get("q") ?? ""));
  }
  if (request.method === "GET" && url.pathname === "/api/google/drive/children") {
    return sendJson(response, 200, await listGoogleDriveChildren(store, url.searchParams.get("parentId") ?? "root"));
  }
  // GitLab OAuth routes
  if (request.method === "GET" && url.pathname === "/api/integrations/gitlab/status") {
    const connection = await store.getGitLabConnection();
    const settings = await store.getGitLabOauthSettings();
    return sendJson(response, 200, {
      connected: Boolean(connection),
      configured: Boolean(settings),
      username: connection?.connectedUsername,
      email: connection?.connectedEmail,
      gitlabUrl: settings?.gitlabUrl ?? "https://gitlab.com",
    });
  }
  if (request.method === "GET" && url.pathname === "/api/settings/integrations/gitlab") {
    const settings = await store.getGitLabOauthSettings();
    return sendJson(response, 200, settings
      ? { ...settings, appSecret: "" }
      : { appId: "", appSecret: "", appUrl: baseUrl(request), gitlabUrl: "https://gitlab.com" });
  }
  if (request.method === "PUT" && url.pathname === "/api/settings/integrations/gitlab") {
    const body = await readJson(request);
    const current = await store.getGitLabOauthSettings();
    const appId = cleanText(body.appId);
    const appSecret = cleanText(body.appSecret) || current?.appSecret || "";
    const appUrl = cleanText(body.appUrl).replace(/\/$/, "");
    const gitlabUrl = cleanText(body.gitlabUrl || "https://gitlab.com").replace(/\/$/, "");
    if (!appId || !appSecret || !appUrl) return sendJson(response, 400, { error: "App ID, app secret, and app URL are required." });
    await store.saveGitLabOauthSettings({ appId, appSecret, appUrl, gitlabUrl });
    return sendJson(response, 200, { appId, appSecret: "", appUrl, gitlabUrl });
  }
  if (request.method === "GET" && url.pathname === "/api/integrations/gitlab/connect") {
    const settings = await store.getGitLabOauthSettings();
    if (!settings) return sendJson(response, 400, { error: "GitLab OAuth is not configured." });
    const auth = createGitLabAuthRequest(settings);
    response.writeHead(302, {
      Location: auth.url,
      "Set-Cookie": createGitLabOauthStateCookie(auth.state),
    });
    response.end();
    return;
  }
  if (request.method === "POST" && url.pathname === "/api/integrations/gitlab/disconnect") {
    await store.deleteGitLabConnection();
    return sendJson(response, 200, { ok: true });
  }
  if (request.method === "POST" && url.pathname === "/api/projects") {
    const body = await readJson(request); const now = new Date().toISOString();
    const project: ProjectRecord = { id:createProjectId(), name:cleanText(body.name)||"Untitled", folder:"docs", scheduleMinutes:5, commitMode:"auto_commit", destination:{provider:"gitlab",branch:"docsync/update-docs",baseBranch:"main"}, mappings:[], notifications:defaultNotifications(), description:cleanText(body.description)||undefined, createdAt:now, updatedAt:now };
    await store.createProject(project); return sendJson(response, 201, project);
  }
  const projectMatch = url.pathname.match(/^\/api\/projects\/([^/]+)$/);
  if (projectMatch) {
    const project = await store.getProject(projectMatch[1]); if (!project) return sendJson(response,404,{error:"Not found"});
    if (request.method === "GET") return sendJson(response,200,project);
    if (request.method === "DELETE") { await store.deleteProject(project.id); return sendJson(response,200,{ok:true}); }
    if (request.method === "PATCH") {
      const body = await readJson(request);
      const destChanged = body.destination && JSON.stringify(body.destination) !== JSON.stringify(project.destination);
      // Explicit allowlist — never let callers overwrite id, createdAt, mappings
      if (body.name !== undefined) project.name = cleanText(body.name) || project.name;
      if (body.description !== undefined) project.description = cleanText(body.description) || undefined;
      if (body.folder !== undefined) project.folder = cleanText(body.folder) || project.folder;
      if (body.scheduleMinutes !== undefined) project.scheduleMinutes = cleanPositiveInt(body.scheduleMinutes, project.scheduleMinutes);
      if (body.commitMode === "auto_commit" || body.commitMode === "alert_only") project.commitMode = body.commitMode;
      if (body.destination !== undefined) project.destination = body.destination;
      if (body.notifications !== undefined) project.notifications = body.notifications;
      project.updatedAt = new Date().toISOString();
      await store.updateProject(project);
      if (destChanged) {
        for (const m of project.mappings) {
          m.lastChecksum = undefined;
          await store.updateMapping(project.id, m);
        }
      }
      return sendJson(response,200,project);
    }
  }
  const mappingApi = url.pathname.match(/^\/api\/projects\/([^/]+)\/mappings$/);
  if (mappingApi && request.method === "POST") {
    const project = await store.getProject(mappingApi[1]); if (!project) return sendJson(response,404,{error:"Not found"});
    const body = await readJson(request); const mapping = { id:createMappingId(), name:cleanText(body.name), sourceType: body.sourceType === "lark_doc" ? "lark_doc" as const : "google_doc" as const, sourceId:cleanText(body.sourceId), outputFile:cleanText(body.outputFile) };
    await store.addMapping(project.id,mapping); project.mappings.push(mapping); await store.updateProject(project); return sendJson(response,201,project);
  }
  const mappingItemApi = url.pathname.match(/^\/api\/projects\/([^/]+)\/mappings\/([^/]+)$/);
  if (mappingItemApi) {
    const project = await store.getProject(mappingItemApi[1]); if (!project) return sendJson(response,404,{error:"Not found"});
    const mapping = project.mappings.find((item) => item.id === mappingItemApi[2]); if (!mapping) return sendJson(response,404,{error:"Not found"});
    if (request.method === "PATCH") {
      const body = await readJson(request);
      Object.assign(mapping, body);
      await store.updateMapping(project.id, mapping); return sendJson(response,200,project);
    }
    if (request.method === "DELETE") {
      await store.deleteMapping(project.id, mapping.id);
      project.mappings = project.mappings.filter((item) => item.id !== mapping.id);
      return sendJson(response,200,project);
    }
  }
  const syncApi = url.pathname.match(/^\/api\/projects\/([^/]+)\/sync$/);
  if (syncApi && request.method === "POST") {
    const project = await store.getProject(syncApi[1]); if (!project) return sendJson(response,404,{error:"Not found"});
    await runProjectSync(project, store); project.updatedAt = new Date().toISOString(); await store.recordSyncRun(project); return sendJson(response,200,project);
  }
  const mappingSyncApi = url.pathname.match(/^\/api\/projects\/([^/]+)\/mappings\/([^/]+)\/sync$/);
  if (mappingSyncApi && request.method === "POST") {
    const project = await store.getProject(mappingSyncApi[1]); if (!project) return sendJson(response,404,{error:"Not found"});
    const mapping = project.mappings.find((item) => item.id === mappingSyncApi[2]); if (!mapping) return sendJson(response,404,{error:"Not found"});
    const singleMappingProject = { ...project, mappings: [mapping] };
    await runProjectSync(singleMappingProject, store); project.lastCheckedAt = singleMappingProject.lastCheckedAt; project.lastRunAt = singleMappingProject.lastRunAt; project.lastRunStatus = singleMappingProject.lastRunStatus; project.lastRunMessage = singleMappingProject.lastRunMessage; await store.recordSyncRun(project); return sendJson(response,200,project);
  }
  return sendJson(response,404,{error:"Not found"});
}

async function handleGoogleCallback(request: IncomingMessage, response: ServerResponse, store: StateStore, url: URL): Promise<void> {
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const expectedState = getGoogleOauthState(request.headers.cookie);
  if (!code) return sendText(response, 400, "Missing code");
  if (!state || !expectedState || state !== expectedState) return sendText(response, 400, "Invalid OAuth state");
  const settings = await store.getGoogleOauthSettings();
  if (!settings) return sendText(response, 400, "Google OAuth is not configured");
  const connection = await exchangeCode(code, settings);
  await store.saveGoogleConnection(connection);
  response.writeHead(302, { Location: "/projects", "Set-Cookie": clearGoogleOauthStateCookie() }); response.end();
}

async function handleGitLabCallback(request: IncomingMessage, response: ServerResponse, store: StateStore, url: URL): Promise<void> {
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const expectedState = getGitLabOauthState(request.headers.cookie);
  if (!code) return sendText(response, 400, "Missing code");
  if (!state || !expectedState || state !== expectedState) return sendText(response, 400, "Invalid OAuth state");
  const settings = await store.getGitLabOauthSettings();
  if (!settings) return sendText(response, 400, "GitLab OAuth is not configured");
  const connection = await exchangeGitLabCode(code, settings);
  await store.saveGitLabConnection(connection);
  response.writeHead(302, { Location: "/settings?tab=integrations", "Set-Cookie": clearGitLabOauthStateCookie() });
  response.end();
}

async function runProjectSync(project: ProjectRecord, store: StateStore): Promise<void> {
  try {
    // Build context with tokens fetched from DB (OAuth connections)
    const context: import("../core/syncEngine.js").SyncContext = {};

    if (project.mappings.some((m) => m.sourceType === "google_doc")) {
      context.googleAccessToken = await getValidAccessToken(store);
    }
    if (project.destination.provider === "gitlab") {
      context.gitlabToken = await getValidGitLabToken(store);
    }

    const result = await sync(project, context);
    await notify(project, result);

    if (result.updates && result.updates.length > 0) {
      for (const update of result.updates) {
        const mapping = project.mappings.find(m => m.id === update.mappingId);
        if (mapping) {
          mapping.lastChecksum = update.checksum;
          await store.updateMapping(project.id, mapping);
        }
      }
    }
    const changed = result.changes.filter((change) => change.status !== "skipped").length;
    const skipped = result.changes.length - changed;
    project.lastRunAt = new Date().toISOString();
    project.lastRunStatus = "success";
    project.lastRunMessage = `${changed} changed, ${skipped} skipped${result.commit ? `, ${result.commit}` : ""}`;
    await store.recordSyncRun(project);
  } catch (error) {
    project.lastRunAt = new Date().toISOString();
    project.lastRunStatus = "failed";
    project.lastRunMessage = error instanceof Error ? error.message : "Sync failed";
    await store.recordSyncRun(project);
  }
  project.lastCheckedAt = new Date().toISOString();
}

async function readJson(request: IncomingMessage): Promise<Record<string, any>> {
  const chunks: Buffer[] = [];
  let totalSize = 0;
  for await (const chunk of request) {
    const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    totalSize += buf.length;
    if (totalSize > 1_048_576) throw new Error("Request body too large"); // 1 MB limit
    chunks.push(buf);
  }
  if (!chunks.length) return {};
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw new Error("Invalid JSON");
  }
}

function cleanText(value: unknown): string {
  return String(value ?? "").trim();
}

function cleanPositiveInt(value: unknown, fallback: number): number {
  const parsed = Number.parseInt(cleanText(value), 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}


function startScheduler(store: StateStore): void {
  setInterval(() => {
    void runDueProjects(store);
  }, 60_000).unref();
}

async function runDueProjects(store: StateStore): Promise<void> {
  const projects = await store.listProjects();
  const now = Date.now();

  for (const project of projects) {
    const lastCheckedAt = project.lastCheckedAt ? new Date(project.lastCheckedAt).getTime() : 0;
    const due = !lastCheckedAt || now - lastCheckedAt >= project.scheduleMinutes * 60_000;
    if (!due || project.mappings.length === 0) {
      continue;
    }

    await runProjectSync(project, store);
    project.updatedAt = new Date().toISOString();
    await store.recordSyncRun(project);
  }
}


function sendText(response: ServerResponse, statusCode: number, text: string): void {
  response.writeHead(statusCode, {
    "Content-Type": "text/plain; charset=utf-8",
    "Cache-Control": "no-store"
  });
  response.end(text);
}
function sendJson(response: ServerResponse, statusCode: number, value: unknown): void {
  response.writeHead(statusCode, {
    "Content-Type": "application/json",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff"
  });
  response.end(JSON.stringify(value));
}
function baseUrl(request: IncomingMessage): string {
  return process.env.APP_URL ?? `http://${request.headers.host}`;
}
async function sendWebAsset(response: ServerResponse, pathname: string): Promise<void> {
  const root = path.resolve("web-dist");
  const candidate = pathname === "/" ? path.join(root, "index.html") : path.resolve(root, pathname.slice(1));
  const assetPath = candidate.startsWith(root) ? candidate : path.join(root, "index.html");
  try {
    const data = await readFile(assetPath);
    const isAsset = assetPath.includes("/assets/");
    const type = assetPath.endsWith(".js") ? "text/javascript" : assetPath.endsWith(".css") ? "text/css" : "text/html";
    response.writeHead(200, {
      "Content-Type": type,
      "Cache-Control": isAsset ? "public, max-age=31536000, immutable" : "no-store",
      "X-Content-Type-Options": "nosniff",
      "X-Frame-Options": "DENY"
    });
    response.end(data);
  } catch {
    const data = await readFile(path.join(root, "index.html"));
    response.writeHead(200, { "Content-Type": "text/html", "Cache-Control": "no-store", "X-Frame-Options": "DENY" });
    response.end(data);
  }
}
