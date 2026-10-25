import { render, screen } from '@testing-library/react';

const mocks = vi.hoisted(() => ({ props: null as null | Record<string, unknown> }));

vi.mock('@clerk/react', () => ({
  SignIn: (props: Record<string, unknown>) => {
    mocks.props = props;
    return <div data-testid="clerk-sign-in" />;
  },
}));

import { SignInScreen } from './SignIn';

describe('SignInScreen', () => {
  it('shows one heading and Clerk sign-in with sign-up on the same screen, on hash routing', () => {
    render(<SignInScreen />);
    expect(screen.getByRole('heading', { level: 1, name: 'Grievers Guidance' })).toBeInTheDocument();
    expect(screen.getByTestId('clerk-sign-in')).toBeInTheDocument();
    expect(mocks.props).toMatchObject({ withSignUp: true, routing: 'hash' });
  });

  it('uses calm copy: no exclamation points (C7)', () => {
    const { container } = render(<SignInScreen />);
    expect(container.textContent).not.toContain('!');
  });
});
