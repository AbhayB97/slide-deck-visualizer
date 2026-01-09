import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const AUTH_USER = "AbhayB";
const AUTH_PASS = "120VrAdldeE";

function isAuthorized(request: NextRequest) {
  const header = request.headers.get("authorization");
  if (!header || !header.startsWith("Basic ")) return false;
  const encoded = header.replace("Basic ", "").trim();
  let decoded = "";
  try {
    decoded = atob(encoded);
  } catch {
    return false;
  }
  const [user, pass] = decoded.split(":");
  return user === AUTH_USER && pass === AUTH_PASS;
}

export function middleware(request: NextRequest) {
  if (isAuthorized(request)) {
    return NextResponse.next();
  }

  return new NextResponse("Authentication required.", {
    status: 401,
    headers: {
      "WWW-Authenticate": 'Basic realm="Restricted"',
    },
  });
}

export const config = {
  matcher: ["/admin/upload/:path*", "/admin/upload-master/:path*", "/draw/slot-machine/:path*"],
};
