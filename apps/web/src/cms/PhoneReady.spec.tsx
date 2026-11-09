import { render, screen, within } from '@testing-library/react';
import { screenCopy } from '@griever/copy';
import type { SectionKey } from '@griever/shared';
import { navTitle } from './SideNav';
import { PhoneReadyList, readyPhoneSections } from './PhoneReady';

describe('readyPhoneSections', () => {
  it('keeps only ready announcement, service, obituary and thanks, in order', () => {
    expect(
      readyPhoneSections([
        { sectionStatus: { thanks: 'ready', person: 'ready' } },
        { sectionStatus: { announcement: 'ready', service: 'in_progress' } },
        {},
      ]),
    ).toEqual(['announcement', 'thanks']);
  });

  it('is empty for nobody or nothing ready', () => {
    expect(readyPhoneSections([])).toEqual([]);
    expect(readyPhoneSections([{ sectionStatus: { service: 'in_progress' } }])).toEqual([]);
  });
});

describe('PhoneReadyList', () => {
  it('renders nothing for an empty list', () => {
    const { container } = render(<PhoneReadyList ready={[]} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('lists each ready section with its name and line, in plain rows', () => {
    const shell = screenCopy('cmsShell');
    const lines: Record<string, string> = {
      service: shell.phoneReadyService,
      thanks: shell.phoneReadyThanks,
    };
    render(<PhoneReadyList ready={['service', 'thanks']} />);
    const rows = screen.getAllByRole('listitem');
    expect(rows).toHaveLength(2);
    (['service', 'thanks'] as SectionKey[]).forEach((key, i) => {
      expect(within(rows[i]).getByText(navTitle(key))).toBeInTheDocument();
      expect(within(rows[i]).getByText(lines[key])).toBeInTheDocument();
      expect(rows[i].className).not.toMatch(/tint/);
    });
  });
});
