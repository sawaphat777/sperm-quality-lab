export function AuthShell({ children }: { children: React.ReactNode }) {
  return (
    <main className="auth-shell">
      <section className="auth-visual">
        <h1>Sperm Quality Lab</h1>
        <p>
          Secure sample ordering, credit-based payment, and AI-assisted semen video analysis with laboratory review.
        </p>
      </section>
      <section className="auth-panel">
        <div className="auth-card">{children}</div>
      </section>
    </main>
  );
}
