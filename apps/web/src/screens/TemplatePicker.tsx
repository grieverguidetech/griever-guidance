import type { useSendFlow } from '@griever/hooks';
import type { TemplateCategory } from '@griever/shared';
import { PencilSimple } from '@phosphor-icons/react';
import { BackButton, Eyebrow } from '../lib/ui';

type Flow = ReturnType<typeof useSendFlow>;

interface Props {
  flow: Flow;
  onBack: () => void;
  onEditPerson: () => void;
}

interface PickerCard {
  category: TemplateCategory;
  eyebrow: string;
  title: string;
  body: string;
}

const CARDS: PickerCard[] = [
  {
    category: 'announcement',
    eyebrow: 'Announcement',
    title: 'Announce the passing',
    body: 'A gentle note letting people know.',
  },
  {
    category: 'service',
    eyebrow: 'Service details',
    title: 'Share the service',
    body: 'Date, time and place, in one message.',
  },
  {
    category: 'aftercare',
    eyebrow: 'Aftercare',
    title: 'Send a thank-you',
    body: 'For flowers, calls and support.',
  },
];

export function TemplatePicker({ flow, onBack, onEditPerson }: Props) {
  const name = flow.session?.personName?.trim() || 'your loved one';

  return (
    <div className="flex flex-col gap-6">
      <BackButton onClick={onBack} />

      <div className="flex flex-col gap-1">
        <div className="flex items-center justify-between gap-3">
          <Eyebrow name={name} />
          <button
            type="button"
            onClick={onEditPerson}
            className="gg-btn gg-btn-ghost !min-h-0 !px-0 text-[12px]"
          >
            <PencilSimple size={13} weight="regular" />
            Edit person
          </button>
        </div>
        <h1 className="text-[22px]">What would you like to send?</h1>
        <p className="text-[13px] m-0" style={{ color: 'var(--text-muted)' }}>
          Choose the kind of message. We already have their details.
        </p>
      </div>

      <div className="flex flex-col gap-6">
        {CARDS.map((card) => (
          <div key={card.category} className="flex flex-col gap-2">
            <p className="gg-eyebrow m-0">{card.eyebrow}</p>
            <button
              type="button"
              onClick={() => {
                flow.setTemplateCategory(card.category);
                flow.nextStep();
              }}
              className="gg-card elev-sm gg-card-selectable text-left"
            >
              <span className="gg-card-title">{card.title}</span>
              <span className="gg-card-body">{card.body}</span>
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
