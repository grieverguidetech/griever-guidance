import { useId, useState } from 'react';
import type { ReactNode, Ref } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { colors, minTouchTarget, radius, spacing } from '@griever/tokens';
import { Button } from '../Button';
import type { ButtonNode } from '../Button';
import { Heading } from '../Heading';
import type { HeadingProps } from '../Heading';
import { Phrasing } from '../phrasing';
import { Card } from '../Card';
import { Body } from '../Text';
import { useSerifStyle } from '../typography';

/** The words the screen needs. libs/copy/screens/whoShouldKnow.json has these keys. */
export interface WhoShouldKnowCopy {
  heading: string;
  introGrouped: string;
  introUngrouped: string;
  back: string;
  checklist: string;
  tierFirst: string;
  tierFamily: string;
  selectAll: string;
  addAnother: string;
  nameLabel: string;
  namePlaceholder: string;
  phoneLabel: string;
  phonePlaceholder: string;
  add: string;
  cancel: string;
  badNumber: string;
  /** Has a {count} placeholder. */
  selected: string;
  continue: string;
  empty: string;
  bringAcross: string;
}

export interface WhoPerson {
  id: string;
  name: string;
  /** Already formatted for reading. */
  phone: string;
  tier?: 'first' | 'family';
}

export interface WhoShouldKnowProps {
  copy: WhoShouldKnowCopy;
  people: WhoPerson[];
  /** Show Close family and Friends & family headings. */
  grouped: boolean;
  selectedIds: string[];
  onToggle: (id: string) => void;
  /** Select all of one group's people. */
  onSelectAll: (ids: string[]) => void;
  /** Turns what was typed into an international number, or null when it is not one. Validation stays with the app. */
  toE164: (raw: string) => string | null;
  /** Saves the new person. The app decides what else happens, for example selecting them. */
  onAddPerson: (input: { name: string; phone: string }) => Promise<void>;
  onBack: () => void;
  onContinue: () => void;
  /** Opens "What you'll need". Leave unset to hide the button. */
  onWhatYoullNeed?: () => void;
  /** For the sheet that "What you'll need" opens to return focus to. */
  checklistRef?: Ref<ButtonNode>;
  /** Mobile only: "Bring people across" (import from the phone's contacts). Leave unset on web. */
  bringAcross?: {
    onPress: () => void;
    /** The import is running. */
    busy?: boolean;
    /** A calm line when it did not work. */
    notice?: string;
    buttonRef?: Ref<ButtonNode>;
  };
  /** Mobile: the contacts are still loading, so the empty line is not shown yet. */
  loading?: boolean;
  /** After the Continue button, for example the saved note. */
  footer?: ReactNode;
  headingRef?: HeadingProps['headingRef'];
}

/**
 * "Who should know?": pick the people who get the message. Built from libs/ui so web (through
 * react-native-web) and mobile show the same screen.
 */
export function WhoShouldKnow({ copy, people, grouped, selectedIds, onToggle, onSelectAll, toE164, onAddPerson, onBack, onContinue, onWhatYoullNeed, checklistRef, bringAcross, loading, footer, headingRef }: WhoShouldKnowProps) {
  const sections = grouped
    ? [
        { key: 'first', label: copy.tierFirst, items: people.filter((p) => (p.tier ?? 'family') === 'first') },
        { key: 'family', label: copy.tierFamily, items: people.filter((p) => (p.tier ?? 'family') === 'family') },
      ].filter((s) => s.items.length > 0)
    : [{ key: 'all', label: null, items: people }];
  return (
    <View style={styles.screen}>
      <View style={styles.topBar}>
        <Button label={copy.back} variant="tertiary" onPress={onBack} />
        {onWhatYoullNeed ? (
          <Button label={copy.checklist} variant="tertiary" outlined opensDialog onPress={onWhatYoullNeed} buttonRef={checklistRef} />
        ) : null}
      </View>
      <View style={styles.head}>
        <Heading level={1} headingRef={headingRef}>{copy.heading}</Heading>
        <Body tone="muted">{grouped ? copy.introGrouped : copy.introUngrouped}</Body>
      </View>
      {sections.map((section) => (
        <View key={section.key} style={styles.section}>
          {section.label ? (
            <View style={styles.sectionHead}>
              <Heading level={2}>{section.label}</Heading>
              <Button label={copy.selectAll} variant="tertiary" onPress={() => onSelectAll(section.items.map((p) => p.id))} />
            </View>
          ) : null}
          {section.items.map((person) => (
            <PersonRow
              key={person.id}
              person={person}
              selected={selectedIds.includes(person.id)}
              onToggle={() => onToggle(person.id)}
            />
          ))}
        </View>
      ))}
      {people.length === 0 && !loading ? <Body tone="muted">{copy.empty}</Body> : null}
      {bringAcross ? (
        <View style={styles.bringAcross}>
          <Button
            label={copy.bringAcross}
            variant="secondary"
            busy={bringAcross.busy}
            buttonRef={bringAcross.buttonRef}
            onPress={() => {
              if (!bringAcross.busy) {
                bringAcross.onPress();
              }
            }}
          />
          {bringAcross.notice ? <Text role="alert" style={styles.error}>{bringAcross.notice}</Text> : null}
        </View>
      ) : null}
      <AddByHand copy={copy} toE164={toE164} onAddPerson={onAddPerson} />
      <View style={styles.footerRow}>
        <Body tone="muted">{copy.selected.replace('{count}', String(selectedIds.length))}</Body>
        <Button label={copy.continue} ariaDisabled={selectedIds.length === 0} onPress={() => selectedIds.length > 0 && onContinue()} />
      </View>
      {footer}
    </View>
  );
}

const DANGER = '#b91c1c';

/** "Add another person": a button that opens a small form. Holds only what is typed. */
function AddByHand({ copy, toE164, onAddPerson }: Pick<WhoShouldKnowProps, 'copy' | 'toE164' | 'onAddPerson'>) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [error, setError] = useState<string | null>(null);

  const close = () => {
    setOpen(false);
    setName('');
    setPhone('');
    setError(null);
  };
  const empty = !name.trim() || !phone.trim();
  const submit = async () => {
    if (empty) {
      return;
    }
    const e164 = toE164(phone);
    if (!e164) {
      setError(copy.badNumber);
      return;
    }
    await onAddPerson({ name: name.trim(), phone: e164 });
    close();
  };

  if (!open) {
    return <Button label={copy.addAnother} variant="tertiary" onPress={() => setOpen(true)} />;
  }
  return (
    <Card>
      <Field label={copy.nameLabel} placeholder={copy.namePlaceholder} value={name} onChangeText={setName} />
      <Field
        label={copy.phoneLabel}
        placeholder={copy.phonePlaceholder}
        value={phone}
        onChangeText={(v) => {
          setPhone(v);
          setError(null);
        }}
        phone
      />
      {error ? <Text role="alert" style={styles.error}>{error}</Text> : null}
      <View style={styles.formButtons}>
        <Button label={copy.add} ariaDisabled={empty} onPress={submit} />
        <Button label={copy.cancel} variant="tertiary" onPress={close} />
      </View>
    </Card>
  );
}

interface FieldProps {
  label: string;
  placeholder: string;
  value: string;
  onChangeText: (v: string) => void;
  phone?: boolean;
}

function Field({ label, placeholder, value, onChangeText, phone = false }: FieldProps) {
  const font = useSerifStyle('regular');
  const labelId = useId();
  return (
    <View style={styles.field}>
      <Body tone="strong" id={labelId}>
        {label}
      </Body>
      <TextInput
        style={[styles.input, font]}
        // Web names the field from the visible label; native reads the label text directly.
        aria-labelledby={labelId}
        accessibilityLabel={label}
        placeholder={placeholder}
        placeholderTextColor={colors['neutral-700']}
        value={value}
        onChangeText={onChangeText}
        keyboardType={phone ? 'phone-pad' : 'default'}
        inputMode={phone ? 'tel' : 'text'}
        autoComplete={phone ? 'tel' : 'off'}
      />
    </View>
  );
}

/** One person: a whole-line checkbox. The tick is drawn, and hidden from screen readers (the state is read once). */
function PersonRow({ person, selected, onToggle }: { person: WhoPerson; selected: boolean; onToggle: () => void }) {
  return (
    <Pressable
      role="checkbox"
      aria-checked={selected}
      accessibilityState={{ checked: selected }}
      onPress={onToggle}
      style={[styles.row, selected && styles.rowSelected]}
    >
      <Phrasing>
        <Body tone="strong">{person.name}</Body>
        <Body tone="muted" small>
          {person.phone}
        </Body>
      </Phrasing>
      <View
        style={[styles.box, selected && styles.boxSelected]}
        accessible={false}
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        aria-hidden
      >
        {selected ? (
          <Text style={styles.tick} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
            ✓
          </Text>
        ) : null}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  topBar: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  bringAcross: { gap: spacing[1] },
  footerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingTop: spacing[2] },
  field: { gap: spacing[1] },
  input: {
    minHeight: minTouchTarget,
    paddingHorizontal: spacing[2],
    borderWidth: 1,
    borderColor: colors['neutral-600'],
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    color: colors.ink,
    fontSize: 14,
  },
  error: { fontSize: 12, color: DANGER },
  formButtons: { flexDirection: 'row', gap: spacing[2], alignItems: 'center' },
  row: {
    minHeight: minTouchTarget,
    justifyContent: 'center',
    gap: 2,
    paddingVertical: spacing[2],
    paddingLeft: spacing[3],
    paddingRight: spacing[8],
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors['neutral-300'],
  },
  rowSelected: { borderWidth: 2, borderColor: colors.accent },
  box: {
    position: 'absolute',
    right: spacing[3],
    top: '50%',
    marginTop: -10,
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors['neutral-600'],
    alignItems: 'center',
    justifyContent: 'center',
  },
  boxSelected: { backgroundColor: colors['accent-700'], borderColor: colors['accent-700'] },
  tick: { color: colors.white, fontSize: 12, fontWeight: '700' },
  screen: { gap: spacing[3] },
  head: { gap: spacing[1] },
  sectionHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  section: { gap: spacing[2] },
});
