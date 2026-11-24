import { describe, expect, it, jest } from '@jest/globals';
import { useEffect } from 'react';
import { render, screen, waitFor } from '@testing-library/react-native';
import { Text } from 'react-native';
import { freshDraft, useSendFlow } from '@griever/hooks';
import { SendingScreen } from './SendingScreen';
import { ReadyToSendScreen } from './ReadyToSendScreen';

// #1073: a screen with nothing to show must hand the person on, never sit blank with no way out.

const session = { personName: 'Anna', dateOfPassing: '', senderName: '', obituaryUrl: '', obituaryPublisher: '', serviceDate: '' } as never;

// The real flow stepped to 'sending' without a send job. A saved draft cannot come back like this (it resumes on
// Ready to send), so the test steps there by hand: the state a blank screen would need.
function SendingWithoutJob() {
  const flow = useSendFlow({ session, draft: freshDraft({ templateCategory: 'service', step: 'review', selectedContactIds: ['c1'] }) });
  const { nextStep } = flow;
  useEffect(() => {
    nextStep();
  }, [nextStep]);
  return (
    <>
      <Text testID="step">{flow.step}</Text>
      <SendingScreen flow={flow} contacts={{ contacts: [] } as never} />
    </>
  );
}

// The real flow on Ready to send with no moment chosen.
function ReadyWithoutMoment({ onLeave }: { onLeave: () => void }) {
  const flow = useSendFlow({ session, draft: freshDraft({ templateCategory: null, step: 'review' }) });
  return <ReadyToSendScreen flow={flow} contacts={{ contacts: [] } as never} onChoosePeople={() => undefined} onGotIt={onLeave} />;
}

describe('screens with nothing to show leave instead of staying blank (#1073)', () => {
  it('Sending with no send job steps back to Ready to send', async () => {
    render(<SendingWithoutJob />);
    await waitFor(() => expect(screen.getByTestId('step').props.children).toBe('review'));
  });

  it('Ready to send with no moment chosen goes to the hub', () => {
    const onLeave = jest.fn();
    render(<ReadyWithoutMoment onLeave={onLeave} />);
    expect(onLeave).toHaveBeenCalled();
  });
});
