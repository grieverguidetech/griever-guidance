import { describe, expect, it, jest } from '@jest/globals';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { Keyboard, ScrollView, StyleSheet, TextInput } from 'react-native';
import { ShareObituary } from './ShareObituary';
import type { ShareObituaryCopy, ShareObituaryProps } from './ShareObituary';
import { tierOfButton } from '../buttonTier.testkit';

const copy: ShareObituaryCopy = {
  heading: 'Has the obituary been published?',
  intro: "Once it's up, this is how most people will learn about the service.",
  back: 'Back',
  checklist: "What you'll need",
  linkLabel: 'Link to the obituary',
  linkPlaceholder: 'Paste the link from the paper or funeral home',
  publisherLabel: 'Where it was published',
  optional: '(optional)',
  publisherPlaceholder: 'e.g. The Waltham Register',
  previewKicker: "We'll send",
  continue: 'Choose who to send it to',
  needLink: 'Paste the link to the obituary to continue.',
  invalidLink: "That link doesn't look right. Copy it again from the paper or funeral home.",
  waiting: "Not published yet? We'll wait.",
  draftTitle: 'Not written yet?',
  draftBody: 'We can help you draft it.',
  draftButton: 'Help me write it',
  emailTitle: 'Step 1',
  emailBody: 'Your email app opens.',
  emailButton: 'Email it to the paper or funeral home',
  emailNoText: "Once it's written, come back here.",
  emailFailed: "We couldn't open email.",
  emailOpened: "Opened in your email app. Come back when it's published.",
  copyButton: 'Copy the text',
  copied: 'Copied.',
  copyFailed: "We couldn't copy the text on this phone.",
  emailShared: "Shared from your phone. Come back when it's published.",
  pasteNotLink: "That doesn't look like a link.",
  pasted: 'Link pasted.',
  linkStepLabel: "Step 2: once it's published, paste the link",
  pasteButton: 'Paste link',
  doneButton: 'Done',
  doneHint: 'Marks the obituary done',
};

/** Every string in the rendered host tree, depth first, so the order is the reading order. */
type Json = NonNullable<ReturnType<typeof screen.toJSON>>;
function textsInOrder(node: Json | null): string[] {
  if (node === null) {
    return [];
  }
  if (Array.isArray(node)) {
    return node.flatMap((child: Json) => textsInOrder(child));
  }
  return (node.children ?? []).flatMap((child: string | Json) => (typeof child === 'string' ? [child] : textsInOrder(child)));
}

function setup(over: Partial<ShareObituaryProps> = {}) {
  render(
    <ShareObituary
      copy={copy}
      eyebrow="For Margaret"
      eyebrowTone="accent2"
      link=""
      linkValid={false}
      publisher=""
      onBack={jest.fn()}
      onWhatYoullNeed={jest.fn()}
      onLinkChange={jest.fn()}
      onPublisherChange={jest.fn()}
      onContinue={jest.fn()}
      {...over}
    />,
  );
}

describe('ShareObituary button tiers (#1065)', () => {
  it('draws Back and What you will need as secondary (#1075)', () => {
    setup();
    expect(tierOfButton('Back')).toBe('secondary');
    expect(tierOfButton("What you'll need")).toBe('secondary');
  });
});

describe('ShareObituary Done after emailing (#726)', () => {
  const editor = { value: 'Anna loved the garden.', onValueChange: jest.fn() };
  const email = { hasText: true, onPress: jest.fn() };

  it('shows no Done until the obituary was emailed', () => {
    setup({ publisherEmail: email, onDone: jest.fn() });
    expect(screen.queryByRole('button', { name: 'Done' })).toBeNull();
  });

  it('shows Done in the bottom bar once emailed, reads the hint, and calls onDone on a tap', () => {
    const onDone = jest.fn();
    setup({ publisherEmail: email, emailed: true, onDone });
    const done = screen.getByRole('button', { name: 'Done' });
    expect(done.props.accessibilityHint).toBe('Marks the obituary done');
    expect(screen.getByTestId('obituary-done-bar')).toBeTruthy();
    fireEvent.press(done);
    expect(onDone).toHaveBeenCalledTimes(1);
  });

  it('keeps Done, the email card and Continue visible with the text box on screen', () => {
    setup({ publisherEmail: email, emailed: true, onDone: jest.fn(), textEditor: editor, link: 'https://legacy.com/anna', linkValid: true });
    expect(screen.getByRole('button', { name: 'Done' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Email it to the paper or funeral home' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Choose who to send it to' })).toBeTruthy();
  });

  it('keeps Done on screen with the keyboard open (its inset is dropped by a negative margin)', () => {
    setup({ publisherEmail: email, emailed: true, keyboardOpen: true, onDone: jest.fn() });
    expect(screen.getByRole('button', { name: 'Done' })).toBeTruthy();
    expect(screen.getByTestId('obituary-done-wrap').props.style).toEqual({ marginBottom: -0 });
  });

  it('keeps Step 2 (Continue) available beside Done', () => {
    setup({ publisherEmail: email, emailed: true, onDone: jest.fn(), link: 'https://legacy.com/anna', linkValid: true });
    expect(screen.getByRole('button', { name: 'Choose who to send it to' })).toBeTruthy();
  });
});

describe('ShareObituary (mobile steps, #650)', () => {
  it('says the obituary is not written, with no email button, when there is no text', () => {
    setup({ publisherEmail: { hasText: false, onPress: jest.fn() } });
    expect(screen.getByText("Once it's written, come back here.")).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Email it to the paper or funeral home' })).toBeNull();
  });

  it('shows the step 2 label when Step 1 shows', () => {
    setup({ publisherEmail: { hasText: true, onPress: jest.fn() } });
    expect(screen.getByRole('heading', { name: "Step 2: once it's published, paste the link" })).toBeTruthy();
  });

  it('shows no Step 2 heading without publisherEmail, even when the copy has the label', () => {
    setup();
    expect(screen.queryByRole('heading', { name: /Step 2/ })).toBeNull();
  });

  it('shows no opened line before mail opens', () => {
    setup({ publisherEmail: { hasText: true, onPress: jest.fn() } });
    expect(screen.queryByText(/Opened in your email app/)).toBeNull();
  });

  it('shows the opened line once mail opened', () => {
    setup({ publisherEmail: { hasText: true, onPress: jest.fn(), note: 'opened' } });
    expect(screen.getByText("Opened in your email app. Come back when it's published.")).toBeTruthy();
  });

  it('shows the shared line, not the opened line, after the share sheet completed', () => {
    setup({ publisherEmail: { hasText: true, onPress: jest.fn(), note: 'shared' } });
    expect(screen.getByText("Shared from your phone. Come back when it's published.")).toBeTruthy();
    expect(screen.queryByText(/Opened in your email app/)).toBeNull();
  });

  it('says the copy failed, and not Copied', () => {
    setup({ publisherEmail: { hasText: true, onPress: jest.fn(), onCopyText: jest.fn(), copyFailed: true } });
    expect(screen.getByText("We couldn't copy the text on this phone.")).toBeTruthy();
    expect(screen.queryByText('Copied.')).toBeNull();
  });

  it('shows the paste line after the Paste link button, in reading order', () => {
    setup({ onPasteLink: jest.fn(), pasteMessage: 'Link pasted.' });
    const texts = textsInOrder(screen.toJSON());
    const at = (s: string) => texts.findIndex((t) => t.includes(s));
    expect(at('Link to the obituary')).toBeGreaterThanOrEqual(0);
    expect(at('Link to the obituary')).toBeLessThan(at('Paste link'));
    expect(at('Paste link')).toBeLessThan(at('Link pasted.'));
    expect(at('Link pasted.')).toBeGreaterThanOrEqual(0);
  });

  it('offers Copy the text, and says Copied after it worked', () => {
    const onCopyText = jest.fn();
    setup({ publisherEmail: { hasText: true, onPress: jest.fn(), failed: true, onCopyText, copied: true } });
    fireEvent.press(screen.getByRole('button', { name: 'Copy the text' }));
    expect(onCopyText).toHaveBeenCalledTimes(1);
    expect(screen.getByText('Copied.')).toBeTruthy();
  });

  it('shows Paste link only when a handler is given, and calls it', () => {
    const onPasteLink = jest.fn();
    setup({ onPasteLink });
    fireEvent.press(screen.getByRole('button', { name: 'Paste link' }));
    expect(onPasteLink).toHaveBeenCalledTimes(1);
  });

  it('hides Paste link and Copy the text when no handlers are given', () => {
    setup({ publisherEmail: { hasText: true, onPress: jest.fn() } });
    expect(screen.queryByRole('button', { name: 'Paste link' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Copy the text' })).toBeNull();
  });
});

describe('ShareObituary text box (#823, #968)', () => {
  const editorCopy = {
    textTitle: 'The obituary text',
    textCaption: 'Read it one last time and make any last changes.',
    editLabel: 'Obituary text',
    editPlaceholder: 'Write the obituary here.',
    messageEdit: 'Edit',
    textEditName: 'Edit obituary text',
    messageDone: 'Done',
    textDoneName: 'Done editing',
  };
  const editor = (over = {}) => ({ value: 'Anna loved the garden.', onValueChange: jest.fn(), ...over });
  const draw = (e: ReturnType<typeof editor>, extra = {}) =>
    render(<ShareObituary copy={{ ...copy, ...editorCopy, ...extra }} eyebrow="For Margaret" link="" linkValid={false} publisher="" onBack={jest.fn()} onWhatYoullNeed={jest.fn()} onLinkChange={jest.fn()} onPublisherChange={jest.fn()} onContinue={jest.fn()} textEditor={e} />);
  const edit = () => fireEvent.press(screen.getByRole('button', { name: 'Edit obituary text' }));

  it('shows no card without textEditor, as the web does', () => {
    setup();
    expect(screen.queryByText('The obituary text')).toBeNull();
  });

  it('reads as plain text by default, with the label, an Edit message button and the caption', () => {
    draw(editor());
    expect(screen.UNSAFE_queryAllByType(TextInput).find((i) => i.props.accessibilityLabel === 'Obituary text')).toBeUndefined();
    const text = screen.getByLabelText('Obituary text');
    expect(text.props.accessibilityValue).toEqual({ text: 'Anna loved the garden.' });
    expect(screen.getByText('Anna loved the garden.')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Edit obituary text' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Done editing' })).toBeNull();
    expect(screen.getByText('Read it one last time and make any last changes.')).toBeTruthy();
  });

  it('tapping the text or the label does not open an editor', () => {
    draw(editor());
    fireEvent.press(screen.getByText('Anna loved the garden.'));
    fireEvent.press(screen.getByText('Obituary text'));
    expect(screen.UNSAFE_queryAllByType(TextInput).find((i) => i.props.accessibilityLabel === 'Obituary text')).toBeUndefined();
  });

  it('one tap on Edit opens a focused multiline box with the cursor at the start', () => {
    draw(editor());
    edit();
    const box = screen.getByLabelText('Obituary text');
    expect(box.props.multiline).toBe(true);
    expect(box.props.autoFocus).toBe(true);
    expect(box.props.selection).toEqual({ start: 0, end: 0 });
    expect(box.props.value).toBe('Anna loved the garden.');
    expect(screen.getByRole('button', { name: 'Done editing' })).toBeTruthy();
  });

  it('one tap on Done, or leaving the box, returns to reading and closes the keyboard', () => {
    const dismiss = jest.spyOn(Keyboard, 'dismiss').mockImplementation(() => undefined);
    draw(editor());
    edit();
    fireEvent.press(screen.getByRole('button', { name: 'Done editing' }));
    expect(dismiss).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('button', { name: 'Edit obituary text' })).toBeTruthy();
    edit();
    fireEvent(screen.getByLabelText('Obituary text'), 'blur');
    expect(screen.getByRole('button', { name: 'Edit obituary text' })).toBeTruthy();
    dismiss.mockRestore();
  });

  it('shows the placeholder as text when there is no text yet, but does not read it as the value', () => {
    draw(editor({ value: '' }));
    expect(screen.getByText('Write the obituary here.')).toBeTruthy();
    const reading = screen.getByLabelText('Obituary text');
    expect(reading.props.accessibilityValue).toEqual({ text: '' });
    expect(reading.props.accessibilityHint).toBe('Write the obituary here.');
    edit();
    expect(screen.getByLabelText('Obituary text').props.value).toBe('');
    expect(screen.getByPlaceholderText('Write the obituary here.')).toBeTruthy();
  });

  it('passes typing to onValueChange, limits the length, and keeps the words across the toggle', () => {
    const e = editor({ maxLength: 10000 });
    draw(e);
    edit();
    const box = screen.getByLabelText('Obituary text');
    expect(box.props.maxLength).toBe(10000);
    fireEvent.changeText(box, 'More');
    expect(e.onValueChange).toHaveBeenCalledWith('More');
  });

  it('keeps the box size in both modes', () => {
    draw(editor());
    expect(StyleSheet.flatten(screen.getByLabelText('Obituary text').props.style)).toMatchObject({ minHeight: 200, fontSize: 16 });
    edit();
    expect(StyleSheet.flatten(screen.getByLabelText('Obituary text').props.style)).toMatchObject({ minHeight: 200, fontSize: 16 });
  });

  it('hides the bar Done while the text is edited, so only one Done shows, and brings it back', () => {
    render(<ShareObituary copy={{ ...copy, ...editorCopy }} eyebrow="For Margaret" link="" linkValid={false} publisher="" onBack={jest.fn()} onWhatYoullNeed={jest.fn()} onLinkChange={jest.fn()} onPublisherChange={jest.fn()} onContinue={jest.fn()} textEditor={editor()} emailed onDone={jest.fn()} />);
    expect(screen.getByTestId('obituary-done-bar')).toBeTruthy();
    edit();
    expect(screen.queryByTestId('obituary-done-bar')).toBeNull();
    fireEvent.press(screen.getByRole('button', { name: 'Done editing' }));
    expect(screen.getByTestId('obituary-done-bar')).toBeTruthy();
  });

  it('lets a scroll close the keyboard', () => {
    draw(editor());
    expect(screen.UNSAFE_getByType(ScrollView).props.keyboardDismissMode).toBe('on-drag');
  });

  it('has no Write, Save or Cancel button', () => {
    draw(editor());
    for (const name of ['Edit the text', 'Write the text', 'Save the text', 'Save', 'Cancel']) {
      expect(screen.queryByRole('button', { name })).toBeNull();
    }
  });

  it('shows the memorial as read-only text under the box when set, and not otherwise', () => {
    draw(editor({ memorial: 'In lieu of flowers.' }));
    expect(screen.getByText('In lieu of flowers.')).toBeTruthy();
    screen.unmount();
    draw(editor());
    expect(screen.queryByText('In lieu of flowers.')).toBeNull();
  });

  it('describes the box by the caption only when the caption is drawn', () => {
    draw(editor());
    expect(screen.getByLabelText('Obituary text').props['aria-describedby']).toBeTruthy();
    screen.unmount();
    draw(editor(), { textCaption: undefined });
    expect(screen.getByLabelText('Obituary text').props['aria-describedby']).toBeUndefined();
  });

  it('tapping the visible label while editing focuses the box', () => {
    draw(editor());
    edit();
    const focus = jest.fn();
    (screen.UNSAFE_getAllByType(TextInput).find((input) => input.props.accessibilityLabel === 'Obituary text')?.instance as unknown as { focus: () => void }).focus = focus;
    fireEvent.press(screen.getByText('Obituary text'));
    expect(focus).toHaveBeenCalledTimes(1);
  });

  it('stays an always-editable box when the toggle words are missing', () => {
    draw(editor(), { messageEdit: undefined });
    expect(screen.getByLabelText('Obituary text').props.multiline).toBe(true);
    expect(screen.queryByRole('button', { name: 'Edit obituary text' })).toBeNull();
  });
});
