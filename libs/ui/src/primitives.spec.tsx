import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Body, Card, Eyebrow, Row } from './index';

describe('Eyebrow and Body', () => {
  it('show their words', () => {
    render(
      <>
        <Eyebrow>For Margaret</Eyebrow>
        <Body>Here is the plan.</Body>
      </>,
    );
    expect(screen.getByText('For Margaret')).toBeInTheDocument();
    expect(screen.getByText('Here is the plan.')).toBeInTheDocument();
  });

  it('Body can carry an id for aria-describedby and be hidden from assistive tech', () => {
    render(
      <Body id="why" hidden>
        Because.
      </Body>,
    );
    const text = screen.getByText('Because.', { ignore: '' });
    expect(text).toHaveAttribute('id', 'why');
    expect(text).toHaveAttribute('aria-hidden', 'true');
  });
});

describe('Card', () => {
  it('holds its children and is not itself a button', () => {
    render(
      <Card selected>
        <Body>Inside</Body>
      </Card>,
    );
    expect(screen.getByText('Inside')).toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });
});

describe('Row', () => {
  it('is a button named by its text, and calls onPress', async () => {
    const onPress = vi.fn();
    render(
      <Row onPress={onPress}>
        <Body>Share the service</Body>
      </Row>,
    );
    const row = screen.getByRole('button', { name: 'Share the service' });
    expect(row).not.toHaveAttribute('aria-disabled');
    await userEvent.click(row);
    expect(onPress).toHaveBeenCalledOnce();
  });

  it('when aria-disabled stays focusable and still calls onPress', async () => {
    const onPress = vi.fn();
    render(
      <Row onPress={onPress} ariaDisabled>
        <Body>Locked</Body>
      </Row>,
    );
    const row = screen.getByRole('button', { name: 'Locked' });
    expect(row).toHaveAttribute('aria-disabled', 'true');
    await userEvent.tab();
    expect(row).toHaveFocus();
    await userEvent.keyboard('{Enter}');
    expect(onPress).toHaveBeenCalledOnce();
  });
});
