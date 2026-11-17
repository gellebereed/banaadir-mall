/**
 * "This tab is running an older version of the site."
 *
 * Every merge to main publishes a new build on Netlify. A shopper who
 * opened the site before that still has the OLD JavaScript in their tab,
 * and the old build's file names (`/_next/static/chunks/<hash>.js`) and
 * server-action ids no longer exist on the new one. The next tap that
 * needs one of them failed with a ChunkLoadError or "Server Action … was
 * not found", and because nothing caught it, Next.js replaced the whole
 * page with its bare "Application error: a client-side exception has
 * occurred". That is the error shoppers saw right after each update.
 *
 * Netlify's skew protection (netlify.toml) now keeps old tabs talking to
 * the build they loaded, which removes most of these. This is the safety
 * net for the rest — a tab older than the deploys Netlify keeps, a
 * browser that drops the deploy cookie: recognise the error and reload
 * the page once, which picks up the new version.
 */

const PATTERNS = [
  /ChunkLoadError/i,
  /Loading (CSS )?chunk [\w-]+ failed/i,
  /Failed to fetch dynamically imported module/i,
  /Importing a module script failed/i,
  /error loading dynamically imported module/i,
  /Failed to find Server Action/i,
  /Server Action .* was not found/i,
  /UnrecognizedActionError/i,
];

export function isStaleDeployError(error: unknown): boolean {
  if (!error) return false;
  const e = error as { name?: unknown; message?: unknown };
  const text = `${typeof e.name === "string" ? e.name : ""} ${
    typeof e.message === "string" ? e.message : String(error)
  }`;
  return PATTERNS.some((p) => p.test(text));
}

const RELOAD_KEY = "bm_stale_reload_at";
/** A second failure inside this window is a real fault, not an old tab. */
const RELOAD_WINDOW_MS = 30_000;

/**
 * Reload the page to pick up the new build — at most once per 30 seconds,
 * so a page that is genuinely broken shows its error instead of looping.
 * Returns false when it did not reload.
 */
export function reloadForNewVersion(): boolean {
  if (typeof window === "undefined") return false;
  try {
    const last = Number(window.sessionStorage.getItem(RELOAD_KEY) || 0);
    if (Date.now() - last < RELOAD_WINDOW_MS) return false;
    window.sessionStorage.setItem(RELOAD_KEY, String(Date.now()));
  } catch {
    // Private mode without storage: still reload, but only this once per
    // page load, which the module-level flag below guarantees.
    if (reloadedWithoutStorage) return false;
    reloadedWithoutStorage = true;
  }
  window.location.reload();
  return true;
}

let reloadedWithoutStorage = false;
