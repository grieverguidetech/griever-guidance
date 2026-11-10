import { useId, useRef } from 'react';
import { buildObituaryDraft, hasTemplateBlanks, screenCopy } from '@griever/copy';
import { PRECEDED_RELATIONS, SURVIVOR_RELATIONS } from '@griever/shared';
import type { ServiceEventFields, SectionFields, SectionKey, SessionDetails } from '@griever/shared';
import { MarkReady } from './MarkReady';
import { ObituaryLifeFields, type ObituaryLifeKey, type ObituaryLifeValues } from './ObituaryLifeFields';
import { ObituaryPeople } from './ObituaryPeople';

const copy = screenCopy('cmsObituary');
const draftCopy = screenCopy('obituaryDraft');

/** The Service fields are only read, to fill the template. They are edited in the Service section. */
type ObituaryValues = ObituaryLifeValues &
  Partial<Pick<SessionDetails, 'serviceDate'>> &
  Partial<ServiceEventFields> &
  Pick<
    SectionFields,
    | 'obituaryText'
    | 'obituaryCareer'
    | 'obituarySurvivors'
    | 'obituaryNote'
    | 'obituarySurvivorList'
    | 'obituaryPrecededList'
    | 'sectionStatus'
    | 'servicePlace'
    | 'serviceTime'
  >;

/** The name and dates are edited in The person, so they are not in the patch. */
export type ObituaryPatch = Partial<
  Pick<SectionFields, 'obituaryText' | 'obituarySurvivorList' | 'obituaryPrecededList' | ObituaryLifeKey>
>;

interface Props {
  values: ObituaryValues;
  /** Gets only the field that changed. There is no Save button; the editor saves as you go. */
  onChange: (patch: ObituaryPatch) => void;
  onReadyChange: (ready: boolean) => void;
  /** The next section still to do, or null when none is left. */
  nextSection?: SectionKey | null;
  onNext?: () => void;
  /** Opens The person, where the name and dates are edited. */
  onOpenPerson?: () => void;
  /** Opens Service, where the service details are edited. */
  onOpenService?: () => void;
}

/** The obituary template fields, and the obituary text. The text follows the fields until edited. */
export function ObituarySection({ values, onChange, onReadyChange, nextSection, onNext, onOpenPerson, onOpenService }: Props) {
  const id = useId();
  const textRef = useRef<HTMLTextAreaElement>(null);
  const prefill = buildObituaryDraft(
    { ...values, dateOfPassing: values.dateOfPassing ?? undefined },
    draftCopy,
  );
  const edited = values.obituaryText !== undefined;
  const shownText = values.obituaryText ?? prefill;
  const blanksLeft = hasTemplateBlanks(shownText, draftCopy);
  const facts = [
    { label: copy.nameLabel, value: values.personName },
    { label: copy.bornLabel, value: values.birthDate },
    { label: copy.diedLabel, value: values.dateOfPassing },
  ].filter((f) => f.value && f.value.trim() !== '');
  const serviceFacts = [
    { label: copy.servicePlaceLabel, value: values.servicePlace },
    { label: copy.serviceDateLabel, value: values.serviceDate },
    { label: copy.serviceTimeLabel, value: values.serviceTime },
    { label: copy.officiantLabel, value: values.serviceOfficiant },
    values.burialPrivate
      ? { label: copy.burialLabel, value: copy.burialPrivateValue }
      : { label: copy.burialPlaceLabel, value: values.burialPlace },
    { label: copy.visitationPlaceLabel, value: values.visitationPlace },
    { label: copy.visitationDateLabel, value: values.visitationDate },
    { label: copy.visitationTimeLabel, value: values.visitationTime },
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
        {onOpenPerson && (
          <button type="button" className="gg-btn gg-btn-secondary self-start" onClick={onOpenPerson}>
            {copy.changeDetails}
          </button>
        )}
      </div>
      <div className="gg-panel flex flex-col gap-4">
        <p id={`${id}-service`} className="font-semibold">
          {copy.serviceDetailsHeading}
        </p>
        <p className="gg-hint">{copy.serviceDetailsHint}</p>
        {serviceFacts.length > 0 && (
          <dl aria-labelledby={`${id}-service`} className="flex flex-col gap-1">
            {serviceFacts.map((f) => (
              <div key={f.label} className="flex gap-2">
                <dt className="font-medium">{f.label}</dt>
                <dd>{f.value}</dd>
              </div>
            ))}
          </dl>
        )}
        {onOpenService && (
          <button type="button" className="gg-btn gg-btn-secondary self-start" onClick={onOpenService}>
            {copy.changeOnService}
          </button>
        )}
      </div>
      <div className="gg-panel flex flex-col gap-6">
        <ObituaryLifeFields values={values} onChange={onChange} />
        <ObituaryPeople
          heading={copy.survivedByHeading}
          relations={SURVIVOR_RELATIONS}
          value={values.obituarySurvivorList ?? ''}
          onChange={(text) => onChange({ obituarySurvivorList: text })}
        />
        <ObituaryPeople
          heading={copy.precededByHeading}
          relations={PRECEDED_RELATIONS}
          value={values.obituaryPrecededList ?? ''}
          onChange={(text) => onChange({ obituaryPrecededList: text })}
        />
      </div>
      <div className="gg-field">
        <label htmlFor={`${id}-text`}>{copy.textLabel}</label>
        <p id={`${id}-text-hint`}>{edited ? copy.textHintEdited : copy.textHint}</p>
        <textarea
          id={`${id}-text`}
          ref={textRef}
          aria-describedby={blanksLeft ? `${id}-text-hint ${id}-text-blanks` : `${id}-text-hint`}
          className="gg-input"
          rows={10}
          value={shownText}
          onChange={(e) => onChange({ obituaryText: e.target.value })}
        />
        {blanksLeft && (
          <p id={`${id}-text-blanks`} className="gg-hint">
            {copy.textBlanks}
          </p>
        )}
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
      <MarkReady
        ready={values.sectionStatus?.obituary === 'ready'}
        onChange={onReadyChange}
        nextSection={nextSection}
        onNext={onNext}
        phoneNudge="obituary"
      />
    </div>
  );
}
