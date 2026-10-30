import { screenCopy } from '@griever/copy';
import type { ChecklistFields, ChecklistItemId, ChecklistItemState } from '@griever/shared';
import { ChecklistRows } from '../../lib/ChecklistRows';
import { DeathCertificateCard, GATHER_HEADING, NO_REMINDER_LINE } from '../../lib/DeathCertificateCard';
import { PhaseList } from './PhaseList';

const copy = screenCopy('cmsChecklist');

interface Props {
  checklist: ChecklistFields['checklist'];
  onSetItem: (id: ChecklistItemId, state: ChecklistItemState | null) => void;
  onOpenItem: (id: ChecklistItemId) => void;
}

/**
 * The body of the CMS checklist panel. The shell supplies the h2 title, so nothing here is
 * above h3. The device-only ticks stay as they were; the phases are saved on the record.
 */
export function ChecklistPanel({ checklist, onSetItem, onOpenItem }: Props) {
  return (
    <div className="flex flex-col gap-6">
      <p className="m-0">{copy.intro}</p>
      <DeathCertificateCard asHeading />
      <div className="flex flex-col gap-3">
        <h3 className="gg-eyebrow m-0">{GATHER_HEADING}</h3>
        <ChecklistRows />
      </div>
      <PhaseList checklist={checklist} onOpen={onOpenItem} onChange={onSetItem} />
      <p className="gg-reassure m-0 text-center">{NO_REMINDER_LINE}</p>
    </div>
  );
}
