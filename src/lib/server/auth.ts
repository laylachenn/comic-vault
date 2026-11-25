import "server-only";
import { createClient, type SupabaseClient, type User } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

/**
 * Checks the signed-in person behind an /api request and returns a Supabase client
 * that acts as them, so the database's own rules decide what they can read and write.
 */
export async function requireUser(req: Request): Promise<{ sb: SupabaseClient; user: User } | NextResponse> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return NextResponse.json({ error: "Supabase isn't set up on the server yet." }, { status: 500 });

  const header = req.headers.get("authorization") || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";
  if (!token) return NextResponse.json({ error: "Sign in first." }, { status: 401 });

  const sb = createClient(url, key, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await sb.auth.getUser(token);
  if (error || !data.user) return NextResponse.json({ error: "Your sign-in expired. Sign in again." }, { status: 401 });
  return { sb, user: data.user };
}

export function errorResponse(e: unknown) {
  const status = typeof e === "object" && e && "status" in e && typeof (e as { status: unknown }).status === "number"
    ? (e as { status: number }).status
    : 500;
  const message = e instanceof Error ? e.message : "Something went wrong. Try again.";
  return NextResponse.json({ error: message }, { status });
}
