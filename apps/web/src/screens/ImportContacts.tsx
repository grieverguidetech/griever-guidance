import { useEffect, useState } from 'react';
import type { ContactRecordSource, ContactTier } from '@griever/shared';
import {
  Cancelled,
  detectDeviceRegion,
  firstAvailableSource,
  runImport,
  webContactSources,
  type ContactSource,
  type NormalizedContact,
} from '@griever/contacts';
import { BackButton } from '../lib/ui';
import { formatPhone } from '../lib/format';
import { CheckCircle, Circle } from '@phosphor-icons/react';

export interface PickedForImport {
  name: string;
  phone: string;
  email: string | null;
  tier: ContactTier;
}

interface Props {
  /** Already-stored E.164 numbers — a re-entry doesn't show people twice (§7). */
  storedPhones: ReadonlySet<string>;
  onBack: () => void;
  onSwitchToManual: () => void;
  onContinue: (picked: PickedForImport[], source: ContactRecordSource) => void;
}

type Status = 'checking' | 'ready' | 'fetching' | 'reviewing' | 'error';

export function ImportContacts({ storedPhones, onBack, onSwitchToManual, onContinue }: Props) {
  const [source, setSource] = useState<ContactSource | null | undefined>(undefined);
  const [status, setStatus] = useState<Status>('checking');
  const [fresh, setFresh] = useState<NormalizedContact[]>([]);
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    firstAvailableSource(webContactSources).then((found) => {
      if (cancelled) return;
      setSource(found);
      setStatus('ready');
    });
    return () => {
      cancelled = true;
    };
  }, []);

  async function handleImport() {
    if (!source) return;
    setStatus('fetching');
    setError(null);
    try {
      const result = await runImport(source, storedPhones, detectDeviceRegion());
      if (source.preselected) {
        // The OS/browser picker already was the select step (§4) — nothing left to review.
        onContinue(
          result.fresh.map((c) => ({ name: c.displayName, phone: c.phone, email: c.email, tier: 'family' as const })),
          source.id,
        );
        return;
      }
      setFresh(result.fresh);
      setSelectedKeys(new Set(result.fresh.filter((c) => c.starred).map((c) => c.key)));
      setStatus('reviewing');
    } catch (err) {
      if (err instanceof Cancelled) {
        setStatus('ready');
        return;
      }
      setError('We could not read your contacts. You can add people by hand instead.');
      setStatus('error');
    }
  }

  function toggle(key: string) {
    setSelectedKeys((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  const selectedCount = selectedKeys.size;

  if (status === 'checking' || source === undefined) {
    return (
      <div className="flex flex-col gap-4">
        <BackButton onClick={onBack} />
        <p className="text-[13px] m-0" style={{ color: 'var(--text-muted)' }}>
          Checking what's available on this device…
        </p>
      </div>
    );
  }

  if (!source) {
    return (
      <div className="flex flex-col gap-4">
        <BackButton onClick={onBack} />
        <div className="flex flex-col gap-1">
          <h1 className="text-[22px]">Add people by hand</h1>
          <p className="text-[13px] m-0" style={{ color: 'var(--text-muted)' }}>
            This browser can't bring contacts across automatically. You can add people yourself —
            it only takes a moment.
          </p>
        </div>
        <button type="button" onClick={onSwitchToManual} className="gg-btn gg-btn-primary gg-btn-block">
          Add people
        </button>
      </div>
    );
  }

  if (status === 'reviewing') {
    return (
      <div className="flex flex-col gap-4">
        <BackButton onClick={() => setStatus('ready')} />
        <div className="flex flex-col gap-1">
          <h1 className="text-[22px]">Bring people across</h1>
          <p className="text-[13px] m-0" style={{ color: 'var(--text-muted)' }}>
            Choose only the ones you want — the rest stay where they are.
          </p>
        </div>
        <div className="flex flex-col gap-2">
          {fresh.map((contact) => (
            <ContactPickRow
              key={contact.key}
              name={contact.displayName}
              phone={contact.phone}
              selected={selectedKeys.has(contact.key)}
              onToggle={() => toggle(contact.key)}
            />
          ))}
        </div>
        <p className="text-[12px] m-0" style={{ color: 'var(--text-hint)' }}>
          Contacts without a mobile number are hidden — we can only send a text.
        </p>
        <div className="flex items-center justify-between pt-2">
          <span className="text-[13px]" style={{ color: 'var(--text-muted)' }}>
            {selectedCount} chosen
          </span>
          <button
            type="button"
            onClick={() =>
              onContinue(
                fresh
                  .filter((c) => selectedKeys.has(c.key))
                  .map((c) => ({ name: c.displayName, phone: c.phone, email: c.email, tier: 'family' as const })),
                source.id,
              )
            }
            disabled={selectedCount === 0}
            className="gg-btn gg-btn-primary"
          >
            Continue
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <BackButton onClick={onBack} />
      <div className="flex flex-col gap-1">
        <h1 className="text-[22px]">Bring people across</h1>
        <p className="text-[13px] m-0" style={{ color: 'var(--text-muted)' }}>
          Choose contacts from your device. Nothing is added until you say so.
        </p>
      </div>

      {error && (
        <p className="text-[13px] m-0" style={{ color: 'var(--color-danger, #b91c1c)' }}>
          {error}
        </p>
      )}

      <button
        type="button"
        onClick={handleImport}
        disabled={status === 'fetching'}
        className="gg-btn gg-btn-primary gg-btn-block"
      >
        {status === 'fetching' ? 'Waiting for your contacts…' : 'Choose from your contacts'}
      </button>

      <button type="button" onClick={onSwitchToManual} className="gg-btn gg-btn-secondary gg-btn-block">
        Add people by hand instead
      </button>
    </div>
  );
}

function ContactPickRow({
  name,
  phone,
  selected,
  onToggle,
}: {
  name: string;
  phone: string;
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
        <span className="gg-card-title text-[14px]">{name}</span>
        <span className="gg-card-meta">{formatPhone(phone)}</span>
      </span>
      {selected ? (
        <CheckCircle size={20} weight="fill" style={{ color: 'var(--color-accent)' }} />
      ) : (
        <Circle size={20} weight="regular" style={{ color: 'var(--color-neutral-400)' }} />
      )}
    </button>
  );
}
