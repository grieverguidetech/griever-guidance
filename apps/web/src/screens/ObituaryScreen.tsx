import { useState } from 'react';
import { generateObituary } from '@griever/api-client';
import type { ObituaryRequest } from '@griever/shared';

type ScreenState = 'form' | 'loading' | 'draft';

interface Props {
  onBack: () => void;
  onShareLink: () => void;
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
        <p className="text-sm text-gray-400">Writing the obituary...</p>
      </div>
    );
  }

  if (screenState === 'draft') {
    return (
      <div>
        <button
          onClick={() => setScreenState('form')}
          className="text-sm text-gray-400 hover:text-gray-600 mb-6"
        >
          ← Edit details
        </button>
        <h1 className="text-xl font-semibold text-gray-900 mb-1">Obituary draft</h1>
        <p className="text-sm text-gray-400 mb-6">
          Edit the text below as needed, then copy and publish wherever you'd like.
        </p>
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          className="w-full border border-gray-200 rounded-lg px-4 py-3 text-sm text-gray-800 leading-relaxed resize-none focus:outline-none focus:border-[#6B7FD4]"
          rows={12}
        />
        <button
          onClick={onShareLink}
          className="w-full mt-6 bg-[#6B7FD4] text-white text-sm font-medium rounded-lg py-3 hover:bg-[#5a6ec2] transition-colors"
        >
          Share a link to this obituary
        </button>
        <button
          onClick={() => navigator.clipboard.writeText(draft)}
          className="w-full mt-3 border border-gray-200 text-sm font-medium text-gray-600 rounded-lg py-3 hover:border-gray-300 transition-colors"
        >
          Copy to clipboard
        </button>
        <div className="flex justify-center mt-4">
          <button
            onClick={onBack}
            className="text-sm text-gray-400 hover:text-gray-600"
          >
            Done
          </button>
        </div>
      </div>
    );
  }

  return (
    <div>
      <button
        onClick={onBack}
        className="text-sm text-gray-400 hover:text-gray-600 mb-6"
      >
        ← Back
      </button>
      <h1 className="text-xl font-semibold text-gray-900 mb-1">Write an obituary</h1>
      <p className="text-sm text-gray-400 mb-8">
        Fill in what you know. The required fields are marked below.
      </p>

      <div className="flex flex-col gap-5">
        <Field
          label="Full name"
          required
          placeholder="e.g. Margaret Ellen Hayes"
          value={fields.fullName}
          onChange={(v) => setField('fullName', v)}
        />
        <Field
          label="Date of birth"
          required
          placeholder="e.g. March 12, 1942"
          value={fields.dateOfBirth}
          onChange={(v) => setField('dateOfBirth', v)}
        />
        <Field
          label="Date of passing"
          required
          placeholder="e.g. June 3, 2025"
          value={fields.dateOfPassing}
          onChange={(v) => setField('dateOfPassing', v)}
        />
        <Field
          label="City of residence"
          placeholder="e.g. Boston, MA"
          value={fields.cityOfResidence ?? ''}
          onChange={(v) => setField('cityOfResidence', v)}
        />
        <Field
          label="Career or vocation"
          placeholder="e.g. retired schoolteacher"
          value={fields.career ?? ''}
          onChange={(v) => setField('career', v)}
        />
        <Field
          label="Survived by"
          placeholder="e.g. husband John, two daughters"
          value={fields.survivors ?? ''}
          onChange={(v) => setField('survivors', v)}
        />

        <div className="flex flex-col gap-1">
          <label className="text-sm text-gray-600">
            A memory or characteristic to include
          </label>
          <textarea
            placeholder="e.g. She made everyone feel at home the moment they walked through her door."
            value={fields.personalNote ?? ''}
            onChange={(e) => setField('personalNote', e.target.value)}
            rows={3}
            className="border border-gray-200 rounded-lg px-4 py-3 text-sm text-gray-800 placeholder-gray-300 resize-none focus:outline-none focus:border-[#6B7FD4]"
          />
        </div>
      </div>

      {error && (
        <p className="text-sm text-red-400 mt-4">{error}</p>
      )}

      <button
        onClick={handleSubmit}
        disabled={!canSubmit}
        className="w-full mt-8 bg-[#6B7FD4] text-white text-sm font-medium rounded-lg py-3 hover:bg-[#5a6ec2] transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
      >
        Write the obituary
      </button>
    </div>
  );
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
    <div className="flex flex-col gap-1">
      <label className="text-sm text-gray-600">
        {label}
        {required && <span className="text-gray-400 ml-1">*</span>}
      </label>
      <input
        type="text"
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="border border-gray-200 rounded-lg px-4 py-3 text-sm text-gray-800 placeholder-gray-300 focus:outline-none focus:border-[#6B7FD4]"
      />
    </div>
  );
}
