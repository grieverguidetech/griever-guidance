import { describe, expect, it, jest } from '@jest/globals';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { ShareObituary } from './ShareObituary';
import type { ShareObituaryCopy, ShareObituaryProps } from './ShareObituary';

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
