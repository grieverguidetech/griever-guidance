import { useRef, useState } from 'react';
import type { SessionDetails } from '@griever/shared';
import { isValidObituaryLink, normalizeUrl } from '@griever/shared';
import { fill, obituaryPreview, screenCopy } from '@griever/copy';
import { ShareObituary as ShareObituaryScreen } from '@griever/ui';
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
  // Loose on purpose: the shared Button hands back a DOM node on web.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const checklistButton = useRef<any>(null);
  const linkValid = isValidObituaryLink(session.obituaryUrl);

  return (
    <div className="flex flex-col gap-4">
      <ShareObituaryScreen
        copy={copy}
        eyebrow={fill(copy.forName, { name: session.personName.trim() || copy.nameFallback })}
        eyebrowTone="accent2"
        link={session.obituaryUrl}
        onLinkChange={(obituaryUrl) => onChange({ obituaryUrl })}
        linkValid={linkValid}
        publisher={session.obituaryPublisher ?? ''}
        onPublisherChange={(obituaryPublisher) => onChange({ obituaryPublisher })}
        preview={linkValid ? obituaryPreview(session, normalizeUrl(session.obituaryUrl), copy) : undefined}
        onBack={onBack}
        onWhatYoullNeed={() => setSheetOpen(true)}
        onContinue={onContinue}
        onDraft={onDraft}
        // Disabled here rather than on the form, so nobody fills in a whole form only to find the last button doesn't work.
        draftUnavailable={OBITUARY_DRAFTING_ENABLED ? undefined : copy.draftBeta}
        checklistRef={checklistButton}
      />
      {sheetOpen && <WhatYoullNeedSheet onClose={() => setSheetOpen(false)} returnFocusRef={checklistButton} />}
    </div>
  );
}
