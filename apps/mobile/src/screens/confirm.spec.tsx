import { afterEach, describe, expect, it, jest } from '@jest/globals';
import { useEffect } from 'react';
import { AccessibilityInfo, Linking } from 'react-native';
import { StyleSheet } from 'react-native';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { freshDraft, useSendFlow } from '@griever/hooks';
import { SHARE_SERVICE_SAMPLE } from '@griever/shared';
import type { SessionDetails } from '@griever/shared';
import { ConfirmScreen } from './ConfirmScreen';
import { SendingScreen } from './SendingScreen';

const session = { personName: 'Margaret Hayes', dateOfPassing: '', senderName: 'Peter', obituaryUrl: '', obituaryPublisher: '', serviceDate: '' } as SessionDetails;
const contacts = { contacts: [{ contactId: 'c0', name: 'Dee', phone: '+15555550100' }] } as never;

function Harness({ fields }: { fields?: Record<string, string> } = {}) {
  const flow = useSendFlow({
    session,
    draft: freshDraft({
      templateCategory: 'service', templateOverrideId: 'share-service', step: 'review',
      fields: fields ?? { serviceDate: 'June 14', serviceTime: '2:00 PM', serviceLocation: 'Oak Chapel' },
    }),
  });
  const { selectContacts } = flow;
  useEffect(() => { selectContacts(['c0']); }, [selectContacts]);
  return flow.sendJob ? <SendingScreen flow={flow} contacts={contacts} /> : <ConfirmScreen flow={flow} contacts={contacts} />;
}

describe('Review your message (Share the service)', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('sends the edited text in the sms: link', async () => {
    const open = jest.spyOn(Linking, 'openURL').mockResolvedValue(undefined);
    render(<Harness />);
    fireEvent.changeText(screen.getByLabelText('Your message'), 'Come as you are, 2 PM at Oak Chapel.');
    fireEvent.press(screen.getByText('Text these people'));
    fireEvent.press(await screen.findByText('Open Messages'));
    expect(decodeURIComponent(String(open.mock.calls[0][0]))).toContain('body=Dee,\nCome as you are, 2 PM at Oak Chapel.');
  });

  it('shows the same text it hands to Messages', async () => {
    const open = jest.spyOn(Linking, 'openURL').mockResolvedValue(undefined);
    open.mockClear();
    render(<Harness />);
    fireEvent.changeText(screen.getByLabelText('Your message'), 'Come as you are.');
    fireEvent.press(screen.getByText('Text these people'));
    fireEvent.press(await screen.findByText('Open Messages'));
    const body = decodeURIComponent(String(open.mock.calls[0][0])).split('body=')[1];
    expect(body).toBe('Dee,\nCome as you are.');
    expect(screen.getByText(body)).toBeTruthy();
  });

  it('sends the plain message with the switch off', async () => {
    const open = jest.spyOn(Linking, 'openURL').mockResolvedValue(undefined);
    open.mockClear();
    render(<Harness />);
    fireEvent.changeText(screen.getByLabelText('Your message'), 'Come as you are.');
    fireEvent.press(screen.getByRole('switch', { name: 'Start with their first name' }));
    fireEvent.press(screen.getByText('Text these people'));
    fireEvent.press(await screen.findByText('Open Messages'));
    const body = decodeURIComponent(String(open.mock.calls[0][0])).split('body=')[1];
    expect(body).toBe('Come as you are.');
  });

  it('has a switch with an accessible name and state, and previews the greeting', () => {
    render(<Harness />);
    const toggle = screen.getByRole('switch', { name: 'Start with their first name' });
    expect(toggle.props.accessibilityState).toEqual({ checked: true });
    expect(screen.getByText('For example: Dee,')).toBeTruthy();
    fireEvent.press(toggle);
    expect(screen.getByRole('switch', { name: 'Start with their first name' }).props.accessibilityState).toEqual({ checked: false });
    expect(screen.queryByText(/For example/)).toBeNull();
    const announce = jest.spyOn(AccessibilityInfo, 'announceForAccessibilityWithOptions').mockImplementation(() => undefined);
    fireEvent.press(screen.getByRole('switch', { name: 'Start with their first name' }));
    expect(announce).toHaveBeenCalledWith('For example: Dee,', { queue: true });
  });

  it('opens and closes the sample with accessibilityState.expanded and a 44 point target', () => {
    render(<Harness />);
    const toggle = screen.getByRole('button', { name: 'Sample message' });
    expect(toggle.props.accessibilityState).toEqual({ expanded: false });
    const style = StyleSheet.flatten(toggle.props.style);
    expect(style.minHeight).toBeGreaterThanOrEqual(44);
    expect(style.minWidth).toBeGreaterThanOrEqual(44);
    expect(screen.queryByText(SHARE_SERVICE_SAMPLE)).toBeNull();
    const announce = jest.spyOn(AccessibilityInfo, 'announceForAccessibility').mockImplementation(() => undefined);
    fireEvent.press(toggle);
    expect(announce).toHaveBeenCalledWith(SHARE_SERVICE_SAMPLE);
    expect(screen.getByRole('button', { name: 'Sample message' }).props.accessibilityState).toEqual({ expanded: true });
    expect(screen.getByText(SHARE_SERVICE_SAMPLE)).toBeTruthy();
    fireEvent.press(screen.getByRole('button', { name: 'Sample message' }));
    expect(screen.getByRole('button', { name: 'Sample message' }).props.accessibilityState).toEqual({ expanded: false });
    expect(screen.queryByText(SHARE_SERVICE_SAMPLE)).toBeNull();
  });

  it('blocks sending a blank message and says why', () => {
    render(<Harness />);
    fireEvent.changeText(screen.getByLabelText('Your message'), '   ');
    expect(screen.getByText('Add a message before you send it.')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Text these people' }).props.accessibilityState?.disabled).toBe(true);
    expect(screen.getByLabelText('Your message').props.value).toBe('   ');
  });

  describe('Details row', () => {
    it('changes the preview when the date changes', () => {
      render(<Harness />);
      expect(screen.getByLabelText('Service date').props.value).toBe('June 14');
      fireEvent.changeText(screen.getByLabelText('Service date'), 'June 20');
      expect(screen.getByLabelText('Your message').props.value).toContain('June 20');
      expect(screen.getByLabelText('Your message').props.value).not.toContain('June 14');
    });

    it('blocks Send and says why while a required field is empty', () => {
      render(<Harness fields={{ serviceDate: 'June 14', serviceTime: '2:00 PM', serviceLocation: '' }} />);
      expect(screen.getByText('Needed')).toBeTruthy();
      expect(screen.getByRole('button', { name: 'Text these people' }).props.accessibilityState?.disabled).toBe(true);
      expect(screen.getByText('Fill in the details marked Needed to send.')).toBeTruthy();
      fireEvent.changeText(screen.getByLabelText('Location'), 'Oak Chapel');
      expect(screen.queryByText('Needed')).toBeNull();
      expect(screen.getByRole('button', { name: 'Text these people' }).props.accessibilityState?.disabled).toBeFalsy();
    });

    it('hides the inputs for hand-edited text, and Use the suggested wording brings them back', () => {
      render(<Harness />);
      fireEvent.changeText(screen.getByLabelText('Your message'), 'My own words.');
      expect(screen.queryByLabelText('Service date')).toBeNull();
      expect(screen.getByLabelText('Your message').props.value).toBe('My own words.');
      fireEvent.press(screen.getByText('Use the suggested wording'));
      expect(screen.getByLabelText('Service date')).toBeTruthy();
      expect(screen.getByLabelText('Your message').props.value).toContain('June 14');
    });
  });
});
