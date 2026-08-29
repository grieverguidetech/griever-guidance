import { useState } from 'react';
import { generateObituary } from '@griever/api-client';
import type { ObituaryRequest } from '@griever/shared';
import { BackButton } from '../lib/ui';
import { DateField, todayISO } from '../lib/DateField';

type ScreenState = 'form' | 'loading' | 'draft';

interface Props {
  onBack: () => void;
  /** Hand the finished obituary to the active session as its obituary link. */
  onShareLink: (info: { fullName: string; dateOfPassing: string; url: string }) => void;
}

/** Stand-in for a published-obituary URL (no real hosting yet). */
function mockObituaryUrl(fullName: string): string {
  const slug =
    fullName
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '') || 'obituary';
  return `https://obituaries.example.com/${slug}`;
}

const EMPTY_FIELDS: ObituaryRequest = {
  fullName: '',
  dateOfBirth: '',
  dateOfPassing: '',
  cityOfResidence: '',
  survivors: '',
  career: '',
  personalNote: '',
};

export function ObituaryScreen({ onBack, onShareLink }: Props) {
  const [screenState, setScreenState] = useState<ScreenState>('form');
  const [fields, setFields] = useState<ObituaryRequest>(EMPTY_FIELDS);
  const [draft, setDraft] = useState('');
  const [error, setError] = useState('');

  const canSubmit =
    fields.fullName.trim() !== '' &&
    fields.dateOfBirth.trim() !== '' &&
    fields.dateOfPassing.trim() !== '';

  function setField(key: keyof ObituaryRequest, value: string) {
    setFields((prev) => ({ ...prev, [key]: value }));
  }

  async function handleSubmit() {
    setError('');
    setScreenState('loading');
    try {
      const result = await generateObituary({
        fullName: fields.fullName,
        dateOfBirth: fields.dateOfBirth,
        dateOfPassing: fields.dateOfPassing,
        cityOfResidence: fields.cityOfResidence || undefined,
        career: fields.career || undefined,
        survivors: fields.survivors || undefined,
        personalNote: fields.personalNote || undefined,
      });
      setDraft(result.draft);
      setScreenState('draft');
    } catch {
      setError('Something went wrong. Please try again.');
      setScreenState('form');
    }
  }

  if (screenState === 'loading') {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <p className="text-[13px] gg-reassure">Writing the obituary…</p>
      </div>
    );
  }

  if (screenState === 'draft') {
    return (
      <div className="flex flex-col gap-4">
        <BackButton onClick={() => setScreenState('form')} />
        <div className="flex flex-col gap-1">
          <h1 className="text-[22px]">Obituary draft</h1>
          <p className="text-[13px] m-0" style={{ color: 'var(--text-muted)' }}>
            Edit the text below as needed, then copy and publish wherever you'd like.
          </p>
        </div>
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          className="gg-input"
          rows={12}
        />
        <button
          type="button"
          onClick={() =>
            onShareLink({
              fullName: fields.fullName,
              dateOfPassing: fields.dateOfPassing,
              url: mockObituaryUrl(fields.fullName),
            })
          }
          className="gg-btn gg-btn-primary gg-btn-block"
        >
          Share a link to this obituary
        </button>
        <button
          type="button"
          onClick={() => navigator.clipboard.writeText(draft)}
          className="gg-btn gg-btn-secondary gg-btn-block"
        >
          Copy to clipboard
        </button>
        <div className="flex justify-center">
          <button
            type="button"
            onClick={onBack}
            className="gg-btn gg-btn-ghost"
            style={{ color: 'var(--text-muted)' }}
          >
            Done
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <BackButton onClick={onBack} />
      <div className="flex flex-col gap-1">
        <h1 className="text-[22px]">Write an obituary</h1>
        <p className="text-[13px] m-0" style={{ color: 'var(--text-muted)' }}>
          Fill in what you know. The required fields are marked below.
        </p>
      </div>

      <Field label="Full name" required placeholder="e.g. Margaret Ellen Hayes"
        value={fields.fullName} onChange={(v) => setField('fullName', v)} />
      <DateField
        id="obit-dob"
        label={<>Date of birth<RequiredMark /></>}
        value={fields.dateOfBirth}
        max={todayISO()}
        required
        onChange={(v) => setField('dateOfBirth', v)}
      />
      <DateField
        id="obit-dop"
        label={<>Date of passing<RequiredMark /></>}
        value={fields.dateOfPassing}
        max={todayISO()}
        required
        onChange={(v) => setField('dateOfPassing', v)}
      />
      <Field label="City of residence" placeholder="e.g. Boston, MA"
        value={fields.cityOfResidence ?? ''} onChange={(v) => setField('cityOfResidence', v)} />
      <Field label="Career or vocation" placeholder="e.g. retired schoolteacher"
        value={fields.career ?? ''} onChange={(v) => setField('career', v)} />
      <Field label="Survived by" placeholder="e.g. husband John, two daughters"
        value={fields.survivors ?? ''} onChange={(v) => setField('survivors', v)} />

      <div className="gg-field">
        <label htmlFor="obit-memory">A memory or characteristic to include</label>
        <textarea
          id="obit-memory"
          className="gg-input"
          rows={3}
          placeholder="e.g. She made everyone feel at home the moment they walked through her door."
          value={fields.personalNote ?? ''}
          onChange={(e) => setField('personalNote', e.target.value)}
        />
      </div>

      {error && (
        <p className="text-[13px] m-0" style={{ color: 'var(--color-accent-2-700)' }}>
          {error}
        </p>
      )}

      <button
        type="button"
        onClick={handleSubmit}
        disabled={!canSubmit}
        className="gg-btn gg-btn-primary gg-btn-block"
      >
        Write the obituary
      </button>
    </div>
  );
}

function RequiredMark() {
  return <span style={{ color: 'var(--text-eyebrow)' }}> *</span>;
}

interface FieldProps {
  label: string;
  placeholder: string;
  value: string;
  onChange: (value: string) => void;
  required?: boolean;
}

function Field({ label, placeholder, value, onChange, required }: FieldProps) {
  return (
    <div className="gg-field">
      <label>
        {label}
        {required && <span style={{ color: 'var(--text-eyebrow)' }}> *</span>}
      </label>
      <input
        type="text"
        className="gg-input"
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  );
}
