import { useState } from 'react';
import type { useSendFlow } from '@griever/hooks';
import { BackButton } from '../lib/ui';

type Flow = ReturnType<typeof useSendFlow>;

interface Props {
  flow: Flow;
}

const OPTIONS = [
  {
    value: 'no' as const,
    title: 'Not yet',
    body: "We'll say details are coming, and remind you to send them later.",
  },
  {
    value: 'yes' as const,
    title: 'Yes, I have them',
    body: 'Include the date, time and place in this message.',
  },
];

export function ServiceKnownScreen({ flow }: Props) {
  const [choice, setChoice] = useState<'yes' | 'no'>(flow.serviceDetailsKnown ?? 'no');

  return (
    <div className="flex flex-col gap-4">
      <BackButton onClick={flow.prevStep} />
      <div className="flex flex-col gap-1">
        <h1 className="text-[22px]">Do you know the service details?</h1>
        <p className="text-[13px] m-0" style={{ color: 'var(--text-muted)' }}>
          Most people don't yet. That's completely fine.
        </p>
      </div>

      <div className="flex flex-col gap-2">
        {OPTIONS.map((option) => (
          <button
            key={option.value}
            type="button"
            onClick={() => setChoice(option.value)}
            aria-pressed={choice === option.value}
            className={`gg-card elev-sm gg-card-selectable text-left ${
              choice === option.value ? 'gg-card-selected' : ''
            }`}
          >
            <span className="gg-card-title">{option.title}</span>
            <span className="gg-card-body">{option.body}</span>
          </button>
        ))}
      </div>

      <button
        type="button"
        onClick={() => {
          flow.setServiceDetailsKnown(choice);
          flow.nextStep();
        }}
        className="gg-btn gg-btn-primary gg-btn-block"
      >
        Continue
      </button>
    </div>
  );
}
