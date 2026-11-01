import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { DeleteCancelledError } from '../lib/authClient';
import { AccountSection, AccountSettingsSection } from './AccountSection';

function profile(overrides: Partial<Parameters<typeof AccountSection>[0]> = {}) {
  const props = {
    senderName: 'Anna' as string | null,
    error: null as string | null,
    onSaveDetails: vi.fn().mockResolvedValue({ ok: true }),
    onSignOut: vi.fn(),
    ...overrides,
  };
  render(<AccountSection {...props} />);
  return props;
}

describe('AccountSection', () => {
  it('shows the Personal details form, Sign out, and no heading or Back of its own', () => {
    profile();
    expect(screen.getByRole('heading', { level: 3, name: 'Personal details' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Sign out' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { level: 1 })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Back' })).not.toBeInTheDocument();
  });

  it('has no Your name or Full name field', () => {
    profile();
    expect(screen.queryByLabelText('Your name')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Full name')).not.toBeInTheDocument();
  });

  it('the name prompt asks First name and Last name only, with its intro as the first name hint, and sends only the names', async () => {
    const user = userEvent.setup();
    const props = profile({
      asksName: true,
      senderName: null,
      birthDate: '1980-05-29',
      address: { line1: '1 Main St', line2: '', city: 'Milltown', state: 'NJ', zip: '08850' },
    });
    expect(screen.getByLabelText('First name')).toHaveAccessibleDescription('Your first name is the name your messages are signed with.');
    expect(screen.getByLabelText('First name')).toHaveAttribute('aria-required', 'true');
    expect(screen.getByLabelText('Last name (optional)')).toBeInTheDocument();
    expect(screen.queryByLabelText('Date of birth')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('ZIP code')).not.toBeInTheDocument();
    await user.type(screen.getByLabelText('First name'), 'Anna');
    await user.type(screen.getByLabelText('Last name (optional)'), 'Reyes');
    await user.click(screen.getByRole('button', { name: 'Save details' }));
    expect(props.onSaveDetails).toHaveBeenCalledWith({ firstName: 'Anna', lastName: 'Reyes' });
    const sent = (props.onSaveDetails as ReturnType<typeof vi.fn>).mock.calls[0]?.[0] as Record<string, unknown>;
    expect(sent).toEqual({ firstName: 'Anna', lastName: 'Reyes' });
    expect(sent).not.toHaveProperty('birthDate');
    expect(sent).not.toHaveProperty('address');
  });

  it('the name prompt blocks only on name errors, even with a bad stored address, and does not wait for the profile', async () => {
    const user = userEvent.setup();
    const props = profile({ asksName: true, senderName: null, profileLoaded: false, address: { line1: '', line2: '', city: '', state: 'N', zip: '1' } });
    await user.type(screen.getByLabelText('First name'), 'Anna');
    await user.click(screen.getByRole('button', { name: 'Save details' }));
    expect(props.onSaveDetails).toHaveBeenCalledWith({ firstName: 'Anna', lastName: null });
  });

  it('the name prompt needs a first name and does not save without one', async () => {
    const user = userEvent.setup();
    const props = profile({ asksName: true, senderName: null });
    await user.click(screen.getByRole('button', { name: 'Save details' }));
    expect(screen.getByLabelText('First name')).toHaveAccessibleDescription(/Please enter your first name\./);
    expect(screen.getByLabelText('First name')).toBeInvalid();
    expect(props.onSaveDetails).not.toHaveBeenCalled();
  });

  it("has no second What you'll need list on Your account", () => {
    profile();
    expect(screen.queryByRole('heading', { name: "What you'll need" })).not.toBeInTheDocument();
    expect(screen.queryByText('Not today. Just so none of it surprises you.')).not.toBeInTheDocument();
    expect(screen.queryAllByRole('checkbox')).toHaveLength(0);
  });

  it('shows the Settings actions under the account content when given, and none otherwise', () => {
    const { unmount } = render(
      <AccountSection
        senderName="Anna"
        error={null}
        onSaveDetails={vi.fn()}
        onSignOut={vi.fn()}
        settings={{ removeMember: <h2>People helping you</h2> }}
      />,
    );
    expect(screen.getByRole('heading', { level: 2, name: 'People helping you' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Remove everything from this device' })).not.toBeInTheDocument();
    expect(screen.queryByText('Remove everything from this device')).not.toBeInTheDocument();
    unmount();
    profile();
    expect(screen.queryByRole('heading', { name: 'People helping you' })).not.toBeInTheDocument();
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
    expect(names).toEqual(['Profile', 'Sign-in and security', 'On your phone', 'Payments', 'People helping you', 'Help and support', 'Sign out']);
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
  it('shows the remove-a-member section and no "Remove everything" control', () => {
    render(<AccountSettingsSection removeMember={<h2>People helping you</h2>} />);
    expect(screen.queryByRole('heading', { level: 1 })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Back' })).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 2, name: 'People helping you' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Remove everything/ })).not.toBeInTheDocument();
  });

  it('shows Help and support, and no empty page, without a remove-a-member section', () => {
    render(<AccountSettingsSection />);
    expect(screen.getByRole('heading', { level: 2, name: 'Help and support' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /@/ })).toHaveAttribute('href', expect.stringMatching(/^mailto:/));
    expect(screen.queryByRole('heading', { name: 'People helping you' })).not.toBeInTheDocument();
  });

  it('shows Help and support after the remove-a-member section', () => {
    render(<AccountSettingsSection removeMember={<h2>People helping you</h2>} />);
    const headings = screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent);
    expect(headings).toEqual(['People helping you', 'Help and support']);
  });
});

describe('AccountSection personal details', () => {
  const ok = { ok: true as const };
  const SAVE = { name: 'Save details' };
  const address = { line1: '1 Main St', line2: 'Apt 2', city: 'Milltown', state: 'NJ', zip: '08850' };

  function withDetails(overrides: Partial<Parameters<typeof AccountSection>[0]> = {}) {
    const onSaveDetails = vi.fn().mockResolvedValue(ok);
    const props = { senderName: 'Anna', error: null as string | null, onSignOut: vi.fn(), onSaveDetails, ...overrides };
    render(<AccountSection {...props} />);
    return { ...props, onSaveDetails };
  }

  async function fillAddress(user: ReturnType<typeof userEvent.setup>, values: Partial<Record<string, string>> = {}) {
    const all = { 'Address line 1': '1 Main St', 'Address line 2 (optional)': '', City: 'Milltown', State: 'nj', 'ZIP code': '08850', ...values };
    for (const [label, text] of Object.entries(all)) {
      if (text) {
        await user.type(screen.getByLabelText(label), text);
      }
    }
  }

  it('renders every field with visible labels, autocomplete hints and one Save details button', () => {
    withDetails();
    const expected: Record<string, string> = {
      'First name': 'given-name',
      'Last name (optional)': 'family-name',
      'Address line 1': 'address-line1',
      'Address line 2 (optional)': 'address-line2',
      City: 'address-level2',
      State: 'address-level1',
      'ZIP code': 'postal-code',
    };
    for (const [label, token] of Object.entries(expected)) {
      expect(screen.getByLabelText(label)).toHaveAttribute('autocomplete', token);
    }
    expect(screen.getByLabelText('State')).not.toHaveAttribute('maxlength');
    expect(screen.getByLabelText('State')).toHaveAttribute('autocorrect', 'off');
    expect(screen.getByLabelText('State')).toHaveAttribute('spellcheck', 'false');
    expect(screen.getByLabelText('ZIP code')).toHaveAttribute('inputmode', 'numeric');
    expect(screen.getByLabelText('ZIP code')).toHaveAttribute('spellcheck', 'false');
    expect(screen.getByLabelText('First name')).toHaveAttribute('aria-required', 'true');
    expect(screen.getByLabelText('Last name (optional)')).not.toHaveAttribute('aria-required');
    // The date field stays off autofill: browsers fill a birthday as yyyy-mm-dd.
    expect(screen.getByLabelText('Date of birth')).toHaveAttribute('autocomplete', 'off');
    expect(screen.getByLabelText('Date of birth')).toBeInTheDocument();
    expect(screen.getByRole('group', { name: 'Address' })).toBeInTheDocument();
    expect(screen.getAllByRole('button', SAVE)).toHaveLength(1);
  });

  it('prefills the first name from senderName when no names are saved', () => {
    withDetails({ senderName: 'Anna' });
    expect(screen.getByLabelText('First name')).toHaveValue('Anna');
    expect(screen.getByLabelText('Last name (optional)')).toHaveValue('');
  });

  it('prefers saved names over senderName, and does not copy senderName into a blank first name when a last name exists', () => {
    const { unmount } = render(<AccountSection senderName="Ann" firstName="Anna" lastName="Reyes" error={null} onSaveDetails={vi.fn()} onSignOut={vi.fn()} />);
    expect(screen.getByLabelText('First name')).toHaveValue('Anna');
    expect(screen.getByLabelText('Last name (optional)')).toHaveValue('Reyes');
    unmount();
    render(<AccountSection senderName="Ann" firstName={null} lastName="Reyes" error={null} onSaveDetails={vi.fn()} onSignOut={vi.fn()} />);
    expect(screen.getByLabelText('First name')).toHaveValue('');
  });

  it('shows the saved values, the date as Month D, YYYY', () => {
    withDetails({ firstName: 'Anna', lastName: 'Lee', birthDate: '1980-05-29', address });
    expect(screen.getByLabelText('Date of birth')).toHaveValue('May 29, 1980');
    expect(screen.getByLabelText('Address line 1')).toHaveValue('1 Main St');
    expect(screen.getByLabelText('Address line 2 (optional)')).toHaveValue('Apt 2');
    expect(screen.getByLabelText('City')).toHaveValue('Milltown');
    expect(screen.getByLabelText('State')).toHaveValue('NJ');
    expect(screen.getByLabelText('ZIP code')).toHaveValue('08850');
  });

  it('saves trimmed names, a yyyy-mm-dd date and the address with the state in capitals, then says so', async () => {
    const user = userEvent.setup();
    const { onSaveDetails } = withDetails({ senderName: null });
    await user.type(screen.getByLabelText('First name'), '  Anna ');
    await user.type(screen.getByLabelText('Last name (optional)'), 'Lee');
    await user.type(screen.getByLabelText('Date of birth'), 'May 29, 1980');
    await fillAddress(user);
    await user.click(screen.getByRole('button', SAVE));
    expect(onSaveDetails).toHaveBeenCalledWith({
      firstName: 'Anna',
      lastName: 'Lee',
      birthDate: '1980-05-29',
      address: { line1: '1 Main St', line2: '', city: 'Milltown', state: 'NJ', zip: '08850' },
    });
    expect(await screen.findByText('Your details are saved.')).toBeInTheDocument();
  });

  it('needs a first name, in the full form too, and does not save without one', async () => {
    const user = userEvent.setup();
    const { onSaveDetails } = withDetails({ senderName: null });
    await user.click(screen.getByRole('button', SAVE));
    expect(onSaveDetails).not.toHaveBeenCalled();
    expect(screen.getByText('Please enter your first name.')).toBeInTheDocument();
    expect(screen.getByLabelText('First name')).toBeInvalid();
  });

  it('saves a first name alone, with no last name, date or address', async () => {
    const user = userEvent.setup();
    const { onSaveDetails } = withDetails({ senderName: null });
    await user.type(screen.getByLabelText('First name'), 'Anna');
    await user.click(screen.getByRole('button', SAVE));
    expect(onSaveDetails).toHaveBeenCalledWith({ firstName: 'Anna', lastName: null, birthDate: null, address: null });
  });

  it('accepts a numeric date', async () => {
    const user = userEvent.setup();
    const { onSaveDetails } = withDetails();
    await user.type(screen.getByLabelText('Date of birth'), '5/29/1980');
    await user.click(screen.getByRole('button', SAVE));
    expect(onSaveDetails).toHaveBeenCalledWith(expect.objectContaining({ birthDate: '1980-05-29' }));
  });

  it('clears everything but the first name when emptied', async () => {
    const user = userEvent.setup();
    const { onSaveDetails } = withDetails({ firstName: 'Anna', lastName: 'Lee', birthDate: '1980-05-29', address });
    for (const label of ['Last name (optional)', 'Date of birth', 'Address line 1', 'Address line 2 (optional)', 'City', 'State', 'ZIP code']) {
      await user.clear(screen.getByLabelText(label));
    }
    await user.click(screen.getByRole('button', SAVE));
    expect(onSaveDetails).toHaveBeenCalledWith({ firstName: 'Anna', lastName: null, birthDate: null, address: null });
  });

  it('refuses a partly filled address, naming each missing field, and does not save', async () => {
    const user = userEvent.setup();
    const { onSaveDetails } = withDetails();
    await user.type(screen.getByLabelText('Address line 1'), '1 Main St');
    await user.click(screen.getByRole('button', SAVE));
    expect(onSaveDetails).not.toHaveBeenCalled();
    expect(screen.getByText('Please enter the city.')).toBeInTheDocument();
    expect(screen.getByText('Please enter the state.')).toBeInTheDocument();
    expect(screen.getByText('Please enter the ZIP code.')).toBeInTheDocument();
    expect(screen.queryByText('Please enter the street address.')).not.toBeInTheDocument();
    expect(screen.getByLabelText('City')).toBeInvalid();
    expect(screen.getByLabelText('City')).toHaveAccessibleDescription('Please enter the city.');
    expect(screen.getByLabelText('Address line 1')).not.toHaveAttribute('aria-invalid');
  });

  it('moves focus to the first invalid field, in page order, and puts a short summary in the status line', async () => {
    const user = userEvent.setup();
    const { onSaveDetails } = withDetails();
    await user.type(screen.getByLabelText('Address line 1'), '1 Main St');
    await user.type(screen.getByLabelText('ZIP code'), '123');
    await user.click(screen.getByRole('button', SAVE));
    expect(onSaveDetails).not.toHaveBeenCalled();
    // City and State are empty and ZIP is wrong; City comes first on the page.
    expect(screen.getByLabelText('City')).toHaveFocus();
    expect(screen.getAllByRole('status')[0]).toHaveTextContent('Please check the fields with a message under them.');
    expect(document.querySelectorAll('[role="alert"]')).toHaveLength(0);
    await user.type(screen.getByLabelText('City'), 'Milltown');
    await user.type(screen.getByLabelText('State'), 'NJ');
    await user.click(screen.getByRole('button', SAVE));
    expect(screen.getByLabelText('ZIP code')).toHaveFocus();
    await user.clear(screen.getByLabelText('First name'));
    await user.click(screen.getByRole('button', SAVE));
    expect(screen.getByLabelText('First name')).toHaveFocus();
  });

  it('turns a full state name into its code on save', async () => {
    const user = userEvent.setup();
    const { onSaveDetails } = withDetails();
    await fillAddress(user, { State: 'New Jersey' });
    await user.click(screen.getByRole('button', SAVE));
    expect(onSaveDetails).toHaveBeenLastCalledWith(expect.objectContaining({ address: expect.objectContaining({ state: 'NJ' }) }));
  });

  it('turns the District of Columbia into DC on save', async () => {
    const user = userEvent.setup();
    const { onSaveDetails } = withDetails();
    await fillAddress(user, { State: 'district of columbia' });
    await user.click(screen.getByRole('button', SAVE));
    expect(onSaveDetails).toHaveBeenLastCalledWith(expect.objectContaining({ address: expect.objectContaining({ state: 'DC' }) }));
  });

  it('refuses a state that is not a code or a name, with the state message', async () => {
    const user = userEvent.setup();
    const { onSaveDetails } = withDetails();
    await fillAddress(user, { State: 'Narnia' });
    await user.click(screen.getByRole('button', SAVE));
    expect(onSaveDetails).not.toHaveBeenCalled();
    expect(screen.getByText('Please use the two-letter state code, for example NJ.')).toBeInTheDocument();
  });

  it('keeps Save details waiting until the profile has loaded, then saves', async () => {
    const user = userEvent.setup();
    const onSaveDetails = vi.fn().mockResolvedValue({ ok: true });
    const base = { senderName: 'Anna', error: null, onSignOut: vi.fn(), onSaveDetails };
    const { rerender } = render(<AccountSection {...base} profileLoaded={false} />);
    expect(screen.getByRole('button', SAVE)).toHaveAttribute('aria-disabled', 'true');
    await user.click(screen.getByRole('button', SAVE));
    expect(onSaveDetails).not.toHaveBeenCalled();
    rerender(<AccountSection {...base} profileLoaded firstName="Anna" birthDate="1980-05-29" address={address} />);
    expect(screen.getByRole('button', SAVE)).not.toHaveAttribute('aria-disabled', 'true');
    await user.click(screen.getByRole('button', SAVE));
    expect(onSaveDetails).toHaveBeenCalledWith(expect.objectContaining({ birthDate: '1980-05-29', address }));
  });

  it('shows Loading your details while waiting, and no stale status', () => {
    withDetails({ profileLoaded: false });
    expect(screen.getAllByRole('status')[0]).toHaveTextContent('Loading your details.');
    expect(screen.getByRole('button', SAVE)).toHaveAttribute('aria-disabled', 'true');
  });

  it('clears the check-the-fields line once the only invalid field is fixed', async () => {
    const user = userEvent.setup();
    withDetails({ senderName: null });
    await user.click(screen.getByRole('button', SAVE));
    expect(screen.getAllByRole('status')[0]).toHaveTextContent('Please check the fields');
    await user.type(screen.getByLabelText('First name'), 'A');
    expect(screen.getAllByRole('status')[0]).toBeEmptyDOMElement();
  });

  it('says Saving in the status line while the save runs', async () => {
    const user = userEvent.setup();
    let finish: (r: { ok: true }) => void = () => undefined;
    withDetails({ onSaveDetails: vi.fn((): Promise<{ ok: true }> => new Promise((resolve) => { finish = resolve; })) });
    await user.click(screen.getByRole('button', SAVE));
    expect(screen.getAllByRole('status')[0]).toHaveTextContent('Saving…');
    await act(async () => finish({ ok: true }));
    expect(await screen.findByText('Your details are saved.')).toBeInTheDocument();
  });

  it('refuses a bad ZIP and a bad state, then clears the message when the field is edited', async () => {
    const user = userEvent.setup();
    const { onSaveDetails } = withDetails();
    await fillAddress(user, { State: 'N', 'ZIP code': '123' });
    await user.click(screen.getByRole('button', SAVE));
    expect(onSaveDetails).not.toHaveBeenCalled();
    expect(screen.getByText('Please enter a ZIP code like 07001 or 07001-1234.')).toBeInTheDocument();
    expect(screen.getByText('Please use the two-letter state code, for example NJ.')).toBeInTheDocument();
    expect(screen.getByLabelText('ZIP code')).toBeInvalid();
    expect(screen.getByLabelText('State')).toBeInvalid();
    await user.type(screen.getByLabelText('ZIP code'), '45');
    expect(screen.queryByText('Please enter a ZIP code like 07001 or 07001-1234.')).not.toBeInTheDocument();
    expect(screen.getByLabelText('ZIP code')).not.toHaveAttribute('aria-invalid');
  });

  it('refuses a date with no year, with calm copy next to the field, and does not save', async () => {
    const user = userEvent.setup();
    const { onSaveDetails } = withDetails();
    await user.type(screen.getByLabelText('Date of birth'), 'May 29');
    await user.click(screen.getByRole('button', SAVE));
    expect(onSaveDetails).not.toHaveBeenCalled();
    expect(screen.getByRole('alert')).toHaveTextContent('Please enter the whole date, with the year. For example, May 29, 1980.');
    expect(screen.getByLabelText('Date of birth')).toBeInvalid();
    expect(screen.getByLabelText('Date of birth')).toHaveAccessibleDescription(/whole date/);
  });

  it('refuses a future date and a date before 1900', async () => {
    const user = userEvent.setup();
    const { onSaveDetails } = withDetails();
    await user.type(screen.getByLabelText('Date of birth'), 'January 1, 2999');
    await user.click(screen.getByRole('button', SAVE));
    expect(screen.getByText("Please check the date. It can't be in the future or before 1900.")).toBeInTheDocument();
    await user.clear(screen.getByLabelText('Date of birth'));
    await user.type(screen.getByLabelText('Date of birth'), 'January 1, 1850');
    await user.click(screen.getByRole('button', SAVE));
    expect(screen.getByText("Please check the date. It can't be in the future or before 1900.")).toBeInTheDocument();
    expect(onSaveDetails).not.toHaveBeenCalled();
  });

  it('refuses a name over 100 characters and one with a hidden character', async () => {
    const user = userEvent.setup();
    const { onSaveDetails } = withDetails({ senderName: null });
    await user.click(screen.getByLabelText('First name'));
    await user.paste('a'.repeat(101));
    await user.click(screen.getByRole('button', SAVE));
    expect(screen.getByText('That is too long. Please shorten it.')).toBeInTheDocument();
    expect(screen.getByLabelText('First name')).toBeInvalid();
    await user.clear(screen.getByLabelText('First name'));
    await user.paste('Anna\u0001x');
    await user.click(screen.getByRole('button', SAVE));
    expect(screen.getByText('Please enter this on one line, with no hidden characters.')).toBeInTheDocument();
    expect(onSaveDetails).not.toHaveBeenCalled();
  });

  it('maps a server refusal to calm copy and keeps what was typed', async () => {
    const user = userEvent.setup();
    withDetails({ senderName: null, onSaveDetails: vi.fn().mockResolvedValue({ ok: false, invalid: true }) });
    await user.type(screen.getByLabelText('First name'), 'Anna');
    await user.click(screen.getByRole('button', SAVE));
    expect(await screen.findByText(/We couldn't save that/)).toBeInTheDocument();
    expect(screen.getByLabelText('First name')).toHaveValue('Anna');
    expect(screen.queryByText('Your details are saved.')).not.toBeInTheDocument();
  });

  it('shows the general error only after its own save fails, and keeps what was typed', async () => {
    const user = userEvent.setup();
    withDetails({ senderName: null, error: 'We cannot reach you.', onSaveDetails: vi.fn().mockResolvedValue({ ok: false, invalid: false }) });
    expect(screen.queryByText('We cannot reach you.')).not.toBeInTheDocument();
    await user.type(screen.getByLabelText('First name'), 'Anna');
    await user.click(screen.getByRole('button', SAVE));
    expect(await screen.findAllByText('We cannot reach you.')).toHaveLength(1);
    expect(screen.getByLabelText('First name')).toHaveValue('Anna');
    expect(screen.getByLabelText('First name')).not.toHaveAttribute('aria-invalid');
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

  it('downloads a copy of the plans, with no device removal', async () => {
    const user = userEvent.setup();
    const create = vi.fn().mockReturnValue('blob:plans');
    const revoke = vi.fn();
    Object.assign(URL, { createObjectURL: create, revokeObjectURL: revoke });
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);
    render(
      <AccountSection
        senderName="Anna"
        error={null}
        onSaveDetails={vi.fn()}
        onSignOut={vi.fn()}
        plans={[{ personName: 'Sam', obituaryText: 'A kind man.' }]}
        settings={{}}
      />,
    );
    const panel = screen.getByRole('region', { name: 'Your plans' });
    expect(within(panel).getByRole('heading', { level: 2, name: 'Your plans' })).toBeInTheDocument();
    const download = within(panel).getByRole('button', { name: 'Download a copy' });
    expect(screen.queryByRole('button', { name: 'Remove everything from this device' })).not.toBeInTheDocument();

    await user.click(download);
    expect(create).toHaveBeenCalledTimes(1);
    expect(await readBlob(create.mock.calls[0][0] as Blob)).toContain('A kind man.');
    expect(click).toHaveBeenCalledTimes(1);
    expect(await screen.findByText('A copy was made. Check your downloads.')).toBeInTheDocument();
  });

  it('clears the download note after about ten seconds', async () => {
    vi.useFakeTimers();
    try {
      Object.assign(URL, { createObjectURL: vi.fn().mockReturnValue('blob:x'), revokeObjectURL: vi.fn() });
      vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);
      render(<AccountSection senderName="Anna" error={null} onSaveDetails={vi.fn()} onSignOut={vi.fn()} plans={[{ personName: 'Sam' }]} />);
      fireEvent.click(screen.getByRole('button', { name: 'Download a copy' }));
      act(() => {
        vi.advanceTimersByTime(100);
      });
      expect(screen.getByText('A copy was made. Check your downloads.')).toBeInTheDocument();
      act(() => {
        vi.advanceTimersByTime(10000);
      });
      expect(screen.queryByText('A copy was made. Check your downloads.')).not.toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });

  it('says contacts, not drafts, are left out of the copy', () => {
    render(<AccountSection senderName="Anna" error={null} onSaveDetails={vi.fn()} onSignOut={vi.fn()} plans={[{ personName: 'Sam' }]} />);
    expect(screen.getByText(/Contacts are not in it\./)).toBeInTheDocument();
    expect(screen.queryByText(/drafts/)).not.toBeInTheDocument();
  });

  it('says there is nothing to save, and offers no download, when there are no people', () => {
    render(<AccountSection senderName="Anna" error={null} onSaveDetails={vi.fn()} onSignOut={vi.fn()} plans={[]} />);
    expect(screen.getByText('There is nothing to save yet.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Download a copy' })).not.toBeInTheDocument();
  });

  it('shows no plans panel when no plans are given', () => {
    profile();
    expect(screen.queryByRole('heading', { name: 'Your plans' })).not.toBeInTheDocument();
  });

  it('shows the remove-a-member content once, in its own panel, and has no remove-everything control', () => {
    render(
      <AccountSection
        senderName="Anna"
        error={null}
        onSaveDetails={vi.fn()}
        onSignOut={vi.fn()}
        plans={[{ personName: 'Sam' }]}
        peopleHelping={<h2>People helping you</h2>}
        settings={{ removeMember: <h3>People helping you</h3> }}
      />,
    );
    const headings = screen.getAllByRole('heading', { name: 'People helping you' });
    expect(headings.map((h) => h.tagName)).toEqual(['H2', 'H3']);
    expect(headings[1].parentElement).toHaveClass('gg-panel');
    expect(screen.queryByRole('heading', { name: 'Remove everything from this device' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Remove everything/ })).not.toBeInTheDocument();
  });
});

describe('AccountSection phone and support panels', () => {
  it('orders every panel: Profile, security, plans, phone, payments, people, support, sign out', () => {
    render(
      <AccountSection
        senderName="Anna"
        error={null}
        onSaveDetails={vi.fn()}
        onSignOut={vi.fn()}
        email="anna@example.com"
        onManageSignIn={vi.fn()}
        plans={[]}
        peopleHelping={<h2>People helping you</h2>}
      />,
    );
    const names = screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent);
    expect(names).toEqual([
      'Profile',
      'Sign-in and security',
      'Your plans',
      'On your phone',
      'Payments',
      'People helping you',
      'Help and support',
      'Sign out',
    ]);
  });

  it('lists the ready sections from any person, with no counts, and says the app is not in the stores', () => {
    render(
      <AccountSection
        senderName="Anna"
        error={null}
        onSaveDetails={vi.fn()}
        onSignOut={vi.fn()}
        plans={[
          { personName: 'Sam', sectionStatus: { announcement: 'ready', person: 'ready' } },
          { personName: 'Lee', sectionStatus: { thanks: 'ready', service: 'in_progress' } },
        ]}
      />,
    );
    const panel = screen.getByRole('region', { name: 'On your phone' });
    const items = within(panel).getAllByRole('listitem').map((li) => li.textContent);
    expect(items).toEqual([
      'Announcement Tell close family and friends, one at a time from your phone.',
      'Thank-yous Thank the people who helped, one at a time.',
    ]);
    expect(within(panel).getByText('Sending happens in the Grievers Guidance phone app, not on this page.')).toBeInTheDocument();
    expect(within(panel).getByText('The app is not in the app stores yet.')).toBeInTheDocument();
    expect(within(panel).queryByRole('link')).not.toBeInTheDocument();
    expect(within(panel).queryByRole('img')).not.toBeInTheDocument();
  });

  it('says nothing is ready when no phone section is ready', () => {
    profile();
    const panel = screen.getByRole('region', { name: 'On your phone' });
    expect(within(panel).queryByRole('list')).not.toBeInTheDocument();
    expect(within(panel).getByText(/Nothing is marked ready yet/)).toBeInTheDocument();
  });

  it('links Help and support to the support address with mailto', () => {
    profile();
    const panel = screen.getByRole('region', { name: 'Help and support' });
    const link = within(panel).getByRole('link', { name: 'grieversguidancetech@gmail.com' });
    expect(link.getAttribute('href')).toMatch(/^mailto:grieversguidancetech@gmail\.com\?subject=/);
    expect(link.className).toContain('min-h-[44px]');
    expect(link.className).toContain('[overflow-wrap:anywhere]');
    expect(link.className).not.toContain('break-all');
  });
});

describe('Delete account panel', () => {
  const deleteStatus = () => within(screen.getByRole('region', { name: 'Delete account' })).getByRole('status');

  it('is not shown without a delete handler', () => {
    profile();
    expect(screen.queryByRole('heading', { name: 'Delete account' })).not.toBeInTheDocument();
  });

  it('idle: explains what is deleted, sits after Sign out, and does not delete', () => {
    const onDeleteAccount = vi.fn();
    profile({ onDeleteAccount });
    const headings = screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent);
    expect(headings.indexOf('Delete account')).toBe(headings.indexOf('Sign out') + 1);
    expect(screen.getByText(/every person and plan, and the messages they wrote/)).toBeInTheDocument();
    expect(screen.getByText(/People helping you lose access/)).toBeInTheDocument();
    expect(screen.getByText(/It cannot be undone/)).toBeInTheDocument();
    expect(onDeleteAccount).not.toHaveBeenCalled();
  });

  it('confirm: opening moves focus into the confirm and does not delete', async () => {
    const user = userEvent.setup();
    const onDeleteAccount = vi.fn();
    profile({ onDeleteAccount });
    await user.click(screen.getByRole('button', { name: 'Delete my account' }));
    expect(screen.getByRole('heading', { name: 'Delete your account for good?' })).toHaveFocus();
    expect(screen.getByRole('button', { name: 'Yes, delete my account' })).toBeInTheDocument();
    expect(onDeleteAccount).not.toHaveBeenCalled();
  });

  it('puts Cancel before the delete button in the DOM', async () => {
    const user = userEvent.setup();
    profile({ onDeleteAccount: vi.fn() });
    await user.click(screen.getByRole('button', { name: 'Delete my account' }));
    const names = screen.getAllByRole('button').map((b) => b.textContent);
    expect(names.indexOf('Cancel')).toBeGreaterThanOrEqual(0);
    expect(names.indexOf('Cancel')).toBeLessThan(names.indexOf('Yes, delete my account'));
  });

  it('Cancel returns focus to the opener and still does not delete', async () => {
    const user = userEvent.setup();
    const onDeleteAccount = vi.fn();
    profile({ onDeleteAccount });
    await user.click(screen.getByRole('button', { name: 'Delete my account' }));
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.getByRole('button', { name: 'Delete my account' })).toHaveFocus();
    expect(onDeleteAccount).not.toHaveBeenCalled();
  });

  it('deleting: shows progress and ignores a second press, then calls the handler once', async () => {
    const user = userEvent.setup();
    let finish: () => void = () => undefined;
    const onDeleteAccount = vi.fn(() => new Promise<void>((resolve) => (finish = resolve)));
    profile({ onDeleteAccount });
    await user.click(screen.getByRole('button', { name: 'Delete my account' }));
    await user.click(screen.getByRole('button', { name: 'Yes, delete my account' }));
    const busy = screen.getByRole('button', { name: 'Yes, delete my account' });
    expect(busy).toHaveAttribute('aria-disabled', 'true');
    expect(busy).toHaveClass('!opacity-100');
    expect(deleteStatus()).toHaveTextContent('Deleting your account…');
    await user.click(busy);
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onDeleteAccount).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('heading', { name: 'Delete your account for good?' })).toBeInTheDocument();
    await act(async () => finish());
  });

  it('failed: shows a calm error, keeps the confirm open, and can try again', async () => {
    const user = userEvent.setup();
    const onDeleteAccount = vi.fn().mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce(undefined);
    profile({ onDeleteAccount });
    await user.click(screen.getByRole('button', { name: 'Delete my account' }));
    await user.click(screen.getByRole('button', { name: 'Yes, delete my account' }));
    await waitFor(() => expect(deleteStatus()).toHaveTextContent('We could not finish deleting your account. Please try again, or write to us for help.'));
    expect(deleteStatus()).not.toHaveTextContent('!');
    expect(screen.getByRole('button', { name: 'Yes, delete my account' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Yes, delete my account' }));
    await waitFor(() => expect(onDeleteAccount).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(screen.queryByText(/We could not finish deleting/)).not.toBeInTheDocument());
  });

  it('cancelled verification: calm not-deleted line, focus back on the confirm step, can try again', async () => {
    const user = userEvent.setup();
    const onDeleteAccount = vi.fn().mockRejectedValueOnce(new DeleteCancelledError()).mockResolvedValueOnce(undefined);
    profile({ onDeleteAccount });
    await user.click(screen.getByRole('button', { name: 'Delete my account' }));
    await user.click(screen.getByRole('button', { name: 'Yes, delete my account' }));
    await waitFor(() => expect(deleteStatus()).toHaveTextContent('Your account was not deleted.'));
    expect(deleteStatus()).not.toHaveTextContent('We could not finish');
    expect(screen.getByRole('heading', { name: 'Delete your account for good?' })).toHaveFocus();
    await user.click(screen.getByRole('button', { name: 'Yes, delete my account' }));
    await waitFor(() => expect(onDeleteAccount).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(screen.queryByText('Your account was not deleted.')).not.toBeInTheDocument());
  });

  it('failed: focus returns to the confirm step', async () => {
    const user = userEvent.setup();
    profile({ onDeleteAccount: vi.fn().mockRejectedValue(new Error('offline')) });
    await user.click(screen.getByRole('button', { name: 'Delete my account' }));
    await user.click(screen.getByRole('button', { name: 'Yes, delete my account' }));
    await waitFor(() => expect(deleteStatus()).toHaveTextContent('We could not finish deleting'));
    expect(screen.getByRole('heading', { name: 'Delete your account for good?' })).toHaveFocus();
  });
});
