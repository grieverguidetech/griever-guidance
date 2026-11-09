import { screenCopy } from '@griever/copy';
import { SECTION_ORDER } from '@griever/shared';
import type { SectionFields, SectionKey } from '@griever/shared';
import { navTitle } from './SideNav';
import { sectionTintClass } from './sectionTint';

const shell = screenCopy('cmsShell');
const account = screenCopy('account');

/** The sections that are sent from the phone, each with one line about what happens there. */
const PHONE_LINES: Partial<Record<SectionKey, string>> = {
  announcement: shell.phoneReadyAnnouncement,
  service: shell.phoneReadyService,
  obituary: shell.phoneReadyObituary,
  thanks: shell.phoneReadyThanks,
};

type WithStatus = Partial<Pick<SectionFields, 'sectionStatus'>>;

/** The phone sections marked ready on at least one of the given people, in the usual order. */
export function readyPhoneSections(people: readonly WithStatus[]): SectionKey[] {
  return SECTION_ORDER.filter(
    (key) => PHONE_LINES[key] !== undefined && people.some((person) => person.sectionStatus?.[key] === 'ready'),
  );
}

interface Props {
  ready: readonly SectionKey[];
}

interface ListProps extends Props {
  /** Give each row its section's tint. Off by default so the Account list stays plain. */
  tinted?: boolean;
}

/** A plain list of what can be sent from the phone. Nothing is rendered when the list is empty. */
export function PhoneReadyList({ ready, tinted = false }: ListProps) {
  if (ready.length === 0) {
    return null;
  }
  return (
    <ul role="list" className="flex flex-col gap-2 list-none p-0 m-0">
      {ready.map((key) => (
        <li key={key} className={tinted ? `flex flex-col ${sectionTintClass(key)}` : 'flex flex-col'}>
          <span className="font-semibold">{navTitle(key)}</span>{' '}
          <span className="gg-hint">{PHONE_LINES[key]}</span>
        </li>
      ))}
    </ul>
  );
}

/** The Overview card. Hidden when no phone section is ready. */
export function PhoneReadyCard({ ready }: Props) {
  if (ready.length === 0) {
    return null;
  }
  return (
    <section className="gg-panel flex flex-col gap-3" aria-labelledby="phone-ready-heading">
      <h2 id="phone-ready-heading" className="text-[16px] m-0">
        {shell.phoneReadyHeading}
      </h2>
      <p className="gg-hint m-0">{account.phoneNotInStores}</p>
      <PhoneReadyList ready={ready} tinted />
    </section>
  );
}
