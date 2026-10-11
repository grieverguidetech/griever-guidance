import { beforeEach, describe, expect, it } from '@jest/globals';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { recordServiceDate, shouldPurgeContacts } from './contactRetention';

describe('shouldPurgeContacts', () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
  });

  // #79: new Date('May 2') is in 2001, which used to purge every contact.
  it.each(['6', '6/12', 'May 2', 'May 29, 2', 'May 29, 202'])(
    'does not purge for the stored partial date %j, and keeps it stored',
    async (partial) => {
      await recordServiceDate(partial);
      expect(await shouldPurgeContacts()).toBe(false);
      expect(await AsyncStorage.getItem('gg.serviceDate.v1')).toBe(partial);
    },
  );

  it('does not purge when nothing is stored', async () => {
    expect(await shouldPurgeContacts()).toBe(false);
  });

  it('purges once 30 days have passed since a complete service date', async () => {
    await recordServiceDate('May 29, 2020');
    expect(await shouldPurgeContacts()).toBe(true);
    expect(await AsyncStorage.getItem('gg.serviceDate.v1')).toBeNull();
  });

  it('does not purge before the 30 days are up', async () => {
    await recordServiceDate('May 29, 2099');
    expect(await shouldPurgeContacts()).toBe(false);
  });
});
