import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./types";

export async function ensureProfile(supabase: SupabaseClient<Database>) {
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user?.email) return null;

  const { data: existing } = await supabase.from("profiles").select("*").eq("id", user.id).single();
  if (existing) return existing;

  const { data, error } = await supabase
    .from("profiles")
    .insert({
      id: user.id,
      email: user.email,
      full_name: user.user_metadata?.full_name ?? user.user_metadata?.name ?? null,
      avatar_url: user.user_metadata?.avatar_url ?? null
    })
    .select("*")
    .single();

  if (error) throw error;
  return data;
}

export function siteUrl(path: string) {
  const base = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";
  return `${base}${path}`;
}
