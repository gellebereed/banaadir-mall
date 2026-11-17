"use client";

import { useEffect, useState } from "react";
import { isStaleDeployError, reloadForNewVersion } from "@/lib/stale-deploy";

/**
 * Last resort, for an error in the root layout itself (app/error.tsx sits
 * inside it, so it cannot catch those). It replaces the whole document,
 * so it carries its own <html>/<body> and plain inline styles rather than
 * relying on the site's stylesheet having loaded. See lib/stale-deploy.ts.
 */
export default function GlobalError({
  error,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const stale = isStaleDeployError(error);
  const [reloading, setReloading] = useState(stale);

  useEffect(() => {
    console.error(error);
    if (stale && !reloadForNewVersion()) setReloading(false);
  }, [error, stale]);

  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, sans-serif",
          background: "#fbf8f3",
          color: "#0b2a3c",
          textAlign: "center",
          padding: "24px",
        }}
      >
        <div style={{ maxWidth: 420 }}>
          <div style={{ fontSize: 56 }}>{reloading ? "✨" : "🌊"}</div>
          <h1 style={{ fontSize: 24, fontWeight: 800, margin: "16px 0 8px" }}>
            {reloading ? "Updating to the latest version…" : "Something went wrong"}
          </h1>
          <p style={{ color: "#64748b", margin: 0 }}>
            {reloading
              ? "This takes a second."
              : "Banaadir Mall didn't load properly. Please try again — your cart is safe."}
          </p>
          {!reloading && (
            <button
              type="button"
              onClick={() => window.location.reload()}
              style={{
                marginTop: 24,
                padding: "12px 24px",
                borderRadius: 999,
                border: 0,
                background: "#f59e0b",
                color: "#0b2a3c",
                fontWeight: 700,
                fontSize: 15,
                cursor: "pointer",
              }}
            >
              Try again
            </button>
          )}
        </div>
      </body>
    </html>
  );
}
