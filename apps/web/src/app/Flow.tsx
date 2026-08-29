import { useSendFlow } from '@griever/hooks';
import type { SendFlowDraft } from '@griever/hooks';
import type { SessionDetails } from '@griever/shared';
import { TemplatePicker } from '../screens/TemplatePicker';
import { AnnounceForm } from '../screens/AnnounceForm';
import { ServiceKnownScreen } from '../screens/ServiceKnownScreen';
import { DetailsForm } from '../screens/DetailsForm';
import { ContactSelector } from '../screens/ContactSelector';
import { ConfirmScreen } from '../screens/ConfirmScreen';
import { SendingScreen } from '../screens/SendingScreen';
import { SentScreen } from '../screens/SentScreen';

interface Props {
  session: SessionDetails;
  draft: SendFlowDraft | null;
  onDraftChange: (draft: SendFlowDraft) => void;
  onExitToLanding: () => void;
  onEditSession: () => void;
  onViewHistory: () => void;
}

export function Flow({
  session,
  draft,
  onDraftChange,
  onExitToLanding,
  onEditSession,
  onViewHistory,
}: Props) {
  const flow = useSendFlow({ session, draft, onDraftChange });
  const grouped = flow.templateCategory === 'announcement';

  switch (flow.step) {
    case 'template':
      return (
        <TemplatePicker
          flow={flow}
          onBack={onExitToLanding}
          onEditPerson={onEditSession}
        />
      );
    case 'announce':
      return <AnnounceForm flow={flow} onEditSession={onEditSession} />;
    case 'serviceKnown':
      return <ServiceKnownScreen flow={flow} />;
    case 'details':
      return <DetailsForm flow={flow} />;
    case 'contacts':
      return <ContactSelector flow={flow} grouped={grouped} />;
    case 'review':
      return <ConfirmScreen flow={flow} />;
    case 'sending':
      return <SendingScreen flow={flow} />;
    case 'sent':
      return <SentScreen flow={flow} onViewHistory={onViewHistory} />;
    default:
      return null;
  }
}
