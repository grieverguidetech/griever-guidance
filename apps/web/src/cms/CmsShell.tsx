import { useCallback, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import type { SectionKey, SectionStatus } from '@griever/shared';
import { screenCopy } from '@griever/copy';
import { Heading, Sheet } from '@griever/ui';
import { SideNav, navTitle } from './SideNav';
import type { CmsNavKey } from './SideNav';

const copy = screenCopy('cmsChecklist');
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

interface Props {
  personName: string;
  section: CmsNavKey;
  onSelect: (key: CmsNavKey) => void;
  onChangePerson: () => void;
  /** Called instead of onSelect when the account item is chosen. */
  onAccount: () => void;
  notice?: ReactNode;
  statuses?: Partial<Record<SectionKey, SectionStatus>>;
  /** The checklist panel: a third column from `lg`, a sheet below. */
  aside?: ReactNode;
  /** Replaces the h1 text, for item details. */
  title?: string;
  children: ReactNode;
}

/** Nav left, editor right from `md`; stacked below. The shell owns the page's only h1. */
export function CmsShell({ personName, section, onSelect, onChangePerson, onAccount, notice, statuses, aside, title, children }: Props) {
  const heading = useRef<HTMLElement | null>(null);
  const setHeading = useCallback((node: unknown) => {
    heading.current = node as HTMLElement | null;
    // Programmatic focus target only; not in the tab order.
    heading.current?.setAttribute('tabindex', '-1');
  }, []);

  const [panelShown, setPanelShown] = useState(readPanelShown);
  const [sheetOpen, setSheetOpen] = useState(false);
  const sheetButton = useRef<HTMLButtonElement>(null);

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
        }} statuses={statuses} />
      <main className="flex flex-col gap-4 min-w-0 flex-1">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <Heading level={1} headingRef={setHeading}>{title ?? navTitle(section)}</Heading>
          {aside ? (
            <>
              <button
                ref={sheetButton}
                type="button"
                className="gg-btn gg-btn-secondary lg:hidden"
                aria-haspopup="dialog"
                onClick={() => setSheetOpen(true)}
              >
                {copy.phoneButton}
              </button>
              <button
                type="button"
                className="gg-btn gg-btn-secondary hidden lg:inline-flex"
                aria-expanded={panelShown}
                onClick={togglePanel}
              >
                {panelShown ? copy.hide : copy.show}
              </button>
            </>
          ) : null}
        </div>
        {notice}
        {children}
      </main>
      {aside && panelShown ? (
        <aside aria-label={copy.panelTitle} className="hidden lg:block lg:w-80 lg:shrink-0">
          {aside}
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
          {aside}
        </Sheet>
      ) : null}
    </div>
  );
}
