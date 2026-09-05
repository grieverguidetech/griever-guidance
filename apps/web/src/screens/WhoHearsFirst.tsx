import { useState } from 'react';
import type { Contact } from '@griever/shared';
import { CheckCircle, Circle } from '@phosphor-icons/react';
import { BackButton } from '../lib/ui';
import { formatPhone } from '../lib/format';

interface Props {
  contacts: Contact[];
  onBack: () => void;
  onSave: (firstIds: string[]) => void;
}

export function WhoHearsFirst({ contacts, onBack, onSave }: Props) {
  const [firstIds, setFirstIds] = useState<Set<string>>(
    () => new Set(contacts.filter((c) => c.tier === 'first').map((c) => c.id)),
  );

  function toggle(id: string) {
    setFirstIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <BackButton onClick={onBack} />
      <div className="flex flex-col gap-1">
        <h1 className="text-[22px]">Who should hear first?</h1>
        <p className="text-[13px] m-0" style={{ color: 'var(--text-muted)' }}>
          The people who shouldn't find out from a group text. Everyone else can wait a day.
        </p>
      </div>

      <div className="flex flex-col gap-3">
        {contacts.map((contact) => {
          const checked = firstIds.has(contact.id);
          return (
            <label
              key={contact.id}
              className="flex items-center gap-3 cursor-pointer"
              onClick={(e) => {
                e.preventDefault();
                toggle(contact.id);
              }}
            >
              {checked ? (
                <CheckCircle size={20} weight="fill" style={{ color: 'var(--color-accent)' }} />
              ) : (
                <Circle size={20} weight="regular" style={{ color: 'var(--color-neutral-400)' }} />
              )}
              <div>
                <div className="text-[14px]">{contact.name}</div>
                <div className="gg-card-meta">{formatPhone(contact.phoneNumber)}</div>
              </div>
            </label>
          );
        })}
      </div>

      <div className="gg-card" style={{ background: 'var(--color-accent-100)' }}>
        <p className="gg-card-body m-0" style={{ opacity: 1, fontSize: 13, lineHeight: 1.6 }}>
          Everyone you didn't tick is filed under <strong>Friends &amp; family</strong>. That's the
          only sorting this app needs.
        </p>
      </div>

      <button
        type="button"
        onClick={() => onSave(Array.from(firstIds))}
        className="gg-btn gg-btn-primary gg-btn-block"
      >
        Save and continue
      </button>
      <p className="text-[12px] text-center italic m-0" style={{ color: 'var(--text-muted)' }}>
        You can change this whenever you want.
      </p>
    </div>
  );
}
