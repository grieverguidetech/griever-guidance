import { useId, useRef, useState } from 'react';
import type { ReactNode, RefObject } from 'react';
import { screenCopy } from '@griever/copy';
import { Account } from '@griever/ui';
import type { ButtonNode } from '@griever/ui';
import { ChecklistRows } from '../lib/ChecklistRows';
import { WhatYoullNeedSheet } from '../lib/WhatYoullNeedSheet';

const copy = screenCopy('account');

interface Props {
  /** True when the account has no name yet: asks for a name instead of showing the account page. */
  asksName?: boolean;
  /** The saved name, if one is known yet. It can arrive after the screen opens. */
  senderName: string | null;
  onBack: () => void;
  /** Resolves true when saved. A false result keeps what was typed. */
  onSave: (name: string) => Promise<boolean>;
  onSignOut: () => void;
  /** Straight after sign-up: one primary Continue, which hands over the name and goes on to Home. */
  firstTime?: boolean;
  onContinue?: (name: string) => void;
  /** The background save of the sign-up name failed; Continue tries again. */
  saveFailed?: boolean;
  /** The identity hook's own calm copy, shown as-is. */
  error: string | null;
  /** Optional extra section under the form ("People helping you"). Nothing renders when absent. */
  peopleHelping?: ReactNode;
  /** False once the session has ended: the list is for a signed-in account page. */
  showChecklist?: boolean;
}

/** The screen is the shared Account in libs/ui; this holds what is web only: saving, the sheet, and the list under the form. */
export function Profile({ asksName, firstTime, onContinue, saveFailed, senderName, onBack, onSave, onSignOut, error, peopleHelping, showChecklist = true }: Props) {
  const id = useId();
  // Until the person types, show whatever name is known, including one that loads late.
  const [typed, setTyped] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [saved, setSaved] = useState(false);
  const [nameError, setNameError] = useState<string | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const checklistButton = useRef<ButtonNode>(null);
  const value = typed ?? senderName ?? '';

  async function submit() {
    if (pending) {
      return;
    }
    if (firstTime) {
      onContinue?.(value.trim());
      return;
    }
    if (!value.trim()) {
      setNameError(copy.nameRequired);
      return;
    }
    setNameError(null);
    setPending(true);
    setSaved(false);
    try {
      const ok = await onSave(value.trim());
      if (ok) {
        setTyped(null);
        setSaved(true);
      }
    } finally {
      setPending(false);
    }
  }

  // The name prompt and the first visit stay short: the list shows on the everyday account page.
  const showList = showChecklist && !asksName && !firstTime;

  let message = '';
  if (nameError) {
    message = nameError;
  } else if (saveFailed) {
    message = copy.saveFailed;
  } else if (error) {
    message = error;
  } else if (saved) {
    message = copy.saved;
  }
  const isError = Boolean(nameError || error || saveFailed);

  let intro: string | undefined;
  if (firstTime) {
    intro = copy.firstTimeIntro;
  } else if (asksName) {
    intro = copy.askIntro;
  }
  let primaryLabel = copy.save;
  if (firstTime) {
    primaryLabel = copy.continue;
  } else if (pending) {
    primaryLabel = copy.saving;
  }

  const screen = (
    <Account
      copy={copy}
      asksName={asksName}
      intro={intro}
      name={value}
      onNameChange={(next) => {
        setTyped(next);
        setSaved(false);
        setNameError(null);
      }}
      primaryLabel={primaryLabel}
      primaryBusy={pending}
      onPrimary={() => void submit()}
      onSignOut={firstTime ? undefined : onSignOut}
      status={{ message, tone: isError ? 'danger' : 'muted' }}
      onBack={onBack}
      // The list is on the page when it shows, so the button would be a second way to the same thing.
      onWhatYoullNeed={showList ? undefined : () => setSheetOpen(true)}
      checklistRef={checklistButton}
    />
  );
  const sheet = sheetOpen ? (
    <WhatYoullNeedSheet onClose={() => setSheetOpen(false)} returnFocusRef={checklistButton as unknown as RefObject<HTMLElement | null>} />
  ) : null;
  if (!peopleHelping && !showList) {
    return (
      <>
        {screen}
        {sheet}
      </>
    );
  }
  return (
    <div className="flex flex-col gap-6">
      {screen}
      {showList && (
        <section aria-labelledby={`${id}-need`} className="flex flex-col gap-3">
          <h2 id={`${id}-need`} className="text-[16px] m-0">
            {copy.checklist}
          </h2>
          <p className="text-[13px] m-0" style={{ color: 'var(--text-muted)' }}>
            Not today. Just so none of it surprises you.
          </p>
          <ChecklistRows />
        </section>
      )}
      {peopleHelping}
      {sheet}
    </div>
  );
}
