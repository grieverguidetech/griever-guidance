# TestFlight: owner-only steps

The production build (`apps/mobile/eas.json`, profile `production`) turns accounts and sync on.
The code is ready. These steps need the owner's logins, so an agent does not do them. No value
below is a secret; never paste a key, token or password into this file, a ticket or a commit.

Do the steps in order.

1. **Apple Developer Program.** Enrol the owner's Apple ID. Note the Team ID (Membership page).
2. **App Store Connect record.** Create the app with bundle id `com.grieversguidance.app` and the
   name "Grievers Guidance". Note the Apple ID number of the app (later used as `ascAppId`).
3. **Clerk live key in EAS.** Log in with `eas login`, then create the variable in the EAS
   `production` environment, visibility "plain text" (a publishable key is public by design):
   `eas env:create --environment production --name EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY`.
   Enter the Clerk live publishable key (`pk_live_...`) when asked. `eas.json` holds no key for
   `production`. If the variable is missing, the build still works, with accounts off.
4. **Clerk native app.** In the Clerk dashboard (production instance), add the iOS app with the
   Team ID from step 1 and the bundle id `com.grieversguidance.app`. Allow the redirect for the
   `grieversguidance` URL scheme (`grieversguidance://sso-callback`).
5. **`GOOGLE_PLACES_SERVER_KEY`.** Set it where the gateway reads it, as in the existing deploy
   setup, so place search works for testers. Do not put it in `eas.json`.
6. **First build and submit.** From `apps/mobile`:
   `eas build --platform ios --profile production --auto-submit`.
   If EAS asks for the App Store Connect app id, add it to `submit.production.ios.ascAppId` in
   `eas.json` in a separate change.
7. **Internal TestFlight group.** In App Store Connect, create an internal group, add the testers
   (they need App Store Connect users), and add the processed build. Internal testing has no
   App Review.

## Known risk: Sign in with Apple

The app offers Google and Facebook sign-in. App Store guideline 4.8 therefore applies: the app
must also offer Sign in with Apple (or an equivalent privacy-preserving login) before external
TestFlight testing and before App Store release. Internal TestFlight testing has no App Review,
so it is fine without it. Add Sign in with Apple before inviting external testers.

## What the app does without the key

With the flag on and no Clerk key, accounts stay off: no account screens, no sign-in, and the
app works on this phone only (`apps/mobile/src/lib/features.ts`).
