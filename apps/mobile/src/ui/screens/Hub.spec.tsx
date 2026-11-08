import { describe, expect, it, jest } from '@jest/globals';
import { fireEvent, render, screen, within } from '@testing-library/react-native';
import { screenCopy } from '@griever/copy';
import { Hub } from './Hub';
import type { HubProps, HubRow } from './Hub';

const phone = screenCopy('phoneHub');
const copy = { ...screenCopy('pathLanding'), heading: phone.heading, intro: phone.intro, whatYoullNeed: phone.whatYoullNeed, whatYoullNeedHint: phone.whatYoullNeedHint, stateDone: phone.stateDone, stateInProgress: phone.stateInProgress, stateNotStarted: phone.stateNotStarted };

const row = (key: HubRow['key'], extra: Partial<HubRow> = {}): HubRow => ({ key, status: 'next', state: 'notStarted', locked: false, ...extra });

function setup(rows: HubRow[], extra: Partial<HubProps> = {}) {
  const onStart = jest.fn();
  render(<Hub copy={copy} eyebrow="For Anna" rows={rows} name={null} onWhatYoullNeed={jest.fn()} onStart={onStart} onLocked={jest.fn()} {...extra} />);
  return { onStart };
}

const icon = (id: string) => screen.queryAllByTestId(id, { includeHiddenElements: true });

describe('Hub status icons', () => {
  it('draws the matching icon and ends the name with the state word', () => {
    setup([
      row('announce', { status: 'done', state: 'done' }),
      row('service', { state: 'inProgress' }),
      row('obituary', { state: 'notStarted' }),
    ]);
    expect(within(screen.getByRole('button', { name: 'Announce the passing, Done' })).getByTestId('status-check', { includeHiddenElements: true })).toBeTruthy();
    expect(within(screen.getByRole('button', { name: /Share the service.*, In progress$/ })).getByTestId('status-progress', { includeHiddenElements: true })).toBeTruthy();
    expect(within(screen.getByRole('button', { name: /Share the obituary.*, Not started$/ })).getByTestId('status-circle', { includeHiddenElements: true })).toBeTruthy();
  });

  it('hides each icon from screen readers', () => {
    setup([row('announce', { status: 'done', state: 'done' }), row('service', { state: 'inProgress' }), row('obituary')]);
    for (const node of [...icon('status-check'), ...icon('status-progress'), ...icon('status-circle')]) {
      expect(node.props.importantForAccessibility).toBe('no-hide-descendants');
    }
  });

  it('shows the lit card with Next and a state icon, and no Started', () => {
    setup([row('announce', { lit: true, state: 'inProgress' })]);
    const lit = screen.getByRole('button', { name: /^Next, / });
    expect(lit.props.accessibilityLabel).toMatch(/, In progress$/);
    expect(within(lit).getByTestId('status-progress', { includeHiddenElements: true })).toBeTruthy();
    expect(JSON.stringify(screen.toJSON())).not.toMatch(/Started|Sent to/);
  });

  it('locked rows keep the lock and have no status icon', () => {
    setup([row('service', { locked: true })]);
    expect(icon('lock-icon')).toHaveLength(1);
    expect(icon('status-circle')).toHaveLength(0);
  });

  it('unavailable rows are unchanged: no icon, no button', () => {
    setup([row('service', { unavailable: true })]);
    expect(screen.queryByRole('button', { name: /Share the service/ })).toBeNull();
    expect(icon('status-circle')).toHaveLength(0);
  });

  it('keeps the meta line and opens the step from a done row', () => {
    const { onStart } = setup([row('obituary', { meta: 'Needs the obituary link' }), row('announce', { status: 'done', state: 'done' })]);
    expect(screen.getByText('Needs the obituary link')).toBeTruthy();
    fireEvent.press(screen.getByRole('button', { name: 'Announce the passing, Done' }));
    expect(onStart).toHaveBeenCalledWith('announce');
  });
});
