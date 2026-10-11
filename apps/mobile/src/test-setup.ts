import { jest } from '@jest/globals';

jest.mock('@react-native-async-storage/async-storage', () => require('@react-native-async-storage/async-storage/jest'));

// Native-only module: its real entry fails to load outside a device.
jest.mock('expo-contacts', () => ({
  ContactField: {},
  getPermissionsAsync: jest.fn(),
  requestPermissionsAsync: jest.fn(),
  getContactsAsync: jest.fn(),
}));

// The installed react (19.2.x) does not match the renderer bundled in react-native 0.81.5 (19.1.0),
// and that renderer throws a version-mismatch error the first time something needs it (animated
// views, findNodeHandle). The renderer is not what these tests are about, so stub its entry point.
jest.mock('react-native/Libraries/Renderer/shims/ReactNative', () => ({
  __esModule: true,
  default: { findNodeHandle: () => 1, dispatchCommand: () => undefined, sendAccessibilityEvent: () => undefined },
}));
