"use client";

import { useState } from "react";

/**
 * "Here is your link" — the panel a seller is actually looking for.
 *
 * ── It tells them the truth about what they have ─────────────────────────
 * The link always works. Whether it wears THEIR branding or the
 * marketplace's is a grant the admin makes (Store.ownSite), and a seller
 * who has not been given it needs to know that plainly rather than sharing
 * a link expecting their own shopfront and getting the mall's header.
 */
export default function StoreLinkPanel({
  slug,
  storeName,
  rootDomain,
  ownSite,
}: {
  slug: string;
  storeName: string;
  rootDomain: string;
  /** Whether the marketplace has granted this shop its own branded page. */
  ownSite: boolean;
}) {
  const [copied, setCopied] = useState<"yes" | "failed" | null>(null);

  const path = `/store/${slug}`;
  const url = `${rootDomain}${path}`;

  async function copy() {
    try {
      await navigator.clipboard.writeText(`https://${url}`);
      setCopied("yes");
    } catch {
      // Blocked on insecure origins and in some in-app browsers. The
      // address is on screen and selectable either way.
      setCopied("failed");
    }
    setTimeout(() => setCopied(null), 2200);
  }

  return (
    <div className="space-y-3">
      <div className="rounded-2xl border-2 border-ocean-200 bg-ocean-50/40 p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-xs font-bold uppercase tracking-wide text-slate-500">
            Your shop link
          </p>
          <button
            type="button"
            onClick={copy}
            className="rounded-full bg-white px-3 py-1 text-xs font-bold text-ocean-700 ring-1 ring-sand-200 transition hover:bg-ocean-50"
          >
            {copied === "yes" ? "✓ Copied" : copied === "failed" ? "Copy failed" : "Copy"}
          </button>
        </div>

        <p className="mt-1.5 select-all break-all font-mono text-sm font-bold text-ocean-950">
          {url}
        </p>
        <p className="mt-1 text-xs text-slate-500">
          Put it in your bio, on your packaging, anywhere you like.
        </p>
      </div>

      {ownSite ? (
        <p className="rounded-xl bg-emerald-50 px-4 py-3 text-xs text-emerald-900">
          ✓ <strong>This is your own website.</strong> It shows your logo and
          your name, with no marketplace menu and no other shops on it — the
          basket, checkout and delivery are the same ones you already use, so
          orders reach you exactly as they do now.
        </p>
      ) : (
        <p className="rounded-xl bg-sand-100 px-4 py-3 text-xs text-slate-600">
          Right now this opens as a normal Banaadir Mall store page, with the
          marketplace menu across the top. Ask us to switch on{" "}
          <strong>your own branded website</strong> and the same link shows
          your logo and your name instead, with nothing else on it.
        </p>
      )}

      <div className="flex flex-wrap gap-2 pt-1">
        <a
          href={`https://wa.me/?text=${encodeURIComponent(`Shop ${storeName} online: https://${url}`)}`}
          target="_blank"
          rel="noopener noreferrer"
          className="rounded-full bg-emerald-500 px-4 py-2 text-sm font-bold text-white transition hover:bg-emerald-600"
        >
          Share on WhatsApp
        </a>
        <a
          href={path}
          target="_blank"
          rel="noopener noreferrer"
          className="rounded-full border border-sand-200 bg-white px-4 py-2 text-sm font-bold text-slate-600 transition hover:border-ocean-400 hover:text-ocean-700"
        >
          Preview it
        </a>
      </div>
    </div>
  );
}
