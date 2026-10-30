import { useId, useRef, useState } from 'react';
import type { KeyboardEvent } from 'react';
import { screenCopy } from '@griever/copy';
import { SECTION_ORDER } from '@griever/shared';
import type { SectionKey, SectionStatus } from '@griever/shared';
import { Button } from '@griever/ui';

const copy = screenCopy('cmsShell');

export type CmsNavKey = 'overview' | SectionKey | 'account';

type CopyKey = keyof typeof copy;

/** The words for each nav item. A new SectionKey fails to compile until it has a row here. */
const NAV_COPY: Record<CmsNavKey, CopyKey> = {
  overview: 'navOverview',
  person: 'navPerson',
  announcement: 'navAnnouncement',
  service: 'navService',
  obituary: 'navObituary',
  thanks: 'navThankYous',
  account: 'navAccount',
};

function isSectionKey(key: CmsNavKey): key is SectionKey {
  return (SECTION_ORDER as readonly string[]).includes(key);
}

const STATUS_COPY: Record<SectionStatus | 'not_started', CopyKey> = {
  not_started: 'statusNotStarted',
  in_progress: 'statusInProgress',
  ready: 'statusReady',
};

/** The nav order: Overview, the sections in their real-world order, then the account. */
export const NAV_ORDER: readonly CmsNavKey[] = ['overview', ...SECTION_ORDER, 'account'];

export function navTitle(key: CmsNavKey): string {
  return copy[NAV_COPY[key]];
}

interface Props {
  personName: string;
  section: CmsNavKey;
  onSelect: (key: CmsNavKey) => void;
  onChangePerson: () => void;
  /** When given, each section shows its status; a missing key reads as not started. */
  statuses?: Partial<Record<SectionKey, SectionStatus>>;
}

/**
 * Wide screens: always shown. Narrow screens: behind a menu button. The button sits outside the
 * nav landmark so a screen reader does not hear the landmark name twice.
 */
export function SideNav({ personName, section, onSelect, onChangePerson, statuses }: Props) {
  const panelId = useId();
  const [open, setOpen] = useState(false);
  const menuButton = useRef<HTMLButtonElement>(null);
  const name = personName.trim();

  function onKeyDown(event: KeyboardEvent) {
    if (event.key === 'Escape' && open) {
      setOpen(false);
      menuButton.current?.focus();
    }
  }

  function choose(key: CmsNavKey) {
    setOpen(false);
    onSelect(key);
  }

  return (
    <div className="flex flex-col gap-2 md:w-64 md:shrink-0" onKeyDown={onKeyDown}>
      {/* A raw button, not the libs/ui Button: it needs a ref (Escape returns focus here) and aria-expanded / aria-controls, which Button does not take. */}
      <button
        ref={menuButton}
        type="button"
        className="gg-btn gg-btn-secondary self-start md:hidden"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((value) => !value)}
      >
        {copy.menuButton}
      </button>
      <div id={panelId} className={`${open ? 'flex' : 'hidden'} flex-col gap-3 md:flex`}>
        <div className="flex items-center justify-between gap-2">
          <p className="font-semibold break-words min-w-0">{name || copy.unnamedPerson}</p>
          <Button
            label={copy.change}
            accessibilityName={copy.changeLabel}
            variant="tertiary"
            onPress={() => {
              // Close first so focus is never left on a hidden button; the caller then moves it on.
              setOpen(false);
              onChangePerson();
            }}
          />
        </div>
        <nav aria-label={copy.navLandmark}>
          <ul className="flex flex-col gap-1 list-none p-0 m-0">
            {NAV_ORDER.map((key) => (
              <li key={key}>
                <button
                  type="button"
                  className={`gg-btn gg-btn-ghost w-full !justify-between text-left ${
                    key === section ? 'font-semibold bg-accent-100 border-l-4 border-l-accent-700' : ''
                  }`}
                  aria-current={key === section ? 'page' : undefined}
                  onClick={() => choose(key)}
                >
                  <span>{navTitle(key)}</span>
                  {statuses && isSectionKey(key) ? (
                    <>
                      {' '}
                      <span className="text-[12px] font-normal">{copy[STATUS_COPY[statuses[key] ?? 'not_started']]}</span>
                    </>
                  ) : null}
                </button>
              </li>
            ))}
          </ul>
        </nav>
      </div>
    </div>
  );
}
