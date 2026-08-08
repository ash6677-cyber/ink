/**
 * Whether cloud accounts exist for this build — knowable from env vars
 * alone, which is the entire point of this module: the UI needs the answer
 * at boot (does the Account tab offer sign-in? does the engine ever start?),
 * and importing it must not drag the half-megabyte Firebase SDK into the
 * signed-out cold start. Anything that needs the *SDK* imports
 * `@/lib/firebase/config` dynamically, behind sign-in intent.
 */

export const hasRealConfig = Boolean(import.meta.env.VITE_FIREBASE_API_KEY)

/**
 * Use the local emulator suite whenever there's no real project configured
 * (dev by default) or when explicitly requested — never in a production
 * build that a writer would receive, and never when pointed at a real
 * project.
 */
export const useEmulator =
  import.meta.env.VITE_USE_FIREBASE_EMULATOR === 'true' || (!hasRealConfig && import.meta.env.DEV)

/**
 * Whether cloud accounts and sync are actually reachable. A production build
 * with no Firebase project configured has nowhere to sign in to; rather than
 * offer a sign-in button that hangs, the cloud features declare themselves
 * unavailable and the app stays fully local-first. An emulator build counts
 * as cloud-enabled — that is what lets the sync acceptance harness drive the
 * production bundle with nobody's real credentials near it.
 */
export const cloudEnabled = hasRealConfig || import.meta.env.DEV || useEmulator
