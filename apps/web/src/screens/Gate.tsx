import { useState } from 'react';
import { BackButton } from '../lib/ui';

export interface GateOption {
  title: string;
  body: string;
}

interface Props {
  title: string;
  subtitle: string;
  notYet: GateOption;
  ready: GateOption;
  reassurance: string;
  onBack: () => void;
  onChoose: (ready: boolean) => void;
}

/** Generic two-card yes/no gate (C2) — "not yet" is always pre-selected. */
export function Gate({ title, subtitle, notYet, ready, reassurance, onBack, onChoose }: Props) {
  const [choice, setChoice] = useState<'notYet' | 'ready'>('notYet');

  return (
    <div className="flex flex-col gap-4">
      <BackButton onClick={onBack} />
      <div className="flex flex-col gap-1">
        <h1 className="text-[22px]">{title}</h1>
        <p className="text-[13px] m-0" style={{ color: 'var(--text-muted)' }}>
          {subtitle}
        </p>
      </div>

      <div className="flex flex-col gap-2">
        <GateCard option={notYet} selected={choice === 'notYet'} onClick={() => setChoice('notYet')} />
        <GateCard option={ready} selected={choice === 'ready'} onClick={() => setChoice('ready')} />
      </div>

      <button
        type="button"
        onClick={() => onChoose(choice === 'ready')}
        className="gg-btn gg-btn-primary gg-btn-block"
      >
        Continue
      </button>
      <p className="gg-reassure text-center m-0 text-[12px]">{reassurance}</p>
    </div>
  );
}

function GateCard({
  option,
  selected,
  onClick,
}: {
  option: GateOption;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      className={`gg-card elev-sm gg-card-selectable text-left ${selected ? 'gg-card-selected' : ''}`}
    >
      <span className="gg-card-title">{option.title}</span>
      <p className="gg-card-body m-0">{option.body}</p>
    </button>
  );
}
