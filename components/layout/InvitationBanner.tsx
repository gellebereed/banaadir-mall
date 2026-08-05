import Link from "next/link";
import { getPendingInvitationsFor, getStore } from "@/lib/api";
import { PERMISSIONS_BY_KEY, permissionsFor } from "@/lib/auth";
import { getSession } from "@/lib/session";

/**
 * ─────────────────────────────────────────────────────────────────────────
 *  "YOU HAVE BEEN INVITED" — shown on every page, to one person.
 * ─────────────────────────────────────────────────────────────────────────
 * An invitation used to exist only as a link the owner had to deliver
 * themselves. If that link never arrived — wrong number, deleted chat,
 * never actually sent — nothing in the app ever mentioned it, and the
 * invited person had no way to discover they had been invited at all.
 *
 * ── Who sees it ──────────────────────────────────────────────────────────
 * ONLY the account whose email the invitation was addressed to. The lookup
 * takes the email from the SESSION and matches it exactly (see
 * getPendingInvitationsFor). It is deliberately impossible to ask this for
 * anyone else's address, because the banner carries the invite token — the
 * credential that opens that store's dashboard. Signed out, or signed in
 * as anybody else, this renders nothing at all.
 *
 * It also disappears by itself: accepting flips the invitation to active,
 * and active invitations are not returned.
 * ─────────────────────────────────────────────────────────────────────────
 */
export default async function InvitationBanner() {
  const session = await getSession();
  if (!session?.email) return null;

  const invitations = (await getPendingInvitationsFor(session.email)).filter(
    /*
     * Not an invitation you are already inside.
     *
     * Signing in with the shared employee password gets you into the
     * dashboard whether or not the "accepted" flag could be written — and
     * it cannot be until the team migration is applied. Without this,
     * somebody already working in a store would be told, on every page,
     * that they have been invited to it.
     */
    (invitation) => !(session.access && session.store === invitation.store),
  );
  if (invitations.length === 0) return null;

  const cards = await Promise.all(
    invitations.map(async (invitation) => {
      const store =
        invitation.store === "platform" ? null : await getStore(invitation.store);

      // A store that was removed or suspended after the invitation went out
      // has nothing to invite anyone into.
      if (invitation.store !== "platform" && (!store || store.status !== "active")) {
        return null;
      }

      return {
        id: invitation.id,
        token: invitation.inviteToken,
        placeName: store?.name ?? "the Banaadir Mall platform team",
        role: invitation.role,
        grants: permissionsFor(invitation)
          .map((key) => PERMISSIONS_BY_KEY[key]?.label ?? key)
          .slice(0, 4),
      };
    }),
  );

  const live = cards.filter((card) => card !== null);
  if (live.length === 0) return null;

  return (
    <div className="border-b border-mango-200 bg-mango-50">
      {live.map((card) => (
        <div
          key={card.id}
          className="mx-auto flex max-w-7xl flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3"
        >
          <span className="text-xl" aria-hidden>
            ✉️
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-bold text-mango-900">
              You have been invited to join {card.placeName}
            </p>
            <p className="text-xs text-mango-800">
              As <span className="font-semibold capitalize">{card.role}</span>
              {card.grants.length > 0 && <> · {card.grants.join(" · ")}</>}
            </p>
          </div>

          {/*
            Without a token there is nothing to accept — the owner created
            this before the invitation columns existed, or the database has
            not had the team migration applied. Saying so beats a button
            that goes nowhere.
          */}
          {card.token ? (
            <Link
              href={`/invite/${card.token}`}
              className="rounded-full bg-ocean-800 px-5 py-2 text-xs font-bold text-white transition hover:bg-ocean-900"
            >
              View invitation
            </Link>
          ) : (
            <span className="text-xs text-mango-800">
              Ask them to send you the invitation link.
            </span>
          )}
        </div>
      ))}
    </div>
  );
}
