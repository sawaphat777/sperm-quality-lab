"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { Session } from "@supabase/supabase-js";
import { createBrowserSupabase } from "@/lib/supabase";
import { ensureProfile } from "@/lib/auth";

export function RequireSession({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const supabase = createBrowserSupabase();
  const [session, setSession] = useState<Session | null | undefined>(undefined);

  useEffect(() => {
    let mounted = true;

    supabase.auth.getSession().then(async ({ data }) => {
      if (!mounted) return;
      if (!data.session) {
        router.replace("/login");
        return;
      }
      await ensureProfile(supabase);
      setSession(data.session);
    });

    const { data: listener } = supabase.auth.onAuthStateChange((_event, currentSession) => {
      if (!currentSession) router.replace("/login");
      setSession(currentSession);
    });

    return () => {
      mounted = false;
      listener.subscription.unsubscribe();
    };
  }, [router, supabase]);

  if (session === undefined) {
    return (
      <div className="main">
        <div className="notice">Loading secure session...</div>
      </div>
    );
  }

  return <>{children}</>;
}
