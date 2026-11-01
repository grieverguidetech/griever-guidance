import { screenCopy } from '@griever/copy';
import type { ChecklistFields, ChecklistItemId, ChecklistItemState } from '@griever/shared';
import { ChecklistRows } from '../../lib/ChecklistRows';
import { DeathCertificateCard, NO_REMINDER_LINE } from '../../lib/DeathCertificateCard';
import { PhaseList } from './PhaseList';

const copy = screenCopy('cmsChecklist');

interface Props {
  checklist: ChecklistFields['checklist'];
  onSetItem: (id: ChecklistItemId, state: ChecklistItemState | null) => void;
  onOpenItem: (id: ChecklistItemId) => void;
  /** The item whose guidance is open; its label button gets aria-current. */
  currentItem?: ChecklistItemId | null;
  /** Nobody is saved yet: every phase and item, no ticks, and a line saying ticks are kept once you start. */
  preview?: boolean;
}

/**
 * The body of the CMS checklist panel. The shell supplies the h2 title, so nothing here is
 * above h3. The device-only ticks stay as they were; the phases are saved on the record.
 */
export function ChecklistPanel({ checklist, onSetItem, onOpenItem, currentItem, preview = false }: Props) {
  return (
    <div className="flex flex-col gap-6">
      <div className="gg-panel flex flex-col gap-4 [&_.gg-card]:bg-transparent [&_.gg-card]:p-0">
        <p className="m-0">{copy.intro}</p>
        <DeathCertificateCard asHeading />
        {preview ? <p className="gg-hint m-0">{copy.previewLine}</p> : null}
      </div>
      <PhaseList
        checklist={checklist}
        onOpen={onOpenItem}
        current={currentItem}
        onChange={onSetItem}
        gather={preview ? undefined : <ChecklistRows />}
        readOnly={preview}
      />
      <p className="gg-reassure m-0 text-center">{NO_REMINDER_LINE}</p>
    </div>
  );
}
