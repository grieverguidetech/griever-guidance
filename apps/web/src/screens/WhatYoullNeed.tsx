import { CheckCircle, Circle } from '@phosphor-icons/react';
import { BackButton } from '../lib/ui';

interface ChecklistItem {
  label: string;
  meta?: string;
  checked: boolean;
}

const CHECKLIST: ChecklistItem[] = [
  { label: 'Any will or written wishes', meta: 'Burial or cremation, and who they named', checked: true },
  { label: 'Pre-arranged funeral plans', meta: 'Many people have already paid for this', checked: true },
  { label: 'Social Security number and ID', checked: false },
  { label: 'Life insurance policies', checked: false },
  { label: 'Military discharge papers', meta: 'If they served — it may cover the burial', checked: false },
];

interface Props {
  onBack: () => void;
  onEmailList: () => void;
}

export function WhatYoullNeed({ onBack, onEmailList }: Props) {
  return (
    <div className="flex flex-col gap-4">
      <BackButton onClick={onBack} />
      <div className="flex flex-col gap-1">
        <h1 className="text-[22px]">What you'll need</h1>
        <p className="text-[13px] m-0" style={{ color: 'var(--text-muted)' }}>
          Not today. Just so none of it surprises you.
        </p>
      </div>

      <div className="gg-card">
        <span className="gg-card-kicker">The one people get wrong</span>
        <span className="gg-card-title text-[15px]">Certified death certificates</span>
        <p className="gg-card-body m-0">
          Ask the funeral home for <strong>8 to 10 certified copies</strong>. Banks, insurers and
          Social Security each keep an original — photocopies are usually refused.
        </p>
      </div>

      <div className="flex flex-col gap-3">
        <p className="gg-eyebrow m-0">Gather when you can</p>
        {CHECKLIST.map((item) => (
          <div key={item.label} className="flex items-start gap-3">
            {item.checked ? (
              <CheckCircle size={20} weight="fill" style={{ color: 'var(--color-accent)' }} />
            ) : (
              <Circle size={20} weight="regular" style={{ color: 'var(--color-neutral-400)' }} />
            )}
            <div>
              <div className="text-[14px]">{item.label}</div>
              {item.meta && <div className="gg-card-meta">{item.meta}</div>}
            </div>
          </div>
        ))}
      </div>

      <button type="button" onClick={onEmailList} className="gg-btn gg-btn-secondary gg-btn-block">
        Email this list to me
      </button>
      <p className="gg-reassure text-center m-0 text-[12px]">We won't remind you about this list.</p>
    </div>
  );
}
