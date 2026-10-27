import { useRef, useState } from 'react';
import type { RefObject } from 'react';
import type { SessionDetails } from '@griever/shared';
import { isValidObituaryLink, obituaryLink } from '@griever/shared';
import { fill, screenCopy } from '@griever/copy';
import { ShareObituary as ShareObituaryScreen } from '@griever/ui';
import type { ButtonNode } from '@griever/ui';
import { OBITUARY_DRAFTING_ENABLED } from '../lib/features';
import { WhatYoullNeedSheet } from '../lib/WhatYoullNeedSheet';

const copy = screenCopy('shareObituary');

interface Props {
  session: SessionDetails;
  onBack: () => void;
  onChange: (patch: Partial<SessionDetails>) => void;
  onContinue: () => void;
  /** Not written yet — open the drafting screen. */
  onDraft: () => void;
}

/** The screen is the shared ShareObituary in libs/ui; this holds what is web only: the sheet and the drafting beta. */
export function ShareObituary({ session, onBack, onChange, onContinue, onDraft }: Props) {
  const [sheetOpen, setSheetOpen] = useState(false);
  // The shared Button hands back a DOM node on web; the sheet wants it typed as one.
  const checklistButton = useRef<ButtonNode>(null);
  const linkValid = isValidObituaryLink(session.obituaryUrl);
  const name = session.personName.trim() || copy.nameFallback;

  return (
    <div className="flex flex-col gap-4">
      <ShareObituaryScreen
        copy={copy}
        eyebrow={fill(copy.forName, { name })}
        eyebrowTone="accent2"
        link={session.obituaryUrl}
        onLinkChange={(obituaryUrl) => onChange({ obituaryUrl })}
        linkValid={linkValid}
        publisher={session.obituaryPublisher ?? ''}
        onPublisherChange={(obituaryPublisher) => onChange({ obituaryPublisher })}
        // The card is the message itself, so what is read here is what is sent.
        preview={linkValid ? obituaryLink.renderMessage({ deceasedName: name, obituaryUrl: session.obituaryUrl }) : undefined}
        onBack={onBack}
        onWhatYoullNeed={() => setSheetOpen(true)}
        onContinue={onContinue}
        // Hidden while drafting is off, as on mobile, until the template draft ships (#358).
        onDraft={OBITUARY_DRAFTING_ENABLED ? onDraft : undefined}
        checklistRef={checklistButton}
      />
      {sheetOpen && <WhatYoullNeedSheet onClose={() => setSheetOpen(false)} returnFocusRef={checklistButton as unknown as RefObject<HTMLElement | null>} />}
    </div>
  );
}
