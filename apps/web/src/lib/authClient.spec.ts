import { hasSignedInMarker } from './authClient';

afterEach(() => {
  window.localStorage.clear();
});

describe('hasSignedInMarker', () => {
  it('is true when the signed-in marker holds a user id', () => {
    window.localStorage.setItem('gg.signedIn.v1', 'user_1');
    expect(hasSignedInMarker()).toBe(true);
  });

  it('is false for nothing stored or an empty marker', () => {
    expect(hasSignedInMarker()).toBe(false);
    window.localStorage.setItem('gg.signedIn.v1', '');
    expect(hasSignedInMarker()).toBe(false);
  });

  it('is false when storage throws', () => {
    expect(
      hasSignedInMarker({
        getItem: () => {
          throw new Error('blocked');
        },
      }),
    ).toBe(false);
  });
});
