import { useCallback, useEffect, useId, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import type { SectionKey, SectionStatus } from '@griever/shared';
import { screenCopy } from '@griever/copy';
import { Heading, Sheet } from '@griever/ui';
import { SideNav, navTitle } from './SideNav';
import type { CmsNavKey } from './SideNav';

const copy = screenCopy('cmsChecklist');
const shellCopy = screenCopy('cmsShell');
// cmsChecklist has no Close word and copy files are outside this ticket; the shared one lives in paywall.
const closeLabel = screenCopy('paywall').close;

export const CHECKLIST_PANEL_KEY = 'gg.cmsChecklistPanel.v1';

/** Shown unless the saved choice says hidden. Storage can be blocked or broken, so any failure means shown. */
function readPanelShown(): boolean {
  try {
    return window.localStorage.getItem(CHECKLIST_PANEL_KEY) !== 'hidden';
  } catch {
    return true;
  }
}

function savePanelShown(shown: boolean) {
  try {
    window.localStorage.setItem(CHECKLIST_PANEL_KEY, shown ? 'shown' : 'hidden');
  } catch {
    // The choice just won't last past this visit.
  }
}

export interface AsideContext {
  /** True for the copy inside the phone sheet. */
  inSheet: boolean;
  /** Closes the sheet; call it in the same update as an action that moves focus. */
  closeSheet: () => void;
}

interface Props {
  personName: string;
  section: CmsNavKey;
  onSelect: (key: CmsNavKey) => void;
  onChangePerson: () => void;
  /** Called instead of onSelect when the account item is chosen. */
  onAccount: () => void;
  notice?: ReactNode;
  statuses?: Partial<Record<SectionKey, SectionStatus>>;
  /** The checklist panel: a third column from `lg`, a sheet below. Use the function form to get `closeSheet`. */
  aside?: ReactNode | ((context: AsideContext) => ReactNode);
  /** Replaces the h1 text, for item details. */
  title?: string;
  /** The people list: the nav offers only the account item. */
  peopleView?: boolean;
  children: ReactNode;
}

/** Nav left, editor right from `md`; stacked below. The shell owns the page's only h1. */
export function CmsShell({ personName, section, onSelect, onChangePerson, onAccount, notice, statuses, aside, title, peopleView, children }: Props) {
  const heading = useRef<HTMLElement | null>(null);
  const setHeading = useCallback((node: unknown) => {
    heading.current = node as HTMLElement | null;
    // Programmatic focus target only; not in the tab order.
    heading.current?.setAttribute('tabindex', '-1');
  }, []);

  const [panelShown, setPanelShown] = useState(readPanelShown);
  const [sheetOpen, setSheetOpen] = useState(false);
  const sheetButton = useRef<HTMLButtonElement>(null);
  const asideTitleId = useId();

  // From `lg` the phone button is hidden, so close the sheet rather than return focus to it.
  useEffect(() => {
    if (!sheetOpen || typeof window.matchMedia !== 'function') {
      return;
    }
    const query = window.matchMedia('(min-width: 1024px)');
    const onChange = (event: MediaQueryListEvent) => {
      if (event.matches) {
        setSheetOpen(false);
      }
    };
    query.addEventListener('change', onChange);
    return () => query.removeEventListener('change', onChange);
  }, [sheetOpen]);

  const closeSheet = useCallback(() => setSheetOpen(false), []);
  const renderAside = (inSheet: boolean) =>
    typeof aside === 'function' ? aside({ inSheet, closeSheet }) : aside;

  function togglePanel() {
    const next = !panelShown;
    setPanelShown(next);
    savePanelShown(next);
  }

  // The menu closes on a choice, so focus moves to the heading rather than a hidden button.
  function select(key: CmsNavKey) {
    heading.current?.focus();
    if (key === 'account') {
      onAccount();
      return;
    }
    onSelect(key);
  }

  return (
    <div className="flex flex-col gap-4 pt-[52px] md:flex-row md:items-start md:gap-8">
      <SideNav personName={personName} section={section} onSelect={select} onChangePerson={() => {
          heading.current?.focus();
          onChangePerson();
        }} statuses={statuses} accountOnly={peopleView} />
      <main className="flex flex-col gap-4 min-w-0 flex-1">
        {aside && !panelShown ? (
          <div className="hidden justify-end lg:flex">
            <button type="button" className="gg-btn gg-btn-ghost" onClick={togglePanel}>{copy.show}</button>
          </div>
        ) : null}
        {aside ? (
          <div className="flex flex-wrap items-center justify-between gap-2">
            <Heading level={1} headingRef={setHeading}>{title ?? navTitle(section)}</Heading>
            <button
              ref={sheetButton}
              data-checklist-opener=""
              type="button"
              className="gg-btn gg-btn-secondary lg:hidden"
              aria-haspopup="dialog"
              onClick={() => setSheetOpen(true)}
            >
              {copy.phoneButton}
            </button>
          </div>
        ) : (
          <Heading level={1} headingRef={setHeading}>{title ?? navTitle(section)}</Heading>
        )}
        {peopleView || section === 'overview' ? null : <p className="gg-hint">{shellCopy.saveLine}</p>}
        {notice}
        <div key={`${section}:${title ?? ''}`} className="gg-enter flex flex-col gap-4">
          {children}
        </div>
      </main>
      {/* Mounted once: checklist state must live above the shell (props or a hook), not inside `aside`. */}
      {aside && panelShown && !sheetOpen ? (
        // tabIndex makes the scrolling panel reachable by keyboard; the name comes from its heading.
        <aside
          aria-labelledby={asideTitleId}
          tabIndex={0}
          className="hidden lg:sticky lg:top-[52px] lg:block lg:w-80 lg:shrink-0 lg:max-h-[calc(100dvh-52px)] lg:overflow-y-auto"
        >
          <div className="flex items-center justify-between gap-2">
            <h2 id={asideTitleId} className="text-lg font-semibold">{copy.panelTitle}</h2>
            {/* The name flips Hide/Show; no aria-expanded, so there is one signal. */}
            <button type="button" className="gg-btn gg-btn-ghost" onClick={togglePanel}>{copy.hide}</button>
          </div>
          {renderAside(false)}
        </aside>
      ) : null}
      {aside ? (
        <Sheet
          visible={sheetOpen}
          title={copy.panelTitle}
          closeLabel={closeLabel}
          onClose={() => setSheetOpen(false)}
          returnFocusRef={sheetButton}
        >
          {renderAside(true)}
        </Sheet>
      ) : null}
    </div>
  );
}
