import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const AUTH_COOKIE_NAME = "roulette_auth";
const AUTH_SECRET = process.env.ROULETTE_AUTH_SECRET || "";

const encoder = new TextEncoder();

const base64UrlToBytes = (value: string) => {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/").padEnd(
    Math.ceil(value.length / 4) * 4,
    "="
  );
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
};

const decodePayload = (payloadB64: string) => {
  try {
    const bytes = base64UrlToBytes(payloadB64);
    const json = new TextDecoder().decode(bytes);
    return JSON.parse(json) as { exp?: number };
  } catch {
    return null;
  }
};

const verifyToken = async (token: string | undefined) => {
  if (!token || !AUTH_SECRET) return false;
  const parts = token.split(".");
  if (parts.length !== 2) return false;
  const [payloadB64, sigB64] = parts;
  const payload = decodePayload(payloadB64);
  if (!payload?.exp || payload.exp <= Date.now()) return false;
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(AUTH_SECRET),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["verify"]
  );
  return crypto.subtle.verify(
    "HMAC",
    key,
    base64UrlToBytes(sigB64),
    encoder.encode(payloadB64)
  );
};

export async function middleware(request: NextRequest) {
  const token = request.cookies.get(AUTH_COOKIE_NAME)?.value;
  const ok = await verifyToken(token);
  if (ok) {
    return NextResponse.next();
  }

  const loginUrl = new URL("/auth/login", request.url);
  loginUrl.searchParams.set("next", request.nextUrl.pathname + request.nextUrl.search);
  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: ["/admin/upload/:path*", "/admin/upload-master/:path*", "/draw/slot-machine/:path*"],
};
