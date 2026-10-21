import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { freshDraft, useSendFlow } from '@griever/hooks';
import type { SessionDetails } from '@griever/shared';
import { DetailsForm } from './DetailsForm';

const session = {
  personName: 'Margaret Hayes',
  dateOfPassing: 'May 29, 2026',
  senderName: 'Peter',
  obituaryUrl: '',
  obituaryPublisher: '',
  serviceDate: '',
} as SessionDetails;

function Harness() {
  const flow = useSendFlow({
    session,
    draft: freshDraft({
      templateCategory: 'service',
      templateOverrideId: 'share-service',
      step: 'details',
    }),
  });
  return (
    <>
      <DetailsForm flow={flow} />
      <output aria-label="message">{flow.composedMessage}</output>
    </>
  );
}

describe('Service place field', () => {
  it('is a plain text field: typing shows no suggestions and the typed place reaches the message', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    const place = document.getElementById('field-serviceLocation') as HTMLInputElement;
    expect(place).toHaveAttribute('type', 'text');
    await user.click(place);
    await user.type(place, 'River');
    expect(place).toHaveValue('River');
    expect(screen.queryByRole('button', { name: /Chapel|Funeral Home|Church/ })).not.toBeInTheDocument();
    expect(screen.queryByText(/Google Maps/)).not.toBeInTheDocument();
    expect(screen.getByLabelText('message')).toHaveTextContent('River');
  });
});
