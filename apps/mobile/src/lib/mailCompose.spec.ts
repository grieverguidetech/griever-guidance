import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { Linking, Share } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as MailComposer from 'expo-mail-composer';
import { SYNCED_KEYS } from '@griever/shared';
import { buildMailto, checkPublisherEmail, loadPublisherEmail, openMailDraft, publisherEmailKey, savePublisherEmail } from './mailCompose';

// The native module can't load under Jest. The in-app composer is "unavailable" unless a test says otherwise.
jest.mock('expo-mail-composer', () => ({ isAvailableAsync: jest.fn(), composeAsync: jest.fn() }));
const isAvailable = MailComposer.isAvailableAsync as jest.MockedFunction<typeof MailComposer.isAvailableAsync>;
const compose = MailComposer.composeAsync as jest.MockedFunction<typeof MailComposer.composeAsync>;

beforeEach(() => {
  isAvailable.mockReset().mockResolvedValue(false);
  compose.mockReset();
  jest.clearAllMocks();
});

const draft = { subject: 'Obituary for Anna', body: 'Anna, 1950 & more.\nLine two?' };

afterEach(() => {
  jest.restoreAllMocks();
});

describe('buildMailto', () => {
  it('has no recipient and encodes the subject and body', () => {
    expect(buildMailto(draft)).toBe('mailto:?subject=Obituary%20for%20Anna&body=Anna%2C%201950%20%26%20more.%0D%0ALine%20two%3F');
  });
});

describe('buildMailto edge cases', () => {
  it('writes every line break as CRLF, including ones already CRLF', () => {
    expect(buildMailto({ subject: 's', body: 'a\nb\r\nc' })).toBe('mailto:?subject=s&body=a%0D%0Ab%0D%0Ac');
  });

  it('encodes non-ASCII text as UTF-8', () => {
    expect(buildMailto({ subject: 'Obituary for José', body: 'José — 1950' })).toBe(
      'mailto:?subject=Obituary%20for%20Jos%C3%A9&body=Jos%C3%A9%20%E2%80%94%201950',
    );
  });
});

describe('openMailDraft', () => {
  it('opens mail and does not share when mail opens', async () => {
    const open = jest.spyOn(Linking, 'openURL').mockResolvedValue(undefined);
    const share = jest.spyOn(Share, 'share').mockResolvedValue({ action: Share.sharedAction, activityType: undefined });
    await expect(openMailDraft(draft)).resolves.toBe('mail');
    expect(open).toHaveBeenCalledWith(buildMailto(draft));
    expect(share).not.toHaveBeenCalled();
  });

  it('falls back to the share sheet with the same text when openURL rejects', async () => {
    jest.spyOn(Linking, 'openURL').mockRejectedValue(new Error('no mail app'));
    const share = jest.spyOn(Share, 'share').mockResolvedValue({ action: Share.sharedAction, activityType: undefined });
    await expect(openMailDraft(draft)).resolves.toBe('share');
    expect(share).toHaveBeenCalledWith({ message: draft.body, title: draft.subject }, { subject: draft.subject });
  });

  it('reports dismissed, not shared, when the user closes the share sheet', async () => {
    jest.spyOn(Linking, 'openURL').mockRejectedValue(new Error('no mail app'));
    jest.spyOn(Share, 'share').mockResolvedValue({ action: Share.dismissedAction, activityType: undefined });
    await expect(openMailDraft(draft)).resolves.toBe('dismissed');
  });

  it('reports failed when mail and sharing both fail', async () => {
    jest.spyOn(Linking, 'openURL').mockRejectedValue(new Error('no mail app'));
    jest.spyOn(Share, 'share').mockRejectedValue(new Error('no share'));
    await expect(openMailDraft(draft)).resolves.toBe('failed');
  });
});

describe('buildMailto with a recipient', () => {
  it('puts the address in the path, encoded', () => {
    expect(buildMailto({ ...draft, to: 'obits@paper.com' })).toBe(
      'mailto:obits%40paper.com?subject=Obituary%20for%20Anna&body=Anna%2C%201950%20%26%20more.%0D%0ALine%20two%3F',
    );
  });
});

describe('openMailDraft with the in-app composer', () => {
  it('opens the compose sheet with To, subject and body, and does not use mailto', async () => {
    isAvailable.mockResolvedValue(true);
    compose.mockResolvedValue({ status: 'sent' } as Awaited<ReturnType<typeof compose>>);
    const open = jest.spyOn(Linking, 'openURL').mockResolvedValue(undefined);
    await expect(openMailDraft({ ...draft, to: 'obits@paper.com' })).resolves.toBe('mail');
    expect(compose).toHaveBeenCalledWith({ recipients: ['obits@paper.com'], subject: draft.subject, body: draft.body });
    expect(open).not.toHaveBeenCalled();
  });

  it('opens it with no recipients when there is no To', async () => {
    isAvailable.mockResolvedValue(true);
    compose.mockResolvedValue({ status: 'saved' } as Awaited<ReturnType<typeof compose>>);
    await expect(openMailDraft(draft)).resolves.toBe('mail');
    expect(compose).toHaveBeenCalledWith({ recipients: [], subject: draft.subject, body: draft.body });
  });

  it('reports dismissed, and does not fall back, when the user cancels the sheet', async () => {
    isAvailable.mockResolvedValue(true);
    compose.mockResolvedValue({ status: 'cancelled' } as Awaited<ReturnType<typeof compose>>);
    const open = jest.spyOn(Linking, 'openURL').mockResolvedValue(undefined);
    await expect(openMailDraft(draft)).resolves.toBe('dismissed');
    expect(open).not.toHaveBeenCalled();
  });

  it('falls back to mailto with To when the composer is unavailable', async () => {
    const open = jest.spyOn(Linking, 'openURL').mockResolvedValue(undefined);
    await expect(openMailDraft({ ...draft, to: 'obits@paper.com' })).resolves.toBe('mail');
    expect(compose).not.toHaveBeenCalled();
    expect(open).toHaveBeenCalledWith(buildMailto({ ...draft, to: 'obits@paper.com' }));
    expect(open.mock.calls[0]?.[0]).toMatch(/^mailto:obits%40paper\.com\?subject=/);
  });

  it('falls back to mailto when the composer throws', async () => {
    isAvailable.mockResolvedValue(true);
    compose.mockRejectedValue(new Error('no mail'));
    const open = jest.spyOn(Linking, 'openURL').mockResolvedValue(undefined);
    await expect(openMailDraft({ ...draft, to: 'obits@paper.com' })).resolves.toBe('mail');
    expect(open).toHaveBeenCalledWith(buildMailto({ ...draft, to: 'obits@paper.com' }));
  });

  it('falls back to the share sheet when the composer is unavailable and mailto fails', async () => {
    jest.spyOn(Linking, 'openURL').mockRejectedValue(new Error('no mail app'));
    const share = jest.spyOn(Share, 'share').mockResolvedValue({ action: Share.sharedAction, activityType: undefined });
    await expect(openMailDraft({ ...draft, to: 'obits@paper.com' })).resolves.toBe('share');
    expect(share).toHaveBeenCalledWith({ message: draft.body, title: draft.subject }, { subject: draft.subject });
  });
});

describe('checkPublisherEmail', () => {
  it('accepts empty (the field is optional) and one plain address, trimmed', () => {
    expect(checkPublisherEmail('')).toEqual({ ok: true, address: undefined });
    expect(checkPublisherEmail('   ')).toEqual({ ok: true, address: undefined });
    expect(checkPublisherEmail('  obits@paper.com ')).toEqual({ ok: true, address: 'obits@paper.com' });
  });

  it('refuses commas and semicolons as more than one address', () => {
    expect(checkPublisherEmail('a@b.com, c@d.com')).toEqual({ ok: false, reason: 'many' });
    expect(checkPublisherEmail('a@b.com;c@d.com')).toEqual({ ok: false, reason: 'many' });
    expect(checkPublisherEmail('a@b.com,')).toEqual({ ok: false, reason: 'many' });
  });

  it('refuses nonsense, including two addresses split by a space', () => {
    for (const bad of ['obits', 'obits@', '@paper.com', 'obits@paper', 'a@b.com c@d.com', 'a b@c.com']) {
      expect(checkPublisherEmail(bad)).toEqual({ ok: false, reason: 'invalid' });
    }
  });
});

describe('the saved publisher email', () => {
  it('is remembered for the same person and not for another', async () => {
    await savePublisherEmail('anna', 'obits@paper.com');
    await expect(loadPublisherEmail('anna')).resolves.toBe('obits@paper.com');
    await expect(loadPublisherEmail('ben')).resolves.toBe('');
  });

  it('is removed when cleared', async () => {
    await savePublisherEmail('anna', 'obits@paper.com');
    await savePublisherEmail('anna', '  ');
    await expect(loadPublisherEmail('anna')).resolves.toBe('');
    await expect(AsyncStorage.getItem(publisherEmailKey('anna'))).resolves.toBeNull();
  });

  it('is a device-only key, never one of the synced keys', () => {
    expect((SYNCED_KEYS as readonly string[]).some((key) => /email|publisher/i.test(key) && key !== 'obituaryPublisher')).toBe(false);
    expect((SYNCED_KEYS as readonly string[]).includes(publisherEmailKey('anna'))).toBe(false);
  });
});
