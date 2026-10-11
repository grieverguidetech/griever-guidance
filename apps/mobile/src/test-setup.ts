import { jest } from '@jest/globals';

jest.mock('@react-native-async-storage/async-storage', () => require('@react-native-async-storage/async-storage/jest'));

// Native-only module: its real entry fails to load outside a device.
jest.mock('expo-contacts', () => ({
  ContactField: {},
  getPermissionsAsync: jest.fn(),
  requestPermissionsAsync: jest.fn(),
  getContactsAsync: jest.fn(),
}));
