import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const url = (import.meta.env.VITE_SUPABASE_URL as string | undefined) ?? "";
const anonKey = (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined) ?? "";

/**
 * Optional Supabase client. VIRASAT's provenance registry is served by the
 * FastAPI backend; this client is available for future auth, storage and
 * row-level-security integration (see app/models/ddl.sql).
 */
export const supabase: SupabaseClient | null =
  url && anonKey ? createClient(url, anonKey) : null;
