"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Plus } from "lucide-react";
import { createBrowserSupabase } from "@/lib/supabase";
import type { Database } from "@/lib/types";

type Profile = Database["public"]["Tables"]["profiles"]["Row"];
type Order = Database["public"]["Tables"]["orders"]["Row"];

export default function HomePage() {
  const supabase = createBrowserSupabase();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [orders, setOrders] = useState<Order[]>([]);

  useEffect(() => {
    async function load() {
      const {
        data: { user }
      } = await supabase.auth.getUser();
      if (!user) return;

      const [{ data: profileData }, { data: orderData }] = await Promise.all([
        supabase.from("profiles").select("*").eq("id", user.id).single(),
        supabase.from("orders").select("*").eq("user_id", user.id).order("created_at", { ascending: false }).limit(5)
      ]);

      setProfile(profileData ?? null);
      setOrders(orderData ?? []);
    }

    load();
  }, [supabase]);

  return (
    <>
      <div className="page-title">
        <div>
          <h1>Home</h1>
          <p className="muted">Manage your samples, credits, and results.</p>
        </div>
        <Link className="btn icon" href="/new-order" title="New order" aria-label="New order">
          <Plus size={22} />
        </Link>
      </div>

      <section className="grid three">
        <div className="card stat">
          <span className="muted">Credit balance</span>
          <strong>{profile?.credit_balance ?? 0}</strong>
          <Link href="/topup">Top up credit</Link>
        </div>
        <div className="card stat">
          <span className="muted">Orders</span>
          <strong>{orders.length}</strong>
          <Link href="/orders">View all orders</Link>
        </div>
        <div className="card stat">
          <span className="muted">Order price</span>
          <strong>100</strong>
          <span className="muted">credits per analysis</span>
        </div>
      </section>

      <section className="grid two" style={{ marginTop: 18 }}>
        <div className="card">
          <h2>Lab address</h2>
          <p className="muted">
            Sperm Quality Lab, 12 Health Science Road, Bangkok, Thailand 10110
          </p>
          <p className="muted">
            Place the sample container in a sealed secondary bag and include your order code on the package label.
          </p>
        </div>
        <div className="card">
          <h2>Recent orders</h2>
          {orders.length === 0 ? (
            <p className="muted">No orders yet.</p>
          ) : (
            <table className="table">
              <tbody>
                {orders.map((order) => (
                  <tr key={order.id}>
                    <td>
                      <Link href={`/orders/${order.sperm_code}`}>{order.sperm_code}</Link>
                    </td>
                    <td>
                      <span className={`status ${order.status}`}>{order.status}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </section>
    </>
  );
}
