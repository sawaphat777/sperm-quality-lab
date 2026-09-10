"use client";

import { FormEvent, useEffect, useState } from "react";
import Link from "next/link";
import { Activity, Check, LogOut, Plus, Send, ShieldCheck } from "lucide-react";
import { useRouter } from "next/navigation";
import { createBrowserSupabase } from "@/lib/supabase";
import type { Database, Json } from "@/lib/types";

type Profile = Database["public"]["Tables"]["profiles"]["Row"];
type Topup = Database["public"]["Tables"]["topups"]["Row"];
type TopupWithProfile = Topup & {
  profile?: Pick<Profile, "email" | "full_name"> | null;
};
type AiResponse = {
  metrics: Json;
  band: string;
  recommendation: string;
  report: string;
};

export default function LabPage() {
  const router = useRouter();
  const supabase = createBrowserSupabase();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [topups, setTopups] = useState<TopupWithProfile[]>([]);
  const [video, setVideo] = useState<File | null>(null);
  const [code, setCode] = useState("");
  const [microns, setMicrons] = useState("0.5");
  const [processing, setProcessing] = useState(false);
  const [dots, setDots] = useState(".");
  const [result, setResult] = useState<AiResponse | null>(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    async function load() {
      const {
        data: { user }
      } = await supabase.auth.getUser();
      if (!user) {
        router.replace("/login");
        return;
      }

      const { data: labProfileData } = await supabase.from("profiles").select("*").eq("id", user.id).single();
      setProfile(labProfileData ?? null);

      if (labProfileData?.role !== "lab" && labProfileData?.role !== "admin") {
        setError("This page requires a lab account.");
        return;
      }

      const { data: topupData } = await supabase
        .from("topups")
        .select("*")
        .eq("status", "pending")
        .order("created_at", { ascending: true });

      const userIds = [...new Set((topupData ?? []).map((topup) => topup.user_id))];
      const { data: customerProfileData } = userIds.length
        ? await supabase.from("profiles").select("id, email, full_name").in("id", userIds)
        : { data: [] };

      const profilesById = new Map((customerProfileData ?? []).map((item) => [item.id, item]));
      setTopups((topupData ?? []).map((topup) => ({ ...topup, profile: profilesById.get(topup.user_id) ?? null })));
    }

    load();
  }, [router, supabase]);

  useEffect(() => {
    if (!processing) return;
    const timer = window.setInterval(() => {
      setDots((current) => (current.length >= 3 ? "." : `${current}.`));
    }, 450);
    return () => window.clearInterval(timer);
  }, [processing]);

  async function logout() {
    await supabase.auth.signOut();
    router.replace("/login");
  }

  async function approveTopup(id: string) {
    setError("");
    const { error: approveError } = await supabase.rpc("approve_topup", { p_topup_id: id });
    if (approveError) {
      setError(approveError.message);
      return;
    }
    setTopups((current) => current.filter((topup) => topup.id !== id));
  }

  async function rejectTopup(id: string) {
    setError("");
    const { error: rejectError } = await supabase.rpc("reject_topup", { p_topup_id: id });
    if (rejectError) {
      setError(rejectError.message);
      return;
    }
    setTopups((current) => current.filter((topup) => topup.id !== id));
  }

  async function analyze(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmedCode = code.trim();
    if (!video || !trimmedCode) return;
    setError("");
    setMessage("");
    setResult(null);

    const { data: existingOrder, error: orderLookupError } = await supabase
      .from("orders")
      .select("id, sperm_code")
      .eq("sperm_code", trimmedCode)
      .maybeSingle();

    if (orderLookupError) {
      setError(orderLookupError.message);
      return;
    }

    if (!existingOrder) {
      setError(`Order code ${trimmedCode} was not found. Please enter an existing customer order code before processing.`);
      return;
    }

    setProcessing(true);

    const formData = new FormData();
    formData.append("video", video);
    formData.append("microns_per_pixel", microns);
    formData.append("min_track_length", "8");

    const response = await fetch("/api/analyze", { method: "POST", body: formData });
    setProcessing(false);

    if (!response.ok) {
      const data = await response.json().catch(() => ({ error: "Analysis failed" }));
      setError(data.error || "Analysis failed");
      return;
    }

    setResult(await response.json());
  }

  async function publish() {
    if (!result || !code) return;
    setError("");
    setMessage("");
    const { error: publishError } = await supabase.rpc("publish_lab_result", {
      p_sperm_code: code,
      p_video_url: null,
      p_metrics: result.metrics,
      p_clinical_band: result.band,
      p_recommendation: result.recommendation,
      p_report_text: result.report
    });

    if (publishError) {
      setError(publishError.message);
      return;
    }
    setMessage(`Result published to ${code}.`);
  }

  return (
    <main className="lab-shell">
      <header className="lab-header">
        <div>
          <div className="brand">Lab Console</div>
          <p className="muted">AI-assisted sperm video analysis and result publishing</p>
        </div>
        <div className="inline-row">
          <Link className="btn secondary" href="/lab/tracking">
            Tracking Studio
          </Link>
          <button className="btn secondary" type="button" onClick={logout} suppressHydrationWarning>
            <LogOut size={18} />
            Logout
          </button>
        </div>
      </header>

      <section className="lab-main">
        <div className="lab-title page-title">
          <div>
            <h1>Analysis workspace</h1>
            <p className="muted">Account: {profile?.email ?? "loading"}</p>
          </div>
        </div>

        {error && <p className="error">{error}</p>}
        {message && <div className="notice">{message}</div>}

        <section className="grid two">
          <form className="lab-card form" onSubmit={analyze}>
            <h2><Activity size={20} /> Video analysis</h2>
            <div className="field">
              <label htmlFor="video">Add video</label>
                <input
                  id="video"
                  className="input"
                  type="file"
                  accept="video/*"
                  onChange={(e) => setVideo(e.target.files?.[0] ?? null)}
                  required
                  suppressHydrationWarning
                />
            </div>
            <div className="grid two">
              <div className="field">
                <label htmlFor="code">Customer order code</label>
                <input
                  id="code"
                  className="input"
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  placeholder="Sperm_001"
                  required
                  suppressHydrationWarning
                />
              </div>
              <div className="field">
                <label htmlFor="microns">Microns per pixel</label>
                <input
                  id="microns"
                  className="input"
                  type="number"
                  step="0.01"
                  min="0.01"
                  value={microns}
                  onChange={(e) => setMicrons(e.target.value)}
                  suppressHydrationWarning
                />
              </div>
            </div>
            <button className="btn" type="submit" disabled={processing || !video || !code.trim()} suppressHydrationWarning>
              <Plus size={18} />
              {processing ? "Processing" : "Process video"}
            </button>
            {processing && <p className="processing">Processing{dots}</p>}
          </form>

          <div className="lab-card">
            <h2><ShieldCheck size={20} /> Pending top-ups</h2>
            {topups.length === 0 ? (
              <p className="muted">No pending top-up requests.</p>
            ) : (
              <table className="table">
                <thead>
                  <tr>
                    <th>Customer</th>
                    <th>Credits</th>
                    <th>Reference</th>
                    <th>Slip</th>
                    <th>Created</th>
                    <th>Decision</th>
                  </tr>
                </thead>
                <tbody>
                  {topups.map((topup) => (
                    <tr key={topup.id}>
                      <td>
                        <strong>{topup.profile?.email ?? "Unknown"}</strong>
                        {topup.profile?.full_name && <div className="muted">{topup.profile.full_name}</div>}
                      </td>
                      <td>{topup.amount_credits} credits</td>
                      <td>{topup.transfer_reference || <span className="muted">No reference</span>}</td>
                      <td>
                        {topup.slip_url ? (
                          <a className="btn secondary" href={topup.slip_url} target="_blank" rel="noreferrer">
                            View slip
                          </a>
                        ) : (
                          <span className="muted">No slip</span>
                        )}
                      </td>
                      <td>{new Date(topup.created_at).toLocaleString()}</td>
                      <td>
                        <div className="inline-row" style={{ justifyContent: "flex-start" }}>
                          <button className="btn" type="button" onClick={() => approveTopup(topup.id)} suppressHydrationWarning>
                            <Check size={16} />
                            Approve
                          </button>
                          <button className="btn danger" type="button" onClick={() => rejectTopup(topup.id)} suppressHydrationWarning>
                            Reject
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </section>

        {result && (
          <section className="lab-card" style={{ marginTop: 18 }}>
            <div className="inline-row">
              <div>
                <h2>{result.band}</h2>
                <p className="muted">{result.recommendation}</p>
              </div>
              <button className="btn" type="button" onClick={publish} disabled={!code} suppressHydrationWarning>
                <Send size={18} />
                Send to customer
              </button>
            </div>
            <pre style={{ whiteSpace: "pre-wrap", lineHeight: 1.7 }}>{result.report}</pre>
          </section>
        )}
      </section>
    </main>
  );
}
