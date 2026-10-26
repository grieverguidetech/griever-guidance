import { describe, expect, it, jest } from '@jest/globals';
import { BackHandler, Modal } from 'react-native';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import type { Session } from '@griever/hooks';
import { freshDraft } from '@griever/hooks';
import { HubScreen } from './HubScreen';

const anna = {
  id: 'a',
  flowId: 'flow-a',
  ownerId: null,
  role: 'owner',
  personName: 'Anna',
  dateOfPassing: '',
  senderName: '',
  obituaryUrl: '',
  createdAt: '2026-10-01T00:00:00.000Z',
  lastOpenedAt: '2026-10-01T00:00:00.000Z',
  drafts: {},
  serviceReady: false,
  recipientsNotified: {},
  momentCompletedAt: {},
  remindersScheduled: [],
} as unknown as Session;

function setup(session: Session = anna, paymentsEnabled = false) {
  const handlers = { onBack: jest.fn(), onStart: jest.fn(), onEditPerson: jest.fn() };
  render(<HubScreen session={session} paymentsEnabled={paymentsEnabled} {...handlers} />);
  return handlers;
}

describe('HubScreen', () => {
  it('shows the person, the heading and the four steps with one Start', () => {
    setup();
    expect(screen.getByRole('heading', { name: 'One thing at a time.' })).toBeTruthy();
    expect(screen.getByText('For Anna')).toBeTruthy();
    expect(screen.getAllByRole('button', { name: 'Start' })).toHaveLength(1);
    expect(screen.getByRole('button', { name: /Share the service/ })).toBeTruthy();
    expect(screen.getByRole('button', { name: /Share the obituary/ })).toBeTruthy();
    expect(screen.getByRole('button', { name: /Send thank-yous/ })).toBeTruthy();
  });

  it('starts the announcement from Start, and a later step from its row', () => {
    const { onStart } = setup();
    fireEvent.press(screen.getByRole('button', { name: 'Start' }));
    expect(onStart).toHaveBeenLastCalledWith('announce');
    fireEvent.press(screen.getByRole('button', { name: /Share the obituary/ }));
    expect(onStart).toHaveBeenLastCalledWith('obituary');
  });

  it('answers Back and Edit person', () => {
    const { onBack, onEditPerson } = setup();
    fireEvent.press(screen.getByRole('button', { name: 'Back' }));
    fireEvent.press(screen.getByRole('button', { name: 'Edit person' }));
    expect(onBack).toHaveBeenCalledTimes(1);
    expect(onEditPerson).toHaveBeenCalledTimes(1);
  });

  it('Android Back goes Home', () => {
    let handler: (() => boolean) | undefined;
    jest.spyOn(BackHandler, 'addEventListener').mockImplementation((_event, h) => {
      handler = h as () => boolean;
      return { remove: () => undefined };
    });
    const { onBack } = setup();
    act(() => void handler?.());
    expect(onBack).toHaveBeenCalledTimes(1);
  });

  it('shows a finished step with its count, and a started step as Continue', () => {
    const done = {
      ...anna,
      recipientsNotified: { announcement: ['c1', 'c2'] },
      momentCompletedAt: { announce: '2026-10-02T12:00:00.000Z' },
      drafts: { service: freshDraft({ templateCategory: 'service', step: 'details', fields: { serviceLocation: 'St Mary' } }) },
    } as unknown as Session;
    setup(done);
    expect(screen.getByRole('button', { name: /Told close family/ })).toBeTruthy();
    expect(screen.getByText(/2 people · October 2, 2026 · Send again/)).toBeTruthy();
    expect(screen.getByText('Started')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Continue' })).toBeTruthy();
  });

  it('opens What you will need in a sheet', () => {
    setup();
    fireEvent.press(screen.getByRole('button', { name: "What you'll need" }));
    expect(screen.UNSAFE_getAllByType(Modal).some((m) => m.props.visible === true)).toBe(true);
    expect(screen.getByText('Not today. Just so none of it surprises you.')).toBeTruthy();
  });

  it('with payments on, locks the paid steps: they read as unavailable, say why, and open the placeholder', () => {
    const { onStart } = setup(anna, true);
    const service = screen.getByRole('button', { name: /Share the service/ });
    expect(service.props.accessibilityState).toEqual({ disabled: true });
    expect(service.props.accessibilityHint).toBe('Included with the full plan');
    expect(screen.getByRole('button', { name: /Share the obituary/ }).props.accessibilityState).toEqual({ disabled: false });
    fireEvent.press(service);
    expect(onStart).not.toHaveBeenCalled();
    expect(screen.getByText('Payment details will go here.')).toBeTruthy();
  });

  it('with payments off, locks nothing', () => {
    setup(anna, false);
    expect(screen.getByRole('button', { name: /Share the service/ }).props.accessibilityState).toEqual({ disabled: false });
  });

  it('uses no exclamation points', () => {
    setup();
    expect(JSON.stringify(screen.toJSON())).not.toContain('!');
  });
});
