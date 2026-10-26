import { render, screen } from '@testing-library/react';
import { Button, Heading } from '@griever/ui';

/**
 * libs/ui is written for React Native. These checks prove it renders through react-native-web in
 * the web app (the Vite alias), with the same roles the web screens expose.
 */
describe('shared UI on web', () => {
  it('renders a Heading as a real h1', () => {
    render(<Heading level={1}>One thing at a time.</Heading>);
    expect(screen.getByRole('heading', { level: 1, name: 'One thing at a time.' }).tagName).toBe('H1');
  });

  it('renders a Button as a real button', () => {
    render(<Button label="Start" onPress={() => undefined} />);
    expect(screen.getByRole('button', { name: 'Start' }).tagName).toBe('BUTTON');
  });
});
