"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import {
  adminCreateResetLink,
  adminSetPassword,
  type AccountActionResult,
} from "@/app/admin/accounts/actions";
import type { AccountRow } from "@/lib/accounts";

const KINDS: { key: AccountRow["kind"] | "all"; label: string }[] = [
  { key: "all", label: "All" },
  { key: "admin", label: "Admin" },
  { key: "staff", label: "Staff" },
  { key: "seller", label: "Stores" },
  { key: "customer", label: "Customers" },
];

const KIND_STYLE: Record<AccountRow["kind"], string> = {
  admin: "bg-ocean-900 text-white",
  staff: "bg-ocean-100 text-ocean-900",
  seller: "bg-emerald-100 text-emerald-800",
  customer: "bg-slate-100 text-slate-700",
};

export default function AccountsClient({
  accounts,
  enabled,
}: {
  accounts: AccountRow[];
  enabled: boolean;
}) {
  const [query, setQuery] = useState("");
  const [kind, setKind] = useState<AccountRow["kind"] | "all">("all");

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return accounts.filter(
      (a) =>
        (kind === "all" || a.kind === kind) &&
        (!q || a.email.includes(q) || a.name.toLowerCase().includes(q) || a.label.toLowerCase().includes(q)),
    );
  }, [accounts, query, kind]);

  return (
    <div className="mt-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search by email, name or store…"
          className="input sm:max-w-sm"
        />
        <div className="flex flex-wrap gap-2">
          {KINDS.map((k) => (
            <button
              key={k.key}
              type="button"
              onClick={() => setKind(k.key)}
              className={`rounded-full px-3 py-1.5 text-xs font-bold transition ${
                kind === k.key
                  ? "bg-ocean-900 text-white"
                  : "bg-white text-slate-600 ring-1 ring-slate-200 hover:bg-slate-50"
              }`}
            >
              {k.label}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-4 space-y-3">
        {shown.length === 0 && (
          <div className="card p-8 text-center text-sm text-slate-400">No accounts match.</div>
        )}
        {shown.map((account) => (
          <AccountItem key={account.email} account={account} enabled={enabled} />
        ))}
      </div>
    </div>
  );
}

function AccountItem({ account, enabled }: { account: AccountRow; enabled: boolean }) {
  const [mode, setMode] = useState<"idle" | "password">("idle");
  const [password, setPassword] = useState("");
  const [visible, setVisible] = useState(false);
  const [result, setResult] = useState<AccountActionResult | null>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  const run = (work: () => Promise<AccountActionResult>) =>
    startTransition(async () => {
      setResult(null);
      try {
        const res = await work();
        setResult(res);
        if (res.ok) {
          setMode("idle");
          setPassword("");
          // The "own password" badge may have changed.
          router.refresh();
        }
      } catch (err) {
        /*
         * A server action THROWING (rather than returning an error) almost
         * always means the page is older than the site: after a deploy, the
         * buttons on a page left open still point at the previous build's
         * actions, which no longer exist. A reload fixes it.
         */
        console.error("[Accounts]", err);
        setResult({
          error:
            "The site was updated since this page was opened. Reload the page and try again.",
        });
      }
    });

  const generate = () => {
    const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";
    const bytes = crypto.getRandomValues(new Uint8Array(12));
    setPassword(Array.from(bytes, (b) => alphabet[b % alphabet.length]).join(""));
    setVisible(true);
  };

  return (
    <div className="card p-4 sm:p-5">
      <div className="flex flex-wrap items-center gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-ocean-100 font-display font-extrabold text-ocean-800">
          {account.name.charAt(0).toUpperCase()}
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate font-semibold text-slate-800">{account.name}</p>
          <p className="truncate text-xs text-slate-400">{account.email}</p>
        </div>
        <span className={`rounded-full px-3 py-1 text-xs font-bold ${KIND_STYLE[account.kind]}`}>
          {account.label}
        </span>
        <span
          className={`rounded-full px-3 py-1 text-xs font-bold ${
            account.hasAccount ? "bg-emerald-50 text-emerald-700" : "bg-mango-100 text-mango-800"
          }`}
          title={
            account.hasAccount
              ? "Has its own password"
              : "Still signs in with the shared default password"
          }
        >
          {account.hasAccount ? "🔒 Own password" : "⚠️ Default password"}
        </span>
      </div>

      {account.lastSignIn && (
        <p className="mt-2 text-xs text-slate-400">
          Last signed in {new Date(account.lastSignIn).toLocaleString()}
        </p>
      )}

      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          disabled={!enabled || pending}
          onClick={() => {
            setResult(null);
            setMode(mode === "password" ? "idle" : "password");
          }}
          className="btn-secondary px-3 py-1.5 text-xs disabled:opacity-50"
        >
          🔑 Set password
        </button>
        <button
          type="button"
          disabled={!enabled || pending}
          onClick={() => run(() => adminCreateResetLink(account.email))}
          className="btn-secondary px-3 py-1.5 text-xs disabled:opacity-50"
        >
          🔗 Create reset link
        </button>
      </div>

      {mode === "password" && (
        <form
          className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center"
          onSubmit={(e) => {
            e.preventDefault();
            run(() => adminSetPassword(account.email, password));
          }}
        >
          <input
            type={visible ? "text" : "password"}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="New password (8+ characters)"
            autoComplete="new-password"
            minLength={8}
            required
            className="input sm:max-w-xs"
          />
          <div className="flex gap-2">
            <button type="button" onClick={() => setVisible(!visible)} className="btn-secondary px-3 py-2 text-xs">
              {visible ? "Hide" : "Show"}
            </button>
            <button type="button" onClick={generate} className="btn-secondary px-3 py-2 text-xs">
              Generate
            </button>
            <button type="submit" disabled={pending} className="btn-primary px-4 py-2 text-xs disabled:opacity-60">
              {pending ? "Saving…" : "Save"}
            </button>
          </div>
        </form>
      )}

      {result?.error && (
        <p className="mt-3 rounded-lg bg-coral-100 px-3 py-2 text-xs font-semibold text-coral-700">{result.error}</p>
      )}
      {result?.ok && !result.link && (
        <p className="mt-3 rounded-lg bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-800">{result.ok}</p>
      )}
      {result?.link && (
        <ResetLink email={account.email} link={result.link} hadAccount={account.hasAccount} />
      )}
    </div>
  );
}

function ResetLink({
  email,
  link,
  hadAccount,
}: {
  email: string;
  link: string;
  hadAccount: boolean;
}) {
  const [copied, setCopied] = useState(false);
  const message = `Use this link to choose a new password for your Banaadir Mall account (${email}). It works once:\n${link}`;

  return (
    <div className="mt-3 rounded-xl bg-sand-100 p-3">
      <p className="text-xs font-semibold text-slate-600">
        Send this to them. It works once.{" "}
        {hadAccount
          ? "Their current password keeps working until they use it."
          : "The shared default password has stopped working for this login — they sign in with the password they choose."}
      </p>
      <input readOnly value={link} onFocus={(e) => e.target.select()} className="input mt-2 text-xs" />
      <div className="mt-2 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(link);
              setCopied(true);
            } catch {
              setCopied(false);
            }
          }}
          className="btn-secondary px-3 py-1.5 text-xs"
        >
          {copied ? "✅ Copied" : "📋 Copy link"}
        </button>
        <a
          href={`https://wa.me/?text=${encodeURIComponent(message)}`}
          target="_blank"
          rel="noopener noreferrer"
          className="btn-secondary px-3 py-1.5 text-xs"
        >
          💬 WhatsApp
        </a>
        <a
          href={`mailto:${encodeURIComponent(email)}?subject=${encodeURIComponent("Reset your Banaadir Mall password")}&body=${encodeURIComponent(message)}`}
          className="btn-secondary px-3 py-1.5 text-xs"
        >
          ✉️ Email
        </a>
      </div>
    </div>
  );
}
