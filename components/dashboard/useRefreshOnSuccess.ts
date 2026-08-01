"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import type { SaveState } from "@/app/actions";

/**
 * Re-fetch the current route after a form action succeeds.
 *
 * Server-side `revalidatePath` on a dashboard layout would remount the
 * form and throw away its `useActionState` message. `router.refresh()`
 * pulls fresh server data while keeping client state, so the list updates
 * *and* the "✓ Saved" confirmation stays on screen.
 */
export default function useRefreshOnSuccess(state: SaveState): void {
  const router = useRouter();

  useEffect(() => {
    if (state.ok) router.refresh();
  }, [state, router]);
}
