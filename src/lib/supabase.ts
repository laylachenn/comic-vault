import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

export const supabaseConfigured = Boolean(url && key);

let client: SupabaseClient | null = null;

/** The browser's Supabase client. Keeps the person signed in and refreshes their session. */
export function supabase(): SupabaseClient {
  if (!url || !key) throw new Error("Supabase isn't set up yet. Copy .env.local.example to .env.local and fill it in.");
  if (!client) client = createClient(url, key);
  return client;
}

export function coverUrl(path: string | null | undefined): string | null {
  if (!path || !url) return null;
  return supabase().storage.from("covers").getPublicUrl(path).data.publicUrl;
}
