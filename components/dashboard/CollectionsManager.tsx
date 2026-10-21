"use client";

import Link from "next/link";
import { useActionState, useEffect, useMemo, useState, useTransition } from "react";
import {
  deleteCollection,
  moveCollection,
  saveCollection,
  type CollectionState,
} from "@/app/vendor/collections/actions";
import SubmitButton from "@/components/dashboard/SubmitButton";
import { money } from "@/lib/format";
import type { StoreCollection } from "@/lib/collections";

export interface PickerProduct {
  id: string;
  name: string;
  image?: string;
  icon: string;
  price: number;
  hidden: boolean;
}

/**
 * Collections list + editor. The editor is one form: name, description,
 * visibility and an ordered product list posted as `productIdsJson`.
 */
export default function CollectionsManager({
  store,
  canEdit,
  collections,
  products,
}: {
  store: string;
  canEdit: boolean;
  collections: StoreCollection[];
  products: PickerProduct[];
}) {
  /** null = list only; "new" = creating; otherwise the id being edited. */
  const [editing, setEditing] = useState<string | null>(null);
  const [message, setMessage] = useState<CollectionState>({});
  const [pending, startTransition] = useTransition();
  const byId = useMemo(() => new Map(products.map((p) => [p.id, p])), [products]);
  const current = editing && editing !== "new" ? collections.find((c) => c.id === editing) : undefined;

  const act = (fn: () => Promise<CollectionState>) =>
    startTransition(async () => setMessage(await fn()));

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div className="card flex flex-wrap items-center justify-between gap-4 p-6">
        <div className="min-w-0">
          <h1 className="font-display text-2xl font-extrabold text-ocean-950">Collections</h1>
          <p className="mt-1 max-w-xl text-sm text-slate-500">
            Your own groupings — &ldquo;Ramadan picks&rdquo;, &ldquo;Kitchen essentials&rdquo;, &ldquo;Under
            $20&rdquo;. Each one is a tab on your store page. A product can be in as many as you like;
            the marketplace categories don&apos;t change.
          </p>
        </div>
        {canEdit && editing === null && (
          <button type="button" onClick={() => (setMessage({}), setEditing("new"))} className="btn-primary">
            + New collection
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
        <CollectionEditor
          key={editing}
          collection={current}
          products={products}
          onDone={(state) => {
            setMessage(state);
            if (state.ok) setEditing(null);
          }}
          onCancel={() => setEditing(null)}
        />
      )}

      {collections.length === 0 && editing === null ? (
        <div className="card p-10 text-center">
          <p className="text-4xl">🗂️</p>
          <p className="mt-2 font-display text-lg font-bold text-ocean-950">No collections yet</p>
          <p className="mx-auto mt-1 max-w-sm text-sm text-slate-500">
            Group products the way your customers shop — a season, an occasion, a price point.
          </p>
        </div>
      ) : (
        <ul className="space-y-3">
          {collections.map((c, i) => {
            const items = c.productIds.map((id) => byId.get(id)).filter((p): p is PickerProduct => Boolean(p));
            return (
              <li key={c.id} className="card flex flex-col gap-4 p-4 sm:flex-row sm:items-center">
                <div className="flex shrink-0 -space-x-3">
                  {items.slice(0, 4).map((p) => (
                    <Thumb key={p.id} product={p} className="h-12 w-12 ring-2 ring-white" />
                  ))}
                  {items.length === 0 && (
                    <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-sand-100 text-xl">🗂️</span>
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="font-semibold text-ocean-950">
                    {c.name}
                    {c.hidden && (
                      <span className="ml-2 rounded-full bg-sand-100 px-2 py-0.5 text-[11px] font-bold text-slate-500">
                        Hidden
                      </span>
                    )}
                  </p>
                  <p className="text-xs text-slate-400">
                    {items.length} product{items.length === 1 ? "" : "s"}
                    {c.description && ` · ${c.description}`}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {!c.hidden && (
                    <Link
                      href={`/store/${store}?c=${c.slug}`}
                      target="_blank"
                      className="rounded-xl px-3 py-1.5 text-xs font-semibold text-ocean-700 hover:bg-ocean-50"
                    >
                      View ↗
                    </Link>
                  )}
                  {canEdit && (
                    <>
                      <button
                        type="button"
                        aria-label={`Move ${c.name} earlier`}
                        disabled={pending || i === 0}
                        onClick={() => act(() => moveCollection(c.id, -1))}
                        className="rounded-lg px-2 py-1 text-slate-500 hover:bg-sand-100 disabled:opacity-30"
                      >
                        ↑
                      </button>
                      <button
                        type="button"
                        aria-label={`Move ${c.name} later`}
                        disabled={pending || i === collections.length - 1}
                        onClick={() => act(() => moveCollection(c.id, 1))}
                        className="rounded-lg px-2 py-1 text-slate-500 hover:bg-sand-100 disabled:opacity-30"
                      >
                        ↓
                      </button>
                      <button
                        type="button"
                        onClick={() => (setMessage({}), setEditing(c.id))}
                        className="btn-secondary !px-3 !py-1.5 text-xs"
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        disabled={pending}
                        onClick={() => {
                          if (confirm(`Delete "${c.name}"? The products stay in your store.`)) {
                            act(() => deleteCollection(c.id));
                          }
                        }}
                        className="rounded-xl px-3 py-1.5 text-xs font-semibold text-coral-600 hover:bg-coral-100"
                      >
                        Delete
                      </button>
                    </>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
      {!canEdit && (
        <p className="text-center text-xs text-slate-400">Your account can view collections but not change them.</p>
      )}
    </div>
  );
}

function CollectionEditor({
  collection,
  products,
  onDone,
  onCancel,
}: {
  collection?: StoreCollection;
  products: PickerProduct[];
  onDone: (state: CollectionState) => void;
  onCancel: () => void;
}) {
  const [state, formAction] = useActionState(saveCollection, {});
  const [picked, setPicked] = useState<string[]>(
    () => collection?.productIds.filter((id) => products.some((p) => p.id === id)) ?? [],
  );
  const [query, setQuery] = useState("");
  const byId = useMemo(() => new Map(products.map((p) => [p.id, p])), [products]);

  useEffect(() => {
    if (state.ok || state.error) onDone(state);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  const q = query.trim().toLowerCase();
  const available = products.filter((p) => !picked.includes(p.id) && (!q || p.name.toLowerCase().includes(q)));
  const move = (index: number, by: -1 | 1) =>
    setPicked((list) => {
      const next = [...list];
      const target = index + by;
      if (target < 0 || target >= next.length) return list;
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });

  return (
    <form action={formAction} className="card space-y-5 p-6">
      <h2 className="font-display text-lg font-extrabold text-ocean-950">
        {collection ? `Edit "${collection.name}"` : "New collection"}
      </h2>
      {collection && <input type="hidden" name="id" value={collection.id} />}
      <input type="hidden" name="productIdsJson" value={JSON.stringify(picked)} />

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="col-name" className="label">Name</label>
          <input
            id="col-name"
            name="name"
            required
            maxLength={60}
            defaultValue={collection?.name}
            placeholder="e.g. Ramadan picks"
            className="input"
          />
        </div>
        <div>
          <label htmlFor="col-description" className="label">
            Short description <span className="font-normal text-slate-400">(optional)</span>
          </label>
          <input
            id="col-description"
            name="description"
            maxLength={300}
            defaultValue={collection?.description}
            placeholder="Shown above the products"
            className="input"
          />
        </div>
      </div>
      <label className="flex items-center gap-2 text-sm text-slate-600">
        <input type="checkbox" name="hidden" defaultChecked={collection?.hidden} className="h-4 w-4 accent-ocean-700" />
        Hide from the store page for now
      </label>

      <div className="grid gap-4 lg:grid-cols-2">
        <div>
          <p className="label">
            In this collection <span className="font-normal text-slate-400">({picked.length}, in this order)</span>
          </p>
          <ul className="max-h-80 space-y-1.5 overflow-y-auto rounded-xl border border-sand-200 p-2">
            {picked.length === 0 && <li className="p-3 text-sm text-slate-400">Add products from the list.</li>}
            {picked.map((id, i) => {
              const p = byId.get(id)!;
              return (
                <li key={id} className="flex items-center gap-2 rounded-lg bg-sand-50 p-1.5">
                  <Thumb product={p} className="h-9 w-9" />
                  <span className="min-w-0 flex-1 truncate text-sm text-slate-700">{p.name}</span>
                  <button type="button" aria-label="Move up" onClick={() => move(i, -1)} disabled={i === 0} className="px-1.5 text-slate-500 disabled:opacity-30">↑</button>
                  <button type="button" aria-label="Move down" onClick={() => move(i, 1)} disabled={i === picked.length - 1} className="px-1.5 text-slate-500 disabled:opacity-30">↓</button>
                  <button
                    type="button"
                    aria-label={`Remove ${p.name}`}
                    onClick={() => setPicked((list) => list.filter((x) => x !== id))}
                    className="px-1.5 text-coral-600"
                  >
                    ✕
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
        <div>
          <label htmlFor="col-search" className="label">Add products</label>
          <input
            id="col-search"
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search your products"
            className="input !py-2 text-sm"
          />
          <ul className="mt-2 max-h-72 space-y-1.5 overflow-y-auto">
            {available.slice(0, 100).map((p) => (
              <li key={p.id}>
                <button
                  type="button"
                  onClick={() => setPicked((list) => [...list, p.id])}
                  className="flex w-full items-center gap-2 rounded-lg p-1.5 text-left hover:bg-ocean-50"
                >
                  <Thumb product={p} className="h-9 w-9" />
                  <span className="min-w-0 flex-1 truncate text-sm text-slate-700">
                    {p.name}
                    {p.hidden && <span className="ml-1 text-[11px] text-slate-400">(hidden)</span>}
                  </span>
                  <span className="text-xs text-slate-400">{money(p.price)}</span>
                  <span className="text-sm font-bold text-ocean-700">+</span>
                </button>
              </li>
            ))}
            {available.length === 0 && <li className="p-2 text-sm text-slate-400">No more products match.</li>}
          </ul>
        </div>
      </div>

      <div className="flex justify-end gap-2">
        <button type="button" onClick={onCancel} className="btn-secondary">
          Cancel
        </button>
        <SubmitButton className="btn-primary">{collection ? "Save collection" : "Create collection"}</SubmitButton>
      </div>
    </form>
  );
}

function Thumb({ product, className = "" }: { product: PickerProduct; className?: string }) {
  return product.image ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={product.image} alt="" className={`shrink-0 rounded-xl bg-sand-100 object-cover ${className}`} />
  ) : (
    <span className={`flex shrink-0 items-center justify-center rounded-xl bg-sand-100 text-lg ${className}`}>
      {product.icon}
    </span>
  );
}
