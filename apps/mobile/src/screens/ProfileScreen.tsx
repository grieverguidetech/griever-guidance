import { useEffect, useRef, useState } from 'react';
import type { ComponentRef } from 'react';
import { AccessibilityInfo, findNodeHandle, Text } from 'react-native';
import { screenCopy } from '@griever/copy';
import { Account } from '@griever/ui';
import type { ButtonNode } from '@griever/ui';
import type { UseAccountResult } from '@griever/hooks';
import { WhatYoullNeedSheet } from '../components/WhatYoullNeedSheet';

const copy = screenCopy('account');

export const SESSION_ENDED = copy.sessionEnded;

type Props = {
  identity: UseAccountResult;
  /** A name typed at sign-up that is not saved yet; shown in the field until it is. */
  initialName?: string | null;
  /** The server ended the session: keep the typed name and offer sign in. */
  sessionEnded?: boolean;
  /** Called after any successful save, so an older unsaved name can never overwrite it. */
  onSaved: () => void;
  onBack: () => void;
  onSignOut: () => void;
  onSignInAgain: () => void;
};

/** The screen is the shared Account in libs/ui; this holds what is mobile only: saving, focus and the sheet. */
export function ProfileScreen({ identity, initialName, sessionEnded, onSaved, onBack, onSignOut, onSignInAgain }: Props) {
  const savedName = identity.profile?.senderName?.trim() ?? '';
  const source = initialName ?? savedName;
  const [name, setName] = useState(source);
  const [pending, setPending] = useState(false);
  const [saved, setSaved] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const touched = useRef(false);
  const heading = useRef<ComponentRef<typeof Text>>(null);
  const checklistButton = useRef<ButtonNode>(null);

  // The heading takes screen-reader focus when the screen opens.
  useEffect(() => {
    const handle = heading.current ? findNodeHandle(heading.current) : null;
    if (handle) {
      AccessibilityInfo.setAccessibilityFocus(handle);
    }
  }, []);

  // Fill the field from the account until the person starts typing; never overwrite their typing.
  useEffect(() => {
    if (!touched.current && !sessionEnded) {
      setName(source);
    }
  }, [source, sessionEnded]);

  const needsName = !sessionEnded && !savedName && !initialName;

  async function save() {
    if (pending) {
      return;
    }
    if (!name.trim()) {
      setLocalError(copy.nameRequired);
      return;
    }
    setLocalError(null);
    setPending(true);
    setSaved(false);
    try {
      const ok = await identity.updateSenderName(name.trim());
      setSaved(ok);
      if (ok) {
        onSaved();
      }
    } finally {
      setPending(false);
    }
  }

  // Order matters: a session that ended says so; otherwise the error, then the saved line.
  let message = '';
  let tone: 'muted' | 'danger' = 'muted';
  if (sessionEnded) {
    message = copy.sessionEnded;
  } else if (localError ?? identity.error) {
    message = localError ?? identity.error ?? '';
    tone = 'danger';
  } else if (saved) {
    message = copy.saved;
  }
  const showList = !needsName && !sessionEnded;
  let primaryLabel = copy.save;
  if (sessionEnded) {
    primaryLabel = copy.signIn;
  } else if (pending) {
    primaryLabel = copy.saving;
  }

  return (
    <>
      <Account
        copy={copy}
        asksName={needsName}
        intro={needsName ? copy.askIntro : undefined}
        name={name}
        onNameChange={(next) => {
          touched.current = true;
          setName(next);
          setLocalError(null);
        }}
        fieldDisabled={sessionEnded}
        primaryLabel={primaryLabel}
        primaryBusy={sessionEnded ? false : pending}
        onPrimary={sessionEnded ? onSignInAgain : save}
        onSignOut={sessionEnded ? undefined : onSignOut}
        offline={identity.offline}
        status={{ message, tone }}
        onBack={onBack}
        // The list is on the page when it shows; otherwise it opens in a sheet.
        onWhatYoullNeed={showList ? undefined : () => setSheetOpen(true)}
        checklistRef={checklistButton}
        headingRef={heading}
      />
      <WhatYoullNeedSheet visible={sheetOpen} onClose={() => setSheetOpen(false)} onDismiss={() => focusButton(checklistButton.current)} />
    </>
  );
}

function focusButton(node: ButtonNode | null) {
  const handle = node ? findNodeHandle(node) : null;
  if (handle) {
    AccessibilityInfo.setAccessibilityFocus(handle);
  }
}
