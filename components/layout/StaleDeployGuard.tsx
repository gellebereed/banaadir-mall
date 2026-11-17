"use client";

import { useEffect } from "react";
import { isStaleDeployError, reloadForNewVersion } from "@/lib/stale-deploy";

/**
 * Catches the "old tab after an update" errors that never reach an error
 * boundary — a dynamic import started from a click handler, a server
 * action called outside a form — and reloads onto the new version instead
 * of leaving a button that silently does nothing. See lib/stale-deploy.ts.
 */
export default function StaleDeployGuard() {
  useEffect(() => {
    const onRejection = (event: PromiseRejectionEvent) => {
      if (isStaleDeployError(event.reason)) reloadForNewVersion();
    };
    const onError = (event: ErrorEvent) => {
      if (isStaleDeployError(event.error ?? event.message)) reloadForNewVersion();
    };
    window.addEventListener("unhandledrejection", onRejection);
    window.addEventListener("error", onError);
    return () => {
      window.removeEventListener("unhandledrejection", onRejection);
      window.removeEventListener("error", onError);
    };
  }, []);
  return null;
}
