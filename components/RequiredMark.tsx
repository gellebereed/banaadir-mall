/**
 * The asterisk on a required field's label.
 *
 * A component rather than a bare "*" so the marker is consistent
 * everywhere, and so it carries a screen-reader label — a lone asterisk is
 * announced as "star" or skipped entirely, which tells someone using a
 * screen reader nothing about which fields they have to fill in.
 */
export default function RequiredMark() {
  return (
    <span className="ml-0.5 font-bold text-coral-600" title="Required">
      *<span className="sr-only"> (required)</span>
    </span>
  );
}
