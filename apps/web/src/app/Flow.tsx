import { useSendFlow } from '@griever/hooks';
import type { SendFlowDraft, SendJobStore } from '@griever/hooks';
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
  sessionId: string;
  session: SessionDetails;
  draft: SendFlowDraft | null;
  contacts: Contact[];
  notifiedContactIds: string[];
  onDraftChange: (draft: SendFlowDraft) => void;
  onExitToLanding: () => void;
  onEditSession: () => void;
  onAddContact: (input: { name: string; phone: string }) => Promise<Contact>;
  sendJobStore: SendJobStore;
}

export function Flow({
  sessionId,
  session,
  draft,
  contacts,
  notifiedContactIds,
  onDraftChange,
  onExitToLanding,
  onEditSession,
  onAddContact,
  sendJobStore,
}: Props) {
  const flow = useSendFlow({ session, sessionId, draft, onDraftChange, sendJobStore });
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
        <ContactSelector flow={flow} contacts={contacts} grouped={grouped} onAddContact={onAddContact} />
      );
    case 'review':
      return <ConfirmScreen flow={flow} />;
    case 'sending':
      return <SendingScreen flow={flow} contacts={contacts} />;
    case 'sent':
      return <SentScreen flow={flow} />;
    default:
      return null;
  }
}
