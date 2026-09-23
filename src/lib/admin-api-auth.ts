// SERVER ONLY. Same test-level password as src/lib/admin-auth.ts (this is
// still not real auth — just enough that a stranger can't call the admin
// API routes directly without the password). See that file's comments for
// the full caveat; nothing here changes that security level, it just
// extends the existing check to the new server endpoints.
import { NextRequest } from "next/server";

const ADMIN_PASSWORD = process.env.NEXT_PUBLIC_ADMIN_PASSWORD ?? "admin123";

export function isAdminRequest(req: NextRequest): boolean {
  return req.headers.get("x-admin-password") === ADMIN_PASSWORD;
}
