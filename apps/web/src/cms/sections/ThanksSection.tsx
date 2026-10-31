import { useId, useRef } from 'react';
import { fill, screenCopy } from '@griever/copy';
import type { SectionFields, SectionKey, SessionDetails } from '@griever/shared';
import { MarkReady } from './MarkReady';

const copy = screenCopy('cmsThanks');

type ThanksValues = Partial<Pick<SessionDetails, 'personName'> & Omit<SectionFields, 'sectionStatus'>> &
  Pick<SectionFields, 'sectionStatus'>;

export type ThanksPatch = Pick<SectionFields, 'thanksMessage'>;

interface Props {
  values: ThanksValues;
  /** Gets only the field that changed. There is no Save button; the editor saves as you go. */
  onChange: (patch: ThanksPatch) => void;
  onReadyChange: (ready: boolean) => void;
  /** The next section still to do, or null when none is left. */
  nextSection?: SectionKey | null;
  onNext?: () => void;
}

/** The thank-you message. It follows the person's name until the family edits it. */
export function ThanksSection({ values, onChange, onReadyChange, nextSection, onNext }: Props) {
  const id = useId();
  const messageRef = useRef<HTMLTextAreaElement>(null);
  const name = values.personName?.trim() || copy.nameFallback;
  const prefill = fill(copy.template, { deceasedName: name });
  const edited = values.thanksMessage !== undefined;

  return (
    <div className="flex flex-col gap-6">
      <p>{copy.intro}</p>
      <div className="gg-panel">
        <div className="gg-field">
          <label htmlFor={`${id}-message`}>{copy.messageLabel}</label>
          <p id={`${id}-message-hint`} className="gg-hint">
            {edited ? copy.messageHintEdited : copy.messageHint}
          </p>
          <textarea
            id={`${id}-message`}
            ref={messageRef}
            aria-describedby={`${id}-message-hint`}
            className="gg-input"
            rows={8}
            value={values.thanksMessage ?? prefill}
            onChange={(e) => onChange({ thanksMessage: e.target.value })}
          />
          {edited && (
            <button
              type="button"
              className="gg-btn gg-btn-secondary"
              onClick={() => {
                onChange({ thanksMessage: undefined });
                // The button goes away on reset, so keep focus on the message.
                messageRef.current?.focus();
              }}
            >
              {copy.useTemplate}
            </button>
          )}
        </div>
      </div>
      <MarkReady
        ready={values.sectionStatus?.thanks === 'ready'}
        onChange={onReadyChange}
        nextSection={nextSection}
        onNext={onNext}
      />
    </div>
  );
}
