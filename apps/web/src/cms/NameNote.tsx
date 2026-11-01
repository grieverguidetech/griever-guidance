import { screenCopy } from '@griever/copy';

const copy = screenCopy('cmsShell');

/** One calm line on Overview when the account has no first name yet. The whole line is one 44px button that opens Account. */
export function NameNote({ onOpenAccount }: { onOpenAccount: () => void }) {
  return (
    <button
      type="button"
      className="gg-btn gg-btn-ghost gg-hint !px-0 !justify-start !text-left !font-normal !text-[length:inherit] w-full"
      onClick={onOpenAccount}
    >
      <span>
        {copy.nameNoteStart}
        <span className="underline">{copy.nameNoteLink}</span>
        {copy.nameNoteEnd}
      </span>
    </button>
  );
}
