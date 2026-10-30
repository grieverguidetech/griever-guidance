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
  function select(key: CmsNavKey) {
    if (key === 'account') {
      onAccount();
      return;
    }
    onSelect(key);
  }

  return (
    <div className="flex flex-col gap-4 pt-[52px] md:flex-row md:items-start md:gap-8">
      <SideNav personName={personName} section={section} onSelect={select} onChangePerson={onChangePerson} statuses={statuses} />
      <main className="flex flex-col gap-4 min-w-0 flex-1">
        <Heading level={1}>{navTitle(section)}</Heading>
        {notice}
        {children}
      </main>
    </div>
  );
}
