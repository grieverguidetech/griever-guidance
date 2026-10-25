/** #194: every screen with a "What you'll need" button opens the one shared sheet, in place. */
import type { ReactElement } from 'react';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { accountStore } from '@griever/data-local';
import type { Session } from '@griever/hooks';
import { Gate } from './Gate';
import { Home } from './Home';
import { PathLanding } from './PathLanding';
import { SessionSetup } from './SessionSetup';
import { Settings } from './Settings';
import { ForgotPassword } from './ForgotPassword';

const session = {
  id: 's1',
  personName: 'Margaret Hale',
  senderName: 'Anna',
  drafts: {},
  recipientsNotified: {},
  momentCompletedAt: {},
  remindersScheduled: [],
} as unknown as Session;

const option = { label: 'x', description: 'y' } as never;

const screens: [string, () => ReactElement, string][] = [
  ['Home', () => <Home sessions={[]} onOpen={vi.fn()} onCreate={vi.fn()} canCreate checklistLink />, 'Who you\'re writing about'],
  ['SessionSetup', () => <SessionSetup session={session} editing={false} onChange={vi.fn()} onContinue={vi.fn()} onBack={vi.fn()} />, 'Who are we writing about?'],
  ['PathLanding', () => <PathLanding session={session} onBack={vi.fn()} onStartMoment={vi.fn()} onEditPerson={vi.fn()} />, 'One thing at a time.'],
  ['Settings', () => <Settings onBack={vi.fn()} onRemoveEverything={vi.fn()} />, 'Settings'],
  ['ForgotPassword', () => <ForgotPassword onBack={vi.fn()} onSubmit={vi.fn()} />, ''],
  ['Gate', () => <Gate title="Gate title" subtitle="s" notYet={option} ready={option} reassurance="r" onBack={vi.fn()} onChoose={vi.fn()} />, 'Gate title'],
];

describe('"What you\'ll need" opens the same sheet on every screen (#194)', () => {
  afterEach(async () => {
    cleanup();
    await accountStore.setChecklistTicks([]);
    document.body.style.overflow = '';
  });

  it.each(screens)('%s: top-bar button opens the sheet in place and Close returns focus', async (_name, ui, title) => {
    const user = userEvent.setup();
    render(ui());
    const buttons = screen.getAllByRole('button', { name: "What you'll need" });
    expect(buttons).toHaveLength(1);
    const trigger = buttons[0];
    expect(trigger).toHaveClass('gg-btn-bar');
    await user.click(trigger);
    expect(screen.getByRole('dialog', { name: "What you'll need" })).toBeInTheDocument();
    if (title) {
      expect(screen.getByRole('heading', { level: 1, name: title, hidden: true })).toBeInTheDocument();
    }
    await user.click(screen.getByRole('button', { name: 'Close' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(trigger).toHaveFocus();
  });
});
