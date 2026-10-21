"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { submitReviewFormAction } from "@/app/reco-actions";
import { reportReviewAction } from "@/app/review-actions";
import { shortDate } from "@/lib/format";
import { loginHref } from "@/lib/safe-next";
import { compressImageFile } from "@/lib/image-compress";
import type { Review } from "@/lib/types";

const MAX_PHOTOS = 4;

/**
 * Reviews on the product page: the star breakdown, every customer photo in
 * one strip, the reviews themselves (photos included), and the form to
 * write one. A photo of the thing as it actually arrived answers the
 * question every first-time online shopper has — "is it really like the
 * picture?" — better than any amount of seller copy.
 */
export default function ReviewsSection({
  productId,
  reviews,
  rating,
  reviewCount,
  signedIn,
}: {
  productId: string;
  reviews: Review[];
  rating: number;
  reviewCount: number;
  signedIn: boolean;
}) {
  const [filter, setFilter] = useState<"all" | "photos">("all");
  const [lightbox, setLightbox] = useState<string | null>(null);
  const [writing, setWriting] = useState(false);
  const pathname = usePathname();
  const [reported, setReported] = useState<Record<string, string>>({});

  const photos = reviews.flatMap((r) => r.photos ?? []);
  const withPhotos = reviews.filter((r) => r.photos?.length);
  const shown = filter === "photos" ? withPhotos : reviews;
  const counts = [5, 4, 3, 2, 1].map((star) => reviews.filter((r) => r.rating === star).length);

  useEffect(() => {
    if (!lightbox) return;
    const close = (e: KeyboardEvent) => e.key === "Escape" && setLightbox(null);
    document.addEventListener("keydown", close);
    return () => document.removeEventListener("keydown", close);
  }, [lightbox]);

  return (
    <section className="mt-14" id="reviews">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 className="font-display text-2xl font-bold text-ocean-950">Customer Reviews</h2>
          <p className="mt-1 text-sm text-slate-500">
            {rating.toFixed(1)} average from {reviewCount.toLocaleString()} ratings
          </p>
        </div>
        {!writing &&
          (signedIn ? (
            <button type="button" onClick={() => setWriting(true)} className="btn-secondary !py-2 text-sm">
              ✍️ Write a review
            </button>
          ) : (
            <Link href={loginHref(`${pathname}#reviews`)} className="btn-secondary !py-2 text-sm">
              Sign in to write a review
            </Link>
          ))}
      </div>

      {writing && <ReviewForm productId={productId} onDone={() => setWriting(false)} />}

      <div className="mt-5 grid gap-6 lg:grid-cols-[220px_1fr]">
        {/* Star breakdown */}
        <div className="space-y-1.5">
          {counts.map((n, i) => (
            <div key={i} className="flex items-center gap-2 text-xs text-slate-500">
              <span className="w-6 shrink-0">{5 - i}★</span>
              <span className="h-2 flex-1 overflow-hidden rounded-full bg-sand-100">
                <span
                  className="block h-full rounded-full bg-mango-400"
                  style={{ width: `${reviews.length ? (n / reviews.length) * 100 : 0}%` }}
                />
              </span>
              <span className="w-5 shrink-0 text-right">{n}</span>
            </div>
          ))}
          {/* The bars count the written reviews below; the total above is
              every rating, most of which come without words. */}
          <p className="pt-1 text-[11px] text-slate-400">
            From {reviews.length} written review{reviews.length === 1 ? "" : "s"}
          </p>
        </div>

        <div className="min-w-0">
          {photos.length > 0 && (
            <div>
              <p className="text-sm font-semibold text-slate-700">Photos from customers</p>
              <div className="mt-2 flex gap-2 overflow-x-auto pb-1 rail-scroll">
                {photos.slice(0, 12).map((src) => (
                  <button
                    key={src}
                    type="button"
                    onClick={() => setLightbox(src)}
                    aria-label="View customer photo"
                    className="relative h-20 w-20 shrink-0 overflow-hidden rounded-xl bg-sand-100"
                  >
                    <Image src={src} alt="" fill sizes="80px" className="object-cover" />
                  </button>
                ))}
              </div>
            </div>
          )}

          {withPhotos.length > 0 && (
            <div className="mt-4 flex gap-2 text-sm">
              {(["all", "photos"] as const).map((f) => (
                <button
                  key={f}
                  type="button"
                  onClick={() => setFilter(f)}
                  className={`rounded-full px-3 py-1.5 font-semibold ${
                    filter === f ? "bg-ocean-800 text-white" : "bg-white text-slate-600 ring-1 ring-sand-200"
                  }`}
                >
                  {f === "all" ? `All ${reviews.length}` : `📷 With photos ${withPhotos.length}`}
                </button>
              ))}
            </div>
          )}

          <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {shown.map((r, i) => (
              <article key={i} className="card p-5">
                <div className="flex items-center justify-between gap-2">
                  <p className="font-semibold text-slate-800">{r.author}</p>
                  <span className="text-xs text-slate-400">{shortDate(r.date)}</span>
                </div>
                <p className="mt-1 text-sm text-mango-400" aria-label={`${r.rating} out of 5 stars`}>
                  {"★".repeat(r.rating)}
                  <span className="text-sand-200">{"★".repeat(5 - r.rating)}</span>
                </p>
                {r.verified && (
                  <p className="mt-1 text-[11px] font-bold uppercase tracking-wide text-emerald-700">✓ Verified purchase</p>
                )}
                {r.text && <p className="mt-2 text-sm text-slate-600">{r.text}</p>}
                {r.photos && r.photos.length > 0 && (
                  <div className="mt-3 flex gap-2">
                    {r.photos.map((src) => (
                      <button
                        key={src}
                        type="button"
                        onClick={() => setLightbox(src)}
                        aria-label="View photo"
                        className="relative h-16 w-16 overflow-hidden rounded-lg bg-sand-100"
                      >
                        <Image src={src} alt="" fill sizes="64px" className="object-cover" />
                      </button>
                    ))}
                  </div>
                )}
                {/* Only real reviews can be reported; signed-in only, once each. */}
                {r.id && (
                  <div className="mt-3 text-right text-xs">
                    {reported[r.id] ? (
                      <span className="text-slate-500">{reported[r.id]}</span>
                    ) : signedIn ? (
                      <button
                        type="button"
                        onClick={async () => {
                          if (!confirm("Report this review as inappropriate, fake or not about this product?")) return;
                          const result = await reportReviewAction(r.id!);
                          setReported((prev) => ({ ...prev, [r.id!]: result.ok ?? result.error ?? "" }));
                        }}
                        className="text-slate-400 underline hover:text-coral-600"
                      >
                        Report
                      </button>
                    ) : (
                      <Link href={loginHref(`${pathname}#reviews`)} className="text-slate-400 underline hover:text-coral-600">
                        Report
                      </Link>
                    )}
                  </div>
                )}
              </article>
            ))}
          </div>
        </div>
      </div>

      {lightbox && (
        <div
          role="dialog"
          aria-label="Customer photo"
          onClick={() => setLightbox(null)}
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/80 p-4"
        >
          <div className="relative h-[80vh] w-full max-w-3xl">
            <Image src={lightbox} alt="Customer photo" fill sizes="100vw" className="object-contain" />
          </div>
          <button
            type="button"
            aria-label="Close"
            className="absolute right-4 top-4 flex h-10 w-10 items-center justify-center rounded-full bg-white/90 text-lg"
          >
            ✕
          </button>
        </div>
      )}
    </section>
  );
}

function ReviewForm({ productId, onDone }: { productId: string; onDone: () => void }) {
  const router = useRouter();
  const [stars, setStars] = useState(0);
  const [hover, setHover] = useState(0);
  const [text, setText] = useState("");
  const [files, setFiles] = useState<{ file: File; url: string }[]>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  // Preview URLs are released when the form closes, not on every change —
  // a cleanup keyed on `files` would blank the previews still on screen.
  const previews = useRef<string[]>([]);
  previews.current = files.map((f) => f.url);
  useEffect(() => () => previews.current.forEach((url) => URL.revokeObjectURL(url)), []);

  async function addFiles(list: FileList | null) {
    if (!list) return;
    const picked = Array.from(list).filter((f) => f.type.startsWith("image/")).slice(0, MAX_PHOTOS - files.length);
    // Phone photos are several MB; 1600px is plenty for a review photo.
    const compressed = await Promise.all(picked.map((f) => compressImageFile(f, 1600)));
    setFiles((prev) => [...prev, ...compressed.map((file) => ({ file, url: URL.createObjectURL(file) }))]);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (stars === 0 || busy) return;
    setBusy(true);
    const form = new FormData();
    form.set("productId", productId);
    form.set("rating", String(stars));
    form.set("text", text.trim());
    for (const f of files) form.append("photos", f.file);
    const result = await submitReviewFormAction(form);
    setBusy(false);
    if (!result.ok) {
      setMessage({ ok: false, text: result.error ?? "Could not save your review." });
      return;
    }
    setMessage({
      ok: true,
      text: result.verified ? "Thank you — your review is live with a Verified purchase badge." : "Thank you — your review is live.",
    });
    router.refresh();
    setTimeout(onDone, 1800);
  }

  return (
    <form onSubmit={submit} className="card mt-5 space-y-4 p-5">
      <div>
        <p className="label">Your rating</p>
        <div className="flex gap-1" role="radiogroup" aria-label="Rating">
          {[1, 2, 3, 4, 5].map((n) => (
            <button
              key={n}
              type="button"
              role="radio"
              aria-checked={stars === n}
              aria-label={`${n} star${n === 1 ? "" : "s"}`}
              onClick={() => setStars(n)}
              onMouseEnter={() => setHover(n)}
              onMouseLeave={() => setHover(0)}
              className={`text-3xl leading-none transition ${(hover || stars) >= n ? "text-mango-400" : "text-sand-200"}`}
            >
              ★
            </button>
          ))}
        </div>
      </div>
      <div>
        <label htmlFor="review-text" className="label">
          What did you think? <span className="font-normal text-slate-400">(optional)</span>
        </label>
        <textarea
          id="review-text"
          value={text}
          onChange={(e) => setText(e.target.value)}
          maxLength={600}
          rows={3}
          placeholder="Quality, fit, how it compares to the photos, delivery…"
          className="input resize-none"
        />
      </div>
      <div>
        <p className="label">
          Photos <span className="font-normal text-slate-400">(up to {MAX_PHOTOS} — show what arrived)</span>
        </p>
        <div className="flex flex-wrap gap-2">
          {files.map((f, i) => (
            <div key={f.url} className="relative h-20 w-20 overflow-hidden rounded-xl bg-sand-100">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={f.url} alt="" className="h-full w-full object-cover" />
              <button
                type="button"
                aria-label="Remove photo"
                onClick={() => setFiles((prev) => prev.filter((_, j) => j !== i))}
                className="absolute right-1 top-1 flex h-6 w-6 items-center justify-center rounded-full bg-black/60 text-xs text-white"
              >
                ✕
              </button>
            </div>
          ))}
          {files.length < MAX_PHOTOS && (
            <label className="flex h-20 w-20 cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed border-sand-200 text-xs text-slate-500 hover:border-ocean-400">
              <span className="text-xl">📷</span>
              Add
              <input
                type="file"
                accept="image/*"
                multiple
                className="sr-only"
                onChange={(e) => {
                  void addFiles(e.target.files);
                  e.target.value = "";
                }}
              />
            </label>
          )}
        </div>
      </div>
      {message && (
        <p
          role={message.ok ? "status" : "alert"}
          className={`rounded-xl px-3 py-2 text-sm font-semibold ${message.ok ? "bg-emerald-50 text-emerald-700" : "bg-coral-100 text-coral-600"}`}
        >
          {message.text}
        </p>
      )}
      <div className="flex justify-end gap-2">
        <button type="button" onClick={onDone} className="btn-secondary !py-2 text-sm">
          Cancel
        </button>
        <button type="submit" disabled={stars === 0 || busy} className="btn-primary !py-2 text-sm disabled:opacity-50">
          {busy ? "Posting…" : "Post review"}
        </button>
      </div>
    </form>
  );
}
