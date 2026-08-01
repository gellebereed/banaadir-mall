"use client";

import { useFormStatus } from "react-dom";

/**
 * Submit button that disables itself and says "Saving…" while its form's
 * server action is running.
 *
 * Without this a submit looks like nothing happened (the page stays put),
 * so people click Save several times and fire the action repeatedly.
 * Must be rendered INSIDE the <form> it belongs to — useFormStatus reads
 * the nearest enclosing form.
 */
export default function SubmitButton({
  children,
  pendingLabel = "Saving…",
  className = "btn-primary",
}: {
  children: React.ReactNode;
  pendingLabel?: string;
  className?: string;
}) {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={pending}
      className={`${className} disabled:cursor-not-allowed disabled:opacity-60`}
    >
      {pending ? pendingLabel : children}
    </button>
  );
}
