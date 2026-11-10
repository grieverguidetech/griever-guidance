import { useEffect, useId, useRef, useState } from 'react';
import { buildObituaryDraft, hasTemplateBlanks, screenCopy } from '@griever/copy';
import { FLOW_DETAIL_MAX_LENGTH, PRECEDED_RELATIONS, SURVIVOR_RELATIONS } from '@griever/shared';
import type { ServiceEventFields, SectionFields, SectionKey, SessionDetails } from '@griever/shared';
import { MarkReady } from './MarkReady';
import {
  ObituaryLifeFields,
  type ObituaryLifeKey,
  type ObituaryLifeValues,
  type PersonSharedPatch,
  type ServiceSharedPatch,
} from './ObituaryLifeFields';
import { ObituaryPeople } from './ObituaryPeople';

const copy = screenCopy('cmsObituary');
const draftCopy = screenCopy('obituaryDraft');

/** The Service fields fill the template. Officiant, burial, and the service and visitation place, date and time (plus serviceAddress) are also written here, through onServiceChange; birth date and date of passing through onPersonChange. */
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

/** The name is edited in The person, and the dates go through onPersonChange, so they are not in the patch. */
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
  /** Gets only the date that changed (birth, passing). The person shows the same values. */
  onPersonChange: (patch: PersonSharedPatch) => void;
}

/** The obituary template fields, and the obituary text. The text follows the fields until edited. */
export function ObituarySection({ values, onChange, onServiceChange, onReadyChange, nextSection, onNext, onPersonChange }: Props) {
  const id = useId();
  const textRef = useRef<HTMLTextAreaElement>(null);
  const memorialRef = useRef<HTMLTextAreaElement>(null);
  const focusMemorial = useRef(false);
  const prefill = buildObituaryDraft(
    { ...values, dateOfPassing: values.dateOfPassing ?? undefined },
    draftCopy,
  );
  // The switch is on at load only when a memorial is already saved. Not remembered across loads.
  const [memorialOn, setMemorialOn] = useState(() => (values.obituaryMemorial ?? '').trim() !== '');
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
  const memorialBlank = (values.obituaryMemorial ?? '').trim() === '';
  const memorialBlanks = memorialOn && hasTemplateBlanks(values.obituaryMemorial ?? '', draftCopy);
  const blanksLeft = textBlanks || memorialBlanks;
  // The memorial can be switched off, so name it when its blanks are what blocks Ready.
  const blockedMessage = memorialBlanks ? (textBlanks ? copy.readyPlaceholdersBoth : copy.readyPlaceholdersMemorial) : copy.readyPlaceholders;
  return (
    <div className="flex flex-col gap-6">
      <p>{copy.intro}</p>
      <div className="flex flex-col gap-6">
        <ObituaryLifeFields values={values} onChange={onChange} onServiceChange={onServiceChange} onPersonChange={onPersonChange} />
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
      <section className="flex flex-col gap-3">
        <h2 className="m-0">{copy.memorialHeading}</h2>
        <button
          type="button"
          role="switch"
          aria-checked={memorialOn}
          className="flex min-h-11 items-center gap-3 self-start text-left"
          onClick={() => {
            if (memorialOn) {
              // Off: the memorial is left out. Focus stays on this switch.
              setMemorialOn(false);
              onChange({ obituaryMemorial: '' });
              return;
            }
            setMemorialOn(true);
            focusMemorial.current = true;
            if (memorialBlank) {
              onChange({ obituaryMemorial: draftCopy.memorial });
            }
          }}
        >
          <span aria-hidden="true" className={`gg-switch ${memorialOn ? 'gg-switch-on' : ''}`}>
            <span />
          </span>
          {copy.addMemorial}
        </button>
        {memorialOn && (
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
              onChange={(e) => onChange({ obituaryMemorial: e.target.value })}
            />
          </div>
        )}
      </section>
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
