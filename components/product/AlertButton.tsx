"use client";

import { useEffect, useState, useTransition } from "react";
import { subscribeAlert } from "@/app/alert-actions";
import { useT } from "@/components/prefs/PrefsProvider";
import type { AlertKind } from "@/lib/alert-utils";
import type { MessageKey } from "@/lib/i18n";

/** Remembered in this browser, so the second sign-up is one tap. */
const PHONE_KEY = "banaadir_alert_phone";

/**
 * "🔔 Tell me on WhatsApp" — under the buy buttons.
 *
 * Which thing they will be told is the product's state, not a choice
 * (lib/alert-utils#alertKindFor): on a sold-out page the button is the only
 * useful action there is, so it is drawn as one; on a page they could buy
 * from today it stays a quiet text link, because the main thing to do
 * there is buy.
 *
 * It asks for a number and nothing else. No account, no email, no name —
 * every extra field is a reason not to bother, and the number is all a
 * WhatsApp message needs.
 */
export default function AlertButton({ productId, kind }: { productId: string; kind: AlertKind }) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const [phone, setPhone] = useState("");
  const [done, setDone] = useState(false);
  const [error, setError] = useState<MessageKey | null>(null);
  const [pending, start] = useTransition();

  useEffect(() => {
    try {
      setPhone(window.localStorage.getItem(PHONE_KEY) ?? "");
    } catch {
      // Private browsing: they type it.
    }
  }, []);

  // A different product (or the same one changing state) is a new question.
  useEffect(() => {
    setDone(false);
    setOpen(false);
  }, [productId, kind]);

  const prominent = kind !== "price";

  if (done) {
    return (
      <p className="mt-4 rounded-xl bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-800" role="status">
        ✓ {t(`alert.done.${kind}` as MessageKey)}
      </p>
    );
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={
          prominent
            ? "mt-4 flex w-full items-center justify-center gap-2 rounded-full border-2 border-ocean-700 bg-white px-5 py-3 text-sm font-bold text-ocean-800 transition hover:bg-ocean-50"
            : "mt-4 text-sm font-semibold text-ocean-700 hover:underline"
        }
      >
        🔔 {t(`alert.ask.${kind}` as MessageKey)}
      </button>
    );
  }

  return (
    <form
      className="mt-4 rounded-2xl border border-sand-200 bg-white p-4"
      onSubmit={(e) => {
        e.preventDefault();
        setError(null);
        start(async () => {
          const result = await subscribeAlert({ productId, phone });
          if (result.ok) {
            try {
              window.localStorage.setItem(PHONE_KEY, phone);
            } catch {
              // Nothing lost — they are signed up either way.
            }
            setDone(true);
          } else {
            setError(`alert.err.${result.error ?? "unavailable"}` as MessageKey);
          }
        });
      }}
    >
      <label htmlFor="alert-phone" className="block text-sm font-bold text-ocean-950">
        🔔 {t(`alert.ask.${kind}` as MessageKey)}
      </label>
      <p className="mt-0.5 text-xs text-slate-500">{t("alert.promise")}</p>
      <div className="mt-3 flex gap-2">
        <input
          id="alert-phone"
          type="tel"
          inputMode="tel"
          autoComplete="tel"
          required
          autoFocus
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          placeholder="61 234 5678"
          aria-invalid={Boolean(error)}
          className={`input !py-2.5 ${error ? "!border-coral-500" : ""}`}
        />
        <button
          type="submit"
          disabled={pending}
          className="shrink-0 rounded-xl bg-emerald-600 px-4 text-sm font-bold text-white hover:bg-emerald-700 disabled:opacity-60"
        >
          {pending ? "…" : t("alert.submit")}
        </button>
      </div>
      {error && (
        <p className="mt-1.5 text-xs font-semibold text-coral-600" role="alert">
          {t(error)}
        </p>
      )}
    </form>
  );
}
