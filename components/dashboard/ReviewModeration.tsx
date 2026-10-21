"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { moderateReviewAction, removeReviewPhotoAction, type ModerationResult } from "@/app/review-actions";
import { shortDate } from "@/lib/format";

export interface ModerationRow {
  id: string;
  productName: string;
  productSlug?: string;
  storeName: string;
  author: string;
  rating: number;
  text: string;
  date: string;
  photos: string[];
  verified: boolean;
  reports: number;
  hidden: boolean;
  hiddenReason?: "reports" | "admin";
  approved: boolean;
  attention: boolean;
}

type Tab = "attention" | "photos" | "hidden" | "all";

/**
 * The review queue for the marketplace team. Reported reviews come first;
 * every action is one click and lands in the activity log.
 */
export default function ReviewModeration({ rows, reportsToHide }: { rows: ModerationRow[]; reportsToHide: number }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [tab, setTab] = useState<Tab>(rows.some((r) => r.attention) ? "attention" : "all");
  const [notes, setNotes] = useState<Record<string, ModerationResult>>({});
  const [zoom, setZoom] = useState<string | null>(null);

  const counts: Record<Tab, number> = {
    attention: rows.filter((r) => r.attention).length,
    photos: rows.filter((r) => r.photos.length > 0).length,
    hidden: rows.filter((r) => r.hidden).length,
    all: rows.length,
  };
  const shown = rows.filter((r) =>
    tab === "attention" ? r.attention : tab === "photos" ? r.photos.length > 0 : tab === "hidden" ? r.hidden : true,
  );

  const run = (id: string, action: () => Promise<ModerationResult>) =>
    start(async () => {
      const result = await action();
      setNotes((prev) => ({ ...prev, [id]: result }));
      if (result.ok) router.refresh();
    });

  const labels: Record<Tab, string> = {
    attention: "Needs a look",
    photos: "With photos",
    hidden: "Hidden",
    all: "All",
  };

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div className="card p-6">
        <h1 className="font-display text-2xl font-extrabold text-ocean-950">Customer reviews</h1>
        <p className="mt-1 max-w-2xl text-sm text-slate-500">
          Reviews go live at once. Shoppers can report one; after {reportsToHide} reports it is hidden until you
          decide. <strong>Keep</strong> puts it back for good — further reports won&apos;t hide it again. Sellers
          can report reviews of their products but can&apos;t remove them.
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        {(["attention", "photos", "hidden", "all"] as Tab[]).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            className={`rounded-full px-4 py-2 text-sm font-semibold ${
              tab === t ? "bg-ocean-800 text-white" : "bg-white text-slate-600 ring-1 ring-sand-200"
            }`}
          >
            {labels[t]} <span className="opacity-60">{counts[t]}</span>
          </button>
        ))}
      </div>

      {shown.length === 0 && (
        <p className="card p-8 text-center text-sm text-slate-400">
          {tab === "attention" ? "Nothing reported — all clear." : "No reviews here."}
        </p>
      )}

      <ul className="space-y-3">
        {shown.map((r) => {
          const note = notes[r.id];
          return (
            <li key={r.id} className={`card p-5 ${r.hidden ? "opacity-80 ring-1 ring-amber-300" : ""}`}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm text-slate-500">
                    {r.productSlug ? (
                      <Link href={`/product/${r.productSlug}`} target="_blank" className="font-semibold text-ocean-800 hover:underline">
                        {r.productName}
                      </Link>
                    ) : (
                      <span className="font-semibold text-slate-700">{r.productName}</span>
                    )}
                    {r.storeName && <span> · {r.storeName}</span>}
                  </p>
                  <p className="mt-1 font-semibold text-slate-800">
                    {r.author}{" "}
                    <span className="text-mango-400" aria-label={`${r.rating} stars`}>
                      {"★".repeat(r.rating)}
                    </span>
                    <span className="ml-2 text-xs font-normal text-slate-400">{shortDate(r.date)}</span>
                  </p>
                </div>
                <div className="flex flex-wrap gap-1.5 text-[11px] font-bold">
                  {r.verified && <span className="rounded-full bg-emerald-50 px-2 py-1 text-emerald-700">Verified</span>}
                  {r.reports > 0 && (
                    <span className="rounded-full bg-coral-100 px-2 py-1 text-coral-600">
                      {r.reports} report{r.reports === 1 ? "" : "s"}
                    </span>
                  )}
                  {r.hidden && (
                    <span className="rounded-full bg-amber-100 px-2 py-1 text-amber-800">
                      Hidden{r.hiddenReason === "reports" ? " by reports" : ""}
                    </span>
                  )}
                  {r.approved && !r.hidden && <span className="rounded-full bg-sand-100 px-2 py-1 text-slate-600">Kept</span>}
                </div>
              </div>

              {r.text && <p className="mt-2 text-sm text-slate-600">{r.text}</p>}

              {r.photos.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-2">
                  {r.photos.map((src) => (
                    <div key={src} className="relative">
                      <button
                        type="button"
                        onClick={() => setZoom(src)}
                        aria-label="View photo"
                        className="relative block h-24 w-24 overflow-hidden rounded-xl bg-sand-100"
                      >
                        <Image src={src} alt="" fill sizes="96px" className="object-cover" />
                      </button>
                      <button
                        type="button"
                        disabled={pending}
                        onClick={() => {
                          if (confirm("Remove this photo? The review's words stay.")) {
                            run(r.id, () => removeReviewPhotoAction(r.id, src));
                          }
                        }}
                        className="absolute -right-1.5 -top-1.5 flex h-6 w-6 items-center justify-center rounded-full bg-coral-500 text-xs font-bold text-white shadow"
                        aria-label="Remove photo"
                        title="Remove photo"
                      >
                        ✕
                      </button>
                    </div>
                  ))}
                </div>
              )}

              <div className="mt-4 flex flex-wrap items-center gap-2">
                {r.hidden || r.attention ? (
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() => run(r.id, () => moderateReviewAction(r.id, "restore"))}
                    className="btn-primary !px-4 !py-1.5 text-xs"
                  >
                    {r.hidden ? "Keep — show again" : "Keep"}
                  </button>
                ) : null}
                {!r.hidden && (
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() => run(r.id, () => moderateReviewAction(r.id, "hide"))}
                    className="btn-secondary !px-4 !py-1.5 text-xs"
                  >
                    Hide
                  </button>
                )}
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => {
                    if (confirm("Delete this review and its photos for good?")) {
                      run(r.id, () => moderateReviewAction(r.id, "delete"));
                    }
                  }}
                  className="rounded-full px-4 py-1.5 text-xs font-semibold text-coral-600 hover:bg-coral-100"
                >
                  Delete
                </button>
                {note && (
                  <span className={`text-xs font-semibold ${note.ok ? "text-emerald-700" : "text-coral-600"}`}>
                    {note.ok ?? note.error}
                  </span>
                )}
              </div>
            </li>
          );
        })}
      </ul>

      {zoom && (
        <div
          role="dialog"
          aria-label="Review photo"
          onClick={() => setZoom(null)}
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/80 p-4"
        >
          <div className="relative h-[80vh] w-full max-w-3xl">
            <Image src={zoom} alt="Review photo" fill sizes="100vw" className="object-contain" />
          </div>
        </div>
      )}
    </div>
  );
}
