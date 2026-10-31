import { useId, useRef, useState } from 'react';
import type { KeyboardEvent } from 'react';
import { fill, screenCopy } from '@griever/copy';
import { SECTION_ORDER } from '@griever/shared';
import type { SectionKey, SectionStatus } from '@griever/shared';
import { Button } from '@griever/ui';
import { AVAILABLE_SECTIONS } from './Overview';

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

/** Decorative; the status text beside it carries the meaning. */
function CheckIcon() {
  return (
    <svg
      aria-hidden="true"
      focusable="false"
      width="14"
      height="14"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="shrink-0 text-[color:var(--color-success-700)]"
    >
      <path d="M3 8.5l3.2 3.2L13 4.8" />
    </svg>
  );
}

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
  /** The people list: no person is the subject, so only the account item is offered. */
  accountOnly?: boolean;
}

/**
 * Wide screens: always shown. Narrow screens: behind a menu button. The button sits outside the
 * nav landmark so a screen reader does not hear the landmark name twice.
 */
export function SideNav({ personName, section, onSelect, onChangePerson, statuses, accountOnly = false }: Props) {
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

  if (accountOnly) {
    return (
      <div className="flex flex-col gap-2 md:w-48 md:shrink-0">
        <nav aria-label={copy.navLandmark}>
          <ul className="flex flex-col gap-1 list-none p-0 m-0">
            <li>
              <button
                type="button"
                className={`gg-row ${section === 'account' ? 'bg-accent-100 shadow-[inset_3px_0_0_var(--color-accent-700)]' : ''}`}
                aria-current={section === 'account' ? 'page' : undefined}
                onClick={() => onSelect('account')}
              >
                <span>{navTitle('account')}</span>
              </button>
            </li>
          </ul>
        </nav>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2 md:w-48 md:shrink-0 md:sticky md:top-[52px]" onKeyDown={onKeyDown}>
      {/* A raw button, not the libs/ui Button: it needs a ref (Escape returns focus here) and aria-expanded / aria-controls, which Button does not take. */}
      <button
        ref={menuButton}
        type="button"
        className="gg-btn gg-btn-secondary self-start md:hidden"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((value) => !value)}
      >
        {fill(copy.menuButton, { section: navTitle(section) })}
      </button>
      <div id={panelId} className={`${open ? 'flex' : 'hidden'} flex-col gap-3 md:flex`}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="font-semibold text-[15px] break-words min-w-0 m-0">{name || copy.unnamedPerson}</p>
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
            {NAV_ORDER.map((key) => {
              const later = isSectionKey(key) && !AVAILABLE_SECTIONS.includes(key);
              if (later) {
                // Kept in the list so the order is visible, but there is nothing to open yet.
                return (
                  <li key={key}>
                    <p className="gg-row flex-wrap m-0 cursor-default text-[color:var(--text-muted)] hover:!bg-transparent">
                      <span>{navTitle(key)}</span>
                      {statuses ? (
                        <>
                          {' '}
                          <span className="gg-meta gg-row-trail">{copy.statusLater}</span>
                        </>
                      ) : null}
                    </p>
                  </li>
                );
              }
              const current = key === section;
              return (
                <li key={key}>
                  <button
                    type="button"
                    className={`gg-row flex-wrap ${current ? 'bg-accent-100 shadow-[inset_3px_0_0_var(--color-accent-700)]' : ''}`}
                    aria-current={current ? 'page' : undefined}
                    onClick={() => choose(key)}
                  >
                    <span>{navTitle(key)}</span>
                    {statuses && isSectionKey(key) ? (
                      <>
                        {' '}
                        <span className="gg-meta gg-row-trail flex items-center gap-1">
                          {statuses[key] === 'ready' ? <CheckIcon /> : null}
                          <span>{copy[STATUS_COPY[statuses[key] ?? 'not_started']]}</span>
                        </span>
                      </>
                    ) : null}
                  </button>
                </li>
              );
            })}
          </ul>
        </nav>
      </div>
    </div>
  );
}
