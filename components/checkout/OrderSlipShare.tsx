"use client";

import { useState } from "react";

/**
 * ─────────────────────────────────────────────────────────────────────────
 *  SHARE THE PICKING SLIP AS AN IMAGE.
 * ─────────────────────────────────────────────────────────────────────────
 * The honest position on "send an image instead of text": a WhatsApp
 * click-to-chat link can only carry text. Nothing in the URL format lets a
 * web page attach a photo to a chat — that needs either the WhatsApp
 * Business API (an approved sender and message templates) or the phone's
 * own share sheet.
 *
 * This is the share sheet. On a phone, `navigator.share` with a file hands
 * the PNG straight to WhatsApp, where it arrives as a real image the vendor
 * can zoom, forward and keep in the chat's media. On a desktop browser that
 * cannot share files, it downloads instead, which is what a shop printing
 * picking slips wants anyway.
 *
 * The text message is still sent alongside, and that is deliberate: an
 * image cannot be searched, copied, or read aloud by a screen reader, and
 * it is useless on a slow connection until it downloads.
 * ─────────────────────────────────────────────────────────────────────────
 */
export default function OrderSlipShare({
  orderId,
  storeName,
  className = "",
}: {
  orderId: string;
  storeName: string;
  className?: string;
}) {
  const [state, setState] = useState<"idle" | "working" | "shared" | "downloaded" | "error">(
    "idle",
  );

  const slipUrl = `/api/order-slip/${encodeURIComponent(orderId)}`;

  async function handleShare() {
    setState("working");
    try {
      const response = await fetch(slipUrl);
      if (!response.ok) throw new Error(`Slip unavailable (${response.status})`);

      const blob = await response.blob();
      const file = new File([blob], `${orderId}-picking-slip.png`, { type: "image/png" });

      // Feature-detect with canShare({files}) rather than just `share` —
      // desktop Chrome has navigator.share but rejects files, which would
      // otherwise fail *after* the user has already tapped.
      if (navigator.canShare?.({ files: [file] })) {
        await navigator.share({
          files: [file],
          title: `Order ${orderId}`,
          text: `New order for ${storeName} — ${orderId}`,
        });
        setState("shared");
        return;
      }

      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = file.name;
      link.click();
      URL.revokeObjectURL(url);
      setState("downloaded");
    } catch (error) {
      // A cancelled share sheet is not a failure — the user changed their
      // mind, and showing them an error for that is just noise.
      if (error instanceof DOMException && error.name === "AbortError") {
        setState("idle");
        return;
      }
      console.error("[OrderSlipShare]", error);
      setState("error");
    }
  }

  const label =
    state === "working"
      ? "Preparing slip…"
      : state === "shared"
        ? "✓ Slip shared"
        : state === "downloaded"
          ? "✓ Slip downloaded"
          : state === "error"
            ? "Couldn't build the slip — try again"
            : "🧾 Send as image";

  return (
    <div className={className}>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={handleShare}
          disabled={state === "working"}
          className="flex-1 rounded-xl border-2 border-emerald-600 px-4 py-2.5 text-sm font-bold text-emerald-700 transition hover:bg-emerald-600 hover:text-white disabled:opacity-60"
        >
          {label}
        </button>
        <a
          href={slipUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="rounded-xl border border-sand-200 px-3 py-2.5 text-sm font-semibold text-slate-600 transition hover:bg-sand-100"
        >
          Preview
        </a>
      </div>
      <p className="mt-1.5 text-[11px] leading-relaxed text-slate-500">
        On a phone this opens your share sheet, so the slip lands in the chat
        as a real photo. On a computer it downloads instead.
      </p>
    </div>
  );
}
