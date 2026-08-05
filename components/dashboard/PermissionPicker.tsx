"use client";

import { useMemo, useState } from "react";
import {
  permissionsForScope,
  ROLE_DESCRIPTIONS,
  ROLE_PERMISSIONS,
} from "@/lib/auth";
import type { EmployeeRole, Permission } from "@/lib/types";

/**
 * ─────────────────────────────────────────────────────────────────────────
 *  WHO MAY DO WHAT — a role, and then the exceptions to it.
 * ─────────────────────────────────────────────────────────────────────────
 * Roles alone could not say the thing shopkeepers actually need to say:
 * "she runs the products, but she does not see what we paid for them."
 * Five fixed roles have no way to express that, so anyone who needed it
 * had to over-grant and hope.
 *
 * So the role is a STARTING POINT, not the answer. Picking one ticks its
 * boxes; every box stays adjustable afterwards. That ordering matters —
 * the fast path (pick "Products", done) is unchanged, and the precise path
 * is one click further in rather than a different screen.
 *
 * ── Why the role keeps re-applying ───────────────────────────────────────
 * Changing the role RESETS the boxes, deliberately. A half-applied role —
 * some boxes from "orders", some left over from "products" — is worse than
 * either, and impossible to reason about later when someone asks why a
 * person could do something.
 * ─────────────────────────────────────────────────────────────────────────
 */
export default function PermissionPicker({
  store,
  roles,
  initialRole,
  initialPermissions,
  idPrefix,
}: {
  /** Store slug, or "platform" — decides which permissions are relevant. */
  store: string;
  roles: EmployeeRole[];
  initialRole: EmployeeRole;
  /** Undefined means "whatever the role implies". */
  initialPermissions?: Permission[];
  /** Keeps input ids unique when several pickers share a page. */
  idPrefix: string;
}) {
  const available = useMemo(() => permissionsForScope(store), [store]);
  const availableKeys = useMemo(() => available.map((p) => p.key), [available]);

  const [role, setRole] = useState<EmployeeRole>(initialRole);
  const [granted, setGranted] = useState<Set<Permission>>(
    () =>
      new Set(
        (initialPermissions && initialPermissions.length > 0
          ? initialPermissions
          : ROLE_PERMISSIONS[initialRole]
        ).filter((key) => availableKeys.includes(key)),
      ),
  );

  function chooseRole(next: EmployeeRole) {
    setRole(next);
    setGranted(new Set(ROLE_PERMISSIONS[next].filter((key) => availableKeys.includes(key))));
  }

  function toggle(key: Permission, on: boolean) {
    setGranted((current) => {
      const next = new Set(current);
      if (on) next.add(key);
      else next.delete(key);
      return next;
    });
  }

  const groups = useMemo(() => {
    const byGroup = new Map<string, typeof available>();
    for (const spec of available) {
      const list = byGroup.get(spec.group);
      if (list) list.push(spec);
      else byGroup.set(spec.group, [spec]);
    }
    return [...byGroup.entries()];
  }, [available]);

  const matchesRole =
    granted.size === ROLE_PERMISSIONS[role].filter((k) => availableKeys.includes(k)).length &&
    ROLE_PERMISSIONS[role].every((k) => !availableKeys.includes(k) || granted.has(k));

  return (
    <div className="space-y-4">
      <div>
        <label htmlFor={`${idPrefix}-role`} className="label">
          Access role
        </label>
        <select
          id={`${idPrefix}-role`}
          name="role"
          className="input"
          value={role}
          onChange={(event) => chooseRole(event.target.value as EmployeeRole)}
        >
          {roles.map((r) => (
            <option key={r} value={r}>
              {r} — {ROLE_DESCRIPTIONS[r]}
            </option>
          ))}
        </select>
      </div>

      {/*
        Tells the server the boxes were on screen, so an ALL-UNTICKED answer
        reads as "may do nothing" instead of as "no answer, use the role".
      */}
      <input type="hidden" name="permissions-set" value="1" />

      <div className="rounded-2xl border border-sand-200 bg-sand-50 p-4">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <p className="font-display text-sm font-bold text-ocean-950">
            Exactly what they can do
          </p>
          <span className="text-xs text-slate-500">
            {matchesRole ? `Standard ${role} access` : "Customised"}
          </span>
        </div>

        <div className="mt-3 space-y-4">
          {groups.map(([group, specs]) => (
            <fieldset key={group}>
              <legend className="text-[11px] font-bold uppercase tracking-wide text-ocean-700">
                {group}
              </legend>
              <div className="mt-1.5 space-y-1.5">
                {specs.map((spec) => {
                  const id = `${idPrefix}-${spec.key}`;
                  return (
                    <label
                      key={spec.key}
                      htmlFor={id}
                      className="flex cursor-pointer gap-2.5 rounded-xl px-2 py-1.5 transition hover:bg-white"
                    >
                      <input
                        id={id}
                        type="checkbox"
                        name="permissions"
                        value={spec.key}
                        checked={granted.has(spec.key)}
                        onChange={(event) => toggle(spec.key, event.target.checked)}
                        className="mt-0.5 h-4 w-4 shrink-0 accent-ocean-700"
                      />
                      <span className="min-w-0">
                        <span className="block text-sm font-semibold text-slate-800">
                          {spec.label}
                        </span>
                        <span className="block text-xs text-slate-500">{spec.hint}</span>
                      </span>
                    </label>
                  );
                })}
              </div>
            </fieldset>
          ))}
        </div>
      </div>
    </div>
  );
}
