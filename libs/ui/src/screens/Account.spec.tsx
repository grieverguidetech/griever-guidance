import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Account } from './Account';
import type { AccountCopy, AccountProps } from './Account';

const copy: AccountCopy = {
  heading: 'Your account',
  askHeading: 'What should we call you?',
  askIntro: 'This is the name on your account.',
  back: 'Back',
  checklist: "What you'll need",
  nameLabel: 'Your name',
  signOut: 'Sign out',
  offline: 'You are offline. You can change your name when you are connected.',
};

function setup(over: Partial<AccountProps> = {}) {
  const props: AccountProps = {
    copy,
    name: 'Anna',
    onNameChange: vi.fn(),
    primaryLabel: 'Save',
    onPrimary: vi.fn(),
    onSignOut: vi.fn(),
    onBack: vi.fn(),
    ...over,
  };
  render(<Account {...props} />);
  return props;
}

describe('Account', () => {
  it('shows the heading and a name field named by its label', () => {
    setup();
    expect(screen.getByRole('heading', { level: 1, name: 'Your account' })).toBeInTheDocument();
    expect(screen.getByLabelText('Your name')).toHaveValue('Anna');
  });

  it('asks "What should we call you?" with its intro when the account has no name', () => {
    setup({ asksName: true, intro: copy.askIntro });
    expect(screen.getByRole('heading', { level: 1, name: 'What should we call you?' })).toBeInTheDocument();
    expect(screen.getByText('This is the name on your account.')).toBeInTheDocument();
  });

  it('reports typing', async () => {
    const props = setup({ name: '' });
    await userEvent.type(screen.getByLabelText('Your name'), 'A');
    expect(props.onNameChange).toHaveBeenCalledWith('A');
  });

  it('calls save from the primary button and from Enter in the field', async () => {
    const props = setup();
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    await userEvent.type(screen.getByLabelText('Your name'), '{Enter}');
    expect(props.onPrimary).toHaveBeenCalledTimes(2);
  });

  it('Sign out fires and is the outline (header) style, not a filled button', async () => {
    const props = setup();
    const button = screen.getByRole('button', { name: 'Sign out' });
    await userEvent.click(button);
    expect(props.onSignOut).toHaveBeenCalledTimes(1);
    // The header look has no fill; the primary Save has a solid one.
    expect(['', 'transparent', 'rgba(0, 0, 0, 0)']).toContain(getComputedStyle(button).backgroundColor);
    expect(getComputedStyle(screen.getByRole('button', { name: 'Save' })).backgroundColor).not.toBe(getComputedStyle(button).backgroundColor);
  });

  it('leaves Sign out out when there is no handler', () => {
    setup({ onSignOut: undefined });
    expect(screen.queryByRole('button', { name: 'Sign out' })).not.toBeInTheDocument();
  });

  it('shows the offline line only when offline, in an always-present status node', () => {
    const { rerender } = renderWith({});
    expect(screen.queryByText(copy.offline)).not.toBeInTheDocument();
    rerender({ offline: true });
    expect(screen.getByText(copy.offline)).toBeInTheDocument();
  });

  it('always renders the status node, empty when there is no message', () => {
    setup();
    expect(screen.getAllByRole('status').length).toBeGreaterThanOrEqual(2);
    for (const node of screen.getAllByRole('status')) {
      expect(node).toBeEmptyDOMElement();
    }
  });

  it('draws an error in the danger colour, different from a plain status', () => {
    setup({ status: { message: 'We could not save.', tone: 'danger' } });
    const danger = getComputedStyle(screen.getByText('We could not save.')).color;
    cleanup();
    setup({ status: { message: 'Your name is saved.' } });
    expect(getComputedStyle(screen.getByText('Your name is saved.')).color).not.toBe(danger);
  });

  it('moves focus to the name field when its label is tapped', async () => {
    setup();
    await userEvent.click(screen.getByText('Your name'));
    expect(screen.getByLabelText('Your name')).toHaveFocus();
  });

  it('shows a status message and an error in the live status line', () => {
    setup({ status: { message: 'Your name is saved.' } });
    expect(screen.getByText('Your name is saved.')).toBeInTheDocument();
  });

  it('marks the primary button unavailable while busy but still focusable', () => {
    setup({ primaryLabel: 'Saving…', primaryBusy: true });
    expect(screen.getByRole('button', { name: 'Saving…' })).toHaveAttribute('aria-disabled', 'true');
  });

  it('opens What you will need only when asked to', async () => {
    const onWhatYoullNeed = vi.fn();
    setup({ onWhatYoullNeed });
    await userEvent.click(screen.getByRole('button', { name: "What you'll need" }));
    expect(onWhatYoullNeed).toHaveBeenCalledTimes(1);
  });

  it('has no What you will need button without a handler', () => {
    setup();
    expect(screen.queryByRole('button', { name: "What you'll need" })).not.toBeInTheDocument();
  });

  it('calls Back', async () => {
    const props = setup();
    await userEvent.click(screen.getByRole('button', { name: 'Back' }));
    expect(props.onBack).toHaveBeenCalledTimes(1);
  });

  it('makes the field read-only when the session has ended', () => {
    setup({ fieldDisabled: true });
    expect(screen.getByLabelText('Your name')).toHaveAttribute('readonly');
  });
});

function renderWith(over: Partial<AccountProps>) {
  const base: AccountProps = { copy, name: 'Anna', onNameChange: vi.fn(), primaryLabel: 'Save', onPrimary: vi.fn(), onBack: vi.fn() };
  const view = render(<Account {...base} {...over} />);
  return { rerender: (next: Partial<AccountProps>) => view.rerender(<Account {...base} {...next} />) };
}
