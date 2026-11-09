import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { findHardCodedCopy } from '@griever/copy';
import { PHONE_NUDGE_KEY, PhoneNudge, readDismissedNudges, resetSessionDismissed, saveDismissedNudges } from './PhoneNudge';

afterEach(() => {
  resetSessionDismissed();
  window.localStorage.clear();
  vi.restoreAllMocks();
});

const CASES = [
  ['announcement', 'The announcement is ready.', 'Open the Grievers Guidance phone app to begin sending it to your loved ones. Sign in with this same account to find it there.'],
  ['service', 'The service details are ready.', 'Open the Grievers Guidance phone app to begin sharing them with your loved ones. Sign in with this same account to find them there.'],
  ['obituary', 'The obituary is ready.', 'Open the Grievers Guidance phone app to begin sharing it with your loved ones. Sign in with this same account to find it there.'],
  ['thanks', 'The thank-you notes are ready.', 'Open the Grievers Guidance phone app to begin sending them to the people who helped. Sign in with this same account to find them there.'],
] as const;

describe('PhoneNudge', () => {
  it.each(CASES)('shows the %s heading (level 2) and line in the one blue card', (section, heading, line) => {
    render(<PhoneNudge section={section} onDismiss={() => undefined} />);
    expect(screen.getByRole('heading', { level: 2, name: heading })).toBeInTheDocument();
    const card = screen.getByRole('region', { name: heading });
    expect(card).toHaveTextContent(line);
    expect(card).toHaveClass('gg-phone-nudge');
    expect(card.className).not.toMatch(/gg-tint-/);
    expect(card).toHaveAttribute('tabindex', '-1');
    expect(card).toHaveAccessibleDescription(line);
  });

  it('keeps every body line under 200 characters and every text free of exclamation points', () => {
    for (const [section, heading, line] of CASES) {
      render(<PhoneNudge section={section} onDismiss={() => undefined} />);
      expect(line.length).toBeLessThan(200);
      expect(heading).not.toContain('!');
      expect(line).not.toContain('!');
      cleanup();
    }
  });

  it('has a Got it button at least 44px tall, last in the card, that calls onDismiss', async () => {
    const onDismiss = vi.fn();
    render(<PhoneNudge section="announcement" onDismiss={onDismiss} />);
    const button = screen.getByRole('button', { name: 'Got it' });
    expect(button).toHaveClass('gg-btn-primary', 'min-h-[44px]');
    expect(screen.getByRole('region').lastElementChild).toBe(button);
    await userEvent.click(button);
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it('holds no hard-coded copy', () => {
    const source = readFileSync(join(import.meta.dirname, 'PhoneNudge.tsx'), 'utf8');
    expect(findHardCodedCopy(source, 'cmsShell')).toEqual([]);
  });

  it('keeps no exclamation point and no sent or done wording', () => {
    render(<PhoneNudge section="thanks" onDismiss={() => undefined} />);
    expect(document.body.textContent).not.toMatch(/!|\bsent\b|\bdone\b/i);
  });
});

describe('dismissed storage', () => {
  it('round trips the section names', () => {
    saveDismissedNudges(['announcement', 'thanks']);
    expect(window.localStorage.getItem(PHONE_NUDGE_KEY)).toBe('["announcement","thanks"]');
    expect(readDismissedNudges()).toEqual(['announcement', 'thanks']);
  });

  it('reads junk or a throwing store as nothing dismissed', () => {
    window.localStorage.setItem(PHONE_NUDGE_KEY, '{not json');
    expect(readDismissedNudges()).toEqual([]);
    window.localStorage.setItem(PHONE_NUDGE_KEY, '["bogus","service"]');
    expect(readDismissedNudges()).toEqual(['service']);
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    expect(readDismissedNudges()).toEqual([]);
  });

  it('does not throw when saving fails', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('full');
    });
    expect(() => saveDismissedNudges(['service'])).not.toThrow();
  });
});
