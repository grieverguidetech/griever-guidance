import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { useState } from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { findHardCodedCopy } from '@griever/copy';
import { MarkReady } from './MarkReady';
import { resetSessionDismissed } from './PhoneNudge';

describe('MarkReady', () => {
  it('is a toggle button that is not pressed when not ready', () => {
    render(<MarkReady ready={false} onChange={() => undefined} />);
    expect(screen.getByRole('button', { name: 'Mark as ready' })).toHaveAttribute('aria-pressed', 'false');
  });

  it('has the outlined chip style', () => {
    render(<MarkReady ready={false} onChange={() => undefined} />);
    expect(screen.getByRole('button', { name: 'Mark as ready' })).toHaveClass('gg-chip', 'gg-chip-outlined');
  });

  it('is pressed when ready', () => {
    render(<MarkReady ready onChange={() => undefined} />);
    expect(screen.getByRole('button', { name: 'Mark as ready' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('asks for the opposite state on click', async () => {
    const onChange = vi.fn();
    const { rerender } = render(<MarkReady ready={false} onChange={onChange} />);
    await userEvent.click(screen.getByRole('button', { name: 'Mark as ready' }));
    expect(onChange).toHaveBeenLastCalledWith(true);
    rerender(<MarkReady ready onChange={onChange} />);
    await userEvent.click(screen.getByRole('button', { name: 'Mark as ready' }));
    expect(onChange).toHaveBeenLastCalledWith(false);
  });

  it('works from the keyboard', async () => {
    const onChange = vi.fn();
    render(<MarkReady ready={false} onChange={onChange} />);
    await userEvent.tab();
    await userEvent.keyboard('{Enter}');
    expect(onChange).toHaveBeenCalledWith(true);
  });

  it('shows a check mark only when ready, and keeps the name', () => {
    const { container, rerender } = render(<MarkReady ready={false} onChange={() => undefined} />);
    expect(container.querySelector('svg')).toBeNull();
    rerender(<MarkReady ready onChange={() => undefined} />);
    expect(container.querySelector('svg')).toHaveAttribute('aria-hidden', 'true');
    expect(screen.getByRole('button', { name: 'Mark as ready' })).toBeInTheDocument();
  });

  it('shows a bordered empty box when not ready, and the check inside the box when ready', () => {
    const { rerender } = render(<MarkReady ready={false} onChange={() => undefined} />);
    const box = screen.getByTestId('ready-box');
    expect(box).toHaveClass('gg-check-box');
    expect(box).toBeEmptyDOMElement();
    rerender(<MarkReady ready onChange={() => undefined} />);
    expect(screen.getByTestId('ready-box').querySelector('svg')).not.toBeNull();
  });

  it('shows the hint and ties it to the toggle', () => {
    render(<MarkReady ready={false} onChange={() => undefined} />);
    const hint = screen.getByText('Mark as ready when these details are settled. It is a note for you and anyone helping. You can still change them.');
    expect(screen.getByRole('button', { name: 'Mark as ready' })).toHaveAccessibleDescription(hint.textContent ?? '');
  });

  it('shows no continue button when not ready', () => {
    render(<MarkReady ready={false} onChange={() => undefined} nextSection="service" onNext={() => undefined} />);
    expect(screen.queryByRole('button', { name: /^Next:|Back to Overview/ })).toBeNull();
  });

  it('shows "Next: section" when ready and calls onNext', async () => {
    const onNext = vi.fn();
    render(<MarkReady ready onChange={() => undefined} nextSection="service" onNext={onNext} />);
    await userEvent.click(screen.getByRole('button', { name: 'Next: Service' }));
    expect(onNext).toHaveBeenCalledTimes(1);
  });

  it('shows "Back to Overview" when ready and nothing is left', async () => {
    const onNext = vi.fn();
    render(<MarkReady ready onChange={() => undefined} nextSection={null} onNext={onNext} />);
    await userEvent.click(screen.getByRole('button', { name: 'Back to Overview' }));
    expect(onNext).toHaveBeenCalledTimes(1);
  });

  it('uses the chip and hint styles, and the next button enters calmly', () => {
    render(<MarkReady ready onChange={() => undefined} nextSection="service" onNext={() => undefined} />);
    const toggle = screen.getByRole('button', { name: 'Mark as ready' });
    expect(toggle).toHaveClass('gg-chip');
    expect(screen.getByText(/Mark as ready when/)).toHaveClass('gg-hint');
    expect(screen.getByRole('button', { name: 'Next: Service' })).toHaveClass('gg-enter');
  });

  it('keeps focus on the toggle after it is pressed', async () => {
    const Harness = () => {
      const [ready, setReady] = useState(false);
      return <MarkReady ready={ready} onChange={setReady} nextSection="service" onNext={() => undefined} />;
    };
    render(<Harness />);
    const toggle = screen.getByRole('button', { name: 'Mark as ready' });
    await userEvent.click(toggle);
    expect(screen.getByRole('button', { name: 'Next: Service' })).toBeInTheDocument();
    expect(toggle).toHaveFocus();
  });

  it('holds no hard-coded copy', () => {
    const source = readFileSync(join(import.meta.dirname, 'MarkReady.tsx'), 'utf8');
    expect(findHardCodedCopy(source, 'cmsShell')).toEqual([]);
  });

  describe('phone nudge', () => {
    const line = 'Open the Grievers Guidance phone app to begin sending it to your loved ones. Sign in with this same account to find it there.';
    function Harness({ phoneNudge = 'announcement', start = false, onNext }: { phoneNudge?: 'service' | 'announcement'; start?: boolean; onNext?: () => void }) {
      const [ready, setReady] = useState(start);
      return <MarkReady ready={ready} onChange={setReady} phoneNudge={phoneNudge} onNext={onNext} />;
    }
    afterEach(() => {
      resetSessionDismissed();
      window.localStorage.clear();
      vi.restoreAllMocks();
    });

    it('renders no nudge without the prop', () => {
      render(<MarkReady ready onChange={() => undefined} />);
      expect(screen.queryByRole('region')).toBeNull();
      expect(screen.queryByRole('status')).toBeNull();
    });

    it('renders nothing extra when not ready, and no live region wrapper ever', () => {
      render(<Harness />);
      expect(screen.queryByRole('region')).toBeNull();
      expect(screen.queryByRole('status')).toBeNull();
    });

    it('puts the nudge between the toggle row and the Next button', () => {
      render(<Harness start onNext={() => undefined} />);
      const toggle = screen.getByRole('button', { name: 'Mark as ready' });
      const nudge = screen.getByRole('region', { name: 'The announcement is ready.' });
      const next = screen.getByRole('button', { name: /^(Next|Back to Overview)/ });
      expect(toggle.compareDocumentPosition(nudge) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
      expect(nudge.compareDocumentPosition(next) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
      expect(screen.queryByRole('status')).toBeNull();
    });

    it('moves focus to the nudge when marked ready, and hides it when un-marked', async () => {
      render(<Harness />);
      const toggle = screen.getByRole('button', { name: 'Mark as ready' });
      await userEvent.click(toggle);
      const nudge = screen.getByRole('region', { name: 'The announcement is ready.' });
      expect(nudge).toHaveTextContent(line);
      expect(nudge).toHaveFocus();
      await userEvent.click(toggle);
      expect(screen.queryByRole('region')).toBeNull();
      await userEvent.click(toggle);
      expect(screen.getByRole('region')).toHaveFocus();
    });

    it('does not move focus when the page loads already ready', () => {
      render(<Harness start />);
      expect(screen.getByRole('region')).not.toHaveFocus();
      expect(document.body).toHaveFocus();
    });

    it('shows the nudge without focus when ready flips by prop (no click)', () => {
      const { rerender } = render(<MarkReady ready={false} onChange={() => undefined} phoneNudge="announcement" />);
      rerender(<MarkReady ready onChange={() => undefined} phoneNudge="announcement" />);
      expect(screen.getByRole('region')).toBeInTheDocument();
      expect(screen.getByRole('region')).not.toHaveFocus();
    });

    it('moves focus to the toggle when ready turns false while focus is in the nudge', () => {
      const { rerender } = render(<MarkReady ready onChange={() => undefined} phoneNudge="announcement" />);
      screen.getByRole('button', { name: 'Got it' }).focus();
      rerender(<MarkReady ready={false} onChange={() => undefined} phoneNudge="announcement" />);
      expect(screen.queryByRole('region')).toBeNull();
      expect(screen.getByRole('button', { name: 'Mark as ready' })).toHaveFocus();
    });

    it('moves focus to the toggle when ready turns false while the region itself has focus', () => {
      const { rerender } = render(<MarkReady ready onChange={() => undefined} phoneNudge="announcement" />);
      screen.getByRole('region').focus();
      rerender(<MarkReady ready={false} onChange={() => undefined} phoneNudge="announcement" />);
      expect(screen.getByRole('button', { name: 'Mark as ready' })).toHaveFocus();
    });

    it('Got it hides the nudge, saves it and focuses the toggle', async () => {
      render(<Harness start />);
      await userEvent.click(screen.getByRole('button', { name: 'Got it' }));
      expect(screen.queryByRole('region')).toBeNull();
      await expect.poll(() => window.localStorage.getItem('gg.cmsPhoneNudge.v2')).toBe('["announcement"]');
      expect(screen.getByRole('button', { name: 'Mark as ready' })).toHaveFocus();
    });

    it('Got it, then un-mark and re-mark shows the nudge again with focus', async () => {
      render(<Harness start />);
      await userEvent.click(screen.getByRole('button', { name: 'Got it' }));
      const toggle = screen.getByRole('button', { name: 'Mark as ready' });
      await userEvent.click(toggle);
      await expect.poll(() => window.localStorage.getItem('gg.cmsPhoneNudge.v2')).toBe('[]');
      await userEvent.click(toggle);
      expect(screen.getByRole('region', { name: 'The announcement is ready.' })).toHaveFocus();
    });

    it('un-marking one section leaves another dismissed section dismissed', async () => {
      window.localStorage.setItem('gg.cmsPhoneNudge.v2', '["announcement","service"]');
      render(<Harness phoneNudge="service" start />);
      await userEvent.click(screen.getByRole('button', { name: 'Mark as ready' }));
      await expect.poll(() => window.localStorage.getItem('gg.cmsPhoneNudge.v2')).toBe('["announcement"]');
    });

    it('ignores a dismissal saved under v1', () => {
      window.localStorage.setItem('gg.cmsPhoneNudge.v1', '["announcement"]');
      render(<Harness start />);
      expect(screen.getByRole('region')).toBeInTheDocument();
    });

    it('puts 24px between the nudge and the Next button (12px gap plus mt-3), and only then', async () => {
      render(<Harness start onNext={() => undefined} />);
      const next = screen.getByRole('button', { name: /^(Next|Back to Overview)/ });
      expect(next).toHaveClass('mt-3');
      expect(next.parentElement).toHaveClass('gap-3');
      await userEvent.click(screen.getByRole('button', { name: 'Got it' }));
      expect(next).not.toHaveClass('mt-3');
    });

    it('keeps a dismissed section hidden after remount while another still shows', () => {
      window.localStorage.setItem('gg.cmsPhoneNudge.v2', '["announcement"]');
      const { unmount } = render(<Harness start />);
      expect(screen.queryByRole('region')).toBeNull();
      unmount();
      render(<Harness phoneNudge="service" start />);
      expect(screen.getByRole('region')).toHaveTextContent('begin sharing them with your loved ones');
    });

    it('still shows the nudge and lasts the visit when storage throws', async () => {
      vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
        throw new Error('blocked');
      });
      vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
        throw new Error('blocked');
      });
      const { unmount } = render(<Harness start />);
      expect(screen.getByRole('region')).toHaveTextContent(line);
      await userEvent.click(screen.getByRole('button', { name: 'Got it' }));
      expect(screen.queryByRole('region')).toBeNull();
      unmount();
      render(<Harness start />);
      expect(screen.queryByRole('region')).toBeNull();
    });
  });
});
