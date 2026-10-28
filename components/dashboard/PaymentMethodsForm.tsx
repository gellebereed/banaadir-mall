"use client";

import { useActionState, useState } from "react";
import { savePaymentMethods, type MoneyState } from "@/app/money-actions";
import { PAYMENT_KINDS, type ShopPaymentKind, type ShopPaymentMethod } from "@/lib/shop-payments";

/**
 * How customers pay this shop: tick a method, add its number.
 *
 * The numbers are shown to customers as the only ones to pay this shop on,
 * which is why only the owner can change them (see savePaymentMethods).
 */
export default function PaymentMethodsForm({
  initial,
  canEdit,
}: {
  initial: ShopPaymentMethod[];
  /** False for staff: they see the numbers but cannot change them. */
  canEdit: boolean;
}) {
  const [state, action, pending] = useActionState<MoneyState, FormData>(savePaymentMethods, {});
  const [methods, setMethods] = useState<Partial<Record<ShopPaymentKind, ShopPaymentMethod>>>(() =>
    Object.fromEntries(
      (initial.length > 0 ? initial : [{ kind: "cod" as const }]).map((m) => [m.kind, m]),
    ),
  );

  const toggle = (kind: ShopPaymentKind) =>
    setMethods((prev) => {
      const next = { ...prev };
      if (next[kind]) delete next[kind];
      else next[kind] = { kind };
      return next;
    });

  const edit = (kind: ShopPaymentKind, field: "number" | "accountName", value: string) =>
    setMethods((prev) => ({ ...prev, [kind]: { ...prev[kind]!, [field]: value } }));

  // Saved in the order checkout offers them, whatever order they were ticked in.
  const ordered = PAYMENT_KINDS.map((k) => methods[k.kind]).filter(Boolean) as ShopPaymentMethod[];

  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="methodsJson" value={JSON.stringify(ordered)} />
      {PAYMENT_KINDS.map((info) => {
        const on = Boolean(methods[info.kind]);
        const method = methods[info.kind];
        return (
          <div
            key={info.kind}
            className={`rounded-xl border p-3 transition ${on ? "border-ocean-300 bg-ocean-50/40" : "border-sand-200"}`}
          >
            <label className="flex cursor-pointer items-center gap-3">
              <input
                type="checkbox"
                checked={on}
                disabled={!canEdit}
                onChange={() => toggle(info.kind)}
                className="h-4 w-4 accent-ocean-700"
              />
              <span aria-hidden className="text-lg">{info.icon}</span>
              <span className="text-sm font-bold text-ocean-950">{info.label}</span>
              {info.provider && <span className="text-xs text-slate-400">{info.provider}</span>}
            </label>
            {on && info.kind !== "cod" && (
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <div>
                  <label htmlFor={`pm-${info.kind}-number`} className="label">
                    {info.merchant ? "Merchant number" : info.wallet ? "Number customers pay to" : "Bank and account number"}
                  </label>
                  <input
                    id={`pm-${info.kind}-number`}
                    value={method?.number ?? ""}
                    onChange={(e) => edit(info.kind, "number", e.target.value)}
                    disabled={!canEdit}
                    placeholder={
                      info.merchant ? "e.g. 512345" : info.wallet ? "e.g. 61 555 1234" : "e.g. Premier Bank 0012345678"
                    }
                    inputMode={info.wallet ? "tel" : "text"}
                    className="input"
                  />
                </div>
                <div>
                  <label htmlFor={`pm-${info.kind}-name`} className="label">Name on the account</label>
                  <input
                    id={`pm-${info.kind}-name`}
                    value={method?.accountName ?? ""}
                    onChange={(e) => edit(info.kind, "accountName", e.target.value)}
                    disabled={!canEdit}
                    placeholder="e.g. Ahmed Ali Store"
                    className="input"
                  />
                </div>
              </div>
            )}
          </div>
        );
      })}
      {state.error && <p className="text-sm font-semibold text-coral-600">{state.error}</p>}
      {state.ok && <p className="text-sm font-semibold text-emerald-700">{state.ok}</p>}
      {canEdit ? (
        <button type="submit" disabled={pending} className="btn-primary !py-2.5 text-sm disabled:opacity-60">
          {pending ? "Saving…" : "Save payment methods"}
        </button>
      ) : (
        <p className="text-xs text-slate-500">Only the store owner can change these.</p>
      )}
    </form>
  );
}
