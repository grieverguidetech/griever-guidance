/** The death-certificate card shown on "What you'll need". Shared by the sheet and the CMS checklist panel. */
export function DeathCertificateCard() {
  return (
    <div className="gg-card">
      <span className="gg-card-kicker">The one people get wrong</span>
      <span className="gg-card-title text-[15px]">Certified death certificates</span>
      <p className="gg-card-body m-0">
        Ask the funeral home for <strong>8 to 10 certified copies</strong>. Banks, insurers and
        Social Security each keep an original — photocopies are usually refused.
      </p>
    </div>
  );
}
