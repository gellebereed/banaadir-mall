"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Share a product. On phones this opens the phone's own share sheet, which
 * already lists WhatsApp, Messenger, SMS and the rest; on a computer (or a
 * browser without one) a small menu offers the usual places plus "Copy
 * link". The link preview — photo, name, price — comes from the product
 * page's Open Graph tags (app/product/[slug]/opengraph-image.tsx).
 */
export default function ShareButton({ slug, name, price }: { slug: string; name: string; price: string }) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent | KeyboardEvent) => {
      if (e instanceof KeyboardEvent ? e.key === "Escape" : !box.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", close);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", close);
    };
  }, [open]);

  const url = () => `${window.location.origin}/product/${slug}`;
  const text = `${name} — ${price} on Banaadir Mall`;

  const share = async () => {
    if (typeof navigator.share === "function") {
      try {
        await navigator.share({ title: name, text, url: url() });
        return;
      } catch (err) {
        // Closing the sheet is not an error; anything else falls back to the menu.
        if ((err as Error).name === "AbortError") return;
      }
    }
    setOpen((v) => !v);
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url());
    } catch {
      window.prompt("Copy this link:", url());
    }
    setCopied(true);
    setTimeout(() => {
      setCopied(false);
      setOpen(false);
    }, 1400);
  };

  const targets = () => {
    const u = encodeURIComponent(url());
    const t = encodeURIComponent(text);
    return [
      { label: "WhatsApp", icon: "W", color: "#25D366", href: `https://wa.me/?text=${encodeURIComponent(`${text}\n${url()}`)}` },
      { label: "Facebook", icon: "f", color: "#1877F2", href: `https://www.facebook.com/sharer/sharer.php?u=${u}` },
      { label: "Telegram", icon: "T", color: "#229ED9", href: `https://t.me/share/url?url=${u}&text=${t}` },
      { label: "X", icon: "X", color: "#111827", href: `https://twitter.com/intent/tweet?url=${u}&text=${t}` },
    ];
  };

  return (
    <div ref={box} className="relative shrink-0">
      <button
        type="button"
        aria-label="Share this product"
        aria-expanded={open}
        title="Share"
        onClick={share}
        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border-2 border-sand-200 bg-white text-slate-500 transition hover:border-ocean-600 hover:text-ocean-700"
      >
        <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <circle cx="18" cy="5" r="3" />
          <circle cx="6" cy="12" r="3" />
          <circle cx="18" cy="19" r="3" />
          <path d="m8.6 13.5 6.8 4M15.4 6.5l-6.8 4" />
        </svg>
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 top-12 z-30 w-52 rounded-2xl bg-white p-2 shadow-xl ring-1 ring-sand-200"
        >
          <p className="px-3 pb-1 pt-1.5 text-[11px] font-bold uppercase tracking-wide text-slate-400">Share</p>
          {targets().map((t) => (
            <a
              key={t.label}
              role="menuitem"
              href={t.href}
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => setOpen(false)}
              className="flex items-center gap-3 rounded-xl px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-sand-50"
            >
              <span
                aria-hidden
                style={{ background: t.color }}
                className="flex h-6 w-6 items-center justify-center rounded-full text-xs font-extrabold text-white"
              >
                {t.icon}
              </span>
              {t.label}
            </a>
          ))}
          <button
            type="button"
            role="menuitem"
            onClick={copy}
            className="flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left text-sm font-semibold text-slate-700 hover:bg-sand-50"
          >
            <span aria-hidden className="flex h-6 w-6 items-center justify-center rounded-full bg-sand-100 text-xs">
              🔗
            </span>
            {copied ? "✓ Link copied" : "Copy link"}
          </button>
        </div>
      )}
    </div>
  );
}
