import { CaretDown } from '@phosphor-icons/react/CaretDown';
import { CaretUp } from '@phosphor-icons/react/CaretUp';
import { PRODUCT_NAME } from '@griever/shared';
import { screenCopy } from '@griever/copy';

const copy = screenCopy('cmsChecklist');

export interface HeaderChecklistToggle {
  /** Whether the checklist panel is open. The one button is always drawn; the caret and aria-expanded follow this. */
  open: boolean;
  onToggle: () => void;
  /** The id of the panel the button opens and closes. */
  panelId: string;
}

/**
 * The bar across the top of the editor: the product wordmark and, from `lg`, one "What you'll need" button that
 * opens and closes the checklist panel (below `lg` the phone button in the page opens the sheet). The wordmark is a
 * SAMPLE (issue 583). It is inline, not an <img>, so the name is real text in the page font (Sora): an
 * SVG loaded as an image cannot use the page's fonts. The mark is decorative; the text is the name.
 */
export function AppHeader({ checklist }: { checklist?: HeaderChecklistToggle } = {}) {
  return (
    <header className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 min-h-11 py-3 mb-6 border-b border-[color:var(--color-v2-divider)]">
      <span className="flex items-start gap-2 min-w-0">
        <svg viewBox="0 0 64 64" width={24} height={24} aria-hidden="true" focusable="false" className="h-6 w-6 shrink-0">
          <path d="M12 40a20 20 0 0 1 40 0z" style={{ fill: 'var(--color-v2-link)' }} />
          <path
            d="M6 46h52M18 54h28"
            fill="none"
            strokeWidth={4}
            strokeLinecap="round"
            style={{ stroke: 'var(--color-v2-heading)' }}
          />
        </svg>
        <span
          data-testid="wordmark-name"
          className="text-[17px] leading-6 text-[color:var(--color-v2-heading)]"
          style={{
            fontFamily: 'var(--font-v2)',
            fontWeight: 'var(--v2-weight-regular)',
          }}
        >
          {PRODUCT_NAME}
        </span>
      </span>
      {checklist ? (
        <button
          type="button"
          className="gg-btn gg-btn-secondary hidden lg:inline-flex"
          aria-expanded={checklist.open}
          aria-controls={checklist.panelId}
          onClick={checklist.onToggle}
        >
          {copy.phoneButton}
          {checklist.open ? (
            <CaretDown data-testid="checklist-caret" data-caret="down" aria-hidden="true" />
          ) : (
            <CaretUp data-testid="checklist-caret" data-caret="up" aria-hidden="true" />
          )}
        </button>
      ) : null}
    </header>
  );
}
