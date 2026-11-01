import { screenCopy } from '@griever/copy';

const copy = screenCopy('cmsShell');

interface Props {
  /** False for a member: they cannot start a person (C11), so the page only explains. */
  canCreate: boolean;
  onCreate: () => void;
  /** The first sync may still bring people, so nothing is offered yet: a calm line instead. */
  holding?: boolean;
}

/** A section or the Overview with nobody saved: one calm line and one next step. The shell owns the h1. */
export function EmptySection({ canCreate, onCreate, holding = false }: Props) {
  return (
    <section className="flex flex-col gap-4">
      <p className="m-0" role={holding ? 'status' : undefined}>{holding ? copy.emptyHolding : canCreate ? copy.emptyOwner : copy.emptyMember}</p>
      {canCreate && !holding ? (
        <button type="button" onClick={onCreate} className="gg-btn gg-btn-primary gg-btn-block">
          {copy.peopleCreateFirst}
        </button>
      ) : null}
    </section>
  );
}
