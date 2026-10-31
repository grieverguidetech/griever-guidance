import { useId, useRef } from 'react';
import { screenCopy } from '@griever/copy';
import { announcePassing, type SectionFields, type SectionKey, type SessionDetails } from '@griever/shared';
import { MarkReady } from './MarkReady';

const copy = screenCopy('cmsAnnouncement');

type AnnouncementValues = Partial<Pick<SessionDetails, 'personName' | 'dateOfPassing'> & Omit<SectionFields, 'sectionStatus'>> &
  Pick<SectionFields, 'sectionStatus'>;

export type AnnouncementPatch = Pick<SectionFields, 'announcementMessage'>;

interface Props {
  values: AnnouncementValues;
  /** Gets only the field that changed. There is no Save button; the editor saves as you go. */
  onChange: (patch: AnnouncementPatch) => void;
  onReadyChange: (ready: boolean) => void;
  /** The next section still to do, or null when none is left. */
  nextSection?: SectionKey | null;
  onNext?: () => void;
}

/** The announcement message. It follows the person's details until the family edits it. */
export function AnnouncementSection({ values, onChange, onReadyChange, nextSection, onNext }: Props) {
  const id = useId();
  const messageRef = useRef<HTMLTextAreaElement>(null);
  const prefill = announcePassing.renderMessage({
    deceasedName: values.personName ?? '',
    dateOfPassing: values.dateOfPassing ?? '',
  });
  const edited = values.announcementMessage !== undefined;

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
            value={values.announcementMessage ?? prefill}
            onChange={(e) => onChange({ announcementMessage: e.target.value })}
          />
          {edited && (
            <button
              type="button"
              className="gg-btn gg-btn-secondary"
              onClick={() => {
                onChange({ announcementMessage: undefined });
                // The button goes away on reset, so keep focus on the message.
                messageRef.current?.focus();
              }}
            >
              {copy.useDetails}
            </button>
          )}
        </div>
      </div>
      <MarkReady
        ready={values.sectionStatus?.announcement === 'ready'}
        onChange={onReadyChange}
        nextSection={nextSection}
        onNext={onNext}
      />
    </div>
  );
}
