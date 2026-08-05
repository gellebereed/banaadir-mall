"use client";

import { useEffect, useState } from "react";

/**
 * The invite link, and a button that puts it on the clipboard.
 *
 * The URL is assembled in the browser from `location.origin` rather than
 * passed down from the server. The server does not reliably know which
 * host the person is actually looking at — behind Netlify it sees its own
 * — and an invite link pointing at the wrong hostname is worse than no
 * link, because it looks like it worked.
 */
export default function InviteLink({ token }: { token: string }) {
  const [url, setUrl] = useState("");
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    setUrl(`${window.location.origin}/invite/${token}`);
  }, [token]);

  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), 2000);
    return () => clearTimeout(timer);
  }, [copied]);

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
    } catch {
      // Clipboard access is refused in plenty of ordinary situations — an
      // insecure origin, an in-app browser, a permission the person said
      // no to. The field below is selectable, so there is always a way.
      setCopied(false);
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <input
        readOnly
        value={url}
        onFocus={(event) => event.currentTarget.select()}
        aria-label="Invitation link"
        className="input min-w-0 flex-1 !py-2 text-xs"
      />
      <button
        type="button"
        onClick={copy}
        className="rounded-full bg-ocean-800 px-4 py-2 text-xs font-bold text-white transition hover:bg-ocean-900"
      >
        {copied ? "Copied ✓" : "Copy link"}
      </button>
      {url && (
        <a
          href={`https://wa.me/?text=${encodeURIComponent(
            `You have been invited to join our store on Banaadir Mall. Open this link to get started: ${url}`,
          )}`}
          target="_blank"
          rel="noopener noreferrer"
          className="rounded-full border border-ocean-200 px-4 py-2 text-xs font-bold text-ocean-800 transition hover:bg-ocean-50"
        >
          Send on WhatsApp
        </a>
      )}
    </div>
  );
}
