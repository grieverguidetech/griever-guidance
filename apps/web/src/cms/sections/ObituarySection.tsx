import { useId, useRef } from 'react';
import { buildObituaryDraft, screenCopy } from '@griever/copy';
import type { SectionFields, SectionKey, SessionDetails } from '@griever/shared';
import { MarkReady } from './MarkReady';

const copy = screenCopy('cmsObituary');
const draftCopy = screenCopy('obituaryDraft');

type ObituaryValues = Partial<Pick<SessionDetails, 'personName' | 'dateOfPassing' | 'obituaryUrl' | 'obituaryPublisher'>> &
  Pick<
    SectionFields,
    'birthDate' | 'obituaryText' | 'obituaryCity' | 'obituaryCareer' | 'obituarySurvivors' | 'obituaryNote' | 'sectionStatus'
  >;

/** The name and dates are edited in The person, so they are not in the patch. */
export type ObituaryPatch = Partial<
  Pick<
    ObituaryValues,
    'obituaryText' | 'obituaryCity' | 'obituaryCareer' | 'obituarySurvivors' | 'obituaryNote' | 'obituaryUrl' | 'obituaryPublisher'
  >
>;

interface Props {
  values: ObituaryValues;
  /** Gets only the field that changed. There is no Save button; the editor saves as you go. */
  onChange: (patch: ObituaryPatch) => void;
  onReadyChange: (ready: boolean) => void;
  /** The next section still to do, or null when none is left. */
  nextSection?: SectionKey | null;
  onNext?: () => void;
}

/** The obituary template fields, the obituary text and where it is published. The text follows the fields until edited. */
export function ObituarySection({ values, onChange, onReadyChange, nextSection, onNext }: Props) {
  const id = useId();
  const textRef = useRef<HTMLTextAreaElement>(null);
  const prefill = buildObituaryDraft(
    {
      fullName: values.personName ?? '',
      dateOfBirth: values.birthDate,
      dateOfPassing: values.dateOfPassing ?? undefined,
      cityOfResidence: values.obituaryCity,
      career: values.obituaryCareer,
      survivors: values.obituarySurvivors,
      personalNote: values.obituaryNote,
    },
    draftCopy,
  );
  const edited = values.obituaryText !== undefined;
  const facts = [
    { label: copy.nameLabel, value: values.personName },
    { label: copy.bornLabel, value: values.birthDate },
    { label: copy.diedLabel, value: values.dateOfPassing },
  ].filter((f) => f.value && f.value.trim() !== '');

  return (
    <div className="flex flex-col gap-6">
      <p>{copy.intro}</p>
      <div className="gg-panel flex flex-col gap-4">
        <p id={`${id}-details`} className="font-semibold">
          {copy.detailsHeading}
        </p>
        {facts.length > 0 && (
          <dl aria-labelledby={`${id}-details`} className="flex flex-col gap-1">
            {facts.map((f) => (
              <div key={f.label} className="flex gap-2">
                <dt className="font-medium">{f.label}</dt>
                <dd>{f.value}</dd>
              </div>
            ))}
          </dl>
        )}
        <p className="gg-hint">{copy.detailsHint}</p>
        <div className="gg-field">
          <label htmlFor={`${id}-city`}>{copy.cityLabel}</label>
          <input
            id={`${id}-city`}
            type="text"
            className="gg-input"
            autoComplete="off"
            value={values.obituaryCity ?? ''}
            onChange={(e) => onChange({ obituaryCity: e.target.value })}
          />
        </div>
        <div className="gg-field">
          <label htmlFor={`${id}-career`}>{copy.careerLabel}</label>
          <input
            id={`${id}-career`}
            type="text"
            className="gg-input"
            autoComplete="off"
            value={values.obituaryCareer ?? ''}
            onChange={(e) => onChange({ obituaryCareer: e.target.value })}
          />
        </div>
        <div className="gg-field">
          <label htmlFor={`${id}-survivors`}>{copy.survivorsLabel}</label>
          <p id={`${id}-survivors-hint`} className="gg-hint">
            {copy.survivorsHint}
          </p>
          <textarea
            id={`${id}-survivors`}
            aria-describedby={`${id}-survivors-hint`}
            className="gg-input"
            rows={2}
            value={values.obituarySurvivors ?? ''}
            onChange={(e) => onChange({ obituarySurvivors: e.target.value })}
          />
        </div>
        <div className="gg-field">
          <label htmlFor={`${id}-note`}>{copy.noteLabel}</label>
          <p id={`${id}-note-hint`} className="gg-hint">
            {copy.noteHint}
          </p>
          <textarea
            id={`${id}-note`}
            aria-describedby={`${id}-note-hint`}
            className="gg-input"
            rows={3}
            value={values.obituaryNote ?? ''}
            onChange={(e) => onChange({ obituaryNote: e.target.value })}
          />
        </div>
      </div>
      <div className="gg-field">
        <label htmlFor={`${id}-text`}>{copy.textLabel}</label>
        <p id={`${id}-text-hint`}>{edited ? copy.textHintEdited : copy.textHint}</p>
        <textarea
          id={`${id}-text`}
          ref={textRef}
          aria-describedby={`${id}-text-hint`}
          className="gg-input"
          rows={10}
          value={values.obituaryText ?? prefill}
          onChange={(e) => onChange({ obituaryText: e.target.value })}
        />
        {edited && (
          <button
            type="button"
            className="gg-btn gg-btn-secondary"
            onClick={() => {
              onChange({ obituaryText: undefined });
              // The button goes away on reset, so keep focus on the text.
              textRef.current?.focus();
            }}
          >
            {copy.useDetails}
          </button>
        )}
      </div>
      <div className="gg-panel flex flex-col gap-4">
        <p className="font-semibold">{copy.publishedHeading}</p>
        <p className="gg-hint">{copy.publishedHint}</p>
        <div className="gg-field">
          <label htmlFor={`${id}-url`}>{copy.urlLabel}</label>
          <input
            id={`${id}-url`}
            type="url"
            inputMode="url"
            className="gg-input"
            autoComplete="off"
            value={values.obituaryUrl ?? ''}
            onChange={(e) => onChange({ obituaryUrl: e.target.value })}
          />
        </div>
        <div className="gg-field">
          <label htmlFor={`${id}-publisher`}>{copy.publisherLabel}</label>
          <input
            id={`${id}-publisher`}
            type="text"
            className="gg-input"
            autoComplete="off"
            placeholder={copy.publisherPlaceholder}
            value={values.obituaryPublisher ?? ''}
            onChange={(e) => onChange({ obituaryPublisher: e.target.value })}
          />
        </div>
      </div>
      <MarkReady
        ready={values.sectionStatus?.obituary === 'ready'}
        onChange={onReadyChange}
        nextSection={nextSection}
        onNext={onNext}
      />
    </div>
  );
}
