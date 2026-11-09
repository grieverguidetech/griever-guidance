import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { findHardCodedCopy } from '@griever/copy';
import { PHONE_NUDGE_KEY, PhoneNudge, readDismissedNudges, resetSessionDismissed, saveDismissedNudges } from './PhoneNudge';

afterEach(() => {
  resetSessionDismissed();
  window.localStorage.clear();
  vi.restoreAllMocks();
});

describe('PhoneNudge', () => {
  it.each([
    ['announcement', 'You will send the announcement from the Grievers Guidance phone app, signed in to this account.', 'gg-tint-announcement'],
    ['service', 'You will share the service details from the Grievers Guidance phone app, signed in to this account.', 'gg-tint-service'],
    ['obituary', 'You will share the obituary from the Grievers Guidance phone app, signed in to this account.', 'gg-tint-obituary'],
    ['thanks', 'You will send the thank-yous from the Grievers Guidance phone app, signed in to this account.', 'gg-tint-thanks'],
  ] as const)('shows the %s line in its tint', (section, line, tint) => {
    render(<PhoneNudge section={section} onDismiss={() => undefined} />);
    expect(screen.getByText(line).parentElement).toHaveClass('gg-tint-card', tint);
  });

  it('has a Got it button at least 44px tall that calls onDismiss', async () => {
    const onDismiss = vi.fn();
    render(<PhoneNudge section="announcement" onDismiss={onDismiss} />);
    const button = screen.getByRole('button', { name: 'Got it' });
    expect(button).toHaveClass('gg-btn-primary', 'min-h-[44px]');
    await userEvent.click(button);
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it('describes Got it with the line and keeps Got it as its name', () => {
    render(<PhoneNudge section="service" onDismiss={() => undefined} />);
    const button = screen.getByRole('button', { name: 'Got it' });
    expect(button).toHaveAccessibleDescription(/You will share the service details/);
    expect(button).not.toHaveAttribute('aria-label');
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
