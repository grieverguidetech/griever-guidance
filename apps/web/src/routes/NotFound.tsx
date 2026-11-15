import { useEffect, useRef } from 'react';
import { Link } from 'react-router';
import { screenCopy } from '@griever/copy';
import { paths } from './paths';

const copy = screenCopy('notFound');

/**
 * Shown for any path the app does not own. One calm sentence and a way back. The link goes to `/`
 * until /people is routed (a later routing ticket repoints it with `paths.people()`).
 */
export function NotFound() {
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    heading.current?.focus();
  }, []);
  return (
    <main className="mx-auto flex max-w-[480px] flex-col gap-3 px-5 pt-[52px]">
      <h1 ref={heading} tabIndex={-1} className="text-[22px]">
        {copy.heading}
      </h1>
      <p className="text-[14px] leading-[1.6] m-0" style={{ color: 'var(--text-muted)' }}>
        {copy.body}
      </p>
      <Link to={paths.landing()} className="gg-btn gg-btn-secondary gg-btn-block">
        {copy.link}
      </Link>
    </main>
  );
}
