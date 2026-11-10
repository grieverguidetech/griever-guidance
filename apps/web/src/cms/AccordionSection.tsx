import type { ReactNode } from 'react';
import { CaretDown } from '@phosphor-icons/react/CaretDown';
import { Check } from '@phosphor-icons/react/Check';

interface Props {
  title: string;
  open: boolean;
  panelId: string;
  onToggle: () => void;
  done?: boolean;
  /** The hidden text read after the title when done is true. */
  doneLabel?: string;
  /** The heading level: h3 in the checklist panel, h2 on a page of its own. */
  level?: 2 | 3;
  /** An id for the heading, so a group inside the panel can be named by it. */
  headingId?: string;
  children: ReactNode;
}

/** One heading with a disclosure button and its panel. The caller holds the open state. */
export function AccordionSection({
  title,
  open,
  panelId,
  onToggle,
  done = false,
  doneLabel,
  level = 3,
  headingId,
  children,
}: Props) {
  const Heading = level === 2 ? 'h2' : 'h3';
  return (
    <section className="flex flex-col gap-3">
      <Heading id={headingId} className="m-0">
        <button
          type="button"
          className="flex min-h-11 w-full items-center gap-2 text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-700"
          aria-expanded={open}
          aria-controls={panelId}
          onClick={onToggle}
        >
          <CaretDown
            size={16}
            weight="bold"
            aria-hidden="true"
            data-chevron
            className={`order-last ml-auto shrink-0 motion-safe:transition-transform ${open ? 'rotate-180' : ''}`}
          />
          {title}
          {done && (
            <>
              {' '}
              <Check
                size={20}
                weight="bold"
                aria-hidden="true"
                className="shrink-0 text-success-700"
              />
              <span className="sr-only">{doneLabel}</span>
            </>
          )}
        </button>
      </Heading>
      <div
        id={panelId}
        hidden={!open}
        className={open ? 'gg-enter' : undefined}
      >
        <div className="flex flex-col gap-3">{children}</div>
      </div>
    </section>
  );
}
