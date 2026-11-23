import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ObituaryScreen } from './ObituaryScreen';

const mocks = vi.hoisted(() => ({ generateObituary: vi.fn() }));
vi.mock('../lib/features', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../lib/features')>();
  return { ...actual, OBITUARY_DRAFTING_ENABLED: true };
});
vi.mock('@griever/api-client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@griever/api-client')>();
  return { ...actual, generateObituary: mocks.generateObituary };
});

describe('ObituaryScreen date fields', () => {
  it('gives each calendar button its own field name', () => {
    render(<ObituaryScreen session={null} onBack={() => undefined} onDone={() => undefined} />);
    expect(screen.getByRole('button', { name: /^Date of birth.* Choose date from calendar$/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^Date of passing.* Choose date from calendar$/ })).toBeInTheDocument();
  });
});

describe('ObituaryScreen tiers', () => {
  it('makes "Write the obituary" the primary action', () => {
    render(<ObituaryScreen session={null} onBack={() => undefined} onDone={() => undefined} />);
    expect(screen.getByRole('button', { name: 'Write the obituary' })).toHaveClass('gg-btn-primary');
  });
});

describe('ObituaryScreen error', () => {
  it('announces a failed draft as an alert in the error colour, and shows none before', async () => {
    mocks.generateObituary.mockRejectedValue(new Error('nope'));
    render(<ObituaryScreen session={null} onBack={() => undefined} onDone={() => undefined} />);
    expect(screen.queryByRole('alert')).toBeNull();
    await userEvent.type(screen.getByPlaceholderText('e.g. Margaret Ellen Hayes'), 'Ann Lee');
    await userEvent.type(screen.getByLabelText(/Date of birth/, { selector: 'input' }), 'May 2, 1940');
    await userEvent.click(screen.getByRole('button', { name: 'Write the obituary' }));
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Something went wrong. Please try again.');
    expect(alert).toHaveStyle({ color: 'var(--color-v2-error)' });
  });
});
