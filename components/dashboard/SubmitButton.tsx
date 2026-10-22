"use client";

import { useContext } from "react";
import { useFormStatus } from "react-dom";
import { Spinner } from "./PendingButton";
import { SafeFormPendingContext } from "./SafeForm";

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
  const { pending: actionPending } = useFormStatus();
  // SafeForm submits through a transition, which useFormStatus can't see.
  const safeFormPending = useContext(SafeFormPendingContext);
  const pending = actionPending || safeFormPending;

  return (
    <button
      type="submit"
      disabled={pending}
      aria-busy={pending}
      className={`${className} disabled:cursor-wait disabled:opacity-70`}
    >
      {pending ? (
        // A turning ring as well as the words: a label change alone is easy
        // to miss on a small button, and then it looks like nothing happened.
        <span className="inline-flex items-center justify-center gap-1.5">
          <Spinner />
          {pendingLabel}
        </span>
      ) : (
        children
      )}
    </button>
  );
}
