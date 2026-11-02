import { describe, expect, it, jest } from '@jest/globals';
import { useState } from 'react';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { screenCopy } from '@griever/copy';
import { Review } from './Review';

const copy = screenCopy('review');
const SUGGESTED = 'Anna has passed away.';

/** Holds the message the way the app does: edited when it differs from the suggested wording. */
function Harness() {
  const [override, setOverride] = useState<string | null>(null);
  const message = override ?? SUGGESTED;
  return (
    <Review
      copy={copy}
      kind="announcement"
      intro="This will go to 2 people."
      message={message}
      onMessageChange={setOverride}
      edited={override !== null}
      onUseSuggested={() => setOverride(null)}
      tone="plain"
      onToneChange={jest.fn()}
      sendLabel="Text 2 people"
      hasRecipients
      onBack={jest.fn()}
      onSend={jest.fn()}
    />
  );
}

describe('Review: Bring back my words (#654)', () => {
  it('is not shown before the suggested wording has been used', () => {
    render(<Harness />);
    expect(screen.queryByRole('button', { name: 'Bring back my words' })).toBeNull();
  });

  it('restores the last edit after "Use the suggested wording"', () => {
    render(<Harness />);
    fireEvent.press(screen.getByRole('button', { name: 'Edit wording' }));
    fireEvent.changeText(screen.getByLabelText('Your message'), 'My own words.');
    fireEvent.press(screen.getByRole('button', { name: 'Use the suggested wording' }));
    expect(screen.queryByText('My own words.')).toBeNull();
    fireEvent.press(screen.getByRole('button', { name: 'Bring back my words' }));
    expect(screen.getByLabelText('Your message').props.value).toBe('My own words.');
    expect(screen.queryByRole('button', { name: 'Bring back my words' })).toBeNull();
  });

  it('goes away at the next edit', () => {
    render(<Harness />);
    fireEvent.press(screen.getByRole('button', { name: 'Edit wording' }));
    fireEvent.changeText(screen.getByLabelText('Your message'), 'My own words.');
    fireEvent.press(screen.getByRole('button', { name: 'Use the suggested wording' }));
    expect(screen.getByRole('button', { name: 'Bring back my words' })).toBeTruthy();
    fireEvent.changeText(screen.getByLabelText('Your message'), 'Something new.');
    expect(screen.queryByRole('button', { name: 'Bring back my words' })).toBeNull();
  });
});
