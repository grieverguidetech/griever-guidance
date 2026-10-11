import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ShareDetailsButton } from './ShareDetailsButton';

const session = { personName: 'Margaret Hale', dateOfPassing: null, obituaryUrl: '' };
const checklist = [{ label: 'Announce the passing', done: true }];

function setNavigator(share: unknown, writeText?: unknown) {
  Object.defineProperty(navigator, 'share', { value: share, configurable: true });
  Object.defineProperty(navigator, 'clipboard', {
    value: writeText ? { writeText } : undefined,
    configurable: true,
  });
}

describe('ShareDetailsButton', () => {
  afterEach(() => setNavigator(undefined));

  it('opens the share sheet with the snapshot', async () => {
    const share = vi.fn(async (_data: { title: string; text: string }) => undefined);
    setNavigator(share);
    const user = userEvent.setup();
    render(<ShareDetailsButton session={session} checklist={checklist} />);
    await user.click(screen.getByRole('button', { name: 'Share these details' }));
    expect(share).toHaveBeenCalledTimes(1);
    const arg = share.mock.calls[0][0];
    expect(arg.title).toBe('Details for Margaret Hale');
    expect(arg.text).toContain('- Done: Announce the passing');
    expect(screen.getByRole('status')).toBeEmptyDOMElement();
  });

  it('copies to the clipboard when there is no share sheet, and says so', async () => {
    const writeText = vi.fn(async () => undefined);
    const user = userEvent.setup(); // installs its own clipboard, so set ours after
    setNavigator(undefined);
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    render(<ShareDetailsButton session={session} checklist={checklist} />);
    const button = screen.getByRole('button', { name: 'Share these details' });
    await user.click(button);
    expect(writeText).toHaveBeenCalledWith(expect.stringContaining('Margaret Hale'));
    expect(screen.getByRole('status')).toHaveTextContent('Copied. You can paste it into a message.');
    expect(button).toBeEnabled();
  });

  it('stays silent when the share sheet is cancelled', async () => {
    const writeText = vi.fn();
    const user = userEvent.setup();
    setNavigator(
      vi.fn(async () => {
        throw new DOMException('cancelled', 'AbortError');
      }),
    );
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    render(<ShareDetailsButton session={session} checklist={checklist} />);
    await user.click(screen.getByRole('button', { name: 'Share these details' }));
    expect(writeText).not.toHaveBeenCalled();
    expect(screen.getByRole('status')).toBeEmptyDOMElement();
  });

  it('says calmly when copying fails', async () => {
    const user = userEvent.setup();
    setNavigator(undefined);
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText: vi.fn(async () => { throw new Error('denied'); }) },
      configurable: true,
    });
    render(<ShareDetailsButton session={session} checklist={checklist} />);
    await user.click(screen.getByRole('button', { name: 'Share these details' }));
    expect(screen.getByRole('status')).toHaveTextContent("We couldn't copy it. You can try again.");
  });
});
