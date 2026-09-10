"use client";

import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";
import { AuthShell } from "@/components/AuthShell";
import { ensureProfile } from "@/lib/auth";
import { createBrowserSupabase } from "@/lib/supabase";

export default function SetPasswordPage() {
  const router = useRouter();
  const supabase = createBrowserSupabase();
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    const { error: updateError } = await supabase.auth.updateUser({ password });
    if (updateError) {
      setError(updateError.message);
      return;
    }
    await ensureProfile(supabase);
    await supabase.auth.signOut();
    router.replace("/login");
  }

  return (
    <AuthShell>
      <h2>Set password</h2>
      <p className="muted">Create a password for this verified Gmail account.</p>
      <form className="form" onSubmit={save}>
        <div className="field">
          <label htmlFor="password">New password</label>
          <input
            id="password"
            className="input"
            type="password"
            minLength={8}
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            required
            suppressHydrationWarning
          />
        </div>
        {error && <p className="error">{error}</p>}
        <button className="btn" type="submit" suppressHydrationWarning>
          Save password
        </button>
      </form>
    </AuthShell>
  );
}
