import type { useSendFlow } from '@griever/hooks';
import { TopBar, Eyebrow, SavedNote } from '../lib/ui';
import { StartAgain } from '../lib/StartAgain';
import { DateInput } from '../lib/DateField';
import { TimeInput } from '../lib/TimeField';

type Flow = ReturnType<typeof useSendFlow>;

interface Props {
  flow: Flow;
}

export function DetailsForm({ flow }: Props) {
  const { selectedTemplate, fields, setField, setPlace, nextStep, prevStep } = flow;

  if (!selectedTemplate) return null;

  const showEyebrow = selectedTemplate.category === 'service';

  const canProceed = selectedTemplate.fields
    .filter((f) => f.required)
    .every((f) => fields[f.key]?.trim());

  const name = flow.session?.personName?.trim() || 'your loved one';

  return (
    <div className="flex flex-col gap-4">
      <TopBar onBack={prevStep} />
      <div className="flex flex-col gap-1">
        {showEyebrow && <Eyebrow name={name} accent2 />}
        <h1 className="text-[22px]">{selectedTemplate.name}</h1>
        {selectedTemplate.category === 'service' && (
          <p className="text-[13px] m-0" style={{ color: 'var(--text-muted)' }}>
            Three things and you're done.
          </p>
        )}
      </div>

      {selectedTemplate.fields.map((field) => {
        const isLocation = field.key === 'serviceLocation';
        const isNotes = field.key === 'serviceNotes';
        const isDate = field.key === 'serviceDate';
        const isTime = field.key === 'serviceTime';
        return (
          <div key={field.key} className="gg-field">
            <label htmlFor={`field-${field.key}`}>
              {field.label}
              {!field.required && (
                <span style={{ color: 'var(--text-eyebrow)' }}> (optional)</span>
              )}
            </label>

            {isDate ? (
              <DateInput
                id={`field-${field.key}`}
                value={fields[field.key] ?? ''}
                required={field.required}
                onChange={(v) => setField(field.key, v)}
              />
            ) : isTime ? (
              <TimeInput
                id={`field-${field.key}`}
                value={fields[field.key] ?? ''}
                required={field.required}
                onChange={(v) => setField(field.key, v)}
              />
            ) : isNotes ? (
              <textarea
                id={`field-${field.key}`}
                className="gg-input"
                rows={2}
                value={fields[field.key] ?? ''}
                onChange={(e) => setField(field.key, e.target.value)}
                placeholder={field.placeholder}
              />
            ) : isLocation ? (
              <input
                id={`field-${field.key}`}
                className="gg-input"
                type="text"
                value={fields[field.key] ?? ''}
                onChange={(e) => {
                  setField(field.key, e.target.value);
                  setPlace(null);
                }}
                placeholder={field.placeholder}
                autoComplete="off"
              />
            ) : (
              <input
                id={`field-${field.key}`}
                className="gg-input"
                type="text"
                value={fields[field.key] ?? ''}
                onChange={(e) => setField(field.key, e.target.value)}
                placeholder={field.placeholder}
              />
            )}
          </div>
        );
      })}

      <button
        type="button"
        onClick={nextStep}
        disabled={!canProceed}
        className="gg-btn gg-btn-primary gg-btn-block mt-2"
      >
        Continue
      </button>
      <SavedNote />
      <StartAgain flow={flow} />
    </div>
  );
}
