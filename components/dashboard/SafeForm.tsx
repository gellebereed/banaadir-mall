"use client";

import React, { useTransition, useState, useEffect, useRef } from "react";

interface SafeFormProps extends Omit<React.FormHTMLAttributes<HTMLFormElement>, "action"> {
  action: (formData: FormData) => Promise<void>;
  storageKey?: string;
  children: React.ReactNode;
}

/**
 * Robust Client Form Wrapper:
 * 1. Auto-saves form inputs to localStorage in real time (zero data loss).
 * 2. Intercepts Server Action errors (like Next.js deployment UnrecognizedActionError).
 * 3. Keeps form data 100% intact and prompts the user to submit safely.
 */
export default function SafeForm({
  action,
  storageKey,
  children,
  className,
  ...props
}: SafeFormProps) {
  const [, startTransition] = useTransition();
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const formRef = useRef<HTMLFormElement>(null);

  // Restore draft from localStorage if storageKey is provided
  useEffect(() => {
    if (!storageKey || !formRef.current) return;
    try {
      const saved = localStorage.getItem(storageKey);
      if (saved) {
        const data = JSON.parse(saved);
        const form = formRef.current;
        Object.entries(data).forEach(([key, val]) => {
          const input = form.elements.namedItem(key) as
            | HTMLInputElement
            | HTMLTextAreaElement
            | HTMLSelectElement;
          if (input && typeof val === "string" && !input.value) {
            input.value = val;
          }
        });
      }
    } catch {
      // Ignore storage read errors
    }
  }, [storageKey]);

  // Save inputs to localStorage on input change
  const handleInput = () => {
    if (!storageKey || !formRef.current) return;
    try {
      const form = formRef.current;
      const data: Record<string, string> = {};
      Array.from(form.elements).forEach((el) => {
        const element = el as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement;
        if (
          element.name &&
          (element.tagName === "INPUT" ||
            element.tagName === "TEXTAREA" ||
            element.tagName === "SELECT")
        ) {
          if (
            element.type !== "password" &&
            element.type !== "file" &&
            element.type !== "hidden"
          ) {
            data[element.name] = element.value;
          }
        }
      });
      localStorage.setItem(storageKey, JSON.stringify(data));
    } catch {
      // Ignore storage write errors
    }
  };

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);

    startTransition(async () => {
      try {
        setErrorMessage(null);
        await action(formData);
        if (storageKey) {
          localStorage.removeItem(storageKey);
        }
      } catch (err: unknown) {
        // Next.js uses NEXT_REDIRECT for server action redirects
        if ((err as { digest?: string })?.digest?.startsWith("NEXT_REDIRECT")) {
          if (storageKey) {
            localStorage.removeItem(storageKey);
          }
          throw err;
        }

        console.error("[SafeForm Submit Error]", err);

        const msg = String((err as Error)?.message || err || "");
        if (
          msg.includes("Server Action") ||
          msg.includes("UnrecognizedActionError") ||
          msg.includes("404")
        ) {
          setErrorMessage(
            "⚡ The app was updated in the background. Your text and description are safe! Please click Publish / Save once more to complete."
          );
        } else {
          setErrorMessage(msg || "Submission error. Your form data has been preserved.");
        }
      }
    });
  };

  return (
    <form
      ref={formRef}
      onSubmit={handleSubmit}
      onInput={handleInput}
      className={className}
      {...props}
    >
      {errorMessage && (
        <div className="sm:col-span-2 mb-4 rounded-2xl border-2 border-amber-300 bg-amber-50 p-4 text-sm font-semibold text-amber-900 shadow-sm">
          {errorMessage}
        </div>
      )}
      {children}
    </form>
  );
}
