import { useState } from 'react';
import type { useSendFlow } from '@griever/hooks';
import { useMockPlaces } from '@griever/hooks';
import { MapPin } from '@phosphor-icons/react/MapPin';
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
  const [locationFocused, setLocationFocused] = useState(false);

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
              <div className="relative">
                <input
                  id={`field-${field.key}`}
                  className="gg-input"
                  type="text"
                  value={fields[field.key] ?? ''}
                  onChange={(e) => {
                    setField(field.key, e.target.value);
                    setPlace(null);
                  }}
                  onFocus={() => setLocationFocused(true)}
                  onBlur={() => window.setTimeout(() => setLocationFocused(false), 120)}
                  placeholder={field.placeholder}
                  autoComplete="off"
                />
                {locationFocused && (
                  <PlacesPanel
                    query={fields[field.key] ?? ''}
                    onPick={(place) => {
                      setPlace(place);
                      setLocationFocused(false);
                    }}
                  />
                )}
              </div>
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

function PlacesPanel({
  query,
  onPick,
}: {
  query: string;
  onPick: (place: import('@griever/shared').Place) => void;
}) {
  const results = useMockPlaces(query);
  if (results.length === 0) return null;

  return (
    <div
      className="gg-card elev-sm absolute left-0 right-0 z-10 !p-0 !gap-0"
      style={{ marginTop: 6 }}
    >
      {results.map((place, i) => (
        <button
          key={place.placeId}
          type="button"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => onPick(place)}
          className="flex items-start gap-[10px] px-3 py-[10px] text-left w-full"
          style={i === 0 ? { background: 'var(--color-accent-100)' } : undefined}
        >
          <MapPin
            size={18}
            weight="duotone"
            style={{ color: 'var(--color-accent-700)', marginTop: 1, flexShrink: 0 }}
          />
          <span className="flex flex-col">
            <span className="text-[14px]">{place.name}</span>
            <span className="gg-card-meta">{place.formattedAddress}</span>
          </span>
        </button>
      ))}
      <p className="m-0 px-3 py-2 text-[11px]" style={{ color: 'var(--text-eyebrow)' }}>
        Addresses from Google Maps — pick one and we'll send the full address.
      </p>
    </div>
  );
}
