import { useCallback, useEffect, useId, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import type { SectionKey, SectionStatus } from '@griever/shared';
import { screenCopy } from '@griever/copy';
import { Heading, Sheet } from '@griever/ui';
import { AppHeader } from './AppHeader';
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
  /** Called when Your people is chosen in the nav. */
  onPeople: () => void;
  /** Called instead of onSelect when the account item is chosen. */
  onAccount: () => void;
  notice?: ReactNode;
  statuses?: Partial<Record<SectionKey, SectionStatus>>;
  /** The checklist panel: a third column from `lg`, a sheet below. Use the function form to get `closeSheet`. */
  aside?: ReactNode | ((context: AsideContext) => ReactNode);
  /** Replaces the h1 text, for item details. */
  title?: string;
  /** True when the details also sync to the account, so the save line can say they wait on the phone. */
  syncOn?: boolean;
  /** Nobody is saved yet: the save line has nothing to describe, so it is left out. */
  nobody?: boolean;
  /** A loading screen: no nav item is the current page. */
  noCurrent?: boolean;
  /** The side nav link for an item, or null for one that has no path yet (it stays a button). */
  hrefFor?: (key: CmsNavKey) => string | null;
  children: ReactNode;
}

/** Nav left, editor right from `md`; stacked below. The shell owns the page's only h1. */
export function CmsShell({ personName, section, onSelect, onPeople, onAccount, notice, statuses, aside, title, syncOn, nobody = false, noCurrent = false, hrefFor, children }: Props) {
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
  const panelId = useId();

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
    // No scroll: this runs before the move, and a jump here would be saved as the page's Back position (#852).
    heading.current?.focus({ preventScroll: true });
    if (key === 'people') {
      onPeople();
      return;
    }
    if (key === 'account') {
      onAccount();
      return;
    }
    onSelect(key);
  }

  return (
    <>
    <AppHeader checklist={aside ? { open: panelShown, onToggle: togglePanel, panelId } : undefined} />
    <div className="flex flex-col gap-4 md:flex-row md:items-start md:gap-8">
      <SideNav personName={personName} section={section} onSelect={select} statuses={statuses} noCurrent={noCurrent} hrefFor={hrefFor} />
      <main className="flex flex-col gap-4 min-w-0 flex-1">
        {aside ? (
          <div data-testid="title-row" className="flex flex-wrap items-center justify-between gap-x-2 gap-y-4">
            {/* The 44px button is pulled in by 8px top and bottom (-my-2) so it does not stretch the row: the gap below the h1 stays the page's gap-4. */}
            <Heading level={1} headingRef={setHeading}>{title ?? navTitle(section)}</Heading>
            <button
              ref={sheetButton}
              data-checklist-opener=""
              type="button"
              className="gg-btn gg-btn-primary -my-2 lg:hidden"
              aria-haspopup="dialog"
              onClick={() => setSheetOpen(true)}
            >
              {copy.phoneButton}
            </button>
          </div>
        ) : (
          <Heading level={1} headingRef={setHeading}>{title ?? navTitle(section)}</Heading>
        )}
        {nobody || section === 'people' || section === 'overview' || section === 'account' ? null : <p className="gg-hint">{syncOn ? shellCopy.saveLineSynced : shellCopy.saveLine}</p>}
        {/* The notice slots are live regions that are empty most of the time. Each one as its own child of this
            flex column cost a 16px gap (three of them: 48px). One wrapper is a single child, and -mb-4 cancels its
            gap after it, so empty slots add nothing and a message (which carries its own mb-4) has 16px above and below.
            The regions stay rendered: no display:none, no hidden. */}
        <div data-testid="notice-slot" className="-mb-4">{notice}</div>
        <div key={`${section}:${title ?? ''}`} className="gg-enter flex flex-col gap-4">
          {children}
        </div>
      </main>
      {/* Mounted once: checklist state must live above the shell (props or a hook), not inside `aside`. */}
      {aside && panelShown && !sheetOpen ? (
        // Scrolling is keyboard reachable because the checklist rows inside are focusable. The header toggle opens and closes it.
        <aside
          id={panelId}
          aria-labelledby={asideTitleId}
          className="hidden lg:sticky lg:top-4 lg:flex lg:flex-col lg:gap-4 lg:w-96 lg:shrink-0 lg:max-h-[calc(100dvh-2rem)] lg:overflow-y-auto"
        >
          <h2 id={asideTitleId} className="text-lg font-semibold">{copy.panelTitle}</h2>
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
    </>
  );
}
