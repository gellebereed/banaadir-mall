"use client";

import { useEffect, useRef, useState } from "react";

/**
 * SHARE A CAMPAIGN — the shop owner's version of ShareButton.
 *
 * A shopper sharing a product wants one tap and is done, which is what
 * components/ShareButton.tsx gives them. A shop owner sharing their sale is
 * doing marketing: they want to see the picture people will get, adjust
 * the words that go with it, post it in several places one after another,
 * and save the picture for Instagram and TikTok, which take no links from
 * a web page. So this opens a panel instead of a menu, and stays open.
 *
 * The preview picture is the campaign's link-preview card
 * (app/campaign/[id]/card), the same image WhatsApp and Facebook fetch —
 * what the owner sees here is exactly what their customers will see.
 */
export default function CampaignShareButton({
  path,
  cardPath,
  title,
  caption,
  label = "Share",
  variant = "subtle",
}: {
  /** Site path of the campaign page, e.g. "/campaign/promo-abc". */
  path: string;
  /** Site path of its preview card. */
  cardPath: string;
  title: string;
  /** Suggested words to post with the link; the owner can edit them. */
  caption: string;
  label?: string;
  variant?: "primary" | "subtle";
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={
          variant === "primary"
            ? "inline-flex items-center gap-2 rounded-full bg-mango-500 px-4 py-2 text-sm font-bold text-ocean-950 shadow-sm transition hover:bg-mango-400"
            : "inline-flex items-center gap-1.5 rounded-full bg-ocean-50 px-3 py-1.5 text-xs font-bold text-ocean-800 ring-1 ring-ocean-100 transition hover:bg-ocean-100"
        }
      >
        <ShareIcon className={variant === "primary" ? "h-4 w-4" : "h-3.5 w-3.5"} />
        {label}
      </button>
      {open && <SharePanel path={path} cardPath={cardPath} title={title} caption={caption} onClose={() => setOpen(false)} />}
    </>
  );
}

function SharePanel({
  path,
  cardPath,
  title,
  caption: suggested,
  onClose,
}: {
  path: string;
  cardPath: string;
  title: string;
  caption: string;
  onClose: () => void;
}) {
  const [caption, setCaption] = useState(suggested);
  const [copied, setCopied] = useState<"link" | "post" | null>(null);
  const [cardLoaded, setCardLoaded] = useState(false);
  const [canNativeShare, setCanNativeShare] = useState(false);
  const panel = useRef<HTMLDivElement>(null);
  // Known only in the browser; the server-rendered markup has no origin.
  const [origin, setOrigin] = useState("");

  useEffect(() => {
    setOrigin(window.location.origin);
    setCanNativeShare(typeof navigator.share === "function");
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    // The page behind must not scroll while the panel is up on a phone.
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    panel.current?.focus();
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = overflow;
    };
  }, [onClose]);

  const url = `${origin}${path}`;
  const post = `${caption.trim()}\n${url}`;

  const copy = async (what: "link" | "post") => {
    const text = what === "link" ? url : post;
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      window.prompt("Copy this:", text);
    }
    setCopied(what);
    setTimeout(() => setCopied(null), 1600);
  };

  const nativeShare = async () => {
    try {
      await navigator.share({ title, text: caption.trim(), url });
    } catch {
      // Closing the share sheet is not an error worth a message.
    }
  };

  const u = encodeURIComponent(url);
  const c = encodeURIComponent(caption.trim());
  const targets = [
    { label: "WhatsApp", color: "#25D366", glyph: "W", href: `https://wa.me/?text=${encodeURIComponent(post)}` },
    { label: "Facebook", color: "#1877F2", glyph: "f", href: `https://www.facebook.com/sharer/sharer.php?u=${u}` },
    { label: "Telegram", color: "#229ED9", glyph: "T", href: `https://t.me/share/url?url=${u}&text=${c}` },
    { label: "X", color: "#111827", glyph: "X", href: `https://twitter.com/intent/tweet?url=${u}&text=${c}` },
  ];

  return (
    <div
      className="fixed inset-0 z-[60] flex items-end justify-center bg-ocean-950/60 backdrop-blur-sm sm:items-center sm:p-6"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        ref={panel}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label={`Share ${title}`}
        className="animate-fade-up max-h-[92vh] w-full max-w-lg overflow-y-auto rounded-t-3xl bg-white p-5 shadow-2xl outline-none sm:rounded-3xl sm:p-6"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[11px] font-bold uppercase tracking-wide text-mango-600">Share your campaign</p>
            <h3 className="mt-0.5 truncate font-display text-lg font-extrabold text-ocean-950">{title}</h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-sand-100 text-slate-500 transition hover:bg-sand-200 hover:text-slate-800"
          >
            ✕
          </button>
        </div>

        {/* What people will see */}
        <div className="mt-4 overflow-hidden rounded-2xl ring-1 ring-sand-200">
          <div className={`relative aspect-[1200/630] w-full bg-sand-100 ${cardLoaded ? "" : "animate-pulse"}`}>
            {/* eslint-disable-next-line @next/next/no-img-element -- a generated PNG, already the exact size */}
            <img
              src={cardPath}
              alt="The picture shown with your link"
              onLoad={() => setCardLoaded(true)}
              className={`absolute inset-0 h-full w-full object-cover transition-opacity ${cardLoaded ? "opacity-100" : "opacity-0"}`}
            />
          </div>
          <div className="flex items-center justify-between gap-3 bg-sand-50 px-3 py-2">
            <p className="truncate text-[11px] text-slate-500">This picture appears with your link on WhatsApp, Facebook and more.</p>
            <a
              href={cardPath}
              download="banaadir-campaign.png"
              className="shrink-0 text-[11px] font-bold text-ocean-700 hover:underline"
            >
              ⬇ Save picture
            </a>
          </div>
        </div>

        {/* The link */}
        <label className="label mt-4" htmlFor="share-link">
          Campaign link
        </label>
        <div className="flex gap-2">
          <input id="share-link" readOnly value={url} onFocus={(e) => e.currentTarget.select()} className="input min-w-0 flex-1 !text-xs" />
          <button type="button" onClick={() => copy("link")} className="btn-primary shrink-0 !px-4 !py-2 text-sm">
            {copied === "link" ? "✓ Copied" : "Copy"}
          </button>
        </div>

        {/* The words */}
        <label className="label mt-4" htmlFor="share-caption">
          Message <span className="font-normal text-slate-400">(edit it to sound like you)</span>
        </label>
        <textarea
          id="share-caption"
          rows={3}
          value={caption}
          onChange={(e) => setCaption(e.target.value)}
          className="input resize-none text-sm"
        />

        <div className="mt-4 grid grid-cols-4 gap-2">
          {targets.map((t) => (
            <a
              key={t.label}
              href={t.href}
              target="_blank"
              rel="noopener noreferrer"
              className="flex flex-col items-center gap-1.5 rounded-2xl px-1 py-3 text-[11px] font-bold text-slate-600 ring-1 ring-sand-200 transition hover:bg-sand-50 hover:ring-ocean-200"
            >
              <span
                aria-hidden
                style={{ background: t.color }}
                className="flex h-9 w-9 items-center justify-center rounded-full text-sm font-extrabold text-white"
              >
                {t.glyph}
              </span>
              {t.label}
            </a>
          ))}
        </div>

        <div className="mt-2 grid gap-2 sm:grid-cols-2">
          <button
            type="button"
            onClick={() => copy("post")}
            className="rounded-2xl bg-sand-50 px-3 py-2.5 text-xs font-bold text-slate-700 ring-1 ring-sand-200 transition hover:bg-sand-100"
          >
            {copied === "post" ? "✓ Message and link copied" : "📋 Copy message + link"}
          </button>
          {canNativeShare ? (
            <button
              type="button"
              onClick={nativeShare}
              className="rounded-2xl bg-ocean-950 px-3 py-2.5 text-xs font-bold text-white transition hover:bg-ocean-800"
            >
              More apps…
            </button>
          ) : (
            <a
              href={path}
              target="_blank"
              rel="noopener noreferrer"
              className="rounded-2xl bg-ocean-950 px-3 py-2.5 text-center text-xs font-bold text-white transition hover:bg-ocean-800"
            >
              Open the campaign page ↗
            </a>
          )}
        </div>
        <p className="mt-3 text-[11px] leading-relaxed text-slate-400">
          Instagram and TikTok: save the picture, post it, and paste the copied link in your bio or story link.
        </p>
      </div>
    </div>
  );
}

function ShareIcon({ className }: { className: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <circle cx="18" cy="5" r="3" />
      <circle cx="6" cy="12" r="3" />
      <circle cx="18" cy="19" r="3" />
      <path d="m8.6 13.5 6.8 4M15.4 6.5l-6.8 4" />
    </svg>
  );
}
