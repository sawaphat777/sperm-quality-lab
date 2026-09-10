"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { createBrowserSupabase } from "@/lib/supabase";
import type { Database } from "@/lib/types";

type Order = Database["public"]["Tables"]["orders"]["Row"];

export default function OrdersPage() {
  const supabase = createBrowserSupabase();
  const [orders, setOrders] = useState<Order[]>([]);

  useEffect(() => {
    async function load() {
      const {
        data: { user }
      } = await supabase.auth.getUser();
      if (!user) return;
      const { data } = await supabase.from("orders").select("*").eq("user_id", user.id).order("created_at", { ascending: false });
      setOrders(data ?? []);
    }

    load();
  }, [supabase]);

  return (
    <>
      <div className="page-title">
        <div>
          <h1>Your orders</h1>
          <p className="muted">Every account shares the same global Sperm_001 sequence.</p>
        </div>
        <Link className="btn" href="/new-order">
          New order
        </Link>
      </div>
      <div className="card">
        {orders.length === 0 ? (
          <p className="muted">No orders yet.</p>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>Code</th>
                <th>Name</th>
                <th>Status</th>
                <th>Created</th>
              </tr>
            </thead>
            <tbody>
              {orders.map((order) => (
                <tr key={order.id}>
                  <td>
                    <Link href={`/orders/${order.sperm_code}`}>{order.sperm_code}</Link>
                  </td>
                  <td>{order.patient_full_name}</td>
                  <td>
                    <span className={`status ${order.status}`}>{order.status}</span>
                  </td>
                  <td>{new Date(order.created_at).toLocaleDateString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}
