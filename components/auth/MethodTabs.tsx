"use client";

/**
 * "Phone number | Email" — the switch at the top of sign-in and sign-up.
 * Both pages offer both ways in, side by side, so nobody has to hunt for a
 * small "use email instead" link to find the one they already use.
 */
export type AuthMethod = "phone" | "email";

export default function MethodTabs({
  value,
  onChange,
  label,
  className = "",
}: {
  value: AuthMethod;
  onChange: (method: AuthMethod) => void;
  label: string;
  className?: string;
}) {
  return (
    <div
      role="tablist"
      aria-label={label}
      className={`grid grid-cols-2 rounded-xl bg-sand-100 p-1 text-sm font-bold ${className}`}
    >
      {(["phone", "email"] as const).map((m) => (
        <button
          key={m}
          type="button"
          role="tab"
          aria-selected={value === m}
          onClick={() => onChange(m)}
          className={`rounded-lg py-2 transition ${
            value === m ? "bg-white text-ocean-900 shadow-sm" : "text-slate-500 hover:text-ocean-700"
          }`}
        >
          {m === "phone" ? "📱 Phone number" : "✉️ Email"}
        </button>
      ))}
    </div>
  );
}
