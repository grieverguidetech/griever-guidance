import { useSendFlow } from '@griever/hooks';
import type { SendFlowDraft } from '@griever/hooks';
import type { Contact, SessionDetails, TemplateCategory } from '@griever/shared';
import { useFocusHeadingOnChange } from '../lib/ui';
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
  /** Every moment's saved draft, so picking a moment on the picker brings its own back. */
  drafts: Partial<Record<TemplateCategory, SendFlowDraft>>;
  contacts: Contact[];
  notifiedContactIds: string[];
  onDraftChange: (draft: SendFlowDraft) => void;
  onExitToLanding: () => void;
  /** Opens Home, the people list. Leaving unmounts the flow, so nothing composed is kept (C2). */
  onHome: () => void;
  onEditSession: () => void;
  onAddContact: (input: { name: string; phone: string }) => Promise<Contact>;
}

export function Flow({
  session,
  draft,
  drafts,
  contacts,
  notifiedContactIds,
  onDraftChange,
  onExitToLanding,
  onHome,
  onEditSession,
  onAddContact,
}: Props) {
  const flow = useSendFlow({ session, draft, drafts, onDraftChange });
  useFocusHeadingOnChange(flow.step);
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
      return <SentScreen flow={flow} onHome={onHome} />;
    default:
      return null;
  }
}
