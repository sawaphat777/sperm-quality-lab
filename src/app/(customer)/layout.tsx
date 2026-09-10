import { CustomerShell } from "@/components/CustomerShell";
import { RequireSession } from "@/components/RequireSession";

export default function CustomerLayout({ children }: { children: React.ReactNode }) {
  return (
    <RequireSession>
      <CustomerShell>{children}</CustomerShell>
    </RequireSession>
  );
}
