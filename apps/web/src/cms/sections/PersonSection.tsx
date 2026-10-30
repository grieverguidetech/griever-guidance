import { useId } from 'react';
import { screenCopy } from '@griever/copy';
import { dateNote, type SectionFields, SectionKey, SessionDetails } from '@griever/shared';
import { DateField, todayISO } from '../../lib/DateField';
import { MarkReady } from './MarkReady';

const copy = screenCopy('cmsPerson');

/** The unreadable note waits for the field to lose focus; the others show at once. */
function noteProps(kind: ReturnType<typeof dateNote>) {
  if (kind === 'unreadable') {
    return { noteOnBlur: copy.dateUnreadable };
  }
  if (kind === 'birthAfterPassing') {
    return { note: copy.birthAfterPassing };
  }
  if (kind === 'futurePassing') {
    return { note: copy.futurePassing };
  }
  return {};
}

type PersonValues = Partial<Pick<SessionDetails, 'personName' | 'dateOfPassing'>> &
  Pick<SectionFields, 'birthDate' | 'sectionStatus'>;

export type PersonPatch = Partial<Pick<PersonValues, 'personName' | 'birthDate' | 'dateOfPassing'>>;

interface Props {
  values: PersonValues;
  /** Gets only the field that changed. There is no Save button; the editor saves as you go. */
  onChange: (patch: PersonPatch) => void;
  onReadyChange: (ready: boolean) => void;
  /** The next section still to do, or null when none is left. */
  nextSection?: SectionKey | null;
  onNext?: () => void;
}

/** The person's details, typed once; every message reads them. */
export function PersonSection({ values, onChange, onReadyChange, nextSection, onNext }: Props) {
  const id = useId();
  const birthNote = dateNote(values.birthDate, { field: 'birth', dateOfPassing: values.dateOfPassing });
  const passingNote = dateNote(values.dateOfPassing, { field: 'passing' });
  return (
    <div className="flex flex-col gap-4">
      <p>{copy.intro}</p>
      <div className="gg-field">
        <label htmlFor={`${id}-name`}>{copy.nameLabel}</label>
        <input
          id={`${id}-name`}
          type="text"
          className="gg-input"
          autoComplete="off"
          placeholder={copy.namePlaceholder}
          value={values.personName ?? ''}
          onChange={(e) => onChange({ personName: e.target.value })}
        />
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2" style={{ gap: 'var(--space-4)' }}>
        <DateField
          id={`${id}-birth`}
          label={`${copy.dateOfBirthLabel} ${copy.optional}`}
          value={values.birthDate ?? ''}
          max={todayISO()}
          visibleHelp
          {...noteProps(birthNote)}
          onChange={(birthDate) => onChange({ birthDate })}
        />
        <DateField
          id={`${id}-passing`}
          label={`${copy.dateOfPassingLabel} ${copy.optional}`}
          value={values.dateOfPassing ?? ''}
          max={todayISO()}
          visibleHelp
          {...noteProps(passingNote)}
          onChange={(dateOfPassing) => onChange({ dateOfPassing })}
        />
      </div>
      <MarkReady
        ready={values.sectionStatus?.person === 'ready'}
        onChange={onReadyChange}
        nextSection={nextSection}
        onNext={onNext}
      />
    </div>
  );
}
