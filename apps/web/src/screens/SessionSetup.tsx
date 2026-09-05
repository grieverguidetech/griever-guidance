import type { Session } from '@griever/hooks';
import { BackButton } from '../lib/ui';
import { DateField, todayISO } from '../lib/DateField';

interface Props {
  session: Session;
  editing: boolean;
  onChange: (patch: Partial<Session>) => void;
  onContinue: () => void;
  onBack: () => void;
}

export function SessionSetup({ session, editing, onChange, onContinue, onBack }: Props) {
  const canContinue = Boolean(
    session.personName.trim() && session.dateOfPassing.trim(),
  );

  return (
    <div className="flex flex-col gap-4">
      <BackButton onClick={onBack} />
      <div className="flex flex-col gap-1">
        <h1 className="text-[22px]">
          {editing ? 'Edit their details' : 'Who are we writing about?'}
        </h1>
        <p className="text-[13px] m-0" style={{ color: 'var(--text-muted)' }}>
          We'll carry this into every message, so you only type it once.
        </p>
      </div>

      <div className="gg-field">
        <label htmlFor="s-name">Their name</label>
        <input
          id="s-name"
          className="gg-input"
          type="text"
          placeholder="e.g. Margaret Hayes"
          value={session.personName}
          onChange={(e) => onChange({ personName: e.target.value })}
        />
      </div>

      <DateField
        id="s-date"
        label="Date they passed"
        value={session.dateOfPassing}
        max={todayISO()}
        onChange={(dateOfPassing) => onChange({ dateOfPassing })}
      />

      <div className="gg-field">
        <label htmlFor="s-sender">
          Your name<span style={{ color: 'var(--text-eyebrow)' }}> (optional)</span>
        </label>
        <input
          id="s-sender"
          className="gg-input"
          type="text"
          placeholder="So people know who wrote"
          value={session.senderName}
          onChange={(e) => onChange({ senderName: e.target.value })}
        />
      </div>

      <button
        type="button"
        onClick={onContinue}
        disabled={!canContinue}
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
