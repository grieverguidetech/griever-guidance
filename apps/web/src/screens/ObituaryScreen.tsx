import { useState } from 'react';
import { generateObituary } from '@griever/api-client';
import { OBITUARY_DRAFTING_ENABLED } from '../lib/features';
import type { ObituaryRequest, SessionDetails } from '@griever/shared';
import { BackButton, Tooltip } from '../lib/ui';
import { DateField, todayISO } from '../lib/DateField';

type ScreenState = 'form' | 'loading' | 'draft';

interface Props {
  /** The session's person — their name and date of passing prefill the form. */
  session: SessionDetails | null;
  onBack: () => void;
  /** Finished with the draft — back to "Has the obituary been published?". */
  onDone: () => void;
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

export function ObituaryScreen({ session, onBack, onDone }: Props) {
  const [screenState, setScreenState] = useState<ScreenState>('form');
  // Asked once at session setup, so never asked again here — only prefilled.
  const [fields, setFields] = useState<ObituaryRequest>(() => ({
    ...EMPTY_FIELDS,
    fullName: session?.personName ?? '',
    dateOfPassing: session?.dateOfPassing ?? '',
  }));
  const [handOff, setHandOff] = useState<'copied' | 'shared' | null>(null);
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
    if (!OBITUARY_DRAFTING_ENABLED) return;
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

  const canShare = typeof navigator !== 'undefined' && typeof navigator.share === 'function';

  function copyDraft() {
    navigator.clipboard.writeText(draft).then(
      () => {
        setError('');
        setHandOff('copied');
      },
      () => setError('Could not copy the text. You can select and copy it yourself.'),
    );
  }

  // For sending the draft to the funeral home or the paper. No await before
  // share(): it has to run inside the tap's own gesture.
  function shareDraft() {
    navigator.share({ text: draft }).then(
      () => {
        setError('');
        setHandOff('shared');
      },
      (err: unknown) => {
        if (err instanceof DOMException && err.name === 'AbortError') return;
        setError("That didn't go through. You can copy the text instead.");
      },
    );
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
            Read it through and change anything you like. Then send it to the funeral home or the
            paper — they publish it.
          </p>
        </div>
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          className="gg-input"
          rows={12}
        />
        {error && (
          <p className="text-[13px] m-0" style={{ color: 'var(--color-accent-2-700)' }}>
            {error}
          </p>
        )}
        {handOff && (
          <p className="text-[13px] m-0" style={{ color: 'var(--color-accent-700)' }}>
            {handOff === 'copied' ? 'Copied.' : 'Shared.'} Once it has been published, come back and add the
            link so you can send it to people.
          </p>
        )}
        {canShare && (
          <button type="button" onClick={shareDraft} className="gg-btn gg-btn-primary gg-btn-block">
            Share it
          </button>
        )}
        <button
          type="button"
          onClick={copyDraft}
          className={`gg-btn gg-btn-block ${canShare ? 'gg-btn-secondary' : 'gg-btn-primary'}`}
        >
          Copy the text
        </button>
        <div className="flex justify-center">
          <button
            type="button"
            onClick={onDone}
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

      {OBITUARY_DRAFTING_ENABLED ? (
        <button
          type="button"
          onClick={handleSubmit}
          disabled={!canSubmit}
          className="gg-btn gg-btn-primary gg-btn-block"
        >
          Write the obituary
        </button>
      ) : (
        // aria-disabled rather than disabled: a disabled button gets no hover
        // or focus events, so its tooltip could never show.
        <Tooltip text="in beta">
          {(tipId) => (
            <button
              type="button"
              aria-disabled="true"
              aria-describedby={tipId}
              className="gg-btn gg-btn-primary gg-btn-block"
            >
              Write the obituary
            </button>
          )}
        </Tooltip>
      )}
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
