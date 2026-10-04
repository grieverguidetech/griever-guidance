import 'fake-indexeddb/auto';
import '@testing-library/jest-dom/vitest';
import { IDBFactory } from 'fake-indexeddb';
import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';
import { _resetDbConnectionForTests } from '@griever/data-local';

// Each test starts with empty storage: no contacts, sessions or drafts
// carried over from the one before.
afterEach(() => {
  cleanup();
  window.localStorage.clear();
  _resetDbConnectionForTests();
  globalThis.indexedDB = new IDBFactory();
});
