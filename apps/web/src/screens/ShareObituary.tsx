import type { SessionDetails } from '@griever/shared';
import { normalizeUrl } from '@griever/shared';
import { BackButton, Eyebrow } from '../lib/ui';

interface Props {
  session: SessionDetails;
  onBack: () => void;
  onChange: (patch: Partial<SessionDetails>) => void;
  onContinue: () => void;
}

export function ShareObituary({ session, onBack, onChange, onContinue }: Props) {
  const canContinue = session.obituaryUrl.trim() !== '';
  const url = normalizeUrl(session.obituaryUrl);
  const name = session.personName.trim() || 'Their';
  const possessive = /s$/i.test(name) ? `${name}'` : `${name}'s`;

  return (
    <div className="flex flex-col gap-4">
      <BackButton onClick={onBack} />
      <div className="flex flex-col gap-1">
        <Eyebrow name={session.personName || 'them'} accent2 />
        <h1 className="text-[22px]">Has the obituary been published?</h1>
        <p className="text-[13px] m-0" style={{ color: 'var(--text-muted)' }}>
          Once it's up, this is how most people will learn about the service.
        </p>
      </div>

      <div className="gg-field">
        <label htmlFor="ob-url">Link to the obituary</label>
        <input
          id="ob-url"
          className="gg-input"
          type="text"
          inputMode="url"
          placeholder="Paste the link from the paper or funeral home"
          value={session.obituaryUrl}
          onChange={(e) => onChange({ obituaryUrl: e.target.value })}
        />
      </div>

      <div className="gg-field">
        <label htmlFor="ob-publisher">
          Where it was published
          <span style={{ color: 'var(--text-eyebrow)' }}> (optional)</span>
        </label>
        <input
          id="ob-publisher"
          className="gg-input"
          type="text"
          placeholder="e.g. The Waltham Register"
          value={session.obituaryPublisher ?? ''}
          onChange={(e) => onChange({ obituaryPublisher: e.target.value })}
        />
      </div>

      {canContinue && (
        <div className="gg-card">
          <span className="gg-card-kicker">We'll send</span>
          <p className="gg-card-body m-0" style={{ opacity: 1, fontSize: 14, lineHeight: 1.7 }}>
            {possessive} obituary has been published. You can read it here:{' '}
            <span style={{ color: 'var(--color-accent-700)' }}>{url}</span>
          </p>
        </div>
      )}

      <button
        type="button"
        onClick={onContinue}
        disabled={!canContinue}
        className="gg-btn gg-btn-primary gg-btn-block"
      >
        Choose who to send it to
      </button>
      <p className="gg-reassure text-center m-0 text-[12px]">
        Not published yet? We'll wait — the paper usually wants it 1–3 days before the service.
      </p>
    </div>
  );
}
