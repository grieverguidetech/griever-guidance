import { useRef, useState } from 'react';
import type { useSendFlow } from '@griever/hooks';
import { announceRecap, fill, screenCopy } from '@griever/copy';
import { Announce } from '@griever/ui';
import { SavedNote } from '../lib/ui';
import { StartAgain } from '../lib/StartAgain';
import { WhatYoullNeedSheet } from '../lib/WhatYoullNeedSheet';

type Flow = ReturnType<typeof useSendFlow>;

const copy = screenCopy('announce');

interface Props {
  flow: Flow;
  onEditSession: () => void;
}

/** The screen is the shared Announce in libs/ui; this holds what is web only: the sheet and Start again. */
export function AnnounceForm({ flow, onEditSession }: Props) {
  const { fields, setField, nextStep, prevStep, session } = flow;
  const [sheetOpen, setSheetOpen] = useState(false);
  // Loose on purpose: the shared Button hands back a DOM node on web.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const checklistButton = useRef<any>(null);
  const name = session?.personName?.trim() || copy.nameFallback;

  return (
    <div className="flex flex-col gap-4">
      <Announce
        copy={copy}
        eyebrow={fill(copy.forName, { name })}
        eyebrowTone="accent2"
        recap={announceRecap(session, copy)}
        note={fields['personalNote'] ?? ''}
        onNoteChange={(note) => setField('personalNote', note)}
        onBack={prevStep}
        onWhatYoullNeed={() => setSheetOpen(true)}
        onEdit={onEditSession}
        onContinue={nextStep}
        checklistRef={checklistButton}
        footer={
          <>
            <SavedNote />
            <StartAgain flow={flow} />
          </>
        }
      />
      {sheetOpen && <WhatYoullNeedSheet onClose={() => setSheetOpen(false)} returnFocusRef={checklistButton} />}
    </div>
  );
}
