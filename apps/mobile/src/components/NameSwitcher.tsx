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
  // A person was picked or Add someone chosen: the screen changes, so focus is not sent back here.
  const left = useRef(false);
  const label = fill(copy.nameLabel, { name });

  if (others.length === 0) {
    return (
      <Text accessibilityLabel={label} style={styles.name}>
        {name}
      </Text>
    );
  }

  const focusButton = () => {
    if (!left.current) {
      focusNode(button.current);
    }
  };
  const close = () => {
    setOpen(false);
    if (Platform.OS !== 'ios') {
      setTimeout(focusButton, 0);
    }
  };
  const leave = (act: () => void) => {
    left.current = true;
    setOpen(false);
    act();
  };

  return (
    <>
      <Pressable
        ref={button}
        role="button"
        accessibilityLabel={label}
        accessibilityHint={copy.nameHint}
        onPress={() => {
          left.current = false;
          setOpen(true);
        }}
        style={styles.press}
      >
        <Text style={styles.name}>{name}</Text>
      </Pressable>
      <Sheet title={copy.title} closeLabel={copy.close} visible={open} onClose={close} onDismiss={focusButton}>
        {newestFirst(others).map((person) => (
          <Button key={person.id} label={personLabel(person)} variant="secondary" onPress={() => leave(() => onPick(person.id))} />
        ))}
        {onAdd ? <Button label={copy.addSomeone} variant="tinted" onPress={() => leave(onAdd)} /> : null}
      </Sheet>
    </>
  );
}

const styles = StyleSheet.create({
  name: { fontSize: 28, lineHeight: 34, color: colors.ink, fontWeight: '600', flexShrink: 1 },
  press: { minHeight: 44, justifyContent: 'center', flexShrink: 1 },
});
