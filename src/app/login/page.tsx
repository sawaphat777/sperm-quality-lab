"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";
import { Mail } from "lucide-react";
import { AuthShell } from "@/components/AuthShell";
import { ensureProfile, siteUrl } from "@/lib/auth";
import { createBrowserSupabase } from "@/lib/supabase";

export default function LoginPage() {
  const router = useRouter();
  const supabase = createBrowserSupabase();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function login(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setLoading(true);
    const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);
    if (signInError) {
      setError(signInError.message);
      return;
    }
    await ensureProfile(supabase);
    router.replace("/home");
  }

  async function loginWithGoogle() {
    await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: siteUrl("/home") }
    });
  }

  return (
    <AuthShell>
      <h2>Log in</h2>
      <p className="muted">Access your orders, credits, and laboratory reports.</p>
      <form className="form" onSubmit={login}>
        <div className="field">
          <label htmlFor="email">Gmail</label>
          <input id="email" className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required suppressHydrationWarning />
        </div>
        <div className="field">
          <label htmlFor="password">Password</label>
          <input
            id="password"
            className="input"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            suppressHydrationWarning
          />
        </div>
        <div className="inline-row">
          <Link className="muted" href="/forgot-password">
            Forgot password?
          </Link>
        </div>
        {error && <p className="error">{error}</p>}
        <button className="btn" disabled={loading} type="submit" suppressHydrationWarning>
          {loading ? "Logging in..." : "Log in"}
        </button>
        <div className="divider">or sign in with</div>
        <button className="btn secondary" type="button" onClick={loginWithGoogle} suppressHydrationWarning>
          <Mail size={18} />
          Continue with Google
        </button>
        <p className="muted">
          No account? <Link href="/register">Register</Link>
        </p>
      </form>
    </AuthShell>
  );
}
