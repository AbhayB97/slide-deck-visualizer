import { NextResponse } from "next/server";
import {
  AUTH_TTL_MS,
  AUTH_COOKIE_NAME,
  createAuthToken,
  getAuthCookieOptions,
  isAuthConfigured,
  verifyCredentials,
} from "@/lib/auth";

export const runtime = "nodejs";

export async function POST(request: Request) {
  if (!isAuthConfigured()) {
    return NextResponse.json(
      { success: false, error: "Auth is not configured." },
      { status: 500 }
    );
  }

  const body = await request.json().catch(() => null);
  const username = body?.username ? String(body.username) : "";
  const password = body?.password ? String(body.password) : "";

  if (!username || !password) {
    return NextResponse.json(
      { success: false, error: "Missing credentials." },
      { status: 400 }
    );
  }

  if (!verifyCredentials(username, password)) {
    return NextResponse.json(
      { success: false, error: "Invalid credentials." },
      { status: 401 }
    );
  }

  const token = createAuthToken();
  const expiresAt = Date.now() + AUTH_TTL_MS;
  const response = NextResponse.json({ success: true, expiresAt });
  response.cookies.set(AUTH_COOKIE_NAME, token, {
    ...getAuthCookieOptions(),
    expires: new Date(expiresAt),
  });
  return response;
}
