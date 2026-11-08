import { describe, expect, it, jest } from '@jest/globals';
import { StyleSheet } from 'react-native';
import { fireEvent, render, screen, within } from '@testing-library/react-native';
import { screenCopy } from '@griever/copy';
import { Hub } from './Hub';
import type { HubProps, HubRow } from './Hub';

const phone = screenCopy('phoneHub');
const copy = { ...screenCopy('pathLanding'), heading: phone.heading, intro: phone.intro, whatYoullNeed: phone.whatYoullNeed, whatYoullNeedHint: phone.whatYoullNeedHint, continue: 'Continue', stateDone: phone.stateDone, stateInProgress: phone.stateInProgress, stateNotStarted: phone.stateNotStarted };

const row = (key: HubRow['key'], extra: Partial<HubRow> = {}): HubRow => ({ key, status: 'next', state: 'notStarted', locked: false, ...extra });

function setup(rows: HubRow[], extra: Partial<HubProps> = {}) {
  const onStart = jest.fn();
  render(<Hub copy={copy} eyebrow="For Anna" rows={rows} name={null} onWhatYoullNeed={jest.fn()} onStart={onStart} onLocked={jest.fn()} {...extra} />);
  return { onStart };
}

const icon = (id: string) => screen.queryAllByTestId(id, { includeHiddenElements: true });

describe('Hub cards', () => {
  it('shows the state word on every card, and the check only beside Sent', () => {
    setup([
      row('announce', { status: 'done', state: 'done', summary: 'Anna has died.' }),
      row('service', { state: 'inProgress', summary: 'Service, June 14, 2026' }),
      row('obituary', { state: 'notStarted', summary: 'Start with a draft' }),
    ]);
    const sent = screen.getByRole('button', { name: 'Announce the passing, Anna has died., Sent' });
    expect(within(sent).getByText('Sent')).toBeTruthy();
    expect(within(sent).getByTestId('status-check', { includeHiddenElements: true })).toBeTruthy();
    const progress = screen.getByRole('button', { name: 'Share the service, Service, June 14, 2026, In progress' });
    expect(within(progress).getByText('In progress')).toBeTruthy();
    const notStarted = screen.getByRole('button', { name: 'Share the obituary, Start with a draft, Not started' });
    expect(within(notStarted).getByText('Not started')).toBeTruthy();
    expect(icon('status-check')).toHaveLength(1);
    expect(icon('status-progress')).toHaveLength(0);
    expect(icon('status-circle')).toHaveLength(0);
  });

  it('hides the check from screen readers', () => {
    setup([row('announce', { status: 'done', state: 'done' })]);
    expect(icon('status-check')[0].props.importantForAccessibility).toBe('no-hide-descendants');
  });

  it('shows the next card with the bar and Continue, and the others without', () => {
    setup([row('announce', { lit: true, state: 'inProgress', summary: 'Write a short note' }), row('service')]);
    const lit = screen.getByTestId('hub-next-card');
    expect(within(lit).getByText('Continue')).toBeTruthy();
    expect(within(lit).getByTestId('next-bar')).toBeTruthy();
    expect(lit.props.accessibilityLabel).toBe('Next, Announce the passing, Write a short note, In progress');
    expect(screen.getAllByTestId('next-bar')).toHaveLength(1);
    expect(screen.getAllByText('Continue')).toHaveLength(1);
    expect(JSON.stringify(screen.toJSON())).not.toMatch(/Started|Sent to/);
  });

  it('shows the Needs line instead of the summary', () => {
    setup([row('obituary', { summary: 'Draft started', meta: 'Needs the obituary link' })]);
    expect(screen.getByText('Needs the obituary link')).toBeTruthy();
    expect(screen.queryByText('Draft started')).toBeNull();
    expect(screen.getByRole('button', { name: 'Share the obituary, Needs the obituary link, Not started' })).toBeTruthy();
  });

  it('keeps the 15 pt floor on the new text', () => {
    setup([row('announce', { lit: true, summary: 'x' })]);
    const sizes = [screen.getByText('Announce the passing'), screen.getByText('Not started'), screen.getByText('x'), screen.getByText('Continue')].map((node) => StyleSheet.flatten(node.props.style).fontSize);
    for (const size of sizes) {
      expect(size).toBeGreaterThanOrEqual(15);
    }
  });

  it('locked rows keep the lock and have no state word', () => {
    setup([row('service', { locked: true })]);
    expect(icon('lock-icon')).toHaveLength(1);
    expect(screen.queryByText('Not started')).toBeNull();
  });

  it('unavailable rows are unchanged: no button', () => {
    setup([row('service', { unavailable: true })]);
    expect(screen.queryByRole('button', { name: /Share the service/ })).toBeNull();
    expect(screen.queryByText('Not started')).toBeNull();
  });

  it('keeps the meta line and opens the step from a done row', () => {
    const { onStart } = setup([row('obituary', { meta: 'Needs the obituary link' }), row('announce', { status: 'done', state: 'done' })]);
    expect(screen.getByText('Needs the obituary link')).toBeTruthy();
    fireEvent.press(screen.getByRole('button', { name: 'Announce the passing, Sent' }));
    expect(onStart).toHaveBeenCalledWith('announce');
  });
});
