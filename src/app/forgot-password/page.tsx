"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";
import { AuthShell } from "@/components/AuthShell";
import { siteUrl } from "@/lib/auth";
import { createBrowserSupabase } from "@/lib/supabase";

export default function ForgotPasswordPage() {
  const supabase = createBrowserSupabase();
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function reset(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setMessage("");
    const { error: resetError } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: siteUrl("/reset-password")
    });
    if (resetError) {
      setError(resetError.message);
      return;
    }
    setMessage("Password reset link sent. Please check your Gmail inbox.");
  }

  return (
    <AuthShell>
      <h2>Reset password</h2>
      <p className="muted">Enter your Gmail and we will send a secure reset link.</p>
      <form className="form" onSubmit={reset}>
        <div className="field">
          <label htmlFor="email">Gmail</label>
          <input id="email" className="input" type="email" value={email} onChange={(event) => setEmail(event.target.value)} required suppressHydrationWarning />
        </div>
        {message && <div className="notice">{message}</div>}
        {error && <p className="error">{error}</p>}
        <button className="btn" type="submit" suppressHydrationWarning>
          Send reset link
        </button>
        <Link className="muted" href="/login">
          Back to login
        </Link>
      </form>
    </AuthShell>
  );
}
