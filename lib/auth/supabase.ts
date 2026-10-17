import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import type { SessionUser } from "./context";

/** A per-request Supabase client bound to the Next.js cookie store. */
export async function createSupabaseServerClient() {
  const store = await cookies();
  return createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    cookies: {
      getAll: () => store.getAll(),
      setAll: (items) => {
        // Server components cannot write cookies; proxy.ts refreshes the session before they render.
        try { for (const { name, value, options } of items) store.set(name, value, options); } catch { /* read-only */ }
      },
    },
  });
}

/** The signed-in user, verified from the session JWT (signature checked by getClaims). */
export async function verifiedSessionUser(): Promise<SessionUser | null> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.getClaims();
  const claims = data?.claims;
  if (error || !claims?.sub) return null;
  return { id: claims.sub, email: typeof claims.email === "string" ? claims.email : undefined };
}
