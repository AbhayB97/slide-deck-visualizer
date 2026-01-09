import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { AUTH_COOKIE_NAME, verifyAuthToken } from "@/lib/auth";

export const runtime = "nodejs";

export async function GET() {
  const token = cookies().get(AUTH_COOKIE_NAME)?.value;
  const payload = verifyAuthToken(token);

  if (!payload) {
    return NextResponse.json({ authenticated: false });
  }

  return NextResponse.json({ authenticated: true, expiresAt: payload.exp });
}
