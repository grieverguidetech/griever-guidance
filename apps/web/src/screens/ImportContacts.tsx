import { useMemo, useState } from 'react';
import { useMockProviderContacts } from '@griever/hooks';
import type { Contact } from '@griever/shared';
import { BackButton } from '../lib/ui';
import { ContactRow } from './ContactSelector';

interface Props {
  onBack: () => void;
  onContinue: (picked: Contact[]) => void;
}

export function ImportContacts({ onBack, onContinue }: Props) {
  const pool = useMockProviderContacts();
  const withMobile = useMemo(() => pool.filter((c) => c.phoneNumber.trim() !== ''), [pool]);
  const [query, setQuery] = useState('');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const results = useMemo(() => {
    const trimmed = query.trim().toLowerCase();
    if (!trimmed) return withMobile;
    return withMobile.filter((c) => c.name.toLowerCase().includes(trimmed));
  }, [withMobile, query]);

  function toggle(id: string) {
    setSelectedIds((current) => {
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
        <h1 className="text-[22px]">Bring people across</h1>
        <p className="text-[13px] m-0" style={{ color: 'var(--text-muted)' }}>
          From your contacts. Choose only the ones you want — the rest stay where they are.
        </p>
      </div>

      <div className="gg-field">
        <input
          className="gg-input"
          type="text"
          placeholder="Search your contacts"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>

      <div className="flex flex-col gap-2">
        {!query.trim() && <p className="gg-eyebrow m-0">People you message most</p>}
        {results.map((contact) => (
          <ContactRow
            key={contact.id}
            contact={contact}
            selected={selectedIds.has(contact.id)}
            onToggle={() => toggle(contact.id)}
          />
        ))}
      </div>

      <p className="text-[12px] m-0" style={{ color: 'var(--text-hint)' }}>
        Contacts without a mobile number are hidden — we can only send a text.
      </p>

      <div className="flex items-center justify-between pt-2">
        <span className="text-[13px]" style={{ color: 'var(--text-muted)' }}>
          {selectedIds.size} chosen
        </span>
        <button
          type="button"
          onClick={() => onContinue(pool.filter((c) => selectedIds.has(c.id)))}
          disabled={selectedIds.size === 0}
          className="gg-btn gg-btn-primary"
        >
          Continue
        </button>
      </div>
    </div>
  );
}
