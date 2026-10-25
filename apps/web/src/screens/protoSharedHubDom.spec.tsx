// PROTOTYPE #322: prints the DOM react-native-web makes for the shared hub. Throwaway.
import { writeFileSync } from 'node:fs';
import { render } from '@testing-library/react';
import type { Session } from '@griever/hooks';
import { PathLanding } from './PathLanding';

const session: Session = {
  id: 's1', flowId: '11111111-1111-4111-8111-111111111111', ownerId: null, role: 'owner',
  createdAt: '2026-05-30T00:00:00.000Z', lastOpenedAt: '2026-05-30T00:00:00.000Z',
  personName: 'Margaret Hale', dateOfPassing: '2026-05-29', senderName: 'Anna', obituaryUrl: '',
  drafts: {}, serviceReady: false, recipientsNotified: {}, momentCompletedAt: {}, remindersScheduled: [],
};

describe('PROTOTYPE shared hub DOM', () => {
  it('dumps the DOM', () => {
    const { container } = render(
      <PathLanding session={session} onBack={() => undefined} onStartMoment={() => undefined} onEditPerson={() => undefined} paymentsEnabled />,
    );
    const summary = [...container.querySelectorAll('h1,h2,button,[role],[tabindex],[aria-disabled],[aria-describedby]')].map((el) => {
      const attrs = ['role', 'tabindex', 'type', 'aria-level', 'aria-disabled', 'aria-describedby', 'aria-haspopup', 'aria-hidden', 'id']
        .filter((a) => el.hasAttribute(a))
        .map((a) => `${a}=${el.getAttribute(a)}`)
        .join(' ');
      return `<${el.tagName.toLowerCase()} ${attrs}> ${(el.textContent ?? '').slice(0, 40)}`;
    });
    writeFileSync(
      '/private/tmp/claude-501/-Users-petertumulty-Documents-Sites-griever-guidance/d506bc60-9fd0-47ea-91de-011f43cbfb73/scratchpad/proto-dom.txt',
      summary.join('\n'),
    );
    expect(container.querySelector('h1')).not.toBeNull();
  });
});
