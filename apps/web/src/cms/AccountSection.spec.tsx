import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AccountSection, AccountSettingsSection, checkDetails } from './AccountSection';

function profile(overrides: Partial<Parameters<typeof AccountSection>[0]> = {}) {
  const props = {
    senderName: 'Anna' as string | null,
    error: null as string | null,
    onSave: vi.fn().mockResolvedValue(true),
    onSignOut: vi.fn(),
    ...overrides,
  };
  render(<AccountSection {...props} />);
  return props;
}

describe('AccountSection', () => {
  it('shows the saved name, Sign out, and no heading or Back of its own', () => {
    profile();
    expect(screen.getByLabelText('Your name')).toHaveValue('Anna');
    expect(screen.getByRole('button', { name: 'Sign out' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { level: 1 })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Back' })).not.toBeInTheDocument();
  });

  it('saves the trimmed name and says so', async () => {
    const user = userEvent.setup();
    const props = profile();
    await user.clear(screen.getByLabelText('Your name'));
    await user.type(screen.getByLabelText('Your name'), '  Anna Lee ');
    await user.click(screen.getByRole('button', { name: 'Save' }));
    expect(props.onSave).toHaveBeenCalledWith('Anna Lee');
    expect(await screen.findByText('Your name is saved.')).toBeInTheDocument();
  });

  it('asks for a name when it is blank and does not save', async () => {
    const user = userEvent.setup();
    const props = profile({ senderName: null });
    await user.click(screen.getByRole('button', { name: 'Save' }));
    expect(screen.getByText('Please enter your name.')).toBeInTheDocument();
    expect(props.onSave).not.toHaveBeenCalled();
  });

  it('keeps what was typed when the save fails', async () => {
    const user = userEvent.setup();
    profile({ onSave: vi.fn().mockResolvedValue(false), error: 'We couldn\'t save your name. You can try again.' });
    await user.type(screen.getByLabelText('Your name'), ' B');
    await user.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Save' })).toBeInTheDocument());
    expect(screen.getByLabelText('Your name')).toHaveValue('Anna B');
    expect(screen.getByText("We couldn't save your name. You can try again.")).toBeInTheDocument();
    expect(screen.queryByText('Your name is saved.')).not.toBeInTheDocument();
  });

  it('calls onSignOut', async () => {
    const user = userEvent.setup();
    const props = profile();
    await user.click(screen.getByRole('button', { name: 'Sign out' }));
    expect(props.onSignOut).toHaveBeenCalledTimes(1);
  });

  it('shows the intro for the name prompt', () => {
    render(<AccountSection asksName senderName={null} error={null} onSave={vi.fn()} onSignOut={vi.fn()} />);
    expect(screen.getByText('This is the name on your account.')).toBeInTheDocument();
  });

  it("has no second What you'll need list on Your account", () => {
    profile();
    expect(screen.queryByRole('heading', { name: "What you'll need" })).not.toBeInTheDocument();
    expect(screen.queryByText('Not today. Just so none of it surprises you.')).not.toBeInTheDocument();
    expect(screen.queryAllByRole('checkbox')).toHaveLength(0);
  });

  it('shows the Settings actions under the account content when given, and none otherwise', async () => {
    const user = userEvent.setup();
    const onRemoveEverything = vi.fn().mockResolvedValue(undefined);
    const { unmount } = render(
      <AccountSection
        senderName="Anna"
        error={null}
        onSave={vi.fn()}
        onSignOut={vi.fn()}
        settings={{ onRemoveEverything, signsOut: true, removeMember: <h2>Remove a member</h2> }}
      />,
    );
    expect(screen.getByRole('heading', { level: 2, name: 'Remove a member' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Remove everything from this device' }));
    expect(screen.getByText(/You'll be signed out on this device/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Remove everything' }));
    expect(onRemoveEverything).toHaveBeenCalledTimes(1);
    unmount();
    profile();
    expect(screen.queryByRole('button', { name: 'Remove everything from this device' })).not.toBeInTheDocument();
  });

  it('describes the field by the intro and the status, and flags an error after a failed save', async () => {
    const user = userEvent.setup();
    const { unmount } = render(
      <AccountSection asksName senderName={null} error="We couldn't save your name. You can try again." onSave={vi.fn().mockResolvedValue(false)} onSignOut={vi.fn()} />,
    );
    await user.type(screen.getByLabelText('Your name'), 'Anna');
    await user.click(screen.getByRole('button', { name: 'Save' }));
    await screen.findByText("We couldn't save your name. You can try again.");
    const field = screen.getByLabelText('Your name');
    const ids = (field.getAttribute('aria-describedby') ?? '').split(' ');
    expect(ids).toHaveLength(2);
    expect(document.getElementById(ids[0])).toHaveTextContent('This is the name on your account.');
    expect(document.getElementById(ids[1])).toHaveTextContent("We couldn't save your name");
    expect(field).toHaveAttribute('aria-invalid', 'true');
    unmount();
    profile();
    expect(screen.getByLabelText('Your name')).not.toHaveAttribute('aria-invalid');
  });

  it('shows the people helping node under the form', () => {
    profile({ peopleHelping: <h2>People helping you</h2> });
    expect(screen.getByRole('heading', { level: 2, name: 'People helping you' })).toBeInTheDocument();
  });
});

describe('AccountSection as a settings page', () => {
  it('has one h2 per section, in order, and no h1', () => {
    profile({ email: 'anna@example.com', onManageSignIn: vi.fn(), peopleHelping: <h2>People helping you</h2> });
    const names = screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent);
    expect(names).toEqual(['Profile', 'Sign-in and security', 'Payments', 'People helping you', 'Sign out']);
    expect(screen.queryByRole('heading', { level: 1 })).not.toBeInTheDocument();
  });

  it('shows the email read-only and opens Clerk through Manage sign-in', async () => {
    const user = userEvent.setup();
    const onManageSignIn = vi.fn();
    profile({ email: 'anna@example.com', onManageSignIn });
    expect(screen.getByText('anna@example.com')).toBeInTheDocument();
    expect(screen.queryByRole('textbox', { name: 'Email' })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Manage sign-in' }));
    expect(onManageSignIn).toHaveBeenCalledTimes(1);
  });

  it('leaves out Sign-in and security and Manage sign-in when there is nothing to show', () => {
    profile();
    expect(screen.queryByRole('heading', { name: 'Sign-in and security' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Manage sign-in' })).not.toBeInTheDocument();
  });

  it('Payments has a plan card and a payment method card, and never collects card data', async () => {
    const user = userEvent.setup();
    profile();
    const payments = screen.getByRole('heading', { level: 2, name: 'Payments' }).closest('section') as HTMLElement;
    expect(within(payments).getByRole('heading', { name: 'Your plan' })).toBeInTheDocument();
    expect(within(payments).getByText('Free')).toBeInTheDocument();
    expect(within(payments).getByText('There is nothing to pay today.')).toBeInTheDocument();
    expect(within(payments).getByRole('heading', { name: 'Payment method' })).toBeInTheDocument();
    expect(within(payments).getByText('No card added')).toBeInTheDocument();
    expect(within(payments).queryByText('Adding a card is not open yet.')).not.toBeInTheDocument();
    await user.click(within(payments).getByRole('button', { name: 'Add a card' }));
    expect(await within(payments).findByText('Adding a card is not open yet.')).toBeInTheDocument();
    expect(within(payments).getByRole('button', { name: 'Add a card' })).not.toHaveAttribute('aria-describedby');
    expect(payments.querySelectorAll('input, textarea, select, iframe')).toHaveLength(0);
  });
});

describe('AccountSettingsSection', () => {
  it('confirms before removing, then removes', async () => {
    const user = userEvent.setup();
    const onRemoveEverything = vi.fn().mockResolvedValue(undefined);
    render(<AccountSettingsSection onRemoveEverything={onRemoveEverything} removeMember={<h2>Remove a member</h2>} />);
    expect(screen.queryByRole('heading', { level: 1 })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Back' })).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 2, name: 'Remove a member' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Remove everything from this device' }));
    expect(onRemoveEverything).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: 'Remove everything' }));
    expect(onRemoveEverything).toHaveBeenCalledTimes(1);
  });
});

describe('AccountSection details', () => {
  const ok = { ok: true as const };

  function withDetails(overrides: Partial<Parameters<typeof AccountSection>[0]> = {}) {
    const onSaveDetails = vi.fn().mockResolvedValue(ok);
    const props = {
      senderName: 'Anna',
      error: null as string | null,
      onSave: vi.fn().mockResolvedValue(true),
      onSignOut: vi.fn(),
      onSaveDetails,
      ...overrides,
    };
    render(<AccountSection {...props} />);
    return { ...props, onSaveDetails };
  }

  it('shows no details fields when nothing can save them', () => {
    profile();
    expect(screen.queryByLabelText('Full name')).not.toBeInTheDocument();
  });

  it('shows the saved values, the date as Month D, YYYY', () => {
    withDetails({ fullName: 'Anna Lee', birthDate: '1980-05-29' });
    expect(screen.getByLabelText('Full name')).toHaveValue('Anna Lee');
    expect(screen.getByLabelText('Date of birth')).toHaveValue('May 29, 1980');
  });

  it('saves the trimmed name and a yyyy-mm-dd date', async () => {
    const user = userEvent.setup();
    const { onSaveDetails } = withDetails();
    await user.type(screen.getByLabelText('Full name'), '  Anna Lee ');
    await user.type(screen.getByLabelText('Date of birth'), 'May 29, 1980');
    await user.click(screen.getByRole('button', { name: 'Save details' }));
    expect(onSaveDetails).toHaveBeenCalledWith({ fullName: 'Anna Lee', birthDate: '1980-05-29' });
    expect(await screen.findByText('Your details are saved.')).toBeInTheDocument();
  });

  it('accepts a numeric date', async () => {
    const user = userEvent.setup();
    const { onSaveDetails } = withDetails();
    await user.type(screen.getByLabelText('Date of birth'), '5/29/1980');
    await user.click(screen.getByRole('button', { name: 'Save details' }));
    expect(onSaveDetails).toHaveBeenCalledWith({ fullName: null, birthDate: '1980-05-29' });
  });

  it('refuses a tab in the name', () => {
    expect(checkDetails('Anna\tLee', '').nameError).toBe('Please enter your name on one line, with no hidden characters.');
  });

  it('clears both when emptied', async () => {
    const user = userEvent.setup();
    const { onSaveDetails } = withDetails({ fullName: 'Anna Lee', birthDate: '1980-05-29' });
    await user.clear(screen.getByLabelText('Full name'));
    await user.clear(screen.getByLabelText('Date of birth'));
    await user.click(screen.getByRole('button', { name: 'Save details' }));
    expect(onSaveDetails).toHaveBeenCalledWith({ fullName: null, birthDate: null });
  });

  it('refuses a date with no year, with calm copy next to the field, and does not save', async () => {
    const user = userEvent.setup();
    const { onSaveDetails } = withDetails();
    await user.type(screen.getByLabelText('Date of birth'), 'May 29');
    await user.click(screen.getByRole('button', { name: 'Save details' }));
    expect(onSaveDetails).not.toHaveBeenCalled();
    expect(screen.getByRole('alert')).toHaveTextContent('Please enter the whole date, with the year. For example, May 29, 1980.');
    expect(screen.getByLabelText('Date of birth')).toBeInvalid();
    expect(screen.getByLabelText('Date of birth')).toHaveAccessibleDescription(/whole date/);
  });

  it('refuses a future date and a date before 1900', async () => {
    const user = userEvent.setup();
    const { onSaveDetails } = withDetails();
    await user.type(screen.getByLabelText('Date of birth'), 'January 1, 2999');
    await user.click(screen.getByRole('button', { name: 'Save details' }));
    expect(screen.getByText("Please check the date. It can't be in the future or before 1900.")).toBeInTheDocument();
    await user.clear(screen.getByLabelText('Date of birth'));
    await user.type(screen.getByLabelText('Date of birth'), 'January 1, 1850');
    await user.click(screen.getByRole('button', { name: 'Save details' }));
    expect(screen.getByText("Please check the date. It can't be in the future or before 1900.")).toBeInTheDocument();
    expect(onSaveDetails).not.toHaveBeenCalled();
  });

  it('refuses a name over 120 characters and one with a line break character', async () => {
    const user = userEvent.setup();
    const { onSaveDetails } = withDetails();
    await user.click(screen.getByLabelText('Full name'));
    await user.paste('a'.repeat(121));
    await user.click(screen.getByRole('button', { name: 'Save details' }));
    expect(screen.getByRole('alert')).toHaveTextContent('Please use 120 characters or fewer.');
    expect(screen.getByLabelText('Full name')).toBeInvalid();
    await user.clear(screen.getByLabelText('Full name'));
    await user.paste('Anna\u0001x');
    await user.click(screen.getByRole('button', { name: 'Save details' }));
    expect(screen.getByRole('alert')).toHaveTextContent('Please enter your name on one line, with no hidden characters.');
    expect(onSaveDetails).not.toHaveBeenCalled();
  });

  it('maps a server refusal to calm copy and keeps what was typed', async () => {
    const user = userEvent.setup();
    withDetails({ onSaveDetails: vi.fn().mockResolvedValue({ ok: false, invalid: true }) });
    await user.type(screen.getByLabelText('Full name'), 'Anna Lee');
    await user.click(screen.getByRole('button', { name: 'Save details' }));
    expect(await screen.findByText(/We couldn't save that/)).toBeInTheDocument();
    expect(screen.getByLabelText('Full name')).toHaveValue('Anna Lee');
    expect(screen.queryByText('Your details are saved.')).not.toBeInTheDocument();
  });

  it('shows the general error only after its own save fails', async () => {
    const user = userEvent.setup();
    withDetails({ error: 'We cannot reach you.', onSaveDetails: vi.fn().mockResolvedValue({ ok: false, invalid: false }) });
    expect(screen.queryByText('We cannot reach you.')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Save details' }));
    expect(await screen.findAllByText('We cannot reach you.')).toHaveLength(1);
    expect(screen.getByLabelText('Your name')).not.toHaveAttribute('aria-invalid');
  });
});


/** jsdom's Blob has no text(). */
function readBlob(blob: Blob): Promise<string> {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.readAsText(blob);
  });
}

describe('AccountSection plans', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('downloads a copy of the plans, then offers the device removal after it', async () => {
    const user = userEvent.setup();
    const create = vi.fn().mockReturnValue('blob:plans');
    const revoke = vi.fn();
    Object.assign(URL, { createObjectURL: create, revokeObjectURL: revoke });
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);
    render(
      <AccountSection
        senderName="Anna"
        error={null}
        onSave={vi.fn()}
        onSignOut={vi.fn()}
        plans={[{ personName: 'Sam', obituaryText: 'A kind man.' }]}
        settings={{ onRemoveEverything: vi.fn() }}
      />,
    );
    const panel = screen.getByRole('region', { name: 'Your plans' });
    expect(within(panel).getByRole('heading', { level: 2, name: 'Your plans' })).toBeInTheDocument();
    const download = within(panel).getByRole('button', { name: 'Download a copy' });
    const remove = within(panel).getByRole('button', { name: 'Remove everything from this device' });
    expect(download.compareDocumentPosition(remove) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();

    await user.click(download);
    expect(create).toHaveBeenCalledTimes(1);
    expect(await readBlob(create.mock.calls[0][0] as Blob)).toContain('A kind man.');
    expect(click).toHaveBeenCalledTimes(1);
    expect(revoke).toHaveBeenCalledWith('blob:plans');
    expect(await screen.findByText('Your copy is saved to this device.')).toBeInTheDocument();
  });

  it('says there is nothing to save, and offers no download, when there are no people', () => {
    render(<AccountSection senderName="Anna" error={null} onSave={vi.fn()} onSignOut={vi.fn()} plans={[]} />);
    expect(screen.getByText('There is nothing to save yet.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Download a copy' })).not.toBeInTheDocument();
  });

  it('shows no plans panel when no plans are given', () => {
    profile();
    expect(screen.queryByRole('heading', { name: 'Your plans' })).not.toBeInTheDocument();
  });
});
