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

  it('says what is happening on the servers, and nothing about leftovers when the clear worked', () => {
    render(<AccountDeleted />);
    expect(screen.getByText('What you saved is being removed from our servers.')).toBeInTheDocument();
    expect(screen.queryByText(/could not be removed from this device/)).not.toBeInTheDocument();
  });

  it('says some things stayed on this device when the clear failed', () => {
    render(<AccountDeleted cleared={false} />);
    expect(screen.getByText('Some things could not be removed from this device.')).toBeInTheDocument();
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
