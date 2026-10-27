import { useRef, useState } from 'react';
import type { RefObject } from 'react';
import type { Session } from '@griever/hooks';
import { screenCopy } from '@griever/copy';
import { PersonSetup } from '@griever/ui';
import type { ButtonNode } from '@griever/ui';
import { SavedNote } from '../lib/ui';
import { DateInput, todayISO } from '../lib/DateField';
import { WhatYoullNeedSheet } from '../lib/WhatYoullNeedSheet';

const copy = screenCopy('personSetup');

interface Props {
  session: Session;
  editing: boolean;
  onChange: (patch: Partial<Session>) => void;
  onContinue: () => void;
  onBack: () => void;
}

/**
 * The screen is the shared PersonSetup in libs/ui; this holds what is web only: the sheet and the
 * typed date field with its calendar button. Date of death is optional, so pre-planning and recent
 * losses both proceed; only the name is required.
 */
export function SessionSetup({ session, editing, onChange, onContinue, onBack }: Props) {
  const [sheetOpen, setSheetOpen] = useState(false);
  // The shared Button hands back a DOM node on web; the sheet wants it typed as one.
  const checklistButton = useRef<ButtonNode>(null);

  return (
    <div className="flex flex-col gap-4">
      <PersonSetup
        copy={copy}
        editing={editing}
        name={session.personName}
        onNameChange={(personName) => onChange({ personName })}
        renderDate={({ labelId }) => (
          <DateInput id="s-date" labelledBy={labelId} value={session.dateOfPassing ?? ''} max={todayISO()} onChange={(dateOfPassing) => onChange({ dateOfPassing })} />
        )}
        sender={session.senderName}
        onSenderChange={(senderName) => onChange({ senderName })}
        onBack={onBack}
        onWhatYoullNeed={() => setSheetOpen(true)}
        onContinue={onContinue}
        footer={<SavedNote />}
        checklistRef={checklistButton}
      />
      {sheetOpen && <WhatYoullNeedSheet onClose={() => setSheetOpen(false)} returnFocusRef={checklistButton as unknown as RefObject<HTMLElement | null>} />}
    </div>
  );
}
