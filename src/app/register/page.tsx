"use client";

import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";
import { AuthShell } from "@/components/AuthShell";
import { siteUrl } from "@/lib/auth";
import { createBrowserSupabase } from "@/lib/supabase";

export default function RegisterPage() {
  const supabase = createBrowserSupabase();
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    if (!seconds) return;
    const timer = window.setTimeout(() => setSeconds((value) => value - 1), 1000);
    return () => window.clearTimeout(timer);
  }, [seconds]);

  async function sendVerification(event?: FormEvent<HTMLFormElement>) {
    event?.preventDefault();
    setError("");
    setMessage("");
    const { error: otpError } = await supabase.auth.signInWithOtp({
      email,
      options: {
        shouldCreateUser: true,
        emailRedirectTo: siteUrl("/set-password")
      }
    });
    if (otpError) {
      setError(otpError.message);
      return;
    }
    setSent(true);
    setSeconds(60);
    setMessage("Verification link sent. Please check your Gmail inbox.");
  }

  return (
    <AuthShell>
      <h2>Create account</h2>
      <p className="muted">Verify your Gmail first, then set your password.</p>
      <form className="form" onSubmit={sendVerification}>
        <div className="field">
          <label htmlFor="email">Gmail</label>
          <input id="email" className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required suppressHydrationWarning />
        </div>
        {message && <div className="notice">{message}</div>}
        {error && <p className="error">{error}</p>}
        <button className="btn" type="submit" disabled={seconds > 0} suppressHydrationWarning>
          {sent && seconds > 0 ? `Verify again in ${seconds}s` : sent ? "Verify again" : "Send verification"}
        </button>
        <p className="muted">
          Already have an account? <Link href="/login">Log in</Link>
        </p>
      </form>
    </AuthShell>
  );
}
