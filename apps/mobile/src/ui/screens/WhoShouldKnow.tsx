import { useEffect, useId, useRef, useState } from 'react';
import type { ComponentRef, ReactNode, Ref } from 'react';
import {
  AccessibilityInfo,
  FlatList,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { colors, minTouchTarget, radius, spacing } from '@griever/tokens';
import { Button } from '../Button';
import { SerifText } from '../SerifText';
import type { ButtonNode } from '../Button';
import { Heading } from '../Heading';
import type { HeadingProps } from '../Heading';
import { Phrasing } from '../phrasing';
import { Card } from '../Card';
import { Body } from '../Text';
import { focusNode } from '../focusNode';
import { useSerifStyle } from '../typography';

type TextInputNode = ComponentRef<typeof TextInput>;

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
  /** Has a {group} placeholder: the full name of a Select all button. Starts with `selectAll`. */
  selectAllFor: string;
  /** Why Continue is unavailable. */
  chooseOne: string;
  /** A muted line when Continue works with no one ticked. */
  noneYet: string;
  /** Why Add is unavailable. */
  fillBoth: string;
  addAnother: string;
  nameLabel: string;
  namePlaceholder: string;
  phoneLabel: string;
  phonePlaceholder: string;
  add: string;
  cancel: string;
  badNumber: string;
  continue: string;
  empty: string;
  bringAcross: string;
  /** The search field's label. Only shown when `search` is set. */
  searchLabel: string;
  /** Shown when the search matches no one. Only used when `search` is set. */
  searchEmpty: string;
  /** The accessible name of Select all while a search is active. */
  selectAllShown: string;
  /** Contacts are blocked for good: only Settings can turn them on. */
  blockedLine: string;
  openSettings: string;
  /** Shown instead of the bring-across label while the import runs. */
  bringAcrossBusy: string;
  /** A muted line while the saved people load. */
  loadingPeople: string;
  /** A muted tag on a row already sent this moment. */
  sent: string;
  /** Add by hand did not save. */
  saveFailed: string;
  /** Shown on Add while it saves. */
  saving: string;
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
  /** The count line, already built (for example "2 selected"). It is read out when it changes. */
  selectedLabel: string;
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
  /** Mobile only: "Add from your contacts" (import from the phone's contacts). Leave unset on web. */
  bringAcross?: {
    onPress: () => void;
    /** The import is running. */
    busy?: boolean;
    /** A calm line when it did not work. */
    notice?: string;
    /**
     * Contacts are turned off for good: shows the calm line and an Open Settings button (focused when it
     * appears). The import button stays, so a press asks again and carries on if it is allowed now.
     */
    blocked?: { onOpenSettings: () => void };
    buttonRef?: Ref<ButtonNode>;
  };
  /** Mobile: the contacts are still loading, so the empty line is not shown yet. */
  loading?: boolean;
  /** After the Continue button, for example the saved note. */
  footer?: ReactNode;
  headingRef?: HeadingProps['headingRef'];
  /**
   * Mobile: a name search above the list, and a Select all for the single list that acts on the
   * people shown. Leave unset on web. The typed text is kept in this component only.
   */
  search?: boolean;
  /**
   * Mobile: extra buttons that tick a ready-made group of people, for example "Everyone you told".
   * Each one only adds ticks. Leave unset on web.
   */
  shortcuts?: { label: string; accessibilityName?: string; onPress: () => void }[];
  /** Mobile: Continue works with no one ticked (service and obituary can be shared without a text). Leave unset on web. */
  allowNone?: boolean;
  /** Mobile: ids of the people already sent this moment. Their rows get a muted "Sent" tag. Leave unset on web. */
  toldIds?: string[];
  /**
   * Mobile: the list is a FlatList that scrolls by itself, and the count and Continue stay pinned below it.
   * The parent must give this screen a height (flex 1) and must not wrap it in a ScrollView. The list is
   * flat (not grouped). Leave unset on web.
   */
  scrollList?: boolean;
  /**
   * Mobile: Add another person ignores a second press while it saves, shows "Saving…", and says so calmly
   * if the save fails (what was typed stays). Leave unset on web, where Add works as it always did.
   */
  guardedAdd?: boolean;
}

/**
 * "Who should know?": pick the people who get the message. Mobile's own screen
 * (apps/mobile/src/ui).
 */
export function WhoShouldKnow({
  copy,
  people,
  grouped,
  selectedIds,
  selectedLabel,
  onToggle,
  onSelectAll,
  toE164,
  onAddPerson,
  onBack,
  onContinue,
  onWhatYoullNeed,
  checklistRef,
  bringAcross,
  loading,
  footer,
  headingRef,
  search = false,
  shortcuts,
  allowNone = false,
  toldIds,
  scrollList = false,
  guardedAdd = false,
}: WhoShouldKnowProps) {
  const [query, setQuery] = useState('');
  const needle = search ? query.trim().toLowerCase() : '';
  const shown = needle
    ? people.filter((p) => p.name.toLowerCase().includes(needle))
    : people;
  const sections = grouped
    ? [
        {
          key: 'first',
          label: copy.tierFirst,
          items: shown.filter((p) => (p.tier ?? 'family') === 'first'),
        },
        {
          key: 'family',
          label: copy.tierFamily,
          items: shown.filter((p) => (p.tier ?? 'family') === 'family'),
        },
      ].filter((s) => s.items.length > 0)
    : [{ key: 'all', label: null, items: shown }];
  const noneChosen = selectedIds.length === 0 && !allowNone;
  const noneNote = allowNone && selectedIds.length === 0;
  const reasonId = useId();
  const noteId = useId();
  const settingsRef = useRef<ButtonNode>(null);
  const blockedLineRef = useRef<ComponentRef<typeof Text>>(null);
  const isBlocked = Boolean(bringAcross?.blocked);
  // The calm line appears with Open Settings: put the screen reader on the line, so it is read in full.
  // Open Settings is the next swipe. (Focusing the button would cut the line off on iOS.)
  useEffect(() => {
    if (isBlocked) {
      focusNode(blockedLineRef.current);
    }
  }, [isBlocked]);
  const told = new Set(toldIds ?? []);
  const row = (person: WhoPerson) => (
    <PersonRow
      person={person}
      selected={selectedIds.includes(person.id)}
      onToggle={() => onToggle(person.id)}
      toldLabel={told.has(person.id) ? copy.sent : undefined}
    />
  );

  const topBar = (
    <View style={styles.topBar}>
      <Button label={copy.back} variant="header" onPress={onBack} />
      {onWhatYoullNeed ? (
        <Button
          label={copy.checklist}
          variant="header"
          opensDialog
          onPress={onWhatYoullNeed}
          buttonRef={checklistRef}
        />
      ) : null}
    </View>
  );
  const head = (
    <View style={styles.head}>
      <Heading level={1} headingRef={headingRef}>
        {copy.heading}
      </Heading>
      <Body tone="muted">
        {grouped ? copy.introGrouped : copy.introUngrouped}
      </Body>
    </View>
  );
  const searchField =
    search && people.length > 0 ? (
      <Field
        label={copy.searchLabel}
        value={query}
        onChangeText={setQuery}
        search
      />
    ) : null;
  const shortcutRow =
    shortcuts && shortcuts.length > 0 && people.length > 0 ? (
      <View style={styles.shortcuts}>
        {shortcuts.map((shortcut) => (
          <Button
            key={shortcut.label}
            label={shortcut.label}
            accessibilityName={shortcut.accessibilityName}
            variant="secondary"
            onPress={shortcut.onPress}
          />
        ))}
      </View>
    ) : null;
  const selectAllShownRow =
    search && !grouped && shown.length > 0 ? (
      <View style={styles.sectionHead}>
        <Button
          label={copy.selectAll}
          accessibilityName={needle ? copy.selectAllShown : undefined}
          variant="tertiary"
          onPress={() => onSelectAll(shown.map((p) => p.id))}
        />
      </View>
    ) : null;
  const lines = (
    <>
      {search && people.length > 0 && shown.length === 0 ? (
        <LiveLine label={copy.searchEmpty} />
      ) : null}
      {loading ? <LiveLine label={copy.loadingPeople} /> : null}
      {people.length === 0 && !loading ? (
        <Body tone="muted">{copy.empty}</Body>
      ) : null}
    </>
  );
  const bringAcrossRow = bringAcross ? (
    <View style={styles.bringAcross}>
      {bringAcross.blocked ? (
        <>
          <Body tone="muted" textRef={blockedLineRef}>
            {copy.blockedLine}
          </Body>
          <Button
            label={copy.openSettings}
            variant="secondary"
            buttonRef={settingsRef}
            onPress={bringAcross.blocked.onOpenSettings}
          />
        </>
      ) : null}
      <Button
        label={copy.bringAcross}
        busyLabel={copy.bringAcrossBusy}
        variant="secondary"
        busy={bringAcross.busy}
        buttonRef={bringAcross.buttonRef}
        onPress={() => {
          if (!bringAcross.busy) {
            bringAcross.onPress();
          }
        }}
      />
      <Alert message={bringAcross.notice} />
    </View>
  ) : null;
  const addByHand = (
    <AddByHand copy={copy} toE164={toE164} onAddPerson={onAddPerson} guarded={guardedAdd} />
  );
  const bottom = (
    <>
      {noneChosen ? (
        <Body id={reasonId} hidden small tone="muted">
          {copy.chooseOne}
        </Body>
      ) : null}
      {noneNote ? (
        <Body id={noteId} small tone="muted">
          {copy.noneYet}
        </Body>
      ) : null}
      <View style={[styles.footerRow, scrollList && styles.footerRowWrap]}>
        {scrollList ? (
          <View style={styles.countBox}>
            <SelectedCount label={selectedLabel} />
          </View>
        ) : (
          <SelectedCount label={selectedLabel} />
        )}
        <Button
          label={copy.continue}
          ariaDisabled={noneChosen}
          announceDisabled
          describedBy={noneChosen ? reasonId : noneNote ? noteId : undefined}
          hint={noneChosen ? copy.chooseOne : noneNote ? copy.noneYet : undefined}
          onPress={() => {
            if (!noneChosen) {
              onContinue();
            }
          }}
        />
      </View>
    </>
  );

  if (scrollList) {
    return (
      <View style={styles.fill}>
        <FlatList
          style={styles.fill}
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          data={shown}
          keyExtractor={(person) => person.id}
          renderItem={({ item }) => row(item)}
          ItemSeparatorComponent={RowGap}
          ListHeaderComponent={
            <View style={[styles.screen, styles.listEdge]}>
              {topBar}
              {head}
              {searchField}
              {shortcutRow}
              {selectAllShownRow}
            </View>
          }
          ListEmptyComponent={<View style={styles.screen}>{lines}</View>}
          ListFooterComponent={
            <View style={[styles.screen, styles.listEdge]}>
              {bringAcrossRow}
              {addByHand}
              {footer}
            </View>
          }
        />
        <View style={styles.sticky}>{bottom}</View>
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      {topBar}
      {head}
      {searchField}
      {shortcutRow}
      {selectAllShownRow}
      {sections.map((section) => (
        <View key={section.key} style={styles.section}>
          {section.label ? (
            <View style={styles.sectionHead}>
              <Heading level={2}>{section.label}</Heading>
              <Button
                label={copy.selectAll}
                accessibilityName={copy.selectAllFor.replace(
                  '{group}',
                  section.label,
                )}
                variant="tertiary"
                onPress={() => onSelectAll(section.items.map((p) => p.id))}
              />
            </View>
          ) : null}
          {section.items.length > 0 ? (
            <View role="list" style={styles.list}>
              {section.items.map((person) => (
                <View key={person.id} role="listitem">
                  {row(person)}
                </View>
              ))}
            </View>
          ) : null}
        </View>
      ))}
      {lines}
      {bringAcrossRow}
      {addByHand}
      {bottom}
      {footer}
    </View>
  );
}

const RowGap = () => <View style={styles.rowGap} />;

const DANGER = '#b91c1c';

/** "Add another person": a button that opens a small form. Holds only what is typed. */
function AddByHand({
  copy,
  toE164,
  onAddPerson,
  guarded,
}: Pick<WhoShouldKnowProps, 'copy' | 'toE164' | 'onAddPerson'> & { guarded: boolean }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [returnFocus, setReturnFocus] = useState(false);
  const [saving, setSaving] = useState(false);
  const inFlight = useRef(false);
  const nameRef = useRef<TextInputNode>(null);
  const addAnotherRef = useRef<ButtonNode>(null);
  const reasonId = useId();
  const errorId = useId();

  // Focus follows the form: into Name when it opens, back to the opener when it closes.
  useEffect(() => {
    if (open) {
      nameRef.current?.focus();
    } else if (returnFocus) {
      focusNode(addAnotherRef.current);
      setReturnFocus(false);
    }
  }, [open, returnFocus]);

  const close = () => {
    setOpen(false);
    setName('');
    setPhone('');
    setError(null);
    setReturnFocus(true);
  };
  const empty = !name.trim() || !phone.trim();
  const submit = async () => {
    if (empty || inFlight.current) {
      return;
    }
    const e164 = toE164(phone);
    if (!e164) {
      setError(copy.badNumber);
      return;
    }
    if (!guarded) {
      // Web: as it always was.
      await onAddPerson({ name: name.trim(), phone: e164 });
      close();
      return;
    }
    inFlight.current = true;
    setSaving(true);
    setError(null);
    try {
      await onAddPerson({ name: name.trim(), phone: e164 });
      close();
    } catch {
      // What was typed stays, so nothing has to be typed again.
      setError(copy.saveFailed);
    } finally {
      inFlight.current = false;
      setSaving(false);
    }
  };

  if (!open) {
    return (
      <Button
        label={copy.addAnother}
        variant="tertiary"
        buttonRef={addAnotherRef}
        onPress={() => setOpen(true)}
      />
    );
  }
  return (
    <Card>
      <Field
        label={copy.nameLabel}
        placeholder={copy.namePlaceholder}
        value={name}
        onChangeText={setName}
        inputRef={nameRef}
      />
      <Field
        label={copy.phoneLabel}
        placeholder={copy.phonePlaceholder}
        value={phone}
        onChangeText={(v) => {
          setPhone(v);
          setError(null);
        }}
        phone
        errorId={error ? errorId : undefined}
      />
      <Alert message={error ?? undefined} id={errorId} />
      <View style={styles.formButtons}>
        <Button
          label={copy.add}
          busy={guarded && saving}
          busyLabel={copy.saving}
          ariaDisabled={empty}
          announceDisabled
          describedBy={empty ? reasonId : undefined}
          hint={empty ? copy.fillBoth : undefined}
          onPress={submit}
        />
        <Button label={copy.cancel} variant="tertiary" onPress={close} />
      </View>
      {empty ? (
        <Body id={reasonId} hidden small>
          {copy.fillBoth}
        </Body>
      ) : null}
    </Card>
  );
}

interface FieldProps {
  label: string;
  placeholder?: string;
  /** A search box: search key, a clear button, no autocorrect or capitals. */
  search?: boolean;
  value: string;
  onChangeText: (v: string) => void;
  phone?: boolean;
  inputRef?: Ref<TextInputNode>;
  /** Id of the error line when the value is not accepted. */
  errorId?: string;
}

/** Web: lets apps/web/src/styles.css draw its field focus ring (data-gg-field). Ignored on native. */
const webFieldHook: Record<string, unknown> = { dataSet: { ggField: 'true' } };

/** A calm error line. Web: an alert. Native: role=alert is silent there, so it is also announced. */
function Alert({ message, id }: { message?: string; id?: string }) {
  useEffect(() => {
    if (message && Platform.OS !== 'web') {
      AccessibilityInfo.announceForAccessibility(message);
    }
  }, [message]);
  if (!message) {
    return null;
  }
  const extra: Record<string, unknown> = id ? { id } : {};
  return (
    <SerifText role="alert" style={styles.error} {...extra}>
      {message}
    </SerifText>
  );
}

/** A calm line that is read out when it first shows (iOS ignores live regions, so it is announced too). */
export function LiveLine({ label }: { label: string }) {
  useEffect(() => {
    if (Platform.OS === 'ios') {
      AccessibilityInfo.announceForAccessibility(label);
    }
  }, [label]);
  return (
    <Body tone="muted" live>
      {label}
    </Body>
  );
}

/** The "2 selected" line: a polite live region, and announced on iOS when it changes (iOS ignores live regions). */
export function SelectedCount({ label }: { label: string }) {
  const first = useRef(true);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    if (Platform.OS === 'ios') {
      AccessibilityInfo.announceForAccessibility(label);
    }
  }, [label]);
  return (
    <Body tone="muted" live>
      {label}
    </Body>
  );
}

function Field({
  label,
  placeholder,
  value,
  onChangeText,
  phone = false,
  search = false,
  inputRef,
  errorId,
}: FieldProps) {
  const font = useSerifStyle('regular');
  const labelId = useId();
  return (
    <View style={styles.field}>
      <Body tone="strong" id={labelId}>
        {label}
      </Body>
      <TextInput
        ref={inputRef}
        style={[styles.input, font]}
        {...webFieldHook}
        aria-invalid={errorId ? true : undefined}
        aria-describedby={errorId}
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
        {...(search
          ? {
              returnKeyType: 'search' as const,
              clearButtonMode: 'while-editing' as const,
              autoCorrect: false,
              autoCapitalize: 'none' as const,
            }
          : {})}
      />
    </View>
  );
}

/** One person: a whole-line checkbox. The tick is drawn, and hidden from screen readers (the state is read once). */
export function PersonRow({
  person,
  selected,
  onToggle,
  toldLabel,
}: {
  person: WhoPerson;
  selected: boolean;
  onToggle: () => void;
  /** A muted tag under the number, for a person already sent this moment (for example "Sent"). */
  toldLabel?: string;
}) {
  // react-native-web only presses a role=button on Space; a checkbox needs Space too.
  const spaceKey: Record<string, unknown> = {
    onKeyDown: (event: { key: string; preventDefault: () => void }) => {
      if (event.key === ' ') {
        event.preventDefault();
        onToggle();
      }
    },
  };
  return (
    <Pressable
      role="checkbox"
      aria-checked={selected}
      accessibilityState={{ checked: selected }}
      onPress={onToggle}
      style={[styles.row, selected && styles.rowSelected]}
      {...(Platform.OS === 'web' ? spaceKey : {})}
    >
      <Phrasing>
        <Body tone="strong">{person.name}</Body>
        <Body tone="muted" small>
          {person.phone}
        </Body>
        {toldLabel ? (
          <Body tone="muted" small>
            {toldLabel}
          </Body>
        ) : null}
      </Phrasing>
      <View
        style={[styles.box, selected && styles.boxSelected]}
        accessible={false}
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        aria-hidden
      >
        {selected ? (
          <Text
            style={styles.tick}
            accessibilityElementsHidden
            importantForAccessibility="no-hide-descendants"
          >
            ✓
          </Text>
        ) : null}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  topBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  bringAcross: { gap: spacing[1] },
  footerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: spacing[1],
  },
  // Mobile list only: a long count wraps above Continue instead of squeezing it.
  footerRowWrap: { flexWrap: 'wrap', gap: spacing[2] },
  countBox: { flexShrink: 1 },
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
    borderWidth: 2,
    borderColor: colors['neutral-300'],
  },
  rowSelected: { borderColor: colors.accent },
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
  boxSelected: {
    backgroundColor: colors['accent-700'],
    borderColor: colors['accent-700'],
  },
  tick: { color: colors.white, fontSize: 12, fontWeight: '700' },
  screen: { gap: spacing[3] },
  fill: { flex: 1, backgroundColor: colors.bg },
  scrollContent: { padding: spacing[3], paddingTop: spacing[4] },
  listEdge: { paddingVertical: spacing[2] },
  rowGap: { height: spacing[2] },
  sticky: {
    gap: spacing[1],
    padding: spacing[3],
    borderTopWidth: 1,
    borderTopColor: colors['neutral-300'],
    backgroundColor: colors.bg,
  },
  head: { gap: spacing[1] },
  sectionHead: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  shortcuts: { gap: spacing[2] },
  section: { gap: spacing[2] },
  list: { gap: spacing[2] },
});
