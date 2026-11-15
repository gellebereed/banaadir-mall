"use client";

import Link from "next/link";
import { useActionState, useEffect, useMemo, useRef, useState, useTransition, type PointerEvent } from "react";
import { deleteLook, moveLook, saveLook, toggleLook, type LookState } from "@/app/looks-actions";
import SubmitButton from "@/components/dashboard/SubmitButton";
import { money } from "@/lib/format";
import { compressImageFile } from "@/lib/image-compress";
import {
  LOOK_MAX_BUNDLE,
  LOOK_MAX_DISCOUNT,
  LOOK_MAX_ITEMS,
  LOOK_MIN_ITEMS,
  LOOK_OCCASIONS,
  lookPath,
  occasionLabel,
  type Look,
  type LookItem,
} from "@/lib/look-utils";

export interface LookPickerProduct {
  id: string;
  name: string;
  image?: string;
  icon: string;
  price: number;
  /** Shown for marketplace looks, which mix shops. */
  storeName?: string;
  hidden?: boolean;
}

/**
 * Looks list + editor, for a shop (/vendor/looks) and for the marketplace
 * admin (/admin/looks). The editor is one form: the photo, a dot per piece
 * (posted as `itemsJson`), the name, occasions and the optional discount.
 */
export default function LooksManager({
  looks,
  products,
  canEdit,
  allowDiscount,
  intro,
  storeNames,
}: {
  looks: Look[];
  products: LookPickerProduct[];
  canEdit: boolean;
  /** Shops can discount their own looks; marketplace looks can't. */
  allowDiscount: boolean;
  intro: string;
  /** Admin view: which shop made each look. */
  storeNames?: Record<string, string>;
}) {
  const [editing, setEditing] = useState<string | null>(null);
  const [message, setMessage] = useState<LookState>({});
  const [pending, startTransition] = useTransition();
  const byId = useMemo(() => new Map(products.map((p) => [p.id, p])), [products]);
  const current = editing && editing !== "new" ? looks.find((l) => l.id === editing) : undefined;

  const act = (fn: () => Promise<LookState>) => startTransition(async () => setMessage(await fn()));

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div className="card flex flex-wrap items-center justify-between gap-4 p-6">
        <div className="min-w-0">
          <h1 className="font-display text-2xl font-extrabold text-ocean-950">Shop the look</h1>
          <p className="mt-1 max-w-xl text-sm text-slate-500">{intro}</p>
        </div>
        {canEdit && editing === null && (
          <button type="button" onClick={() => (setMessage({}), setEditing("new"))} className="btn-primary">
            + New look
          </button>
        )}
      </div>

      {(message.ok || message.error) && (
        <p
          role={message.error ? "alert" : "status"}
          className={`rounded-xl px-4 py-3 text-sm font-semibold ${
            message.error ? "bg-coral-100 text-coral-600" : "bg-emerald-50 text-emerald-700"
          }`}
        >
          {message.error ?? message.ok}
        </p>
      )}

      {editing !== null && canEdit && (
        <LookEditor
          key={editing}
          look={current}
          products={products}
          allowDiscount={allowDiscount && (!current || Boolean(current.store))}
          onDone={(state) => {
            setMessage(state);
            if (state.ok) setEditing(null);
          }}
          onCancel={() => setEditing(null)}
        />
      )}

      {looks.length === 0 && editing === null ? (
        <div className="card p-10 text-center">
          <p className="text-4xl">👗</p>
          <p className="mt-2 font-display text-lg font-bold text-ocean-950">No looks yet</p>
          <p className="mx-auto mt-1 max-w-sm text-sm text-slate-500">
            Upload a photo of a whole outfit, tap each piece and pick the product it is. Shoppers can then buy
            the whole outfit in one tap.
          </p>
        </div>
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {looks.map((look, i) => {
            const pieces = look.items.map((it) => byId.get(it.productId)).filter(Boolean) as LookPickerProduct[];
            const total = pieces.reduce((t, p) => t + p.price, 0);
            return (
              <li key={look.id} className="card overflow-hidden">
                <div className="relative aspect-[4/5] bg-sand-100">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={look.image} alt="" className="absolute inset-0 h-full w-full object-cover" />
                  {look.items.map((it, n) => (
                    <span
                      key={it.productId}
                      className="absolute flex h-6 w-6 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-white/95 text-[11px] font-bold text-ocean-900 shadow"
                      style={{ left: `${it.x}%`, top: `${it.y}%` }}
                    >
                      {n + 1}
                    </span>
                  ))}
                  {!look.active && (
                    <span className="absolute left-2 top-2 rounded-full bg-slate-900/80 px-2 py-0.5 text-[11px] font-bold text-white">
                      Hidden
                    </span>
                  )}
                  {look.discountPct ? (
                    <span className="absolute right-2 top-2 rounded-full bg-coral-500 px-2 py-0.5 text-[11px] font-bold text-white">
                      −{look.discountPct}% full look
                    </span>
                  ) : null}
                </div>
                <div className="space-y-2 p-4">
                  <p className="font-semibold text-ocean-950">{look.title}</p>
                  <p className="text-xs text-slate-500">
                    {pieces.length} piece{pieces.length === 1 ? "" : "s"} · {money(total)}
                    {storeNames && ` · ${look.store ? storeNames[look.store] ?? look.store : "Marketplace look"}`}
                  </p>
                  {look.occasions.length > 0 && (
                    <p className="text-xs text-slate-500">{look.occasions.map(occasionLabel).join(" · ")}</p>
                  )}
                  <div className="flex flex-wrap items-center gap-1.5 pt-1">
                    {look.active && (
                      <Link
                        href={lookPath(look)}
                        target="_blank"
                        className="rounded-xl px-2.5 py-1.5 text-xs font-semibold text-ocean-700 hover:bg-ocean-50"
                      >
                        View ↗
                      </Link>
                    )}
                    {canEdit && (
                      <>
                        <button
                          type="button"
                          onClick={() => (setMessage({}), setEditing(look.id))}
                          className="btn-secondary !px-3 !py-1.5 text-xs"
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          disabled={pending}
                          onClick={() => act(() => toggleLook(look.id))}
                          className="rounded-xl px-2.5 py-1.5 text-xs font-semibold text-slate-600 hover:bg-sand-100"
                        >
                          {look.active ? "Hide" : "Show"}
                        </button>
                        <button
                          type="button"
                          aria-label={`Move ${look.title} earlier`}
                          disabled={pending || i === 0}
                          onClick={() => act(() => moveLook(look.id, -1))}
                          className="rounded-lg px-2 py-1 text-slate-500 hover:bg-sand-100 disabled:opacity-30"
                        >
                          ←
                        </button>
                        <button
                          type="button"
                          aria-label={`Move ${look.title} later`}
                          disabled={pending || i === looks.length - 1}
                          onClick={() => act(() => moveLook(look.id, 1))}
                          className="rounded-lg px-2 py-1 text-slate-500 hover:bg-sand-100 disabled:opacity-30"
                        >
                          →
                        </button>
                        <button
                          type="button"
                          disabled={pending}
                          onClick={() => {
                            if (confirm(`Delete "${look.title}"? The products stay in the shop.`)) {
                              act(() => deleteLook(look.id));
                            }
                          }}
                          className="rounded-xl px-2.5 py-1.5 text-xs font-semibold text-coral-600 hover:bg-coral-100"
                        >
                          Delete
                        </button>
                      </>
                    )}
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
      {!canEdit && (
        <p className="text-center text-xs text-slate-400">Your account can view looks but not change them.</p>
      )}
    </div>
  );
}

/** A dot being placed: the product may not be chosen yet. */
type Draft = { key: number; productId?: string; x: number; y: number };

function LookEditor({
  look,
  products,
  allowDiscount,
  onDone,
  onCancel,
}: {
  look?: Look;
  products: LookPickerProduct[];
  allowDiscount: boolean;
  onDone: (state: LookState) => void;
  onCancel: () => void;
}) {
  const [state, formAction] = useActionState(saveLook, {});
  const byId = useMemo(() => new Map(products.map((p) => [p.id, p])), [products]);
  const nextKey = useRef(1);
  const [dots, setDots] = useState<Draft[]>(() =>
    (look?.items ?? []).map((it) => ({ ...it, key: nextKey.current++ })),
  );
  const [selected, setSelected] = useState<number | null>(null);
  const [preview, setPreview] = useState<string | undefined>(look?.image);
  const [preparing, setPreparing] = useState(false);
  const [query, setQuery] = useState("");
  const fileInput = useRef<HTMLInputElement>(null);
  const photo = useRef<HTMLDivElement>(null);
  const dragging = useRef<number | null>(null);
  const moved = useRef(false);

  useEffect(() => {
    if (state.ok || state.error) onDone(state);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  /*
   * Phone photos are often 4–8 MB, over the 5 MB upload limit and slow on a
   * Mogadishu connection. The picture is shrunk in the browser first and
   * put back into the file input, so the form posts the small one.
   */
  async function choosePhoto(file?: File) {
    if (!file) return;
    setPreparing(true);
    try {
      const small = await compressImageFile(file, 1600);
      const transfer = new DataTransfer();
      transfer.items.add(small);
      if (fileInput.current) fileInput.current.files = transfer.files;
      setPreview(URL.createObjectURL(small));
    } finally {
      setPreparing(false);
    }
  }

  function pointAt(e: { clientX: number; clientY: number }) {
    const box = photo.current!.getBoundingClientRect();
    const pct = (v: number) => Math.round(Math.min(100, Math.max(0, v)) * 10) / 10;
    return { x: pct(((e.clientX - box.left) / box.width) * 100), y: pct(((e.clientY - box.top) / box.height) * 100) };
  }

  /*
   * One handler for both ends of a tap on the photo. A dot's pointer is
   * captured by the photo while it is dragged, so its "up" arrives here:
   * a dot that did not move was tapped (select it); otherwise the tap was
   * on the photo itself and places a new dot.
   */
  function onPhotoUp(e: PointerEvent<HTMLDivElement>) {
    if (dragging.current !== null) {
      const key = dragging.current;
      dragging.current = null;
      if (!moved.current) setSelected(key);
      return;
    }
    if (e.target !== e.currentTarget) return;
    if (dots.length >= LOOK_MAX_ITEMS) return;
    const key = nextKey.current++;
    setDots((list) => [...list, { key, ...pointAt(e) }]);
    setSelected(key);
    setQuery("");
  }

  const items: LookItem[] = dots
    .filter((d): d is Draft & { productId: string } => Boolean(d.productId))
    .map(({ productId, x, y }) => ({ productId, x, y }));
  const used = new Set(items.map((i) => i.productId));
  const active = dots.find((d) => d.key === selected);
  const q = query.trim().toLowerCase();
  const matches = products
    .filter((p) => !used.has(p.id) || p.id === active?.productId)
    .filter((p) => !q || p.name.toLowerCase().includes(q) || p.storeName?.toLowerCase().includes(q))
    .slice(0, 60);
  const total = items.reduce((t, i) => t + (byId.get(i.productId)?.price ?? 0), 0);
  const [pct, setPct] = useState<number>(look?.discountPct ?? 0);

  function setProduct(productId: string) {
    setDots((list) => list.map((d) => (d.key === selected ? { ...d, productId } : d)));
    setSelected(null);
  }

  return (
    <form action={formAction} className="card space-y-6 p-5 sm:p-6">
      <h2 className="font-display text-lg font-extrabold text-ocean-950">{look ? `Edit "${look.title}"` : "New look"}</h2>
      {look && <input type="hidden" name="id" value={look.id} />}
      <input type="hidden" name="itemsJson" value={JSON.stringify(items)} />

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        {/* ── The photo, and its dots ─────────────────────────────── */}
        <div>
          <p className="label">1. Outfit photo</p>
          <input
            ref={fileInput}
            type="file"
            name="photo"
            accept="image/jpeg,image/png,image/webp"
            onChange={(e) => choosePhoto(e.target.files?.[0])}
            className="block w-full text-sm text-slate-600 file:mr-3 file:rounded-xl file:border-0 file:bg-ocean-50 file:px-4 file:py-2 file:font-semibold file:text-ocean-800"
          />
          <p className="mt-1 text-xs text-slate-400">
            A tall photo of the whole outfit works best. Then tap each piece on the photo.
          </p>
          {preview ? (
            <div
              ref={photo}
              onPointerUp={onPhotoUp}
              onPointerMove={(e) => {
                if (dragging.current === null) return;
                moved.current = true;
                const at = pointAt(e);
                setDots((list) => list.map((d) => (d.key === dragging.current ? { ...d, ...at } : d)));
              }}
              className="relative mt-3 touch-none select-none overflow-hidden rounded-2xl bg-sand-100"
              style={{ cursor: dots.length < LOOK_MAX_ITEMS ? "crosshair" : "default" }}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              {/* Cropped exactly as the storefront shows it (4:5, cover), so a dot
                  placed here lands on the same spot for shoppers. */}
              <img src={preview} alt="" draggable={false} className="pointer-events-none block aspect-[4/5] w-full object-cover" />
              {dots.map((d, n) => (
                <button
                  key={d.key}
                  type="button"
                  aria-label={`Piece ${n + 1}`}
                  onPointerDown={(e) => {
                    e.stopPropagation();
                    (e.currentTarget.parentElement as HTMLElement).setPointerCapture?.(e.pointerId);
                    dragging.current = d.key;
                    moved.current = false;
                  }}
                  className={`absolute flex h-8 w-8 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full text-sm font-bold shadow-lg ring-2 transition ${
                    selected === d.key
                      ? "bg-mango-400 text-ocean-950 ring-white"
                      : d.productId
                        ? "bg-white text-ocean-900 ring-white/60"
                        : "animate-pulse bg-coral-500 text-white ring-white"
                  }`}
                  style={{ left: `${d.x}%`, top: `${d.y}%` }}
                >
                  {n + 1}
                </button>
              ))}
              {preparing && (
                <div className="absolute inset-0 flex items-center justify-center bg-white/60 text-sm font-semibold text-ocean-900">
                  Preparing photo…
                </div>
              )}
            </div>
          ) : (
            <button
              type="button"
              onClick={() => fileInput.current?.click()}
              className="mt-3 flex aspect-[4/5] w-full flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-sand-200 bg-sand-50 text-slate-500 hover:border-ocean-300"
            >
              <span className="text-4xl">📷</span>
              <span className="text-sm font-semibold">{preparing ? "Preparing photo…" : "Choose the outfit photo"}</span>
            </button>
          )}
        </div>

        {/* ── The pieces ─────────────────────────────────────────── */}
        <div className="space-y-4">
          <div>
            <p className="label">
              2. Pieces{" "}
              <span className="font-normal text-slate-400">
                ({items.length} of {LOOK_MAX_ITEMS}
                {items.length > 0 && ` · ${money(total)}`})
              </span>
            </p>
            {dots.length === 0 && (
              <p className="rounded-xl bg-sand-50 p-3 text-sm text-slate-500">
                Tap the photo on each piece — the dress, the shoes, the bag. Drag a dot to move it.
              </p>
            )}
            <ul className="space-y-1.5">
              {dots.map((d, n) => {
                const p = d.productId ? byId.get(d.productId) : undefined;
                return (
                  <li
                    key={d.key}
                    className={`flex items-center gap-2 rounded-xl p-1.5 ${selected === d.key ? "bg-mango-50 ring-1 ring-mango-300" : "bg-sand-50"}`}
                  >
                    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-white text-xs font-bold text-ocean-900 shadow">
                      {n + 1}
                    </span>
                    <button
                      type="button"
                      onClick={() => setSelected(selected === d.key ? null : d.key)}
                      className="flex min-w-0 flex-1 items-center gap-2 text-left"
                    >
                      {p ? (
                        <>
                          <Thumb product={p} className="h-9 w-9" />
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-sm text-slate-700">{p.name}</span>
                            <span className="block text-[11px] text-slate-400">
                              {money(p.price)}
                              {p.storeName && ` · ${p.storeName}`}
                            </span>
                          </span>
                        </>
                      ) : (
                        <span className="text-sm font-semibold text-coral-600">Choose the product →</span>
                      )}
                    </button>
                    <button
                      type="button"
                      aria-label={`Remove piece ${n + 1}`}
                      onClick={() => {
                        setDots((list) => list.filter((x) => x.key !== d.key));
                        if (selected === d.key) setSelected(null);
                      }}
                      className="px-2 text-coral-600"
                    >
                      ✕
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>

          {active && (
            <div className="rounded-2xl border border-mango-200 bg-white p-3">
              <label htmlFor="look-search" className="label">
                Which product is piece {dots.indexOf(active) + 1}?
              </label>
              <input
                id="look-search"
                type="search"
                autoFocus
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search products"
                className="input !py-2 text-sm"
              />
              <ul className="mt-2 max-h-64 space-y-1 overflow-y-auto">
                {matches.map((p) => (
                  <li key={p.id}>
                    <button
                      type="button"
                      onClick={() => setProduct(p.id)}
                      className={`flex w-full items-center gap-2 rounded-lg p-1.5 text-left hover:bg-ocean-50 ${p.id === active.productId ? "bg-ocean-50" : ""}`}
                    >
                      <Thumb product={p} className="h-9 w-9" />
                      <span className="min-w-0 flex-1 truncate text-sm text-slate-700">
                        {p.name}
                        {p.hidden && <span className="ml-1 text-[11px] text-slate-400">(hidden)</span>}
                        {p.storeName && <span className="ml-1 text-[11px] text-slate-400">· {p.storeName}</span>}
                      </span>
                      <span className="text-xs text-slate-400">{money(p.price)}</span>
                    </button>
                  </li>
                ))}
                {matches.length === 0 && <li className="p-2 text-sm text-slate-400">No products match.</li>}
              </ul>
            </div>
          )}

          <div>
            <label htmlFor="look-title" className="label">3. Name</label>
            <input
              id="look-title"
              name="title"
              required
              maxLength={80}
              defaultValue={look?.title}
              placeholder="e.g. Eid in white"
              className="input"
            />
          </div>
          <div>
            <label htmlFor="look-description" className="label">
              Short note <span className="font-normal text-slate-400">(optional)</span>
            </label>
            <input
              id="look-description"
              name="description"
              maxLength={300}
              defaultValue={look?.description}
              placeholder="e.g. Light linen for the Eid morning prayer"
              className="input"
            />
          </div>
          <fieldset>
            <legend className="label">Occasions</legend>
            <div className="flex flex-wrap gap-2">
              {LOOK_OCCASIONS.map((o) => (
                <label
                  key={o.key}
                  className="flex cursor-pointer items-center gap-1.5 rounded-full border border-sand-200 px-3 py-1.5 text-sm has-[:checked]:border-ocean-600 has-[:checked]:bg-ocean-50 has-[:checked]:text-ocean-900"
                >
                  <input
                    type="checkbox"
                    name="occasions"
                    value={o.key}
                    defaultChecked={look?.occasions.includes(o.key)}
                    className="sr-only"
                  />
                  {o.emoji} {o.label}
                </label>
              ))}
            </div>
          </fieldset>
          {allowDiscount && (
            <div>
              <label htmlFor="look-discount" className="label">
                Discount for buying the whole look (%) <span className="font-normal text-slate-400">(optional)</span>
              </label>
              <input
                id="look-discount"
                name="discountPct"
                type="number"
                min="0"
                max={LOOK_MAX_DISCOUNT}
                step="1"
                value={pct || ""}
                onChange={(e) => setPct(Number(e.target.value))}
                placeholder="e.g. 10"
                className="input"
              />
              <p className="mt-1 text-xs text-slate-400">
                {pct > 0 && items.length >= LOOK_MIN_ITEMS
                  ? `Whole look ${money(Math.round(total * (100 - pct)) / 100)} instead of ${money(total)}. `
                  : ""}
                Only when every piece is in the basket. Works for looks of up to {LOOK_MAX_BUNDLE} pieces; it also shows
                under your Promotions as an offer.
              </p>
            </div>
          )}
          <label className="flex items-center gap-2 text-sm text-slate-600">
            <input type="checkbox" name="active" defaultChecked={look ? look.active : true} className="h-4 w-4 accent-ocean-700" />
            Show it to shoppers
          </label>
        </div>
      </div>

      {dots.some((d) => !d.productId) && (
        <p className="text-sm font-semibold text-coral-600">Choose the product for every dot, or remove the dots you don&apos;t need.</p>
      )}
      <div className="flex justify-end gap-2">
        <button type="button" onClick={onCancel} className="btn-secondary">
          Cancel
        </button>
        <SubmitButton className="btn-primary">{look ? "Save look" : "Publish look"}</SubmitButton>
      </div>
    </form>
  );
}

function Thumb({ product, className = "" }: { product: LookPickerProduct; className?: string }) {
  return product.image ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={product.image} alt="" className={`shrink-0 rounded-lg bg-sand-100 object-cover ${className}`} />
  ) : (
    <span className={`flex shrink-0 items-center justify-center rounded-lg bg-sand-100 text-lg ${className}`}>
      {product.icon}
    </span>
  );
}
