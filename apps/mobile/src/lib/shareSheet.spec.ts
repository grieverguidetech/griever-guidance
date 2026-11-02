import { afterEach, describe, expect, it, jest } from '@jest/globals';
import { Share } from 'react-native';
import { shareMessage } from './shareSheet';

afterEach(() => {
  jest.restoreAllMocks();
});

describe('shareMessage', () => {
  it('passes the message to the share sheet', async () => {
    const share = jest.spyOn(Share, 'share').mockResolvedValue({ action: Share.sharedAction, activityType: undefined });
    await expect(shareMessage('Service is at 2 PM.')).resolves.toBe('opened');
    expect(share).toHaveBeenCalledWith({ message: 'Service is at 2 PM.' });
  });

  it('is not an error when the person closes the sheet', async () => {
    jest.spyOn(Share, 'share').mockResolvedValue({ action: Share.dismissedAction, activityType: undefined });
    await expect(shareMessage('Hello')).resolves.toBe('opened');
  });

  it('maps a share error to failed', async () => {
    jest.spyOn(Share, 'share').mockRejectedValue(new Error('no share'));
    await expect(shareMessage('Hello')).resolves.toBe('failed');
  });
});
