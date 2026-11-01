import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AccountDeleted } from './AccountDeleted';

describe('AccountDeleted', () => {
  it('done: focuses its heading and says it calmly', () => {
    render(<AccountDeleted />);
    const heading = screen.getByRole('heading', { level: 1, name: 'Your account is deleted' });
    expect(heading).toHaveFocus();
    expect(document.body.textContent).not.toContain('!');
  });

  it('offers a way back to the start', async () => {
    const assign = vi.fn();
    vi.stubGlobal('location', { ...window.location, assign });
    render(<AccountDeleted />);
    await userEvent.setup().click(screen.getByRole('button', { name: 'Back to the start' }));
    expect(assign).toHaveBeenCalledWith('/');
    vi.unstubAllGlobals();
  });
});
