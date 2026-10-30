import { useCallback, useRef } from 'react';
import type { ReactNode } from 'react';
import type { SectionKey, SectionStatus } from '@griever/shared';
import { Heading } from '@griever/ui';
import { SideNav, navTitle } from './SideNav';
import type { CmsNavKey } from './SideNav';

interface Props {
  personName: string;
  section: CmsNavKey;
  onSelect: (key: CmsNavKey) => void;
  onChangePerson: () => void;
  /** Called instead of onSelect when the account item is chosen. */
  onAccount: () => void;
  notice?: ReactNode;
  statuses?: Partial<Record<SectionKey, SectionStatus>>;
  children: ReactNode;
}

/** Nav left, editor right from `md`; stacked below. The shell owns the page's only h1. */
export function CmsShell({ personName, section, onSelect, onChangePerson, onAccount, notice, statuses, children }: Props) {
  const heading = useRef<HTMLElement | null>(null);
  const setHeading = useCallback((node: unknown) => {
    heading.current = node as HTMLElement | null;
    // Programmatic focus target only; not in the tab order.
    heading.current?.setAttribute('tabindex', '-1');
  }, []);

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
        <Heading level={1} headingRef={setHeading}>{navTitle(section)}</Heading>
        {notice}
        {children}
      </main>
    </div>
  );
}
