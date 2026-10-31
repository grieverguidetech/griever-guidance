import { render, screen } from '@testing-library/react';
import { Settings, SettingsBody } from './Settings';

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
