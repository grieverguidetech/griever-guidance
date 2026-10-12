import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ShareDetailsButton } from './ShareDetailsButton';

const session = { personName: 'Margaret Hale', dateOfPassing: null, obituaryUrl: '' };
const checklist = [{ label: 'Announce the passing', done: true }];
const BUTTON = { name: 'Share these details' };

function setShare(share: unknown) {
  Object.defineProperty(navigator, 'share', { value: share, configurable: true });
}
function setClipboard(writeText: unknown) {
  Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
}
function abort(name: string) {
  return vi.fn(async () => {
    throw new DOMException('x', name);
  });
}

describe('ShareDetailsButton', () => {
  afterEach(() => {
    setShare(undefined);
    Object.defineProperty(navigator, 'clipboard', { value: undefined, configurable: true });
    vi.useRealTimers();
  });

  it('opens the share sheet with the text only', async () => {
    const share = vi.fn(async (_data: { text: string }) => undefined);
    const user = userEvent.setup();
    setShare(share);
    render(<ShareDetailsButton session={session} checklist={checklist} />);
    await user.click(screen.getByRole('button', BUTTON));
    expect(share).toHaveBeenCalledTimes(1);
    const arg = share.mock.calls[0][0];
    expect(Object.keys(arg)).toEqual(['text']);
    expect(arg.text).toContain('Details for Margaret Hale');
    expect(arg.text).toContain('- Done: Announce the passing');
    expect(screen.getByRole('status')).toBeEmptyDOMElement();
  });

  it('copies when there is no share sheet, and says so', async () => {
    const user = userEvent.setup(); // installs its own clipboard, so set ours after
    const writeText = vi.fn(async () => undefined);
    setShare(undefined);
    setClipboard(writeText);
    render(<ShareDetailsButton session={session} checklist={checklist} />);
    await user.click(screen.getByRole('button', BUTTON));
    expect(writeText).toHaveBeenCalledWith(expect.stringContaining('Margaret Hale'));
    expect(screen.getByRole('status')).toHaveTextContent('Copied. You can paste it into a message.');
    expect(screen.getByRole('button', BUTTON)).toBeEnabled();
  });

  it.each(['AbortError', 'InvalidStateError'])('is silent on %s', async (name) => {
    const user = userEvent.setup();
    const writeText = vi.fn();
    setShare(abort(name));
    setClipboard(writeText);
    render(<ShareDetailsButton session={session} checklist={checklist} />);
    await user.click(screen.getByRole('button', BUTTON));
    expect(writeText).not.toHaveBeenCalled();
    expect(screen.getByRole('status')).toBeEmptyDOMElement();
    expect(screen.queryByLabelText('Details to copy')).not.toBeInTheDocument();
  });

  it('on any other share error, says so, does not copy, and offers the text', async () => {
    const user = userEvent.setup();
    const writeText = vi.fn();
    setShare(vi.fn(async () => { throw new Error('boom'); }));
    setClipboard(writeText);
    render(<ShareDetailsButton session={session} checklist={checklist} />);
    await user.click(screen.getByRole('button', BUTTON));
    expect(screen.getByRole('status')).toHaveTextContent("That didn't go through.");
    expect(writeText).not.toHaveBeenCalled();
    expect((screen.getByLabelText('Details to copy') as HTMLTextAreaElement).value).toContain(
      'Details for Margaret Hale',
    );
  });

  it('ignores a second tap while the share sheet is open', async () => {
    const user = userEvent.setup();
    let finish: () => void = () => undefined;
    const share = vi.fn(() => new Promise<void>((resolve) => { finish = resolve; }));
    setShare(share);
    render(<ShareDetailsButton session={session} checklist={checklist} />);
    await user.click(screen.getByRole('button', BUTTON));
    await user.click(screen.getByRole('button', BUTTON));
    expect(share).toHaveBeenCalledTimes(1);
    await act(async () => finish());
    await user.click(screen.getByRole('button', BUTTON));
    expect(share).toHaveBeenCalledTimes(2);
  });

  it('shows the full text to select by hand when copying fails', async () => {
    const user = userEvent.setup();
    setShare(undefined);
    setClipboard(vi.fn(async () => { throw new Error('denied'); }));
    render(<ShareDetailsButton session={session} checklist={checklist} />);
    await user.click(screen.getByRole('button', BUTTON));
    expect(screen.getByRole('status')).toHaveTextContent(
      "We couldn't copy it. You can select the text below and copy it.",
    );
    const box = screen.getByLabelText('Details to copy');
    expect(box).toHaveAttribute('readonly');
    expect(box).toHaveValue('Details for Margaret Hale\n\nName: Margaret Hale\n\nChecklist, in order:\n- Done: Announce the passing');
  });

  it('clears the message so a repeated "Copied." is announced again', async () => {
    const user = userEvent.setup();
    setShare(undefined);
    setClipboard(vi.fn(async () => undefined));
    render(<ShareDetailsButton session={session} checklist={checklist} />);
    const status = screen.getByRole('status');
    await user.click(screen.getByRole('button', BUTTON));
    expect(status).toHaveTextContent('Copied.');
    // Tapping again empties the region first, then fills it, so it is read out again.
    const seen: string[] = [];
    const observer = new MutationObserver(() => seen.push(status.textContent ?? ''));
    observer.observe(status, { childList: true, characterData: true, subtree: true });
    await user.click(screen.getByRole('button', BUTTON));
    await Promise.resolve();
    observer.disconnect();
    expect(seen).toContain('');
    expect(status).toHaveTextContent('Copied.');
  });

  it('empties the message after a few seconds', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    vi.useFakeTimers({ shouldAdvanceTime: true });
    setShare(undefined);
    setClipboard(vi.fn(async () => undefined));
    render(<ShareDetailsButton session={session} checklist={checklist} />);
    await user.click(screen.getByRole('button', BUTTON));
    expect(screen.getByRole('status')).toHaveTextContent('Copied.');
    act(() => { vi.advanceTimersByTime(4100); });
    expect(screen.getByRole('status')).toBeEmptyDOMElement();
  });
});
