import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Settings, SettingsBody } from './Settings';

describe('Settings confirm step', () => {
  it('makes Keep everything the primary first button and Remove everything the secondary one', async () => {
    const user = userEvent.setup();
    render(<Settings onBack={vi.fn()} onRemoveEverything={vi.fn()} />);
    await user.click(screen.getByRole('button', { name: 'Remove everything from this device' }));
    const keep = screen.getByRole('button', { name: 'Keep everything' });
    const remove = screen.getByRole('button', { name: 'Remove everything' });
    expect(keep).toHaveClass('gg-btn-primary');
    expect(remove).toHaveClass('gg-btn-secondary');
    expect(keep.compareDocumentPosition(remove) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });
});

describe('Settings heading levels', () => {
  it('the standalone screen keeps an h2 for the device removal', () => {
    render(<Settings onBack={vi.fn()} onRemoveEverything={vi.fn()} />);
    expect(screen.getByRole('heading', { level: 2, name: 'Remove everything from this device' })).toBeInTheDocument();
  });

  it('SettingsBody uses an h3 when asked, and an h2 by default', () => {
    const { rerender } = render(<SettingsBody onRemoveEverything={vi.fn()} headingLevel={3} />);
    expect(screen.getByRole('heading', { level: 3, name: 'Remove everything from this device' })).toBeInTheDocument();
    rerender(<SettingsBody onRemoveEverything={vi.fn()} />);
    expect(screen.getByRole('heading', { level: 2, name: 'Remove everything from this device' })).toBeInTheDocument();
  });
});
