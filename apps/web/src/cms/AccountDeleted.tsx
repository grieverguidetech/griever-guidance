import { useEffect, useRef } from 'react';
import { screenCopy } from '@griever/copy';

const copy = screenCopy('account');

/** Shown after the account is deleted. Focus lands on the heading so a screen reader starts there. */
export function AccountDeleted() {
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    heading.current?.focus();
  }, []);
  return (
    <main className="min-h-screen flex justify-center" style={{ background: 'var(--color-bg)' }}>
      <div className="w-full max-w-[420px] px-5 py-8 flex flex-col gap-3">
        <h1 ref={heading} tabIndex={-1} className="m-0">
          {copy.deletedHeading}
        </h1>
        <p className="m-0">{copy.deletedBody}</p>
        <div className="flex flex-wrap gap-2">
          <button type="button" className="gg-btn gg-btn-primary" onClick={() => window.location.assign('/')}>
            {copy.deletedAction}
          </button>
        </div>
      </div>
    </main>
  );
}
