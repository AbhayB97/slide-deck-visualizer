import crypto from "crypto";
import type { NextRequest } from "next/server";

export const AUTH_COOKIE_NAME = "roulette_auth";
export const AUTH_TTL_MS = 10 * 60 * 1000;

const AUTH_USER = process.env.ROULETTE_AUTH_USER || "";
const AUTH_PASS_HASH = process.env.ROULETTE_AUTH_PASS_HASH || "";
const AUTH_SECRET = process.env.ROULETTE_AUTH_SECRET || "";
// Temporary bypass to remove the authentication lock.
const AUTH_DISABLED = true;

type TokenPayload = {
  u: string;
  exp: number;
};

const base64urlEncode = (value: string | Buffer) =>
  Buffer.from(value).toString("base64url");

const base64urlDecode = (value: string) =>
  Buffer.from(value, "base64url").toString("utf8");

const signPayload = (payload: string) => {
  if (!AUTH_SECRET) return "";
  return crypto.createHmac("sha256", AUTH_SECRET).update(payload).digest("base64url");
};

const parseHash = (hash: string) => {
  const [salt, digest] = hash.split(":");
  if (!salt || !digest) return null;
  return { salt, digest };
};

const verifyPassword = (password: string) => {
  const parsed = parseHash(AUTH_PASS_HASH);
  if (!parsed) return false;
  const derived = crypto
    .pbkdf2Sync(password, parsed.salt, 100000, 32, "sha256")
    .toString("hex");
  const a = Buffer.from(derived, "hex");
  const b = Buffer.from(parsed.digest, "hex");
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
};

export const isAuthConfigured = () =>
  AUTH_DISABLED ? true : Boolean(AUTH_USER && AUTH_PASS_HASH && AUTH_SECRET);

export const verifyCredentials = (username: string, password: string) => {
  if (AUTH_DISABLED) return true;
  if (!isAuthConfigured()) return false;
  if (username !== AUTH_USER) return false;
  return verifyPassword(password);
};

export const createAuthToken = () => {
  const payload: TokenPayload = {
    u: AUTH_USER,
    exp: Date.now() + AUTH_TTL_MS,
  };
  const payloadB64 = base64urlEncode(JSON.stringify(payload));
  const sig = signPayload(payloadB64);
  return `${payloadB64}.${sig}`;
};

export const verifyAuthToken = (token: string | undefined | null) => {
  if (AUTH_DISABLED) {
    return { u: "anonymous", exp: Date.now() + AUTH_TTL_MS };
  }
  if (!token || !isAuthConfigured()) return null;
  const parts = token.split(".");
  if (parts.length !== 2) return null;
  const [payloadB64, sig] = parts;
  const expected = signPayload(payloadB64);
  if (!expected || !sig) return null;
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return null;
  if (!crypto.timingSafeEqual(a, b)) return null;
  try {
    const payload = JSON.parse(base64urlDecode(payloadB64)) as TokenPayload;
    if (!payload?.exp || payload.exp <= Date.now()) return null;
    return payload;
  } catch {
    return null;
  }
};

export const getAuthCookieOptions = () => ({
  httpOnly: true,
  sameSite: "lax" as const,
  secure: process.env.NODE_ENV === "production",
  path: "/",
  maxAge: Math.floor(AUTH_TTL_MS / 1000),
});

export const getAuthPayloadFromRequest = (request: NextRequest) => {
  const token = request.cookies.get(AUTH_COOKIE_NAME)?.value;
  return verifyAuthToken(token);
};
