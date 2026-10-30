/** Words shared by the sheet and the CMS checklist panel. */
export const GATHER_HEADING = 'Gather when you can';
export const NO_REMINDER_LINE = "We won't remind you about this list.";

/**
 * The death-certificate card shown on "What you'll need". The title is a span by default; pass
 * `asHeading` where the card sits under an h2 and should have a heading of its own.
 */
export function DeathCertificateCard({ asHeading = false }: { asHeading?: boolean }) {
  const titleClass = 'gg-card-title text-[15px]';
  return (
    <div className="gg-card">
      <span className="gg-card-kicker">The one people get wrong</span>
      {asHeading ? (
        <h3 className={titleClass}>Certified death certificates</h3>
      ) : (
        <span className={titleClass}>Certified death certificates</span>
      )}
      <p className="gg-card-body m-0">
        Ask the funeral home for <strong>8 to 10 certified copies</strong>. Banks, insurers and
        Social Security each keep an original — photocopies are usually refused.
      </p>
    </div>
  );
}
