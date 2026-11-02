import { describe, expect, it } from '@jest/globals';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { render, screen } from '@testing-library/react-native';
import { act } from '@testing-library/react-native';
import { reportPersisting, resetPersisting } from '../lib/deviceCache';
import { SavedNote, SAVED_NOTE_TEXT, NOT_SAVED_NOTE_TEXT } from '../components/SavedNote';
import { SetupScreen } from '../screens/SetupScreen';

describe('saved-on-this-phone line (DS-3)', () => {
  it('renders on a flow step as plain text with no exclamation point', () => {
    render(<SetupScreen initial={{ personName: '', dateOfPassing: '' }} onContinue={() => undefined} onBack={() => undefined} />);
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
});
