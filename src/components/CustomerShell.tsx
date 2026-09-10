"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Home, ListOrdered, LogOut, Plus, ReceiptText, UserRound } from "lucide-react";
import { createBrowserSupabase } from "@/lib/supabase";

const nav = [
  { href: "/home", label: "Home", icon: Home },
  { href: "/orders", label: "Your Orders", icon: ListOrdered },
  { href: "/topup", label: "Top Up", icon: ReceiptText },
  { href: "/profile", label: "Profile", icon: UserRound }
];

export function CustomerShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const supabase = createBrowserSupabase();

  async function logout() {
    await supabase.auth.signOut();
    router.replace("/login");
  }

  return (
    <main className="app-shell">
      <aside className="sidebar">
        <div className="brand">Sperm Quality Lab</div>
        <nav className="nav" aria-label="Customer navigation">
          {nav.map((item) => {
            const Icon = item.icon;
            return (
              <Link key={item.href} href={item.href} className={pathname === item.href ? "active" : ""}>
                <Icon size={18} />
                {item.label}
              </Link>
            );
          })}
          <Link href="/new-order">
            <Plus size={18} />
            New Order
          </Link>
          <button type="button" onClick={logout}>
            <LogOut size={18} />
            Logout
          </button>
        </nav>
      </aside>
      <section className="main">{children}</section>
    </main>
  );
}
