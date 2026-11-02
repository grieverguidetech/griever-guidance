import { afterEach, describe, expect, it, jest } from '@jest/globals';
import { Linking, Share } from 'react-native';
import { buildMailto, openMailDraft } from './mailCompose';

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
