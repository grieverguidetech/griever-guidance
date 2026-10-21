import 'fake-indexeddb/auto';
import '@testing-library/jest-dom/vitest';
import { IDBFactory } from 'fake-indexeddb';
import { cleanup, configure } from '@testing-library/react';
import { afterEach } from 'vitest';
import { _resetDbConnectionForTests } from '@griever/data-local';

// #257: findBy and waitFor give up after 1 s by default; a loaded machine needs longer.
// A passing wait returns as soon as it succeeds, so this only changes how long a real failure takes.
configure({ asyncUtilTimeout: 5000 });

// Each test starts with empty storage: no contacts, sessions or drafts
// carried over from the one before.
afterEach(() => {
  cleanup();
  window.localStorage.clear();
  _resetDbConnectionForTests();
  globalThis.indexedDB = new IDBFactory();
});
