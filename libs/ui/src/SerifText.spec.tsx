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
    expect(getComputedStyle(screen.getByText('Plain')).fontFamily).toContain('var(--font-v2-body)');
    expect(getComputedStyle(screen.getByLabelText('Name')).fontFamily).toContain('var(--font-v2-body)');
  });

  it('uses the emphasis weight (600) when the caller asks for bold', () => {
    render(<SerifText style={{ fontWeight: 'bold' }}>Strong</SerifText>);
    expect(getComputedStyle(screen.getByText('Strong')).fontWeight).toBe('600');
  });
});
