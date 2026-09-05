import { useSendFlow } from '@griever/hooks';
import type { SendFlowDraft } from '@griever/hooks';
import type { Contact, SessionDetails } from '@griever/shared';
import { TemplatePicker } from '../screens/TemplatePicker';
import { AnnounceForm } from '../screens/AnnounceForm';
import { ServiceKnownScreen } from '../screens/ServiceKnownScreen';
import { DetailsForm } from '../screens/DetailsForm';
import { ContactSelector } from '../screens/ContactSelector';
import { WideningCircle } from '../screens/WideningCircle';
import { ConfirmScreen } from '../screens/ConfirmScreen';
import { SendingScreen } from '../screens/SendingScreen';
import { SentScreen } from '../screens/SentScreen';

interface Props {
  session: SessionDetails;
  draft: SendFlowDraft | null;
  contacts: Contact[];
  notifiedContactIds: string[];
  onDraftChange: (draft: SendFlowDraft) => void;
  onExitToLanding: () => void;
  onEditSession: () => void;
  onViewHistory: () => void;
}

export function Flow({
  session,
  draft,
  contacts,
  notifiedContactIds,
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
      return flow.templateCategory === 'obituary' ? (
        <WideningCircle flow={flow} contacts={contacts} notifiedContactIds={notifiedContactIds} />
      ) : (
        <ContactSelector flow={flow} contacts={contacts} grouped={grouped} />
      );
    case 'review':
      return <ConfirmScreen flow={flow} contacts={contacts} />;
    case 'sending':
      return <SendingScreen flow={flow} contacts={contacts} />;
    case 'sent':
      return <SentScreen flow={flow} onViewHistory={onViewHistory} />;
    default:
      return null;
  }
}
