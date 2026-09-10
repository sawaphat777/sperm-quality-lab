"use client";

import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { createBrowserSupabase } from "@/lib/supabase";
import type { Database } from "@/lib/types";

type Order = Database["public"]["Tables"]["orders"]["Row"];
type Result = Database["public"]["Tables"]["lab_results"]["Row"];

export default function OrderDetailPage() {
  const params = useParams<{ code: string }>();
  const supabase = createBrowserSupabase();
  const [order, setOrder] = useState<Order | null>(null);
  const [result, setResult] = useState<Result | null>(null);

  useEffect(() => {
    async function load() {
      const [{ data: orderData }, { data: resultData }] = await Promise.all([
        supabase.from("orders").select("*").eq("sperm_code", params.code).single(),
        supabase.from("lab_results").select("*").eq("sperm_code", params.code).maybeSingle()
      ]);
      setOrder(orderData ?? null);
      setResult(resultData ?? null);
    }

    load();
  }, [params.code, supabase]);

  if (!order) {
    return <div className="notice">Loading order...</div>;
  }

  return (
    <>
      <div className="page-title">
        <div>
          <h1>{order.sperm_code}</h1>
          <p className="muted">Status: <span className={`status ${order.status}`}>{order.status}</span></p>
        </div>
        {result && (
          <button className="btn secondary no-print" type="button" onClick={() => window.print()}>
            Print report
          </button>
        )}
      </div>

      <section className="grid two">
        <div className="card">
          <h2>Sample details</h2>
          <p><strong>Name:</strong> {order.patient_full_name}</p>
          <p><strong>Age:</strong> {order.age}</p>
          <p><strong>Phone:</strong> {order.phone}</p>
          <p><strong>Gmail:</strong> {order.email}</p>
        </div>
        <div className="card">
          <h2>Result</h2>
          {!result ? (
            <p className="muted">The laboratory has not published a result yet.</p>
          ) : (
            <>
              <p><strong>{result.clinical_band}</strong></p>
              <p className="muted">{result.recommendation}</p>
            </>
          )}
        </div>
      </section>

      {result && (
        <section className="card printable-report" style={{ marginTop: 18 }}>
          <h2>AI-assisted report</h2>
          <p style={{ whiteSpace: "pre-line", lineHeight: 1.7 }}>{result.report_text}</p>
        </section>
      )}
    </>
  );
}
