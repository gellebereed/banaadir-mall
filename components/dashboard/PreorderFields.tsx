"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { markPreorderArrived } from "@/app/actions";
import { money } from "@/lib/format";
import { MAX_EARLY_PCT, arrivalDate, daysUntilArrival, isPreorder, preorderProgress } from "@/lib/preorder";
import type { Product } from "@/lib/types";

/**
 * THE PRE-ORDER SECTION of the product editor.
 *
 * Three questions, in the order a shop owner thinks them: is this stock
 * still on its way, when does it land, and what do early buyers get. The
 * "how many" question is deliberately NOT asked here — it is the stock
 * field directly above, which on a pre-order means "units customers can
 * reserve". One number, in the place the seller already looks for it.
 *
 * Once pre-orders are open the section turns into the campaign's control
 * panel: how many are reserved, the links to send to customers, and the
 * one button that ends it — "the stock has arrived".
 *
 * Posts `preorderControl`, `preorder`, `preorderArrivesAt`,
 * `preorderEarlyPct` and `preorderNote` (read by readPreorderForm in
 * app/actions.ts). `preorderControl` is what tells the server this form
 * HAS the section — without it an unticked box is indistinguishable from a
 * form that never asked.
 */
export default function PreorderFields({
  product,
  price,
  stock,
}: {
  /** The product being edited; absent while adding a new one. */
  product?: Product;
  /** The price typed in the form right now, for the early-price preview. */
  price: number;
  /** Units in the stock field right now. */
  stock: number;
}) {
  const live = product ? isPreorder(product) : false;
  const [on, setOn] = useState(live);
  const [arrivesAt, setArrivesAt] = useState(live ? (product?.preorder?.arrivesAt ?? "") : "");
  const [earlyPct, setEarlyPct] = useState(live ? String(product?.preorder?.earlyPct ?? "") : "");
  const box = useRef<HTMLInputElement>(null);

  // SafeForm restores an unsaved draft straight into the DOM, without an
  // onChange — so the box can be ticked while this still thinks it is not.
  useEffect(() => {
    const timer = window.setTimeout(() => {
      if (box.current && box.current.checked !== on) setOn(box.current.checked);
    }, 80);
    return () => window.clearTimeout(timer);
    // Once, after mount: this is about the restored draft, not later edits.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Mogadishu's date, so "today" is the shop's today whatever the laptop says.
  const today = new Date(Date.now() + 3 * 3_600_000).toISOString().slice(0, 10);
  const pct = Math.min(MAX_EARLY_PCT, Math.max(0, Math.round(Number(earlyPct) || 0)));
  const earlyPrice = price > 0 && pct > 0 ? Math.round(price * (1 - pct / 100) * 100) / 100 : 0;

  return (
    <div>
      <input type="hidden" name="preorderControl" value="1" />

      <label className="flex cursor-pointer items-start gap-3 rounded-xl border-2 border-sand-200 px-4 py-3 transition has-[:checked]:border-ocean-600 has-[:checked]:bg-ocean-50">
        <input
          ref={box}
          type="checkbox"
          name="preorder"
          value="on"
          checked={on}
          onChange={(e) => setOn(e.target.checked)}
          className="mt-1 h-4 w-4 accent-ocean-700"
        />
        <span>
          <span className="block text-sm font-bold text-slate-800">
            📦 This stock hasn’t arrived yet — take pre-orders
          </span>
          <span className="block text-xs text-slate-500">
            Customers can reserve and order it now. The page shows your arrival date, a countdown and
            how many have been reserved, instead of “in stock”.
          </span>
        </span>
      </label>

      {on && (
        <div className="mt-4 space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="preorderArrivesAt" className="label">
                Arrival date <span className="text-coral-500">*</span>
              </label>
              <input
                id="preorderArrivesAt"
                name="preorderArrivesAt"
                type="date"
                required
                min={today}
                value={arrivesAt}
                onChange={(e) => setArrivesAt(e.target.value)}
                className="input"
              />
              <p className="mt-1 text-xs text-slate-400">
                When you expect it in your shop. Add a few days of safety — early is a nice surprise,
                late is a broken promise.
              </p>
            </div>
            <div>
              <label htmlFor="preorderEarlyPct" className="label">
                Early price <span className="font-normal text-slate-400">(optional)</span>
              </label>
              <div className="relative">
                <input
                  id="preorderEarlyPct"
                  name="preorderEarlyPct"
                  type="number"
                  min="0"
                  max={MAX_EARLY_PCT}
                  step="1"
                  inputMode="numeric"
                  value={earlyPct}
                  onChange={(e) => setEarlyPct(e.target.value)}
                  placeholder="10"
                  className="input !pr-14"
                />
                <span className="pointer-events-none absolute inset-y-0 right-4 flex items-center text-sm font-bold text-slate-400">
                  % off
                </span>
              </div>
              <p className="mt-1 text-xs text-slate-400">
                {earlyPrice > 0 ? (
                  <>
                    Pre-order customers pay <strong className="text-ocean-800">{money(earlyPrice)}</strong>{" "}
                    instead of {money(price)}. Ends by itself when the stock arrives.
                  </>
                ) : (
                  "The strongest reason to order now rather than wait. Ends by itself when the stock arrives."
                )}
              </p>
            </div>
          </div>

          <div>
            <label htmlFor="preorderNote" className="label">
              A line for customers <span className="font-normal text-slate-400">(optional)</span>
            </label>
            <input
              id="preorderNote"
              name="preorderNote"
              maxLength={140}
              defaultValue={live ? product?.preorder?.note : ""}
              placeholder="New season collection, coming direct from Istanbul"
              className="input"
            />
          </div>

          <p className="rounded-xl bg-mango-50 px-4 py-3 text-xs text-mango-900">
            <strong>How many can be reserved?</strong> The stock number above
            {stock > 0 ? (
              <>
                {" "}
                — right now <strong>{stock.toLocaleString()}</strong>
              </>
            ) : null}
            . Set it to the units you have coming (per size and colour if you use variants). Each
            pre-order takes one off, and pre-orders close by themselves when it reaches zero.
            {stock === 0 && (
              <strong className="mt-1 block text-coral-700">
                Stock is 0, so nobody can pre-order yet — enter the quantity you are expecting.
              </strong>
            )}
          </p>
        </div>
      )}

      {live && product && <LivePanel product={product} />}
    </div>
  );
}

/** While pre-orders are open: the count, the links to send, and the way out. */
function LivePanel({ product }: { product: Product }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [confirming, setConfirming] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  const preorder = product.preorder!;
  const progress = preorderProgress(product);
  const days = daysUntilArrival(preorder.arrivesAt);
  const date = arrivalDate(preorder.arrivesAt);

  const links = [
    { key: "product", label: "This product", path: `/product/${product.slug}` },
    { key: "all", label: "All your pre-orders", path: `/preorder?store=${product.store}` },
  ];
  // Known only in the browser, and only after mount — reading it during
  // render gives the server and the browser two different WhatsApp links.
  const [origin, setOrigin] = useState("");
  useEffect(() => setOrigin(window.location.origin), []);
  const url = (path: string) => `${origin}${path}`;
  const message = (path: string) =>
    `📦 ${product.name} is on its way! Pre-order yours now, arriving ${date}.` +
    (preorder.earlyPct ? ` ${preorder.earlyPct}% off until it lands.` : "") +
    ` ${url(path)}`;

  async function copy(key: string, path: string) {
    try {
      await navigator.clipboard.writeText(url(path));
      setCopied(key);
      window.setTimeout(() => setCopied(null), 1800);
    } catch {
      // Clipboard blocked (http, old browser): the link is still on screen to copy by hand.
    }
  }

  if (result?.ok) {
    return (
      <p className="mt-4 rounded-xl bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-800">
        ✅ {result.message}
      </p>
    );
  }

  return (
    <div className="mt-5 space-y-4 border-t border-sand-200 pt-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-bold text-ocean-950">
          🟢 Pre-orders are open
          <span className="ml-2 font-normal text-slate-500">
            {days < 0 ? `arrival date (${date}) has passed` : days === 0 ? "arriving today" : `arriving ${date}`}
          </span>
        </p>
        <p className="rounded-full bg-ocean-950 px-3 py-1 text-xs font-bold text-mango-300">
          {progress ? `${progress.reserved} of ${progress.total} reserved` : "No pre-orders yet"}
        </p>
      </div>

      {/* The whole point: a link the shop can put in front of its regulars. */}
      <div>
        <p className="label">Send it to your customers</p>
        <ul className="space-y-2">
          {links.map((link) => (
            <li key={link.key} className="flex flex-wrap items-center gap-2 rounded-xl bg-sand-50 px-3 py-2">
              <span className="min-w-0 flex-1">
                <span className="block text-xs font-bold text-slate-700">{link.label}</span>
                <span className="block truncate font-mono text-[11px] text-slate-400">{link.path}</span>
              </span>
              <button
                type="button"
                onClick={() => copy(link.key, link.path)}
                className="rounded-full border border-sand-200 bg-white px-3 py-1.5 text-xs font-bold text-slate-700 hover:border-ocean-400"
              >
                {copied === link.key ? "✓ Copied" : "Copy link"}
              </button>
              <a
                href={`https://wa.me/?text=${encodeURIComponent(message(link.path))}`}
                target="_blank"
                rel="noopener noreferrer"
                className="rounded-full bg-emerald-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-emerald-700"
              >
                WhatsApp
              </a>
            </li>
          ))}
        </ul>
        <p className="mt-1.5 text-xs text-slate-400">
          WhatsApp opens with the message written — choose a contact, a group or a broadcast list.
        </p>
      </div>

      <div className={`rounded-xl px-4 py-3 ${days < 0 ? "bg-coral-50" : "bg-sand-50"}`}>
        <p className="text-sm font-bold text-slate-800">
          {days < 0 ? "Has the stock arrived?" : "When the stock arrives"}
        </p>
        <p className="mt-0.5 text-xs text-slate-600">
          Tell us and the product switches to normal selling: the early price ends, customers see
          “Just landed” for two weeks, and you can start sending out the pre-orders waiting in Orders.
          {days < 0 && " Until you do, customers are told it is arriving any day now."}
        </p>
        {result && !result.ok && <p className="mt-2 text-xs font-semibold text-coral-700">{result.message}</p>}
        <div className="mt-3 flex flex-wrap gap-2">
          {confirming ? (
            <>
              <button
                type="button"
                disabled={pending}
                onClick={() =>
                  startTransition(async () => {
                    const outcome = await markPreorderArrived(product.id);
                    setResult(outcome);
                    setConfirming(false);
                    if (outcome.ok) router.refresh();
                  })
                }
                className="rounded-full bg-emerald-600 px-4 py-2 text-xs font-bold text-white hover:bg-emerald-700 disabled:opacity-60"
              >
                {pending ? "Saving…" : "Yes, it is in my shop"}
              </button>
              <button
                type="button"
                disabled={pending}
                onClick={() => setConfirming(false)}
                className="rounded-full border border-sand-200 bg-white px-4 py-2 text-xs font-bold text-slate-600"
              >
                Not yet
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={() => setConfirming(true)}
              className="rounded-full bg-ocean-800 px-4 py-2 text-xs font-bold text-white hover:bg-ocean-700"
            >
              ✅ The stock has arrived
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
