import { useRef, useState } from 'react';
import type { useSendFlow } from '@griever/hooks';
import type { Contact } from '@griever/shared';
import { CheckCircle } from '@phosphor-icons/react/CheckCircle';
import { Circle } from '@phosphor-icons/react/Circle';
import { detectDeviceRegion, toE164 } from '@griever/contacts';
import { screenCopy } from '@griever/copy';
import { WhoShouldKnow } from '@griever/ui';
import { SavedNote } from '../lib/ui';
import { WhatYoullNeedSheet } from '../lib/WhatYoullNeedSheet';
import { formatPhone } from '../lib/format';

type Flow = ReturnType<typeof useSendFlow>;

const copy = screenCopy('whoShouldKnow');

interface Props {
  flow: Flow;
  contacts: Contact[];
  grouped: boolean;
  onAddContact: (input: { name: string; phone: string }) => Promise<Contact>;
}

/** The screen is the shared WhoShouldKnow in libs/ui; this holds what is web only: the sheet and saving. */
export function ContactSelector({ flow, contacts, grouped, onAddContact }: Props) {
  const { selectedContactIds, toggleContact, selectContacts, nextStep, prevStep } = flow;
  const [sheetOpen, setSheetOpen] = useState(false);
  // Loose on purpose: the shared Button hands back a DOM node on web.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const checklistButton = useRef<any>(null);

  return (
    <div className="flex flex-col gap-4">
      <WhoShouldKnow
        copy={copy}
        people={contacts.map((c) => ({ id: c.contactId, name: c.name, phone: formatPhone(c.phone), tier: c.tier }))}
        grouped={grouped}
        selectedIds={selectedContactIds}
        onToggle={toggleContact}
        onSelectAll={selectContacts}
        toE164={(raw) => toE164(raw, detectDeviceRegion())}
        onAddPerson={async (input) => {
          const created = await onAddContact(input);
          toggleContact(created.contactId);
        }}
        onBack={prevStep}
        onContinue={nextStep}
        onWhatYoullNeed={() => setSheetOpen(true)}
        checklistRef={checklistButton}
        footer={<SavedNote />}
      />
      {sheetOpen && <WhatYoullNeedSheet onClose={() => setSheetOpen(false)} returnFocusRef={checklistButton} />}
    </div>
  );
}

/** Still used by WideningCircle (the obituary list), which has its own layout. */
export function ContactRow({
  contact,
  selected,
  onToggle,
}: {
  contact: Contact;
  selected: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-pressed={selected}
      className={`gg-card gg-card-selectable flex-row items-center justify-between ${
        selected ? 'gg-card-selected' : ''
      }`}
    >
      <span className="flex flex-col text-left">
        <span className="gg-card-title text-[14px]">{contact.name}</span>
        <span className="gg-card-meta">{formatPhone(contact.phone)}</span>
      </span>
      {selected ? (
        <CheckCircle size={20} weight="fill" style={{ color: 'var(--color-accent)' }} />
      ) : (
        <Circle size={20} weight="regular" style={{ color: 'var(--color-neutral-400)' }} />
      )}
    </button>
  );
}
