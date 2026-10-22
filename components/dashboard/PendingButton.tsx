"use client";

import { useFormStatus } from "react-dom";
import type { ButtonHTMLAttributes } from "react";

/**
 * A drop-in for the plain <button> inside a one-click server-action form
 * (Approve, Withdraw, Delete, Pause…). While the action runs it disables
 * itself and shows a turning ring, so a click that takes a moment to come
 * back doesn't look like a click that did nothing — and can't be fired
 * twice. Must sit INSIDE its <form>: useFormStatus reads the nearest one.
 */
export default function PendingButton({
  children,
  className = "",
  iconOnly = false,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  /** A small icon button: show only the ring while busy. */
  iconOnly?: boolean;
}) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      {...rest}
      disabled={pending || rest.disabled}
      aria-busy={pending}
      className={`${className} disabled:cursor-wait disabled:opacity-70`}
    >
      {pending ? (
        <span className="inline-flex items-center justify-center gap-1.5">
          <Spinner />
          {!iconOnly && children}
        </span>
      ) : (
        children
      )}
    </button>
  );
}

export function Spinner() {
  return (
    <svg className="h-3.5 w-3.5 shrink-0 animate-spin" viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity="0.3" strokeWidth="3" />
      <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}
