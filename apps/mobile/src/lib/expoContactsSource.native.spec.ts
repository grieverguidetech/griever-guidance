import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import * as Contacts from 'expo-contacts';
import { Cancelled } from '@griever/contacts';
import { expoContactsSource } from './expoContactsSource.native';

const mocked = Contacts as unknown as {
  Fields: { Name: string; PhoneNumbers: string; Emails: string };
  getPermissionsAsync: jest.Mock<() => Promise<unknown>>;
  requestPermissionsAsync: jest.Mock<() => Promise<unknown>>;
  getContactsAsync: jest.Mock<(query: unknown) => Promise<unknown>>;
};

beforeEach(() => {
  mocked.requestPermissionsAsync.mockReset().mockResolvedValue({ granted: true });
  mocked.getContactsAsync.mockReset();
});

describe('expoContactsSource.fetch', () => {
  it('maps contacts, falls back for name and id, and drops empty numbers and emails', async () => {
    mocked.getContactsAsync.mockResolvedValue({
      data: [
        { id: 'a1', name: '  Sam Rivera ', phoneNumbers: [{ number: '555-0100' }, { number: '' }, {}], emails: [{ email: 's@x.co' }, { email: '' }, {}] },
        { id: 'b2', phoneNumbers: [{ number: '555-0101' }] },
        { id: 'c3', name: '   ', emails: [{ email: 'c@x.co' }] },
        { id: '', name: 'No Id' },
      ],
    });

    const contacts = await expoContactsSource.fetch();

    expect(contacts).toEqual([
      { key: 'a1', displayName: 'Sam Rivera', phones: ['555-0100'], emails: ['s@x.co'] },
      { key: 'b2', displayName: 'Unnamed', phones: ['555-0101'], emails: [] },
      { key: 'c3', displayName: 'Unnamed', phones: [], emails: ['c@x.co'] },
      { key: 'native_3', displayName: 'No Id', phones: [], emails: [] },
    ]);
  });

  it('asks for name, phone numbers and emails, and sets no page size', async () => {
    mocked.getContactsAsync.mockResolvedValue({ data: [] });
    await expoContactsSource.fetch();
    const { Fields } = mocked;
    expect(mocked.getContactsAsync).toHaveBeenCalledWith({ fields: [Fields.Name, Fields.PhoneNumbers, Fields.Emails] });
    expect(mocked.getContactsAsync.mock.calls[0][0]).not.toHaveProperty('pageSize');
  });

  it('treats a denied permission as cancelled and reads nothing', async () => {
    mocked.requestPermissionsAsync.mockResolvedValue({ granted: false });
    await expect(expoContactsSource.fetch()).rejects.toBeInstanceOf(Cancelled);
    expect(mocked.getContactsAsync).not.toHaveBeenCalled();
  });
});
