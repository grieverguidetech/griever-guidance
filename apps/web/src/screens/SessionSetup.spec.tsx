import { render, screen } from '@testing-library/react';
import type { Session } from '@griever/hooks';
import { SessionSetup } from './SessionSetup';

describe('SessionSetup date field', () => {
  it('names the calendar button by the date field', () => {
    render(
      <SessionSetup
        session={{ personName: '', dateOfPassing: '' } as Session}
        editing={false}
        onChange={() => undefined}
        onContinue={() => undefined}
        onBack={() => undefined}
      />,
    );
    expect(screen.getByRole('button', { name: /^Date they passed.* Choose date from calendar$/ })).toBeInTheDocument();
  });
});
