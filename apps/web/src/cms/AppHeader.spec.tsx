import { render, screen } from '@testing-library/react';
import { PRODUCT_NAME } from '@griever/shared';
import { AppHeader } from './AppHeader';

describe('AppHeader', () => {
  it('is a banner that shows only the product name', () => {
    render(<AppHeader />);
    const banner = screen.getByRole('banner');
    expect(banner).toHaveTextContent(PRODUCT_NAME);
    expect(banner.textContent).toBe(PRODUCT_NAME);
    expect(banner.querySelector('button, a, input')).toBeNull();
  });
});
