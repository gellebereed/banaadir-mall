"use client";

import { useState } from "react";

/**
 * "Here is your website" — the panel a seller is actually looking for.
 *
 * ── Both addresses, honestly labelled ────────────────────────────────────
 * The subdomain is the one worth printing on a box, and it only works once
 * a wildcard DNS record exists. The path link works today, on any
 * deployment, with no setup at all. Showing only the pretty one would hand
 * sellers a link that 404s until an infrastructure change nobody told them
 * about; showing only the plain one undersells what they have.
 */
export default function StoreLinkPanel({
  slug,
  storeName,
  rootDomain,
}: {
  slug: string;
  storeName: string;
  rootDomain: string;
}) {
  const [copied, setCopied] = useState<string | null>(null);

  const subdomain = `${slug}.${rootDomain}`;
  const pathUrl = `${rootDomain}/store/${slug}`;

  async function copy(text: string, id: string) {
    try {
      await navigator.clipboard.writeText(`https://${text}`);
      setCopied(id);
      setTimeout(() => setCopied(null), 2000);
    } catch {
      // Clipboard is blocked on insecure origins and in some in-app
      // browsers. The address is on screen and selectable either way.
      setCopied("failed");
      setTimeout(() => setCopied(null), 2500);
    }
  }

  const share = `Shop ${storeName} online: https://${subdomain}`;

  return (
    <div className="space-y-3">
      {[
        {
          id: "sub",
          url: subdomain,
          label: "Your own address",
          note: "The one to print on your packaging and put in your bio.",
          primary: true,
        },
        {
          id: "path",
          url: pathUrl,
          label: "Works right now",
          note: "No setup needed — use this one until the address above is live.",
          primary: false,
        },
      ].map((link) => (
        <div
          key={link.id}
          className={`rounded-2xl border-2 p-4 ${
            link.primary ? "border-ocean-200 bg-ocean-50/40" : "border-sand-200 bg-white"
          }`}
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs font-bold uppercase tracking-wide text-slate-500">
              {link.label}
            </p>
            <button
              type="button"
              onClick={() => copy(link.url, link.id)}
              className="rounded-full bg-white px-3 py-1 text-xs font-bold text-ocean-700 ring-1 ring-sand-200 transition hover:bg-ocean-50"
            >
              {copied === link.id ? "✓ Copied" : copied === "failed" ? "Copy failed" : "Copy"}
            </button>
          </div>

          <p className="mt-1.5 select-all break-all font-mono text-sm font-bold text-ocean-950">
            {link.url}
          </p>
          <p className="mt-1 text-xs text-slate-500">{link.note}</p>
        </div>
      ))}

      <div className="flex flex-wrap gap-2 pt-1">
        <a
          href={`https://wa.me/?text=${encodeURIComponent(share)}`}
          target="_blank"
          rel="noopener noreferrer"
          className="rounded-full bg-emerald-500 px-4 py-2 text-sm font-bold text-white transition hover:bg-emerald-600"
        >
          Share on WhatsApp
        </a>
        <a
          href={`https://${pathUrl}`}
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
