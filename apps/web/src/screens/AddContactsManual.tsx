import { useState } from 'react';
import type { Contact } from '@griever/shared';
import { detectDeviceRegion, toE164 } from '@griever/contacts';
import { CheckCircle, Circle, Plus } from '@phosphor-icons/react';
import { BackButton } from '../lib/ui';
import { formatPhone } from '../lib/format';

interface Props {
  contacts: Contact[];
  onBack: () => void;
  onAdd: (input: { name: string; phone: string; hearsFirst: boolean }) => void;
  onDone: () => void;
}

export function AddContactsManual({ contacts, onBack, onAdd, onDone }: Props) {
  const [name, setName] = useState('');
  const [phoneInput, setPhoneInput] = useState('');
  const [hearsFirst, setHearsFirst] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canAdd = name.trim() !== '' && phoneInput.trim() !== '';

  function handleAdd() {
    if (!canAdd) return;
    const phone = toE164(phoneInput, detectDeviceRegion());
    if (!phone) {
      setError("That number doesn't look right — check the area code and digits.");
      return;
    }
    setError(null);
    onAdd({ name: name.trim(), phone, hearsFirst });
    setName('');
    setPhoneInput('');
    setHearsFirst(false);
  }

  return (
    <div className="flex flex-col gap-4">
      <BackButton onClick={onBack} />
      <div className="flex flex-col gap-1">
        <h1 className="text-[22px]">Who should we be able to reach?</h1>
        <p className="text-[13px] m-0" style={{ color: 'var(--text-muted)' }}>
          Start with the few people you'd call first. You can add more any time.
        </p>
      </div>

      <div className="gg-field">
        <label htmlFor="ac-name">Name</label>
        <input
          id="ac-name"
          className="gg-input"
          type="text"
          placeholder="e.g. Aunt Carol"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
      </div>

      <div className="gg-field">
        <label htmlFor="ac-phone">Mobile number</label>
        <input
          id="ac-phone"
          className="gg-input"
          type="tel"
          placeholder="(617) 555-0148"
          value={phoneInput}
          onChange={(e) => {
            setPhoneInput(e.target.value);
            setError(null);
          }}
        />
        {error && (
          <p className="text-[12px] m-0" style={{ color: 'var(--color-danger, #b91c1c)' }}>
            {error}
          </p>
        )}
      </div>

      <label
        className="flex items-center gap-3 cursor-pointer"
        onClick={(e) => {
          e.preventDefault();
          setHearsFirst((v) => !v);
        }}
      >
        {hearsFirst ? (
          <CheckCircle size={20} weight="fill" style={{ color: 'var(--color-accent)' }} />
        ) : (
          <Circle size={20} weight="regular" style={{ color: 'var(--color-neutral-400)' }} />
        )}
        <span className="text-[14px]">One of the people who should hear first</span>
      </label>

      <button
        type="button"
        onClick={handleAdd}
        disabled={!canAdd}
        className="gg-btn gg-btn-primary gg-btn-block"
      >
        <Plus size={16} weight="regular" />
        Add and start another
      </button>

      {contacts.length > 0 && (
        <div className="flex flex-col gap-2 pt-2">
          <p className="gg-eyebrow m-0">Added so far — {contacts.length}</p>
          {contacts.map((c) => (
            <div key={c.contactId} className="flex items-center justify-between">
              <div>
                <div className="text-[14px]">{c.name}</div>
                <div className="gg-card-meta">{formatPhone(c.phone)}</div>
              </div>
              <span className={`gg-tag ${c.tier === 'first' ? 'gg-tag-accent' : 'gg-tag-neutral'}`}>
                {c.tier === 'first' ? 'Hears first' : 'Friends & family'}
              </span>
            </div>
          ))}
        </div>
      )}

      <button type="button" onClick={onDone} className="gg-btn gg-btn-secondary gg-btn-block">
        Done for now
      </button>
      <p className="text-[12px] text-center italic m-0" style={{ color: 'var(--text-muted)' }}>
        Three is plenty to begin. Nobody needs the whole list today.
      </p>
    </div>
  );
}
