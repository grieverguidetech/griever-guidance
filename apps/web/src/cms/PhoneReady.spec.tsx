import { render, screen } from '@testing-library/react';
import { screenCopy } from '@griever/copy';
import { PhoneReadyCard, PhoneReadyList, readyPhoneSections } from './PhoneReady';

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

describe('PhoneReadyList and PhoneReadyCard', () => {
  it('render nothing for an empty list', () => {
    const { container } = render(
      <>
        <PhoneReadyList ready={[]} />
        <PhoneReadyCard ready={[]} />
      </>,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('the card has an h2 and one item per ready section', () => {
    render(<PhoneReadyCard ready={['service']} />);
    expect(screen.getByRole('heading', { level: 2, name: 'Ready to send from your phone' })).toBeInTheDocument();
    expect(screen.getAllByRole('listitem')).toHaveLength(1);
  });

  it('each card row has its own section tint class and keeps the section name and line', () => {
    render(<PhoneReadyCard ready={['announcement', 'service', 'obituary', 'thanks']} />);
    const rows = screen.getAllByRole('listitem');
    expect(rows).toHaveLength(4);
    const tints = ['announcement', 'service', 'obituary', 'thanks'];
    rows.forEach((row, i) => {
      expect(row).toHaveClass('gg-tint-card', `gg-tint-${tints[i]}`);
      expect(row.textContent?.length).toBeGreaterThan(0);
    });
    expect(screen.getByText('Ready to send from your phone')).toBeInTheDocument();
    expect(screen.getByText(screenCopy('account').phoneNotInStores)).toBeInTheDocument();
  });

  it('the list on its own stays plain', () => {
    render(<PhoneReadyList ready={['service', 'thanks']} />);
    for (const row of screen.getAllByRole('listitem')) {
      expect(row.className).not.toMatch(/tint/);
    }
  });
});
