import { useEffect, useRef } from 'react';
import { useSendFlow } from '@griever/hooks';
import type { SendFlowDraft } from '@griever/hooks';
import type { Contact, SessionDetails, TemplateCategory } from '@griever/shared';
import { useFocusHeadingOnChange } from '../lib/ui';
import { AnnounceForm } from '../screens/AnnounceForm';
import { DetailsForm } from '../screens/DetailsForm';
import { ContactSelector } from '../screens/ContactSelector';
import { WideningCircle } from '../screens/WideningCircle';
import { ConfirmScreen } from '../screens/ConfirmScreen';
import { SendingScreen } from '../screens/SendingScreen';

/** How a finished send went, handed to the app so it can record the moment and open the path. */
export interface FlowFinish {
  category: TemplateCategory;
  /** People who were handed the message (skipped ones are not here). */
  deliveredIds: string[];
  /** Everyone on the list, skipped included. */
  total: number;
}

interface Props {
  session: SessionDetails;
  draft: SendFlowDraft | null;
  /** Every moment's saved draft, so a moment already under way comes back as it was. */
  drafts: Partial<Record<TemplateCategory, SendFlowDraft>>;
  contacts: Contact[];
  notifiedContactIds: string[];
  onDraftChange: (draft: SendFlowDraft) => void;
  /** Opens the path. Back from a moment's first form, and the way out of a flow with no moment, come here. */
  onExitToLanding: () => void;
  /** The last person was handed the message. The app records it and opens the path with a note. */
  onFinished: (finish: FlowFinish) => void;
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
  onFinished,
  onEditSession,
  onAddContact,
}: Props) {
  const flow = useSendFlow({ session, draft, drafts, onDraftChange });
  useFocusHeadingOnChange(flow.step);
  const grouped = flow.templateCategory === 'announcement';

  // The path is the hub, so the hook's 'template' step (kept for mobile's picker) is a way out.
  useEffect(() => {
    if (flow.step === 'template') onExitToLanding();
  }, [flow.step, onExitToLanding]);

  // Fires once, when this mount's own send reaches its end.
  const finished = useRef(false);
  useEffect(() => {
    if (flow.step !== 'sent' || finished.current) return;
    finished.current = true;
    const category = flow.templateCategory;
    if (!category) {
      onExitToLanding();
      return;
    }
    // A flow opened again already at 'sent' has no send job; its saved list stands in for it.
    const recipients =
      flow.sendJob?.recipients ??
      flow.selectedContactIds.map((contactId) => ({ contactId, status: 'delivered' as const }));
    onFinished({
      category,
      deliveredIds: recipients.filter((r) => r.status === 'delivered').map((r) => r.contactId),
      total: recipients.length,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [flow.step]);

  // Back on a moment's first form goes to the path, not to a picker.
  const onFirstForm = flow.steps[1] === flow.step;
  const forms = { ...flow, prevStep: onFirstForm ? onExitToLanding : flow.prevStep };

  switch (flow.step) {
    case 'announce':
      return <AnnounceForm flow={forms} onEditSession={onEditSession} />;
    case 'details':
      return <DetailsForm flow={forms} />;
    case 'contacts':
      return flow.templateCategory === 'obituary' ? (
        <WideningCircle flow={forms} contacts={contacts} notifiedContactIds={notifiedContactIds} />
      ) : (
        <ContactSelector flow={forms} contacts={contacts} grouped={grouped} onAddContact={onAddContact} />
      );
    case 'review':
      return <ConfirmScreen flow={forms} />;
    case 'sending':
      return <SendingScreen flow={forms} contacts={contacts} />;
    default:
      return null;
  }
}
