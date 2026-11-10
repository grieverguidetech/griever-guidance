import { useEffect, useId, useRef, useState } from 'react';
import { buildObituaryDraft, hasTemplateBlanks, screenCopy } from '@griever/copy';
import { FLOW_DETAIL_MAX_LENGTH, PRECEDED_RELATIONS, SURVIVOR_RELATIONS } from '@griever/shared';
import type { ServiceEventFields, SectionFields, SectionKey, SessionDetails } from '@griever/shared';
import { AccordionSection } from '../AccordionSection';
import { MarkReady } from './MarkReady';
import {
  ObituaryLifeFields,
  type ObituaryLifeKey,
  type ObituaryLifeValues,
  type ServiceSharedPatch,
} from './ObituaryLifeFields';
import { ObituaryPeople } from './ObituaryPeople';

const copy = screenCopy('cmsObituary');
const draftCopy = screenCopy('obituaryDraft');

/** The Service fields fill the template. Only cemetery, private burial and officiant are also written here. */
type ObituaryValues = ObituaryLifeValues &
  Partial<Pick<SessionDetails, 'serviceDate'>> &
  Partial<ServiceEventFields> &
  Pick<
    SectionFields,
    | 'obituaryText'
    | 'obituaryMemorial'
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
  Pick<SectionFields, 'obituaryText' | 'obituaryMemorial' | 'obituarySurvivorList' | 'obituaryPrecededList' | ObituaryLifeKey>
>;

interface Props {
  values: ObituaryValues;
  /** Gets only the field that changed. There is no Save button; the editor saves as you go. */
  onChange: (patch: ObituaryPatch) => void;
  /** Gets only the Service field that changed (cemetery, private burial, officiant). Service shows the same values. */
  onServiceChange: (patch: ServiceSharedPatch) => void;
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
export function ObituarySection({ values, onChange, onServiceChange, onReadyChange, nextSection, onNext, onOpenPerson, onOpenService }: Props) {
  const id = useId();
  const textRef = useRef<HTMLTextAreaElement>(null);
  const memorialRef = useRef<HTMLTextAreaElement>(null);
  // True while the memorial box has focus, so a cleared box stays until the user leaves it.
  const [memorialFocused, setMemorialFocused] = useState(false);
  const focusMemorial = useRef(false);
  const prefill = buildObituaryDraft(
    { ...values, dateOfPassing: values.dateOfPassing ?? undefined },
    draftCopy,
  );
  const memorialBlank = (values.obituaryMemorial ?? '').trim() === '';
  // Open on load only when a memorial is already saved. Not remembered across loads.
  const [memorialOpen, setMemorialOpen] = useState(() => !memorialBlank);
  // Relies on onChange updating state synchronously (useSessions updateSection).
  useEffect(() => {
    if (focusMemorial.current) {
      memorialRef.current?.focus();
    }
    focusMemorial.current = false;
  });
  const edited = values.obituaryText !== undefined;
  const shownText = values.obituaryText ?? prefill;
  const textBlanks = hasTemplateBlanks(shownText, draftCopy);
  const memorialBlanks = hasTemplateBlanks(values.obituaryMemorial ?? '', draftCopy);
  const blanksLeft = textBlanks || memorialBlanks;
  // The memorial can be closed, so name it when its blanks are what blocks Ready.
  const blockedMessage = memorialBlanks ? (textBlanks ? copy.readyPlaceholdersBoth : copy.readyPlaceholdersMemorial) : copy.readyPlaceholders;
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
      <div className="gg-panel">
        <div className="grid grid-cols-1 items-start gap-6 md:grid-cols-2">
          <div className="flex flex-col gap-4">
            <h2 id={`${id}-details`} className="font-semibold">
              {copy.detailsHeading}
            </h2>
            {facts.length > 0 && (
              <dl aria-labelledby={`${id}-details`} className="flex flex-col gap-1">
                {facts.map((f) => (
                  <div key={f.label} className="flex flex-wrap gap-x-2">
                    <dt className="font-medium">{f.label}</dt>
                    <dd className="min-w-0 [overflow-wrap:anywhere]">{f.value}</dd>
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
          <div className="flex flex-col gap-4">
            <h2 id={`${id}-service`} className="font-semibold">
              {copy.serviceDetailsHeading}
            </h2>
            {serviceFacts.length > 0 ? (
              <p id={`${id}-service-hint`} className="gg-hint">
                {copy.serviceDetailsHint}
              </p>
            ) : (
              <p className="gg-hint">{copy.serviceDetailsEmpty}</p>
            )}
            {serviceFacts.length > 0 && (
              <dl
                aria-labelledby={`${id}-service`}
                aria-describedby={`${id}-service-hint`}
                className="flex flex-col gap-1"
              >
                {serviceFacts.map((f) => (
                  <div key={f.label} className="flex flex-wrap gap-x-2">
                    <dt className="font-medium">{f.label}</dt>
                    <dd className="min-w-0 [overflow-wrap:anywhere]">{f.value}</dd>
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
        </div>
      </div>
      <div className="flex flex-col gap-6">
        <ObituaryLifeFields values={values} onChange={onChange} onServiceChange={onServiceChange} />
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
          aria-describedby={`${id}-text-hint`}
          className="gg-input"
          rows={10}
          value={shownText}
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
      <AccordionSection
        title={copy.memorialHeading}
        level={2}
        open={memorialOpen}
        panelId={`${id}-memorial-panel`}
        onToggle={() => setMemorialOpen((o) => !o)}
      >
        {memorialBlank && !memorialFocused ? (
          <button
            type="button"
            className="gg-btn gg-btn-primary self-start"
            onClick={() => {
              focusMemorial.current = true;
              onChange({ obituaryMemorial: draftCopy.memorial });
            }}
          >
            {copy.addMemorial}
          </button>
        ) : (
          <div className="gg-field">
            <label htmlFor={`${id}-memorial`}>{copy.memorialLabel}</label>
            <p id={`${id}-memorial-hint`}>{copy.memorialHint}</p>
            <textarea
              id={`${id}-memorial`}
              ref={memorialRef}
              aria-describedby={`${id}-memorial-hint`}
              className="gg-input"
              rows={4}
              maxLength={FLOW_DETAIL_MAX_LENGTH.obituaryMemorial}
              value={values.obituaryMemorial ?? ''}
              onFocus={() => setMemorialFocused(true)}
              onBlur={(e) => {
                setMemorialFocused(false);
                // Blank on leaving means "not added": the button comes back, focus stays where the user put it.
                if (e.target.value.trim() === '') {
                  onChange({ obituaryMemorial: '' });
                }
              }}
              onChange={(e) => onChange({ obituaryMemorial: e.target.value })}
            />
          </div>
        )}
      </AccordionSection>
      <MarkReady
        ready={values.sectionStatus?.obituary === 'ready'}
        onChange={onReadyChange}
        nextSection={nextSection}
        onNext={onNext}
        phoneNudge="obituary"
        blockedMessage={blanksLeft ? blockedMessage : undefined}
      />
    </div>
  );
}
