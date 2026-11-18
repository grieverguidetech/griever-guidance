import { render, screen } from '@testing-library/react';
import { ObituaryScreen } from './ObituaryScreen';

describe('ObituaryScreen date fields', () => {
  it('gives each calendar button its own field name', () => {
    render(<ObituaryScreen session={null} onBack={() => undefined} onDone={() => undefined} />);
    expect(screen.getByRole('button', { name: /^Date of birth.* Choose date from calendar$/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^Date of passing.* Choose date from calendar$/ })).toBeInTheDocument();
  });
});
