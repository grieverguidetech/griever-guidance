import type { useSendFlow } from '@griever/hooks';
import { PencilSimple } from '@phosphor-icons/react';
import { BackButton, Eyebrow } from '../lib/ui';

type Flow = ReturnType<typeof useSendFlow>;

interface Props {
  flow: Flow;
  onEditSession: () => void;
}

export function AnnounceForm({ flow, onEditSession }: Props) {
  const { fields, setField, nextStep, prevStep } = flow;
  const session = flow.session;
  const name = session?.personName?.trim() || 'your loved one';

  const recap = [
    session?.personName?.trim() || 'Their name',
    session?.dateOfPassing?.trim()
      ? `passed ${session.dateOfPassing.trim()}`
      : 'date not set',
    session?.senderName?.trim() ? `from ${session.senderName.trim()}` : null,
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <div className="flex flex-col gap-4">
      <BackButton onClick={prevStep} />
      <div className="flex flex-col gap-1">
        <Eyebrow name={name} accent2 />
        <h1 className="text-[22px]">Announce the passing</h1>
        <p className="text-[13px] m-0" style={{ color: 'var(--text-muted)' }}>
          We have everything we need. This is only if you'd like to say more.
        </p>
      </div>

      <div className="gg-card">
        <span className="gg-card-kicker">From your details</span>
        <p className="gg-card-body m-0" style={{ opacity: 1, fontSize: 14 }}>
          {recap}
        </p>
        <button
          type="button"
          onClick={onEditSession}
          className="gg-btn gg-btn-ghost self-start !min-h-0 !px-0"
        >
          <PencilSimple size={16} weight="regular" />
          Edit
        </button>
      </div>

      <div className="gg-field">
        <label htmlFor="b-note">
          Anything you'd like to add
          <span style={{ color: 'var(--text-eyebrow)' }}> (optional)</span>
        </label>
        <textarea
          id="b-note"
          className="gg-input"
          rows={3}
          placeholder="She was peaceful, and we were with her."
          value={fields['personalNote'] ?? ''}
          onChange={(e) => setField('personalNote', e.target.value)}
        />
      </div>

      <button
        type="button"
        onClick={nextStep}
        className="gg-btn gg-btn-primary gg-btn-block"
      >
        Continue
      </button>
      <p className="gg-reassure text-center m-0 text-[12px]">
        Everything is saved as you go. You can stop and come back.
      </p>
    </div>
  );
}
