"use client";

/**
 * ─────────────────────────────────────────────────────────────────────────
 *  THE ADDRESS BOOK.
 * ─────────────────────────────────────────────────────────────────────────
 * Checkout used to remember exactly ONE delivery address, overwritten by
 * every order. That is wrong for how people here actually buy: the same
 * shopper sends things to their home, to their shop, and to a relative in
 * another city — and each time, they had to retype the whole thing while
 * the form helpfully pre-filled the wrong one.
 *
 * Addresses are stored per ACCOUNT on this device (lib/storage-scope.ts),
 * so a shared phone does not hand one person's home address to the next.
 */

import { scopedKey } from "./storage-scope";

export const ADDRESS_BOOK_KEY = "banaadir_addresses";

export interface SavedAddress {
  id: string;
  /** What the shopper calls it — "Home", "The shop", "Mum's place". */
  label: string;
  name: string;
  phone: string;
  countryCode: string;
  /** Selected city, or "Other" when they typed their own. */
  city: string;
  customCity?: string;
  district?: string;
  notes?: string;
  /** Offered first at checkout. */
  isDefault?: boolean;
  /** Epoch ms, so the most recently used can lead. */
  usedAt?: number;
}

/** How many an account may keep. Past this it is a list nobody scrolls. */
const MAX_ADDRESSES = 8;

export function readAddresses(scope: string): SavedAddress[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(scopedKey(ADDRESS_BOOK_KEY, scope));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((entry) => entry && typeof entry.id === "string").slice(0, MAX_ADDRESSES);
  } catch {
    return [];
  }
}

export function writeAddresses(scope: string, addresses: SavedAddress[]): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(
      scopedKey(ADDRESS_BOOK_KEY, scope),
      JSON.stringify(addresses.slice(0, MAX_ADDRESSES)),
    );
  } catch {
    // A full quota must never block a checkout.
  }
}

/** Default first, then most recently used. */
export function sortAddresses(addresses: SavedAddress[]): SavedAddress[] {
  return [...addresses].sort((a, b) => {
    if (a.isDefault !== b.isDefault) return a.isDefault ? -1 : 1;
    return (b.usedAt ?? 0) - (a.usedAt ?? 0);
  });
}

/**
 * Add or update an address.
 *
 * Matching on the delivery details rather than the id is what stops the
 * book filling with near-identical entries: somebody ordering to the same
 * house every week should end up with one "Home", not eight.
 */
export function upsertAddress(
  addresses: SavedAddress[],
  candidate: Omit<SavedAddress, "id"> & { id?: string },
): SavedAddress[] {
  const fingerprint = (address: Pick<SavedAddress, "city" | "customCity" | "district" | "phone">) =>
    [address.city, address.customCity ?? "", address.district ?? "", address.phone]
      .map((part) => part.trim().toLowerCase())
      .join("|");

  const target = candidate.id
    ? addresses.find((entry) => entry.id === candidate.id)
    : addresses.find((entry) => fingerprint(entry) === fingerprint(candidate));

  const saved: SavedAddress = {
    ...candidate,
    id: target?.id ?? candidate.id ?? `addr-${Date.now().toString(36)}`,
    usedAt: Date.now(),
  };

  const rest = addresses.filter((entry) => entry.id !== saved.id);
  // Only one default, always.
  const normalised = saved.isDefault
    ? rest.map((entry) => ({ ...entry, isDefault: false }))
    : rest;

  // The very first address saved is the default — nobody wants to be asked
  // to nominate one when there is only one.
  if (normalised.length === 0) saved.isDefault = true;

  return [saved, ...normalised].slice(0, MAX_ADDRESSES);
}

export function removeAddress(addresses: SavedAddress[], id: string): SavedAddress[] {
  const remaining = addresses.filter((entry) => entry.id !== id);
  // Deleting the default promotes the next one, so checkout always has a
  // sensible pre-selection instead of silently choosing nothing.
  if (remaining.length > 0 && !remaining.some((entry) => entry.isDefault)) {
    remaining[0] = { ...remaining[0], isDefault: true };
  }
  return remaining;
}

export function makeDefault(addresses: SavedAddress[], id: string): SavedAddress[] {
  return addresses.map((entry) => ({ ...entry, isDefault: entry.id === id }));
}

/** "Hodan, Mogadishu (Xamar), Somalia" — one line for a card. */
export function formatAddress(address: SavedAddress, countryName: string): string {
  const city = address.city === "Other" ? address.customCity : address.city;
  return [address.district, city, countryName].filter(Boolean).join(", ");
}
