"use client";

import Image from "next/image";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import {
  applyStockFile,
  previewStockFile,
  saveStockBuffer,
  setStockLevels,
  type StockPreview,
} from "@/app/vendor/stock/actions";
import { normaliseCode } from "@/lib/stock-sync";
import type { PosSettings } from "@/lib/types";

export interface StockLine {
  key: string;
  productId: string;
  variantId?: string;
  name: string;
  label?: string;
  codes: string[];
  stock: number;
  image?: string;
  icon?: string;
  hidden?: boolean;
}

type Tab = "upload" | "hand";

/**
 * The stock page: upload from the POS, or update by hand. Both end in the
 * same place — the counts customers see online.
 */
export default function StockClient({
  lines,
  saved,
  buffer,
}: {
  lines: StockLine[];
  saved?: PosSettings["stockImport"];
  buffer: number;
}) {
  const [tab, setTab] = useState<Tab>("upload");
  const soldOut = lines.filter((l) => l.stock <= 0 && !l.hidden).length;
  const low = lines.filter((l) => l.stock > 0 && l.stock <= 3 && !l.hidden).length;

  return (
    <div className="mt-5 space-y-5">
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: "Items with their own count", value: lines.length },
          { label: "Sold out", value: soldOut, tone: soldOut ? "text-coral-600" : "" },
          { label: "Low (1–3 left)", value: low, tone: low ? "text-amber-700" : "" },
        ].map((tile) => (
          <div key={tile.label} className="card p-4">
            <p className="text-xs font-medium text-slate-500">{tile.label}</p>
            <p className={`mt-1 font-display text-2xl font-extrabold text-ocean-950 ${tile.tone ?? ""}`}>{tile.value}</p>
          </div>
        ))}
      </div>

      <div role="tablist" className="flex gap-2">
        {(
          [
            ["upload", "📤 Upload from your POS"],
            ["hand", "✋ Update by hand"],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            type="button"
            role="tab"
            aria-selected={tab === key}
            onClick={() => setTab(key)}
            className={`rounded-full px-4 py-2 text-sm font-bold transition ${
              tab === key ? "bg-ocean-800 text-white shadow-sm" : "bg-white text-slate-600 ring-1 ring-sand-200 hover:ring-ocean-300"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === "upload" ? <UploadPanel saved={saved} /> : <HandPanel lines={lines} />}

      <BufferCard initial={buffer} />
    </div>
  );
}

// ── Upload from the POS ──────────────────────────────────────────────────

function UploadPanel({ saved }: { saved?: PosSettings["stockImport"] }) {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<StockPreview | null>(null);
  const [choice, setChoice] = useState<{ sheet?: string; codeColumn?: string; qtyColumn?: string; mode?: "set" | "add" }>({});
  const [editing, setEditing] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [pending, start] = useTransition();

  const form = (f: File, c: typeof choice) => {
    const data = new FormData();
    data.set("file", f);
    for (const [k, v] of Object.entries(c)) if (v) data.set(k, v);
    return data;
  };

  const runPreview = (f: File, c: typeof choice) =>
    start(async () => {
      setResult(null);
      const p = await previewStockFile(form(f, c));
      setPreview(p);
      // The first time (nothing remembered) open the column choice.
      setEditing(!p.remembered);
    });

  const change = (patch: typeof choice) => {
    const next = { ...choice, ...patch };
    setChoice(next);
    if (file) runPreview(file, next);
  };

  const table = preview?.sheets.find((s) => s.name === preview.sheet) ?? preview?.sheets[0];
  const plan = preview?.plan;

  return (
    <section className="card p-5 sm:p-6">
      <h2 className="font-display font-bold text-ocean-950">Upload your stock report</h2>
      <p className="mt-1 text-sm text-slate-500">
        Export &ldquo;stock on hand&rdquo; from your POS (Excel or CSV) and drop it here. Items are matched by
        barcode or product code.{" "}
        {saved
          ? `Your layout is remembered: code from “${saved.codeColumn}”, quantity from “${saved.qtyColumn}”.`
          : "The first time, you'll show us which columns to read — after that it's remembered."}
      </p>

      <label className="mt-4 flex cursor-pointer flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-sand-300 bg-sand-50 p-6 text-center hover:border-ocean-400">
        <span className="text-3xl" aria-hidden>📄</span>
        <span className="text-sm font-bold text-ocean-900">{file ? file.name : "Choose your stock file"}</span>
        <span className="text-xs text-slate-500">.xlsx or .csv · up to 15 MB</span>
        <input
          type="file"
          accept=".xlsx,.xlsm,.csv,.tsv,.txt"
          className="sr-only"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (!f) return;
            setFile(f);
            setChoice({});
            runPreview(f, {});
          }}
        />
      </label>

      {pending && <p className="mt-3 text-sm text-slate-500">Reading your file…</p>}

      {preview && !pending && (
        <div className="mt-5 space-y-4">
          {/* Which columns — shown the first time, or on request. */}
          {editing || !preview.ok ? (
            <div className="grid gap-3 rounded-2xl bg-sand-50 p-4 sm:grid-cols-4">
              {preview.sheets.length > 1 && (
                <Select label="Sheet" value={preview.sheet} options={preview.sheets.map((s) => s.name)} onChange={(v) => change({ sheet: v, codeColumn: undefined, qtyColumn: undefined })} />
              )}
              <Select label="Barcode / code column" value={preview.codeColumn} options={table?.headers ?? []} onChange={(v) => change({ codeColumn: v })} />
              <Select label="Quantity column" value={preview.qtyColumn} options={table?.headers ?? []} onChange={(v) => change({ qtyColumn: v })} />
              <div>
                <span className="label">This file is…</span>
                <select
                  value={preview.mode}
                  onChange={(e) => change({ mode: e.target.value as "set" | "add" })}
                  className="input !py-2 text-sm"
                >
                  <option value="set">What I have now (replace)</option>
                  <option value="add">A delivery (add to stock)</option>
                </select>
              </div>
              {table && (
                <div className="overflow-x-auto sm:col-span-4">
                  <p className="mb-1 text-[11px] font-semibold text-slate-500">First rows of “{table.name}” ({table.rows} rows)</p>
                  <table className="w-full text-left text-[11px]">
                    <thead>
                      <tr>
                        {table.headers.map((h) => (
                          <th
                            key={h}
                            className={`whitespace-nowrap px-2 py-1 font-bold ${
                              h === preview.codeColumn ? "bg-ocean-100 text-ocean-900" : h === preview.qtyColumn ? "bg-emerald-100 text-emerald-900" : "text-slate-500"
                            }`}
                          >
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {table.sample.map((row, i) => (
                        <tr key={i} className="border-t border-sand-200">
                          {row.map((cell, j) => (
                            <td key={j} className="whitespace-nowrap px-2 py-1 text-slate-700">{cell}</td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          ) : (
            <p className="text-sm text-slate-600">
              Reading <strong>{preview.codeColumn}</strong> → <strong>{preview.qtyColumn}</strong>
              {preview.mode === "add" ? " (adding a delivery)" : ""} ·{" "}
              <button type="button" onClick={() => setEditing(true)} className="font-semibold text-ocean-700 hover:underline">
                change
              </button>
            </p>
          )}

          {!preview.ok && preview.message && <p className="rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-900">{preview.message}</p>}

          {plan && (
            <>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                <Mini label="Will update" value={plan.changes.length} />
                <Mini label="Will sell out" value={plan.soldOut} tone={plan.soldOut ? "text-coral-600" : ""} />
                <Mini label="Already right" value={plan.unchanged} />
                <Mini label="Codes not found" value={plan.notFound.length} tone={plan.notFound.length ? "text-amber-700" : ""} />
              </div>

              {plan.changes.length > 0 && (
                <div className="max-h-80 overflow-y-auto rounded-xl ring-1 ring-sand-200">
                  <table className="w-full text-sm">
                    <tbody className="divide-y divide-sand-100">
                      {plan.changes.slice(0, 200).map((c) => (
                        <tr key={`${c.productId}|${c.variantId ?? ""}`}>
                          <td className="px-3 py-2">
                            <p className="font-medium text-slate-800">{c.name}</p>
                            {c.label && <p className="text-xs text-slate-500">{c.label}</p>}
                          </td>
                          <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums">
                            <span className="text-slate-400">{c.from}</span> →{" "}
                            <strong className={c.to === 0 ? "text-coral-600" : "text-ocean-950"}>{c.to === 0 ? "Sold out" : c.to}</strong>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {plan.changes.length > 200 && <p className="p-2 text-center text-xs text-slate-500">…and {plan.changes.length - 200} more</p>}
                </div>
              )}

              {plan.notFound.length > 0 && (
                <details className="rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-900">
                  <summary className="cursor-pointer font-semibold">
                    {plan.notFound.length} code{plan.notFound.length === 1 ? "" : "s"} in the file didn&apos;t match a product
                  </summary>
                  <p className="mt-1 text-xs">
                    Add these codes to the products (Products → edit → Barcode / Internal reference) and they&apos;ll match next time:{" "}
                    {plan.notFound.slice(0, 30).map((n) => n.code).join(", ")}
                    {plan.notFound.length > 30 && "…"}
                  </p>
                </details>
              )}

              <div className="flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  disabled={pending || plan.changes.length === 0}
                  onClick={() =>
                    file &&
                    start(async () => {
                      const r = await applyStockFile(form(file, { ...choice, sheet: preview.sheet, codeColumn: preview.codeColumn, qtyColumn: preview.qtyColumn, mode: preview.mode }));
                      setResult(r);
                      if (r.ok) {
                        setPreview(null);
                        setFile(null);
                      }
                    })
                  }
                  className="btn-primary disabled:opacity-50"
                >
                  {plan.changes.length === 0 ? "Nothing to change" : `Update ${plan.changes.length} item${plan.changes.length === 1 ? "" : "s"}`}
                </button>
              </div>
            </>
          )}
        </div>
      )}

      {result && (
        <p className={`mt-4 rounded-xl px-4 py-3 text-sm font-semibold ${result.ok ? "bg-emerald-50 text-emerald-800" : "bg-amber-50 text-amber-900"}`}>
          {result.ok ? "✓ " : "⚠ "}
          {result.message}
        </p>
      )}
    </section>
  );
}

function Select({ label, value, options, onChange }: { label: string; value?: string; options: string[]; onChange: (v: string) => void }) {
  return (
    <div>
      <span className="label">{label}</span>
      <select value={value ?? ""} onChange={(e) => onChange(e.target.value)} className="input !py-2 text-sm">
        <option value="" disabled>
          Choose…
        </option>
        {options.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </select>
    </div>
  );
}

function Mini({ label, value, tone = "" }: { label: string; value: number; tone?: string }) {
  return (
    <div className="rounded-xl bg-sand-50 p-3 ring-1 ring-sand-200">
      <p className="text-[11px] font-medium text-slate-500">{label}</p>
      <p className={`font-display text-xl font-extrabold text-ocean-950 ${tone}`}>{value}</p>
    </div>
  );
}

// ── Update by hand ───────────────────────────────────────────────────────

function HandPanel({ lines }: { lines: StockLine[] }) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<"all" | "low" | "out">("all");
  const [edits, setEdits] = useState<Record<string, number>>({});
  const [focusKey, setFocusKey] = useState<string | null>(null);
  const [scanning, setScanning] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; message: string } | null>(null);
  const [pending, start] = useTransition();
  const inputs = useRef<Record<string, HTMLInputElement | null>>({});

  const byCode = useMemo(() => {
    const map = new Map<string, StockLine>();
    for (const line of lines) for (const code of line.codes) map.set(normaliseCode(code), line);
    return map;
  }, [lines]);

  const current = (l: StockLine) => edits[l.key] ?? l.stock;
  const q = query.trim().toLowerCase();
  const visible = lines
    .filter((l) => (filter === "out" ? current(l) <= 0 : filter === "low" ? current(l) > 0 && current(l) <= 3 : true))
    .filter((l) => !q || l.name.toLowerCase().includes(q) || (l.label ?? "").toLowerCase().includes(q) || l.codes.some((c) => c.toLowerCase().includes(q)))
    .slice(0, 150);

  const changed = lines.filter((l) => edits[l.key] !== undefined && edits[l.key] !== l.stock);

  /** A scanned or typed code: jump to its line and put the cursor in it. */
  const goTo = (code: string) => {
    const line = byCode.get(normaliseCode(code));
    if (!line) {
      setMessage({ ok: false, message: `No product has the code ${code}. Add it on the product's page to scan it next time.` });
      return false;
    }
    setQuery("");
    setFilter("all");
    setFocusKey(line.key);
    setMessage(null);
    return true;
  };

  useEffect(() => {
    if (!focusKey) return;
    const el = inputs.current[focusKey];
    el?.scrollIntoView({ behavior: "smooth", block: "center" });
    el?.focus();
    el?.select();
  }, [focusKey]);

  const set = (key: string, value: number) => setEdits((e) => ({ ...e, [key]: Math.max(0, Math.floor(value || 0)) }));

  return (
    <section className="card p-4 sm:p-6">
      <div className="flex flex-col gap-2 sm:flex-row">
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            // A USB / Bluetooth barcode scanner "types" the code and presses
            // Enter — so scanning into this box jumps straight to the item.
            if (e.key === "Enter" && query.trim() && goTo(query.trim())) e.preventDefault();
          }}
          placeholder="🔍 Search name or scan / type a barcode…"
          aria-label="Search products or scan a barcode"
          className="input flex-1"
        />
        <CameraScanButton
          scanning={scanning}
          setScanning={setScanning}
          onCode={(code) => {
            setScanning(false);
            goTo(code);
          }}
        />
      </div>

      <div className="mt-3 flex gap-2">
        {(
          [
            ["all", "All"],
            ["low", "Low"],
            ["out", "Sold out"],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            type="button"
            onClick={() => setFilter(key)}
            className={`rounded-full px-3 py-1.5 text-xs font-bold ${filter === key ? "bg-ocean-800 text-white" : "bg-sand-100 text-slate-600"}`}
          >
            {label}
          </button>
        ))}
      </div>

      {message && (
        <p className={`mt-3 rounded-xl px-3 py-2 text-sm ${message.ok ? "bg-emerald-50 text-emerald-800" : "bg-amber-50 text-amber-900"}`}>{message.message}</p>
      )}

      <ul className="mt-3 divide-y divide-sand-100">
        {visible.map((line) => {
          const value = current(line);
          const isChanged = edits[line.key] !== undefined && edits[line.key] !== line.stock;
          return (
            <li key={line.key} className={`flex items-center gap-3 py-2.5 ${focusKey === line.key ? "rounded-xl bg-ocean-50 px-2" : ""}`}>
              <span className="relative flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-sand-100 text-lg">
                {line.image ? <Image src={line.image} alt="" fill sizes="44px" className="object-cover" /> : (line.icon ?? "📦")}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-slate-800">{line.name}</p>
                <p className="truncate text-xs text-slate-500">
                  {line.label}
                  {line.label && line.codes[0] ? " · " : ""}
                  {line.codes[0]}
                  {line.hidden && " · hidden"}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-1">
                <button type="button" onClick={() => set(line.key, value - 1)} aria-label={`One fewer ${line.name}`} className="flex h-9 w-9 items-center justify-center rounded-full bg-sand-100 font-bold text-slate-600">
                  −
                </button>
                <input
                  ref={(el) => {
                    inputs.current[line.key] = el;
                  }}
                  type="number"
                  inputMode="numeric"
                  min={0}
                  value={value}
                  onChange={(e) => set(line.key, Number(e.target.value))}
                  aria-label={`Stock for ${line.name}`}
                  className={`h-9 w-16 rounded-lg border text-center text-sm font-bold tabular-nums ${
                    isChanged ? "border-ocean-500 bg-ocean-50" : value <= 0 ? "border-coral-300 text-coral-600" : "border-sand-200"
                  }`}
                />
                <button type="button" onClick={() => set(line.key, value + 1)} aria-label={`One more ${line.name}`} className="flex h-9 w-9 items-center justify-center rounded-full bg-sand-100 font-bold text-slate-600">
                  +
                </button>
              </div>
            </li>
          );
        })}
        {visible.length === 0 && <li className="py-8 text-center text-sm text-slate-500">Nothing matches.</li>}
      </ul>

      {/* Save bar — sticks above the phone's tab bar while there are changes. */}
      {changed.length > 0 && (
        <div className="sticky bottom-[calc(4.5rem+env(safe-area-inset-bottom))] z-20 mt-4 flex items-center justify-between gap-3 rounded-2xl bg-ocean-900 p-3 text-white shadow-xl lg:bottom-4">
          <span className="text-sm font-semibold">
            {changed.length} change{changed.length === 1 ? "" : "s"} not saved
          </span>
          <span className="flex gap-2">
            <button type="button" onClick={() => setEdits({})} className="rounded-full px-3 py-1.5 text-sm font-semibold text-ocean-100 hover:bg-white/10">
              Undo
            </button>
            <button
              type="button"
              disabled={pending}
              onClick={() =>
                start(async () => {
                  const r = await setStockLevels(changed.map((l) => ({ productId: l.productId, variantId: l.variantId, stock: edits[l.key] })));
                  setMessage(r);
                  if (r.ok) setEdits({});
                })
              }
              className="rounded-full bg-mango-500 px-4 py-1.5 text-sm font-bold text-white hover:bg-mango-600 disabled:opacity-60"
            >
              {pending ? "Saving…" : "Save"}
            </button>
          </span>
        </div>
      )}
    </section>
  );
}

/**
 * Scan with the phone's camera. Uses the browser's own barcode reader
 * (Chrome on Android has it); where there isn't one the button doesn't
 * show — a USB/Bluetooth scanner into the search box still works.
 */
function CameraScanButton({
  scanning,
  setScanning,
  onCode,
}: {
  scanning: boolean;
  setScanning: (v: boolean) => void;
  onCode: (code: string) => void;
}) {
  const [supported, setSupported] = useState(false);
  const video = useRef<HTMLVideoElement>(null);

  useEffect(() => setSupported(typeof window !== "undefined" && "BarcodeDetector" in window), []);

  useEffect(() => {
    if (!scanning) return;
    let stream: MediaStream | null = null;
    let timer: ReturnType<typeof setInterval> | null = null;
    let stopped = false;
    (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
        if (stopped || !video.current) return;
        video.current.srcObject = stream;
        await video.current.play();
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const detector = new (window as any).BarcodeDetector();
        timer = setInterval(async () => {
          if (!video.current) return;
          const codes = await detector.detect(video.current).catch(() => []);
          if (codes[0]?.rawValue) onCode(String(codes[0].rawValue));
        }, 300);
      } catch {
        setScanning(false);
      }
    })();
    return () => {
      stopped = true;
      if (timer) clearInterval(timer);
      stream?.getTracks().forEach((t) => t.stop());
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scanning]);

  if (!supported) return null;
  return (
    <>
      <button type="button" onClick={() => setScanning(true)} className="btn-primary shrink-0 !py-2.5">
        📷 Scan
      </button>
      {scanning && (
        <div className="fixed inset-0 z-[80] flex flex-col items-center justify-center bg-black/90 p-4" role="dialog" aria-label="Scan a barcode">
          <video ref={video} className="w-full max-w-md rounded-2xl" playsInline muted />
          <p className="mt-3 text-sm text-white">Point the camera at the barcode</p>
          <button type="button" onClick={() => setScanning(false)} className="mt-4 rounded-full bg-white px-5 py-2 text-sm font-bold text-ocean-900">
            Cancel
          </button>
        </div>
      )}
    </>
  );
}

// ── Safety buffer ────────────────────────────────────────────────────────

function BufferCard({ initial }: { initial: number }) {
  const [value, setValue] = useState(initial);
  const [msg, setMsg] = useState<{ ok: boolean; message: string } | null>(null);
  const [pending, start] = useTransition();
  return (
    <section className="card p-5">
      <h2 className="font-display font-bold text-ocean-950">Safety buffer (optional)</h2>
      <p className="mt-1 text-sm text-slate-500">
        Off by default — every unit you have can be bought online. If you&apos;d rather keep the last few for
        customers in your shop, set how many: online, an item shows sold out once that many or fewer are left.
      </p>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <input
          type="number"
          min={0}
          max={20}
          value={value}
          onChange={(e) => setValue(Math.max(0, Math.min(20, Number(e.target.value) || 0)))}
          aria-label="Safety buffer"
          className="input !w-24 !py-2"
        />
        <span className="text-sm text-slate-500">{value === 0 ? "Off" : `Keep ${value} for the shop`}</span>
        <button
          type="button"
          disabled={pending || value === initial}
          onClick={() => start(async () => setMsg(await saveStockBuffer(value)))}
          className="btn-primary !px-5 !py-2 text-sm disabled:opacity-50"
        >
          Save
        </button>
      </div>
      {msg && <p className={`mt-2 text-sm ${msg.ok ? "text-emerald-700" : "text-coral-600"}`}>{msg.message}</p>}
    </section>
  );
}
