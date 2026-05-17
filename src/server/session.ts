import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

const COOKIE_NAME = "docsynchub_session";
const OAUTH_STATE_COOKIE_NAME = "docsynchub_google_oauth_state";
const GITLAB_OAUTH_STATE_COOKIE_NAME = "docsynchub_gitlab_oauth_state";

const MAX_AGE_SECONDS = 60 * 60 * 24 * 7;
const OAUTH_STATE_MAX_AGE_SECONDS = 60 * 10;

export function createSessionCookie(secret: string): string {
  const payload = Buffer.from(
    JSON.stringify({
      sub: "admin",
      nonce: randomBytes(12).toString("hex"),
      exp: Math.floor(Date.now() / 1000) + MAX_AGE_SECONDS
    }),
    "utf8"
  ).toString("base64url");
  const signature = sign(secret, payload);
  return `${COOKIE_NAME}=${payload}.${signature}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${MAX_AGE_SECONDS}`;
}

export function clearSessionCookie(): string {
  return `${COOKIE_NAME}=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0`;
}

export function createGoogleOauthStateCookie(state: string): string {
  return `${OAUTH_STATE_COOKIE_NAME}=${state}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${OAUTH_STATE_MAX_AGE_SECONDS}`;
}

export function clearGoogleOauthStateCookie(): string {
  return `${OAUTH_STATE_COOKIE_NAME}=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0`;
}

export function getGoogleOauthState(cookieHeader: string | undefined): string | undefined {
  return parseCookies(cookieHeader)[OAUTH_STATE_COOKIE_NAME];
}

export function createGitLabOauthStateCookie(state: string): string {
  return `${GITLAB_OAUTH_STATE_COOKIE_NAME}=${state}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${OAUTH_STATE_MAX_AGE_SECONDS}`;
}

export function clearGitLabOauthStateCookie(): string {
  return `${GITLAB_OAUTH_STATE_COOKIE_NAME}=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0`;
}

export function getGitLabOauthState(cookieHeader: string | undefined): string | undefined {
  return parseCookies(cookieHeader)[GITLAB_OAUTH_STATE_COOKIE_NAME];
}

export function isAuthenticated(cookieHeader: string | undefined, secret: string): boolean {
  const token = parseCookies(cookieHeader)[COOKIE_NAME];
  if (!token) {
    return false;
  }

  const [payload, signature] = token.split(".");
  if (!payload || !signature || !safeEqual(signature, sign(secret, payload))) {
    return false;
  }

  try {
    const parsed = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as { exp?: number; sub?: string };
    return parsed.sub === "admin" && typeof parsed.exp === "number" && parsed.exp > Math.floor(Date.now() / 1000);
  } catch {
    return false;
  }
}

function sign(secret: string, payload: string): string {
  return createHmac("sha256", secret).update(payload).digest("base64url");
}

function parseCookies(header: string | undefined): Record<string, string> {
  const cookies: Record<string, string> = {};
  if (!header) {
    return cookies;
  }

  for (const part of header.split(";")) {
    const [name, ...valueParts] = part.trim().split("=");
    if (name && valueParts.length > 0) {
      cookies[name] = valueParts.join("=");
    }
  }

  return cookies;
}

function safeEqual(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}
