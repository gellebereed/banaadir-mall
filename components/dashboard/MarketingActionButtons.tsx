"use client";

import { useTransition } from "react";
import {
  deleteBanner,
  deletePromoTile,
  moveBanner,
  toggleBanner,
  togglePromoTile,
} from "@/app/actions";

export function BannerToggleBtn({ id, active }: { id: string; active: boolean }) {
  const [isPending, startTransition] = useTransition();

  return (
    <button
      type="button"
      disabled={isPending}
      onClick={() => {
        startTransition(async () => {
          await toggleBanner(id);
        });
      }}
      className={`rounded-full px-3 py-1 text-xs font-bold transition disabled:opacity-50 ${
        active ? "bg-emerald-100 text-emerald-700 hover:bg-emerald-200" : "bg-sand-100 text-slate-500 hover:bg-sand-200"
      }`}
    >
      {isPending ? "⏳..." : active ? "● Live" : "🙈 Paused"}
    </button>
  );
}

export function BannerDeleteBtn({ id }: { id: string }) {
  const [isPending, startTransition] = useTransition();

  return (
    <button
      type="button"
      disabled={isPending}
      onClick={() => {
        if (!confirm("Are you sure you want to delete this banner?")) return;
        startTransition(async () => {
          await deleteBanner(id);
        });
      }}
      className="rounded-full border border-coral-500 px-3 py-1 text-xs font-bold text-coral-600 transition hover:bg-coral-500 hover:text-white disabled:opacity-50"
    >
      {isPending ? "Deleting…" : "Delete"}
    </button>
  );
}

export function BannerMoveBtn({
  id,
  delta,
  disabled,
}: {
  id: string;
  delta: number;
  disabled: boolean;
}) {
  const [isPending, startTransition] = useTransition();

  return (
    <button
      type="button"
      disabled={disabled || isPending}
      onClick={() => {
        startTransition(async () => {
          await moveBanner(id, delta);
        });
      }}
      aria-label={delta < 0 ? "Move up" : "Move down"}
      className="px-2 text-slate-400 hover:text-ocean-700 disabled:opacity-25 transition"
    >
      {isPending ? "…" : delta < 0 ? "▲" : "▼"}
    </button>
  );
}

export function TileToggleBtn({ id, active }: { id: string; active: boolean }) {
  const [isPending, startTransition] = useTransition();

  return (
    <button
      type="button"
      disabled={isPending}
      onClick={() => {
        startTransition(async () => {
          await togglePromoTile(id);
        });
      }}
      className={`w-full rounded-full py-1 text-[11px] font-bold transition disabled:opacity-50 ${
        active ? "bg-emerald-100 text-emerald-700 hover:bg-emerald-200" : "bg-sand-100 text-slate-500 hover:bg-sand-200"
      }`}
    >
      {isPending ? "⏳..." : active ? "● Live" : "🙈 Paused"}
    </button>
  );
}

export function TileDeleteBtn({ id }: { id: string }) {
  const [isPending, startTransition] = useTransition();

  return (
    <button
      type="button"
      disabled={isPending}
      onClick={() => {
        if (!confirm("Are you sure you want to delete this campaign tile?")) return;
        startTransition(async () => {
          await deletePromoTile(id);
        });
      }}
      className="rounded-full border border-coral-500 px-3 py-1 text-[11px] font-bold text-coral-600 transition hover:bg-coral-500 hover:text-white disabled:opacity-50"
    >
      {isPending ? "…" : "✕"}
    </button>
  );
}
