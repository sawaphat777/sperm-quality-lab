"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { createBrowserSupabase } from "@/lib/supabase";

export default function Page() {
  const router = useRouter();
  const supabase = createBrowserSupabase();

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      router.replace(data.session ? "/home" : "/login");
    });
  }, [router, supabase]);

  return null;
}
