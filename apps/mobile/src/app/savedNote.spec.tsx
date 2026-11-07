import { afterEach, describe, expect, it, jest } from '@jest/globals';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { AccessibilityInfo } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { render, screen } from '@testing-library/react-native';
import { act } from '@testing-library/react-native';
import { createDeviceCache, reportPersisting, resetPersisting } from '../lib/deviceCache';
import { SavedNote, SAVED_NOTE_TEXT, NOT_SAVED_NOTE_TEXT } from '../components/SavedNote';
import { SetupScreen } from '../screens/SetupScreen';

afterEach(() => {
  jest.restoreAllMocks();
  resetPersisting();
});

describe('saved-on-this-phone line (DS-3)', () => {
  it('renders on a flow step as plain text with no exclamation point', () => {
    render(<SetupScreen initial={{ personName: '', dateOfPassing: '' }} checklist={undefined} onSetItem={() => undefined} onContinue={() => undefined} onBack={() => undefined} />);
    const line = screen.getByText(SAVED_NOTE_TEXT);
    expect(line).toBeTruthy();
    expect(line.props.accessibilityLiveRegion).toBeUndefined();
    expect(SAVED_NOTE_TEXT).not.toContain('!');
  });

  it('is the same string web shows', () => {
    const web = readFileSync(join(__dirname, '../../../web/src/lib/ui.tsx'), 'utf8');
    const webText = web.slice(web.indexOf('export function SavedNote')).match(/>\s*(Everything[^<]+?)\s*<\/p>/)?.[1];
    expect(webText).toBe(SAVED_NOTE_TEXT);
    render(<SavedNote />);
    expect(screen.getByText(webText as string)).toBeTruthy();
  });

  it('says the phone could not save while storage is failing, and goes back when it works', () => {
    resetPersisting();
    render(<SavedNote />);
    expect(screen.getByText(SAVED_NOTE_TEXT)).toBeTruthy();
    act(() => reportPersisting('test', false));
    expect(screen.queryByText(SAVED_NOTE_TEXT)).toBeNull();
    expect(screen.getByText('This phone could not save just now. Keep this screen open.')).toBeTruthy();
    expect(NOT_SAVED_NOTE_TEXT).not.toContain('!');
    act(() => reportPersisting('test', true));
    expect(screen.getByText(SAVED_NOTE_TEXT)).toBeTruthy();
  });

  it('announces once when saving starts failing, however many notes are mounted', () => {
    resetPersisting();
    const announce = jest.spyOn(AccessibilityInfo, 'announceForAccessibility').mockImplementation(() => undefined);
    announce.mockClear();
    render(
      <>
        <SavedNote />
        <SavedNote />
      </>,
    );
    act(() => reportPersisting('test', false));
    act(() => reportPersisting('other', false));
    expect(announce).toHaveBeenCalledTimes(1);
    expect(announce).toHaveBeenCalledWith(NOT_SAVED_NOTE_TEXT);
  });

  it('a flow-queue cache that cannot read for one user does not flip the note, or the next user', async () => {
    resetPersisting();
    jest.spyOn(AsyncStorage, 'getItem').mockRejectedValue(new Error('unreadable'));
    render(<SavedNote />);
    await createDeviceCache([{ key: 'gg.flowQueue.userA', json: true }]).hydrate();
    expect(screen.getByText(SAVED_NOTE_TEXT)).toBeTruthy();
    await createDeviceCache([{ key: 'gg.flowQueue.userB', json: true }]).hydrate();
    expect(screen.getByText(SAVED_NOTE_TEXT)).toBeTruthy();
  });

  it('the session cache does flip the note when it cannot read', async () => {
    resetPersisting();
    jest.spyOn(AsyncStorage, 'getItem').mockRejectedValue(new Error('unreadable'));
    jest.spyOn(AccessibilityInfo, 'announceForAccessibility').mockImplementation(() => undefined);
    render(<SavedNote />);
    await act(() => createDeviceCache([{ key: 'k', json: true }], { reportsPersisting: true }).hydrate());
    expect(screen.getByText(NOT_SAVED_NOTE_TEXT)).toBeTruthy();
  });
});
