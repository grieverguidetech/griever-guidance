import type { Ref } from 'react';
import { PRODUCT_NAME } from '@griever/shared';
import { screenCopy } from '@griever/copy';

const copy = screenCopy('cmsChecklist');

export interface HeaderChecklistToggle {
  /** Whether the checklist panel is open. The button is only drawn while it is closed. */
  open: boolean;
  onToggle: () => void;
  /** The id of the panel the button opens. */
  panelId: string;
  /** Lets the shell move focus here when the panel closes. */
  buttonRef?: Ref<HTMLButtonElement>;
}

/**
 * The bar across the top of the editor: the product wordmark and, from `lg`, a primary button that opens
 * the checklist panel while it is closed (below `lg` the phone button in the page opens the sheet). The wordmark is a
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
      {checklist && !checklist.open ? (
        <button
          ref={checklist.buttonRef}
          type="button"
          className="gg-btn gg-btn-primary hidden lg:inline-flex"
          aria-expanded={false}
          aria-controls={checklist.panelId}
          onClick={checklist.onToggle}
        >
          {copy.show}
        </button>
      ) : null}
    </header>
  );
}
