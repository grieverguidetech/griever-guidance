/**
 * #79: typing a service date character by character must never delete the
 * saved contacts. A half-typed date ("May 2") used to parse as 2001, which
 * looked 30+ days past and wiped the list. Real App, real hooks, in-memory
 * IndexedDB; nothing talks to the gateway.
 */
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { contactStore } from '@griever/data-local';
import { App } from './app';

type User = ReturnType<typeof userEvent.setup>;

async function addContact(user: User, name: string, phone: string) {
  await user.type(screen.getByLabelText('Name'), name);
  await user.type(screen.getByLabelText('Mobile number'), phone);
  await user.click(screen.getByRole('button', { name: 'Add and start another' }));
}

async function reachServiceDateField(user: User) {
  await addContact(user, 'Aunt Carol', '6175550148');
  await screen.findByText('Added so far — 1');
  await addContact(user, 'Uncle Joe', '6175550199');
  await screen.findByText('Added so far — 2');
  await user.click(screen.getByRole('button', { name: 'Done for now' }));
  await user.click(screen.getByRole('button', { name: 'Save and continue' }));
  await user.type(screen.getByLabelText('Their name'), 'Margaret Hayes');
  await user.click(screen.getByRole('button', { name: 'Continue' }));
  await screen.findByRole('heading', { name: 'One thing at a time.' });
  await user.click(screen.getByRole('button', { name: 'Start' }));
  await user.click(await screen.findByRole('button', { name: 'Continue' }));
  await user.click(await screen.findByRole('button', { name: /Yes, I have them/ }));
  await user.click(screen.getByRole('button', { name: 'Continue' }));
  return screen.findByLabelText('Service date');
}

describe('contact retention while a service date is being typed (#79)', () => {
  // A future date, so the finished value itself is not past retention.
  it.each(['May 29, 2099', '5/29/2099'])(
    'keeps every saved contact at every keystroke of %s',
    async (date) => {
      const user = userEvent.setup();
      render(<App />);
      const field = await reachServiceDateField(user);
      expect(await contactStore.list()).toHaveLength(2);

      for (const char of date) {
        await user.type(field, char);
        // Let the retention effect (and any clearAll it triggers) settle.
        await act(async () => {
          await new Promise((resolve) => setTimeout(resolve, 0));
        });
        expect(await contactStore.list(), `after typing ${JSON.stringify(char)} (value ${(field as HTMLInputElement).value})`).toHaveLength(2);
      }

      await waitFor(() => expect(field).toHaveValue(date));
      expect(await contactStore.list()).toHaveLength(2);
    },
  );
});
