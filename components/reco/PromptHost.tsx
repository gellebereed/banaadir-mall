"use client";

/**
 * ─────────────────────────────────────────────────────────────────────────
 *  PROMPTS — the ask, rendered as a card the shopper can ignore.
 * ─────────────────────────────────────────────────────────────────────────
 * The server decides WHETHER there is a question worth asking
 * (lib/reco/prompts.ts). This decides how it arrives, and everything about
 * that is designed around one fact: a shopper who feels trapped by a
 * pop-up stops trusting the shop that showed it.
 *
 *   IT IS NOT A MODAL. No overlay, no blocked scroll, no dimmed page. It
 *   slides in at the corner and the shopper can carry on shopping around
 *   it — which is the difference between an invitation and a toll gate.
 *
 *   IT WAITS. The admin's delay runs from arrival, and the timer is
 *   cancelled outright if the shopper starts checking out.
 *
 *   DISMISS MEANS DISMISS. Closing it stamps the cooldown, so it is gone
 *   for days rather than until the next page load.
 *
 *   IT PAYS OUT IMMEDIATELY. Answering re-keys the profile signature, so
 *   the shelves behind the card are already rebuilt by the time it closes.
 *   That is the entire reason anyone answers the second question.
 * ─────────────────────────────────────────────────────────────────────────
 */

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { submitReviewAction } from "@/app/reco-actions";
import { primaryImage } from "@/lib/product-utils";
import type { PromptOffer } from "@/lib/reco/types";
import { useReco, useRecommendations } from "./RecoProvider";

/** Pages where a question is never welcome. */
const QUIET_ROUTES = ["/checkout", "/cart", "/login", "/register"];

export default function PromptHost() {
  const pathname = usePathname();
  const { data } = useRecommendations({ surface: "home", useCartLines: true });
  const { profile, ready, seePrompt, answerPrompt, setPrefs, rateProduct } = useReco();

  /**
   * The prompt currently on screen, captured by value.
   *
   * This must NOT render straight from `data.prompt`. Showing a prompt
   * stamps its cooldown, which changes the profile, which re-keys the
   * recommendation request — so the very next response no longer offers
   * the prompt that is currently open. Rendering from the live response
   * meant the card appeared and vanished within a frame of itself.
   *
   * Capturing it once decouples what is on screen from what the server
   * would offer next, which is the correct relationship anyway: the
   * shopper is answering the question they were asked, not whichever one
   * is top of the queue at the moment they click.
   */
  const [active, setActive] = useState<PromptOffer | null>(null);
  const [done, setDone] = useState(false);
  /** Prompt ids already put up in this tab — never re-armed. */
  const handled = useRef<Set<string>>(new Set());

  const offer = data.prompt;
  const quiet = QUIET_ROUTES.some((route) => pathname?.startsWith(route));

  useEffect(() => {
    if (!ready || !offer || quiet) return;
    if (active) return; // one at a time
    if (handled.current.has(offer.id)) return;

    const timer = setTimeout(() => {
      handled.current.add(offer.id);
      setDone(false);
      setActive(offer);
      // Stamped on DISPLAY, not dismissal — see markPromptSeen().
      seePrompt(offer.id);
    }, offer.delaySeconds * 1000);

    return () => clearTimeout(timer);
    // Keyed on the id, not the object: every refetch produces a new object
    // identity and would otherwise restart the timer forever.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [offer?.id, ready, quiet, active, seePrompt]);

  // Leaving for the cart or checkout closes anything open. Nobody should
  // have to dismiss a question to finish paying.
  useEffect(() => {
    if (quiet) setActive(null);
  }, [quiet]);

  if (!active) return null;

  function close() {
    setActive(null);
  }

  function finish() {
    if (!active) return;
    answerPrompt(active.id);
    setDone(true);
    setTimeout(() => setActive(null), 1400);
  }

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-0 z-50 flex justify-center px-3 pb-24 sm:justify-end sm:px-6 sm:pb-6">
      <div className="animate-prompt-in pointer-events-auto w-full max-w-sm overflow-hidden rounded-3xl bg-white shadow-2xl shadow-ocean-950/25 ring-1 ring-ocean-950/10">
        <div className="texture-weave bg-gradient-to-br from-ocean-900 to-ocean-700 px-5 py-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[10px] font-extrabold uppercase tracking-[0.16em] text-mango-300">
                {active.kind === "review" ? "Your order" : "Tune your shelves"}
              </p>
              <h2 className="mt-1 font-display text-lg font-extrabold leading-snug text-white">
                {done ? "Thank you — noted." : active.title}
              </h2>
            </div>
            <button
              onClick={close}
              aria-label="Close"
              className="shrink-0 rounded-full p-1 text-lg leading-none text-white/50 transition hover:bg-white/10 hover:text-white"
            >
              ✕
            </button>
          </div>
        </div>

        {done ? (
          <p className="px-5 py-6 text-sm text-slate-600">
            {active.kind === "review"
              ? "Your review is on the product page now."
              : "Your shelves have already been rebuilt around that."}
          </p>
        ) : (
          <div className="px-5 py-4">
            {active.body && (
              <p className="mb-4 text-sm leading-relaxed text-slate-500">{active.body}</p>
            )}

            {active.kind === "departments" && (
              <MultiChoice
                options={active.options ?? []}
                cta="Save"
                onSubmit={(values) => {
                  setPrefs({ departments: values });
                  finish();
                }}
                onSkip={close}
              />
            )}

            {active.kind === "budget" && (
              <SingleChoice
                options={active.options ?? []}
                onSubmit={(value) => {
                  setPrefs({ budget: value });
                  finish();
                }}
                onSkip={close}
              />
            )}

            {active.kind === "review" && active.product && (
              <ReviewForm
                offer={active}
                onSubmit={async (rating, text) => {
                  rateProduct(active.product!.id);
                  await submitReviewAction({
                    productId: active.product!.id,
                    orderId: active.orderId,
                    rating,
                    text,
                  });
                  finish();
                }}
                onSkip={close}
              />
            )}
          </div>
        )}

        {!done && (
          <p className="border-t border-sand-200 bg-sand-50 px-5 py-2.5 text-[10px] leading-relaxed text-slate-400">
            {profile.prefs?.departments?.length
              ? "Stored on this device. Change or clear it any time from your account."
              : "Stored on this device only — never sold, never shared."}
          </p>
        )}
      </div>
    </div>
  );
}

// ── Answer widgets ─────────────────────────────────────────────────────

function MultiChoice({
  options,
  cta,
  onSubmit,
  onSkip,
}: {
  options: { value: string; label: string; icon?: string }[];
  cta: string;
  onSubmit: (values: string[]) => void;
  onSkip: () => void;
}) {
  const [selected, setSelected] = useState<string[]>([]);

  function toggle(value: string) {
    setSelected((current) =>
      current.includes(value) ? current.filter((v) => v !== value) : [...current, value],
    );
  }

  return (
    <>
      <div className="flex flex-wrap gap-2">
        {options.map((option) => {
          const on = selected.includes(option.value);
          return (
            <button
              key={option.value}
              onClick={() => toggle(option.value)}
              aria-pressed={on}
              className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-2 text-xs font-bold transition ${
                on
                  ? "border-ocean-700 bg-ocean-700 text-white shadow-sm"
                  : "border-sand-200 bg-white text-slate-600 hover:border-ocean-300"
              }`}
            >
              {option.icon && <span aria-hidden>{option.icon}</span>}
              {option.label}
            </button>
          );
        })}
      </div>

      <div className="mt-4 flex items-center gap-3">
        <button
          onClick={() => onSubmit(selected)}
          disabled={selected.length === 0}
          className="btn-primary !px-5 !py-2.5 text-sm disabled:cursor-not-allowed disabled:opacity-40"
        >
          {cta}
        </button>
        <button
          onClick={onSkip}
          className="text-xs font-semibold text-slate-400 transition hover:text-slate-600"
        >
          Not now
        </button>
      </div>
    </>
  );
}

function SingleChoice({
  options,
  onSubmit,
  onSkip,
}: {
  options: { value: string; label: string }[];
  onSubmit: (value: string) => void;
  onSkip: () => void;
}) {
  return (
    <>
      <div className="grid grid-cols-2 gap-2">
        {options.map((option) => (
          <button
            key={option.value}
            onClick={() => onSubmit(option.value)}
            className="rounded-xl border border-sand-200 bg-white px-3 py-2.5 text-xs font-bold text-slate-700 transition hover:border-ocean-500 hover:bg-ocean-50 hover:text-ocean-800"
          >
            {option.label}
          </button>
        ))}
      </div>
      <button
        onClick={onSkip}
        className="mt-3 text-xs font-semibold text-slate-400 transition hover:text-slate-600"
      >
        Not now
      </button>
    </>
  );
}

/**
 * The rating form.
 *
 * The stars submit on their own — a required comment box is the reason most
 * review requests go unanswered, and one honest star rating is worth more
 * than a blank form nobody finished.
 */
function ReviewForm({
  offer,
  onSubmit,
  onSkip,
}: {
  offer: PromptOffer;
  onSubmit: (rating: number, text: string) => void | Promise<void>;
  onSkip: () => void;
}) {
  const [rating, setRating] = useState(0);
  const [hovered, setHovered] = useState(0);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);

  const product = offer.product!;
  const image = primaryImage(product);
  const shown = hovered || rating;

  return (
    <>
      <div className="flex items-center gap-3 rounded-2xl bg-sand-50 p-3">
        {image ? (
          <Image
            src={image}
            alt=""
            width={48}
            height={48}
            className="h-12 w-12 shrink-0 rounded-xl object-cover"
          />
        ) : (
          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-white text-2xl">
            {product.icon}
          </span>
        )}
        <p className="line-clamp-2 text-xs font-semibold text-slate-700">{product.name}</p>
      </div>

      <div
        className="mt-4 flex justify-center gap-1"
        onMouseLeave={() => setHovered(0)}
        role="radiogroup"
        aria-label="Rating"
      >
        {[1, 2, 3, 4, 5].map((star) => (
          <button
            key={star}
            role="radio"
            aria-checked={rating === star}
            aria-label={`${star} star${star === 1 ? "" : "s"}`}
            onMouseEnter={() => setHovered(star)}
            onClick={() => setRating(star)}
            className={`text-3xl leading-none transition ${
              star <= shown ? "scale-110 text-mango-400" : "text-sand-200 hover:text-mango-200"
            }`}
          >
            ★
          </button>
        ))}
      </div>

      {rating > 0 && (
        <textarea
          value={text}
          onChange={(event) => setText(event.target.value)}
          rows={2}
          maxLength={400}
          placeholder="Anything the next shopper should know? (optional)"
          className="input mt-3 resize-none !py-2.5 text-sm"
        />
      )}

      <div className="mt-4 flex items-center gap-3">
        <button
          onClick={async () => {
            if (rating === 0 || sending) return;
            setSending(true);
            await onSubmit(rating, text.trim());
          }}
          disabled={rating === 0 || sending}
          className="btn-primary !px-5 !py-2.5 text-sm disabled:cursor-not-allowed disabled:opacity-40"
        >
          {sending ? "Sending…" : "Post review"}
        </button>
        <button
          onClick={onSkip}
          className="text-xs font-semibold text-slate-400 transition hover:text-slate-600"
        >
          Not now
        </button>
      </div>
    </>
  );
}
