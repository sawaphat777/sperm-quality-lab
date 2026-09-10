"use client";

import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useState } from "react";
import { createBrowserSupabase } from "@/lib/supabase";

export default function NewOrderPage() {
  const router = useRouter();
  const supabase = createBrowserSupabase();
  const [form, setForm] = useState({
    fullName: "",
    nickname: "",
    dateOfBirth: "",
    age: "",
    phone: "",
    email: ""
  });
  const [credit, setCredit] = useState<number | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    async function loadDefaults() {
      const {
        data: { user }
      } = await supabase.auth.getUser();
      if (!user) return;
      const { data } = await supabase.from("profiles").select("*").eq("id", user.id).single();
      setCredit(data?.credit_balance ?? 0);
      setForm((current) => ({
        ...current,
        fullName: data?.full_name ?? "",
        nickname: data?.nickname ?? "",
        phone: data?.phone ?? "",
        email: user.email ?? ""
      }));
    }

    loadDefaults();
  }, [supabase]);

  function update(name: keyof typeof form, value: string) {
    setForm((current) => ({ ...current, [name]: value }));
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setLoading(true);

    const { data, error: orderError } = await supabase.rpc("create_order", {
      p_full_name: form.fullName,
      p_nickname: form.nickname || null,
      p_date_of_birth: form.dateOfBirth,
      p_age: Number(form.age),
      p_phone: form.phone,
      p_email: form.email
    });

    setLoading(false);

    if (orderError) {
      setError(orderError.message);
      return;
    }

    router.replace(`/orders/${data.sperm_code}`);
  }

  return (
    <>
      <div className="page-title">
        <div>
          <h1>New order</h1>
          <p className="muted">Creating an order deducts 100 credits from your balance.</p>
        </div>
      </div>

      <div className="grid two">
        <form className="card form" onSubmit={submit}>
          <div className="grid two">
            <div className="field">
              <label htmlFor="fullName">Full name</label>
              <input id="fullName" className="input" value={form.fullName} onChange={(e) => update("fullName", e.target.value)} required />
            </div>
            <div className="field">
              <label htmlFor="nickname">Nickname</label>
              <input id="nickname" className="input" value={form.nickname} onChange={(e) => update("nickname", e.target.value)} />
            </div>
          </div>
          <div className="grid two">
            <div className="field">
              <label htmlFor="dateOfBirth">Date of birth</label>
              <input
                id="dateOfBirth"
                className="input"
                type="date"
                value={form.dateOfBirth}
                onChange={(e) => update("dateOfBirth", e.target.value)}
                required
              />
            </div>
            <div className="field">
              <label htmlFor="age">Age</label>
              <input id="age" className="input" type="number" min="1" max="120" value={form.age} onChange={(e) => update("age", e.target.value)} required />
            </div>
          </div>
          <div className="field">
            <label htmlFor="phone">Phone</label>
            <input id="phone" className="input" value={form.phone} onChange={(e) => update("phone", e.target.value)} required />
          </div>
          <div className="field">
            <label htmlFor="email">Gmail</label>
            <input id="email" className="input" type="email" value={form.email} onChange={(e) => update("email", e.target.value)} required />
          </div>
          {error && <p className="error">{error}</p>}
          <button className="btn" type="submit" disabled={loading || (credit ?? 0) < 100}>
            {loading ? "Submitting..." : "Submit order"}
          </button>
        </form>

        <aside className="card">
          <h2>Credit check</h2>
          <p className="muted">Current balance</p>
          <div className="stat">
            <strong>{credit ?? "..."}</strong>
            <span className="muted">credits available</span>
          </div>
          {(credit ?? 0) < 100 && <p className="error">Please top up before creating an order.</p>}
        </aside>
      </div>
    </>
  );
}
