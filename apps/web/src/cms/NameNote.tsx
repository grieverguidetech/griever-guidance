import { screenCopy } from '@griever/copy';

const copy = screenCopy('cmsShell');

/** One calm line on Overview when the account has no first name yet. The link opens Account. */
export function NameNote({ onOpenAccount }: { onOpenAccount: () => void }) {
  return (
    <p className="gg-hint m-0">
      {copy.nameNoteStart}
      <button type="button" className="gg-btn gg-btn-ghost !px-0 !min-h-0 inline underline" onClick={onOpenAccount}>
        {copy.nameNoteLink}
      </button>
      {copy.nameNoteEnd}
    </p>
  );
}
