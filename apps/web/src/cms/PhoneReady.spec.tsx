import { render, screen } from '@testing-library/react';
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
});
