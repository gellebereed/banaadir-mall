/** Shapes shared by lib/payouts.ts, lib/activity.ts and the local DB. */

export interface PayoutRecord {
  id: string;
  store: string;
  /** "2026-10" — the month whose delivered sales this pays for. */
  period: string;
  amount: number;
  method?: string;
  reference?: string;
  note?: string;
  paidAt: string;
  paidBy?: string;
}

export interface PayoutAccount {
  store: string;
  method: string;
  accountName?: string;
  accountNumber: string;
  updatedAt?: string;
  updatedBy?: string;
}

export interface ActivityEntry {
  id: string;
  at: string;
  /** Store slug, or "platform" for marketplace-wide actions. */
  store: string;
  actorEmail?: string;
  actorName?: string;
  action: string;
  summary: string;
  target?: string;
}
