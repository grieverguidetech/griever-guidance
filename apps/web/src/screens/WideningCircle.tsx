import { useMemo } from 'react';
import type { useSendFlow } from '@griever/hooks';
import type { Contact } from '@griever/shared';
import { BackButton } from '../lib/ui';
import { ContactRow } from './ContactSelector';

type Flow = ReturnType<typeof useSendFlow>;

interface Props {
  flow: Flow;
  contacts: Contact[];
  /** Contact IDs who already received the announcement — excluded and stated plainly. */
  notifiedContactIds: string[];
}

interface Section {
  key: string;
  label: string;
  items: Contact[];
}

export function WideningCircle({ flow, contacts, notifiedContactIds }: Props) {
  const { selectedContactIds, toggleContact, selectContacts, nextStep, prevStep } = flow;
  const selected = new Set(selectedContactIds);
  const count = selectedContactIds.length;
  const notified = new Set(notifiedContactIds);

  const sections = useMemo<Section[]>(() => {
    const eligible = contacts.filter((c) => !notified.has(c.id));
    const byLabel = new Map<string, Contact[]>();
    for (const contact of eligible) {
      const label =
        contact.providerLabels?.[0] ??
        (contact.tier === 'first' ? 'Close family' : 'Friends & family');
      const list = byLabel.get(label) ?? [];
      list.push(contact);
      byLabel.set(label, list);
    }
    return Array.from(byLabel.entries()).map(([label, items]) => ({
      key: label,
      label,
      items,
    }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contacts, notifiedContactIds]);

  return (
    <div className="flex flex-col gap-4">
      <BackButton onClick={prevStep} />
      <div className="flex flex-col gap-1">
        <h1 className="text-[22px]">Who hasn't heard yet?</h1>
        <p className="text-[13px] m-0" style={{ color: 'var(--text-muted)' }}>
          The {notifiedContactIds.length} people you told first are already checked off.
        </p>
      </div>

      <div className="gg-card" style={{ background: 'var(--color-accent-100)' }}>
        <p className="gg-card-body m-0" style={{ opacity: 1, fontSize: 13, lineHeight: 1.6 }}>
          Close family heard from you personally
          {flow.session?.dateOfPassing ? ` on ${flow.session.dateOfPassing}` : ''}. Nobody will
          get this twice.
        </p>
      </div>

      {sections.map((section) => (
        <div key={section.key} className="flex flex-col gap-2">
          <div className="flex items-baseline justify-between">
            <p className="gg-eyebrow m-0">{section.label}</p>
            <button
              type="button"
              onClick={() => selectContacts(section.items.map((c) => c.id))}
              className="gg-btn gg-btn-ghost !min-h-0 !py-0 !px-0 text-[12px]"
            >
              Select all
            </button>
          </div>
          {section.items.map((contact) => (
            <ContactRow
              key={contact.id}
              contact={contact}
              selected={selected.has(contact.id)}
              onToggle={() => toggleContact(contact.id)}
            />
          ))}
        </div>
      ))}

      <div className="flex items-center justify-between pt-2">
        <span className="text-[13px]" style={{ color: 'var(--text-muted)' }}>
          {count} selected
        </span>
        <button
          type="button"
          onClick={nextStep}
          disabled={count === 0}
          className="gg-btn gg-btn-primary"
        >
          Continue
        </button>
      </div>
    </div>
  );
}
