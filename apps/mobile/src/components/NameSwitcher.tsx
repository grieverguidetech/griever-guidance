import { useRef, useState } from 'react';
import { Platform, Pressable, StyleSheet } from 'react-native';
import { fill, screenCopy } from '@griever/copy';
import type { Session } from '@griever/hooks';
import { colors } from '@griever/tokens';
import { Button, focusNode, Sheet, SerifText as Text } from '../ui';
import type { ButtonNode } from '../ui';
import { personLabel } from './PersonSwitcher';

const copy = screenCopy('phoneSwitcher');

/** Newest first, by when each person was last opened. Never mutates the list it is given. */
const newestFirst = (people: Session[]) => [...people].sort((a, b) => b.lastOpenedAt.localeCompare(a.lastOpenedAt));

export type NameSwitcherProps = {
  /** The open person's name, as shown. */
  name: string;
  /** The other people kept on this phone (not the open one). With none, the name is plain text. */
  others: Session[];
  onPick: (id: string) => void;
  /** Absent when the user cannot add a person (C11): the add button is then not drawn. */
  onAdd?: () => void;
};

/**
 * The open person's name, top-left of the person screen. With other people on the phone it is a
 * button that opens a sheet: the others, newest first, and the add button. Nothing here removes
 * anyone (C9).
 */
export function NameSwitcher({ name, others, onPick, onAdd }: NameSwitcherProps) {
  const [open, setOpen] = useState(false);
  const button = useRef<ButtonNode>(null);
  // What the sheet asked for, run once the sheet is gone so the screen swap and the announcement
  // do not land inside the closing modal (as the More sheet does).
  const after = useRef<(() => void) | null>(null);
  const label = fill(copy.nameLabel, { name });

  if (others.length === 0) {
    return (
      <Text accessibilityLabel={label} style={styles.name}>
        {name}
      </Text>
    );
  }

  // The sheet is gone: run what was chosen, or put focus back on the name if nothing was.
  const finish = () => {
    const next = after.current;
    after.current = null;
    if (next) {
      next();
      return;
    }
    focusNode(button.current);
  };
  const close = (next?: () => void) => {
    // A second close while the sheet slides out must not clear the choice already made.
    if (next) {
      after.current = next;
    }
    setOpen(false);
    if (Platform.OS !== 'ios') {
      setTimeout(finish, 0);
    }
  };

  return (
    <>
      <Pressable
        ref={button}
        role="button"
        accessibilityLabel={label}
        accessibilityHint={copy.nameHint}
        onPress={() => setOpen(true)}
        style={({ pressed }) => [styles.press, pressed && styles.pressed]}
      >
        <Text style={styles.name}>{name}</Text>
        {/* A small arrow so the name looks tappable. Hidden from screen readers: the hint says what it does. */}
        <Text style={styles.chevron} accessible={false} importantForAccessibility="no" accessibilityElementsHidden>
          ⌄
        </Text>
      </Pressable>
      <Sheet title={copy.title} closeLabel={copy.close} visible={open} onClose={() => close()} onDismiss={finish}>
        {newestFirst(others).map((person) => (
          <Button key={person.id} label={personLabel(person)} variant="secondary" onPress={() => close(() => onPick(person.id))} />
        ))}
        {onAdd ? <Button label={copy.addSomeone} variant="tinted" onPress={() => close(onAdd)} /> : null}
      </Sheet>
    </>
  );
}

const styles = StyleSheet.create({
  name: { fontSize: 28, lineHeight: 34, color: colors.ink, fontWeight: '600', flexShrink: 1 },
  press: { minHeight: 44, minWidth: 44, flexDirection: 'row', alignItems: 'center', gap: 6, flexShrink: 1 },
  pressed: { backgroundColor: colors['accent-100'] },
  chevron: { fontSize: 22, color: colors.ink },
});
