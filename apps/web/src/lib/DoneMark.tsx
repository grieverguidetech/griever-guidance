export interface DoneMarkProps {
  checked: boolean;
}

/**
 * The tick on a checklist row (same look as mobile's DoneMark). Done is a small colour swirl that
 * turns once and rests (and stays still with reduced motion, see styles.css). Open is a plain ring.
 * It is decoration only: the button around it carries aria-pressed, so this is hidden from screen readers.
 */
export function DoneMark({ checked }: DoneMarkProps) {
  return (
    <span aria-hidden="true" data-testid="done-mark" className="gg-done-mark">
      {checked ? (
        <span data-testid="done-mark-swirl" className="gg-done-mark-swirl" />
      ) : (
        <span data-testid="done-mark-ring" className="gg-done-mark-ring" />
      )}
    </span>
  );
}
