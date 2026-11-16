"use client";

import { useEffect } from "react";

/**
 * Last-resort fallback for client errors in the root layout.
 * Never display exception messages or stack traces to shoppers.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[Banaadir Mall] Unhandled render error", error);
  }, [error]);

  return (
    <html lang="en">
      <body style={{ margin: 0, fontFamily: "system-ui, sans-serif", background: "#f8fafc", color: "#123746" }}>
        <main style={{ maxWidth: 480, margin: "16vh auto", padding: "24px", textAlign: "center" }}>
          <h1 style={{ fontSize: 26 }}>Something went wrong</h1>
          <p>We couldn't load this page. Please try again.</p>
          <div style={{ display: "flex", gap: 12, justifyContent: "center", marginTop: 24 }}>
            <button type="button" onClick={reset} style={{ padding: "12px 20px", cursor: "pointer" }}>
              Try again
            </button>
            <button type="button" onClick={() => window.location.reload()} style={{ padding: "12px 20px", cursor: "pointer" }}>
              Reload page
            </button>
          </div>
          {error.digest && <p style={{ fontSize: 12, opacity: 0.65 }}>Reference: {error.digest}</p>}
        </main>
      </body>
    </html>
  );
}
