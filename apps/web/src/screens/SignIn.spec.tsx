import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';

const mocks = vi.hoisted(() => ({ props: null as null | Record<string, unknown> }));

vi.mock('@clerk/react', () => ({
  SignIn: (props: Record<string, unknown>) => {
    mocks.props = props;
    return <div data-testid="clerk-sign-in" />;
  },
}));

import { SignInScreen } from './SignIn';

describe('SignInScreen', () => {
  it('shows one heading and Clerk sign-in with sign-up on the same screen, on path routing under /sign-in', () => {
    render(
      <MemoryRouter initialEntries={['/sign-in/factor-one']}>
        <SignInScreen />
      </MemoryRouter>,
    );
    expect(screen.getByRole('heading', { level: 1, name: 'Grievers Guidance' })).toBeInTheDocument();
    expect(screen.getByTestId('clerk-sign-in')).toBeInTheDocument();
    expect(mocks.props).toMatchObject({ withSignUp: true, routing: 'path', path: '/sign-in' });
  });

  it('keeps hash routing on /join, which stays public (#851)', () => {
    render(
      <MemoryRouter initialEntries={['/join']}>
        <SignInScreen />
      </MemoryRouter>,
    );
    expect(mocks.props).toMatchObject({ withSignUp: true, routing: 'hash' });
    expect(mocks.props).not.toHaveProperty('path');
  });

  it('uses calm copy: no exclamation points (C7)', () => {
    const { container } = render(<SignInScreen />, { wrapper: MemoryRouter });
    expect(container.textContent).not.toContain('!');
  });
});
