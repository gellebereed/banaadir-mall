"use client";

import { usePathname } from "next/navigation";
import { useT } from "@/components/prefs/PrefsProvider";
import { whatsappLink } from "@/lib/whatsapp";

/**
 * Floating "ask us on WhatsApp" button — how shoppers here ask a question
 * before they buy. The message names the page they were on, so support
 * knows which product is meant without a back-and-forth.
 *
 * Only shown when NEXT_PUBLIC_SUPPORT_WHATSAPP is set: the code's fallback
 * number is a placeholder, and a help button that opens a chat with a
 * number nobody answers is worse than none.
 */
const NUMBER = process.env.NEXT_PUBLIC_SUPPORT_WHATSAPP;

export default function WhatsAppHelp() {
  const pathname = usePathname() ?? "/";
  const t = useT();
  if (!NUMBER) return null;

  // Product pages have a sticky "Add to Cart" bar above the tab bar on a
  // phone; the button sits above it rather than on top of the buy button.
  const onProduct = pathname.startsWith("/product/");

  const open = () => {
    const page = document.title.replace(/\s*·\s*Banaadir Mall$/, "");
    const message = `${t("help.whatsapp.message")}${pathname === "/" ? "" : ` ${t("help.whatsapp.about", { page })}`}\n${window.location.href}`;
    window.open(whatsappLink(NUMBER, message), "_blank", "noopener");
  };

  return (
    <button
      type="button"
      onClick={open}
      aria-label={t("help.whatsapp")}
      title={t("help.whatsapp")}
      className={`fixed right-4 z-30 flex h-12 w-12 items-center justify-center rounded-full bg-[#25D366] text-white shadow-lg ring-4 ring-white/70 transition hover:scale-105 md:bottom-6 md:right-6 md:h-14 md:w-14 [[data-install-open]_&]:hidden ${
        onProduct
          ? "bottom-[calc(9.5rem+env(safe-area-inset-bottom))]"
          : "bottom-[calc(4.6rem+env(safe-area-inset-bottom))]"
      }`}
    >
      <svg viewBox="0 0 32 32" className="h-6 w-6 md:h-7 md:w-7" fill="currentColor" aria-hidden>
        <path d="M16.04 3C9.4 3 4 8.36 4 14.96c0 2.1.56 4.16 1.62 5.97L4 29l8.27-2.15a12.1 12.1 0 0 0 3.77.6h.01C22.68 27.45 28 22.1 28 15.5 28 8.9 22.68 3 16.04 3Zm0 22.2h-.01a9.9 9.9 0 0 1-3.41-.6l-.24-.1-4.9 1.27 1.3-4.75-.16-.25a9.73 9.73 0 0 1-1.52-5.2c0-5.4 4.42-9.8 9.86-9.8 5.43 0 9.85 4.4 9.85 9.86 0 5.43-4.42 9.57-9.77 9.57Zm5.4-7.32c-.3-.15-1.75-.86-2.02-.96-.27-.1-.47-.15-.67.15-.2.3-.77.96-.94 1.16-.17.2-.35.22-.64.07-.3-.15-1.25-.46-2.38-1.47-.88-.78-1.47-1.75-1.64-2.05-.17-.3-.02-.46.13-.6.13-.13.3-.35.44-.52.15-.17.2-.3.3-.5.1-.2.05-.37-.02-.52-.08-.15-.67-1.6-.92-2.2-.24-.57-.48-.5-.67-.5h-.57c-.2 0-.52.08-.79.37-.27.3-1.04 1.01-1.04 2.47 0 1.45 1.06 2.86 1.21 3.06.15.2 2.09 3.18 5.06 4.46.71.3 1.26.49 1.69.63.71.22 1.36.19 1.87.12.57-.09 1.75-.72 2-1.41.25-.7.25-1.29.17-1.41-.07-.13-.27-.2-.57-.35Z" />
      </svg>
    </button>
  );
}
