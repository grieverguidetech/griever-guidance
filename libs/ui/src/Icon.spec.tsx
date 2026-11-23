import { render } from '@testing-library/react';
import { v2 } from '@griever/tokens';
import { Icon } from './Icon';

describe('Icon', () => {
  it('is hidden from assistive tech and not focusable', () => {
    const { container } = render(<Icon name="lock" color={v2.roles.muted} />);
    const svg = container.querySelector('svg');
    expect(svg).toHaveAttribute('aria-hidden', 'true');
    expect(svg).toHaveAttribute('focusable', 'false');
  });

  it('draws in the colour it is given and at the size it is given', () => {
    const { container } = render(<Icon name="lock" size={24} color={v2.roles.muted} />);
    const svg = container.querySelector('svg');
    expect(svg).toHaveAttribute('width', '24');
    expect(container.querySelector('path')).toHaveAttribute('stroke', v2.roles.muted);
  });
});
