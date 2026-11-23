import { render, screen } from '@testing-library/react';
import { SerifText, SerifTextInput } from './SerifText';

describe('SerifText and SerifTextInput', () => {
  it('give a plain Text and a TextInput the serif', () => {
    render(
      <>
        <SerifText>Plain</SerifText>
        <SerifTextInput accessibilityLabel="Name" />
      </>,
    );
    expect(getComputedStyle(screen.getByText('Plain')).fontFamily).toContain('var(--font-v2)');
    expect(getComputedStyle(screen.getByLabelText('Name')).fontFamily).toContain('var(--font-v2)');
  });

  it('uses the medium weight (500) when the caller asks for bold', () => {
    render(<SerifText style={{ fontWeight: 'bold' }}>Strong</SerifText>);
    expect(getComputedStyle(screen.getByText('Strong')).fontWeight).toBe('500');
  });
});
