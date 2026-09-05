import type { useSendFlow } from '@griever/hooks';
import type { Contact, ContactTier } from '@griever/shared';
import { CheckCircle, Circle } from '@phosphor-icons/react';
import { BackButton } from '../lib/ui';
import { formatPhone } from '../lib/format';

type Flow = ReturnType<typeof useSendFlow>;

interface Props {
  flow: Flow;
  contacts: Contact[];
  grouped: boolean;
}

const TIER_LABELS: Record<ContactTier, string> = {
  first: 'Close family',
  family: 'Friends & neighbours',
};

const TIER_ORDER: ContactTier[] = ['first', 'family'];

export function ContactSelector({ flow, contacts, grouped }: Props) {
  const { selectedContactIds, toggleContact, selectContacts, nextStep, prevStep } = flow;
  const selected = new Set(selectedContactIds);
  const count = selectedContactIds.length;

  const sections = grouped
    ? TIER_ORDER.map((tier) => ({
        key: tier,
        label: TIER_LABELS[tier],
        items: contacts.filter((c) => (c.tier ?? 'family') === tier),
      })).filter((s) => s.items.length > 0)
    : [{ key: 'all' as const, label: null, items: contacts }];

  return (
    <div className="flex flex-col gap-4">
      <BackButton onClick={prevStep} />
      <div className="flex flex-col gap-1">
        <h1 className="text-[22px]">Who should know?</h1>
        <p className="text-[13px] m-0" style={{ color: 'var(--text-muted)' }}>
          {grouped
            ? "Send to close family now, everyone else when you're ready."
            : 'Select everyone who should get this.'}
        </p>
      </div>

      {sections.map((section) => (
        <div key={section.key} className="flex flex-col gap-2">
          {section.label && (
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
          )}
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
        <span className="gg-card-meta">{formatPhone(contact.phoneNumber)}</span>
      </span>
      {selected ? (
        <CheckCircle size={20} weight="fill" style={{ color: 'var(--color-accent)' }} />
      ) : (
        <Circle size={20} weight="regular" style={{ color: 'var(--color-neutral-400)' }} />
      )}
    </button>
  );
}
