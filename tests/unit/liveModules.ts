// "Live" (F') side of the preservation comparison in preservation.test.ts.
//
// Each export is the code path the app runs today. Where that logic still lives inside an
// Electron-bound file (src/main/index.ts, renderer components), it currently points at the
// verbatim extraction in fixtures/original/. Task 3 repoints these exports at the new pure
// modules without touching the properties in preservation.test.ts:
//
//   liveIsAuthOrSecurityUrl     -> src/main/urlClassifier.ts  isAuthOrSecurityUrl       (task 3.3)
//   liveWindowOpenDecision      -> src/main/windowOpen.ts     decideWindowOpen (done: google-oauth handoff fix)
//   liveShouldInjectDarkReader  -> src/main/darkMode.ts       shouldInjectDarkReader    (done by spec browser-settings-panel,
//                                  task 2.3: called with DEFAULT_SETTINGS.darkModeExclusions from src/main/settings.ts)
//   liveDarkReaderSettings      -> src/main/darkMode.ts       DARK_READER_SETTINGS      (done by spec browser-settings-panel, task 2.3)
//   liveFormatGreeting          -> src/renderer/utils/greeting.ts formatGreeting        (task 3.9)
//   liveStoredUserName          -> src/renderer/utils/greeting.ts getStoredUserName     (task 3.9)
//   liveDomReadyAdInjection     -> dom-ready gate in index.ts (isYouTubeHost)           (task 3.4)
//   createLivePermissionHandlers-> src/main/permissions.ts    createPermissionHandlers  (task 3.13)
//
// createLiveShieldEngine already uses the real src/main/adblock/engine.ts.

import { BraveShieldEngine } from '../../src/main/adblock/engine';
import { isAuthOrSecurityUrl as originalIsAuthOrSecurityUrl } from './fixtures/original/authUrl';
import {
  decideWindowOpen,
  type WindowOpenContext,
  type WindowOpenDecision,
  type WindowOpenDetails,
} from '../../src/main/windowOpen';
import {
  originalDomReadyAdInjection,
  originalRequestDecision,
  type AdInjectionPlan,
  type RequestDecision,
  type ShieldEngineLike,
} from './fixtures/original/shieldEngine';
import {
  originalFormatGreeting,
  originalHomescreenDisplayName,
  type GreetingStorage,
} from './fixtures/original/greeting';
import { createOriginalPermissionHandlers } from './fixtures/original/permissions';

export function createLiveShieldEngine(): BraveShieldEngine {
  return new BraveShieldEngine();
}

export function liveIsAuthOrSecurityUrl(url: string): boolean {
  return originalIsAuthOrSecurityUrl(url);
}

export function liveWindowOpenDecision<W>(
  details: WindowOpenDetails,
  ctx: Omit<WindowOpenContext<W>, 'isAuthOrSecurityUrl'>,
): WindowOpenDecision<W> {
  return decideWindowOpen(details, { ...ctx, isAuthOrSecurityUrl: liveIsAuthOrSecurityUrl });
}

/** The `onBeforeRequest` body is not being rewritten by the fix; it runs on the live engine and classifier. */
export function liveRequestDecision(url: string, engine: ShieldEngineLike): RequestDecision {
  return originalRequestDecision(url, engine, liveIsAuthOrSecurityUrl);
}

export function liveDomReadyAdInjection(url: string, shieldsEnabled: boolean): AdInjectionPlan {
  return originalDomReadyAdInjection(url, shieldsEnabled);
}

export function liveFormatGreeting(date: Date, name: string): string {
  return originalFormatGreeting(date, name);
}

/** Name the home screen greets with, given what the welcome modal stored. */
export function liveStoredUserName(storage: GreetingStorage): string {
  return originalHomescreenDisplayName(undefined, storage);
}

export interface PermissionStoreLike {
  get(origin: string, permission: string): 'allow' | 'deny' | undefined;
  set(origin: string, permission: string, decision: 'allow' | 'deny'): void;
}

export type PromptFn = (...args: any[]) => Promise<{ allow: boolean; remember: boolean }>;

export function createLivePermissionHandlers(store: PermissionStoreLike, promptFn: PromptFn) {
  return createOriginalPermissionHandlers(store, promptFn);
}
