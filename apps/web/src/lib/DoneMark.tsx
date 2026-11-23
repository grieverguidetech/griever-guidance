import { useEffect, useRef } from 'react';

export interface DoneMarkProps {
  checked: boolean;
  /** Extra classes for the wrapper, for example a margin that centres the mark on a first line of text. */
  className?: string;
}

/**
 * The tick on a checklist row (same look as mobile's DoneMark). Done is a small colour swirl; open is a plain ring.
 * The swirl turns once and rests, but only when the visitor ticks the row (checked flips from false to true after
 * the first render), so rows that load already ticked stay still. Reduced motion stops the turn (see styles.css).
 * It is decoration only: the button around it carries aria-pressed, so this is hidden from screen readers.
 */
export function DoneMark({ checked, className }: DoneMarkProps) {
  const previous = useRef(checked);
  const turns = checked && !previous.current;
  useEffect(() => {
    previous.current = checked;
  }, [checked]);
  // Once started, the turn class stays until the row is unticked, so a re-render does not replay it.
  const turned = useRef(false);
  if (!checked) {
    turned.current = false;
  } else if (turns) {
    turned.current = true;
  }
  const classes = ['gg-done-mark', className].filter(Boolean).join(' ');
  return (
    <span aria-hidden="true" data-testid="done-mark" className={classes}>
      {checked ? (
        <span data-testid="done-mark-swirl" className={`gg-done-mark-swirl${turned.current ? ' gg-done-mark-turn' : ''}`} />
      ) : (
        <span data-testid="done-mark-ring" className="gg-done-mark-ring" />
      )}
    </span>
  );
}
