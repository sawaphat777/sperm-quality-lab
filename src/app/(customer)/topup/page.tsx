"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { createBrowserSupabase } from "@/lib/supabase";
import type { Database } from "@/lib/types";

type Topup = Database["public"]["Tables"]["topups"]["Row"];

export default function TopupPage() {
  const supabase = createBrowserSupabase();
  const [amount, setAmount] = useState("500");
  const [reference, setReference] = useState("");
  const [slip, setSlip] = useState<File | null>(null);
  const [topups, setTopups] = useState<Topup[]>([]);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const hasPendingTopup = topups.some((topup) => topup.status === "pending");

  const load = useCallback(async () => {
    const {
      data: { user }
    } = await supabase.auth.getUser();
    if (!user) return;
    const { data } = await supabase.from("topups").select("*").eq("user_id", user.id).order("created_at", { ascending: false });
    setTopups(data ?? []);
  }, [supabase]);

  useEffect(() => {
    load();
  }, [load]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting || hasPendingTopup) return;

    setSubmitting(true);
    setError("");
    setMessage("");

    const {
      data: { user }
    } = await supabase.auth.getUser();
    if (!user) {
      setSubmitting(false);
      return;
    }

    let slipUrl: string | null = null;
    if (slip) {
      const path = `${user.id}/${Date.now()}-${slip.name}`;
      const { error: uploadError } = await supabase.storage.from("topup-slips").upload(path, slip, { upsert: false });
      if (uploadError) {
        setError(uploadError.message);
        setSubmitting(false);
        return;
      }
      const { data } = supabase.storage.from("topup-slips").getPublicUrl(path);
      slipUrl = data.publicUrl;
    }

    const { error: insertError } = await supabase.from("topups").insert({
      user_id: user.id,
      amount_credits: Number(amount),
      transfer_reference: reference || null,
      slip_url: slipUrl,
      status: "pending"
    });

    if (insertError) {
      setError(insertError.message.includes("duplicate") ? "You already have a pending top-up request. Please wait for lab review." : insertError.message);
      setSubmitting(false);
      return;
    }

    setMessage("Top-up request submitted. Credit will be added after lab approval.");
    setReference("");
    setSlip(null);
    await load();
    setSubmitting(false);
  }

  return (
    <>
      <div className="page-title">
        <div>
          <h1>Top up</h1>
          <p className="muted">Transfer manually and upload proof. This keeps the payment flow free to operate.</p>
        </div>
      </div>

      <section className="grid two">
        <div className="card">
          <h2>Transfer details</h2>
          <p><strong>Bank:</strong> {process.env.NEXT_PUBLIC_BANK_NAME}</p>
          <p><strong>Account name:</strong> {process.env.NEXT_PUBLIC_BANK_ACCOUNT_NAME}</p>
          <p><strong>Account number:</strong> {process.env.NEXT_PUBLIC_BANK_ACCOUNT_NUMBER}</p>
          <p><strong>PromptPay:</strong> {process.env.NEXT_PUBLIC_PROMPTPAY_ID}</p>
        </div>

        <form className="card form" onSubmit={submit}>
          {hasPendingTopup && (
            <div className="notice">
              You already have a pending top-up request. Please wait for lab approval before submitting another one.
            </div>
          )}
          <div className="field">
            <label htmlFor="amount">Credits</label>
            <input
              id="amount"
              className="input"
              type="number"
              min="100"
              step="100"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              disabled={submitting || hasPendingTopup}
              required
            />
          </div>
          <div className="field">
            <label htmlFor="reference">Transfer reference</label>
            <input
              id="reference"
              className="input"
              value={reference}
              onChange={(e) => setReference(e.target.value)}
              disabled={submitting || hasPendingTopup}
            />
          </div>
          <div className="field">
            <label htmlFor="slip">Payment slip</label>
            <input
              id="slip"
              className="input"
              type="file"
              accept="image/*,application/pdf"
              onChange={(e) => setSlip(e.target.files?.[0] ?? null)}
              disabled={submitting || hasPendingTopup}
              required
            />
          </div>
          {message && <div className="notice">{message}</div>}
          {error && <p className="error">{error}</p>}
          <button className="btn" type="submit" disabled={submitting || hasPendingTopup}>
            {submitting ? "Submitting..." : "Submit top-up"}
          </button>
        </form>
      </section>

      <section className="card" style={{ marginTop: 18 }}>
        <h2>Top-up history</h2>
        {topups.length === 0 ? (
          <p className="muted">No top-up requests yet.</p>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>Credits</th>
                <th>Status</th>
                <th>Created</th>
              </tr>
            </thead>
            <tbody>
              {topups.map((topup) => (
                <tr key={topup.id}>
                  <td>{topup.amount_credits}</td>
                  <td><span className={`status ${topup.status}`}>{topup.status}</span></td>
                  <td>{new Date(topup.created_at).toLocaleDateString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </>
  );
}
