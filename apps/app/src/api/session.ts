// Who is signed in. With Firebase settings it uses real accounts. Without them, as in local
// development, the token is a random id kept in this browser, which the local API accepts.

import { FirebaseError, initializeApp } from 'firebase/app';
import {
  createUserWithEmailAndPassword,
  getAuth,
  sendEmailVerification,
  sendPasswordResetEmail,
  updateProfile,
  signInWithEmailAndPassword,
  signOut,
} from 'firebase/auth';

const KEY = 'portfolio-league-token';

// Expo replaces these while building the site, so each has to be written out in full.
const apiKey = process.env.EXPO_PUBLIC_FIREBASE_API_KEY;
const firebase = apiKey
  ? getAuth(
      initializeApp({
        apiKey,
        authDomain: process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN,
        projectId: process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID,
        appId: process.env.EXPO_PUBLIC_FIREBASE_APP_ID,
      }),
    )
  : null;

export const usesAccounts = firebase !== null;

export const newId = () => globalThis.crypto.randomUUID();

function storage(): Storage | null {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null; // private windows can refuse access
  }
}

/** The token for API calls, or null when signed out. Firebase renews it when needed. */
export async function currentToken(): Promise<string | null> {
  if (!firebase) return storage()?.getItem(KEY) ?? null;
  await firebase.authStateReady();
  return (await firebase.currentUser?.getIdToken()) ?? null;
}

/** With real accounts, Firebase also emails a link that confirms the address is theirs. */
export async function createAccount(email: string, password: string, name: string) {
  if (!firebase) return storage()?.setItem(KEY, newId());
  const { user } = await createUserWithEmailAndPassword(firebase, email, password);
  // The name is kept on the account, so after the email link it's still there, also after a
  // refresh or on another device, and nobody is asked for a name twice.
  await updateProfile(user, { displayName: name });
  await sendEmailVerification(user);
}

/** The player name chosen at sign-up, kept on the account until the player is created. */
export const signUpName = () => firebase?.currentUser?.displayName?.trim() || null;

/** Whether the signed-in account's email is confirmed. Asks Firebase again, since the link is
 *  clicked in another tab or app. Without real accounts there's nothing to confirm. */
export async function emailConfirmed() {
  if (!firebase) return true;
  await firebase.authStateReady();
  const user = firebase.currentUser;
  if (!user) return false;
  await user.reload();
  return user.emailVerified;
}

export async function resendConfirmation() {
  const user = firebase?.currentUser;
  if (user) await sendEmailVerification(user);
}

export const signedInEmail = () => firebase?.currentUser?.email ?? null;

/** Sign-up found an account already on this email. */
export const emailTaken = (error: unknown) =>
  error instanceof FirebaseError && error.code === 'auth/email-already-in-use';

/** The sign-in account no longer exists, for example because the owner deleted this player. */
export const accountGone = (error: unknown) =>
  error instanceof FirebaseError &&
  ['auth/user-not-found', 'auth/user-token-expired', 'auth/user-disabled', 'auth/invalid-user-token'].includes(
    error.code,
  );

/**
 * For "use a different email": an account whose email was never confirmed is deleted, so a
 * mistyped address is free again for its real owner. A confirmed account is only signed out.
 */
export async function dropUnconfirmedAccount() {
  const user = firebase?.currentUser;
  if (user && !user.emailVerified) {
    try {
      await user.delete();
      return;
    } catch {
      // Firebase may want a fresh sign-in first. Then it stays, and its owner can still claim it
      // with "Forgot password?".
    }
  }
  await logOut();
}

export async function logIn(email: string, password: string) {
  if (firebase) await signInWithEmailAndPassword(firebase, email, password);
}

/** Firebase emails a reset link. An unknown email looks the same, so nobody can test who plays. */
export async function resetPassword(email: string) {
  if (!firebase) return;
  try {
    await sendPasswordResetEmail(firebase, email);
  } catch (error) {
    if (!(error instanceof FirebaseError && error.code === 'auth/user-not-found')) throw error;
  }
}

export async function logOut() {
  if (firebase) await signOut(firebase);
  else storage()?.removeItem(KEY);
}

const SIGN_IN_PROBLEMS: Record<string, string> = {
  'auth/email-already-in-use':
    'That email already has an account. Sign in, or if it’s yours and you never finished signing up, use “Forgot password?” on the Sign in tab.',
  'auth/invalid-email': 'That email doesn’t look right.',
  'auth/weak-password': 'Use a password of at least 8 characters.',
  'auth/invalid-credential': 'That email or password isn’t right.',
  'auth/too-many-requests': 'Too many attempts. Please wait a little and try again.',
  'auth/network-request-failed': 'Can’t reach the server. Please try again.',
};

export const signInProblem = (error: unknown) =>
  (error instanceof FirebaseError && SIGN_IN_PROBLEMS[error.code]) ||
  'Couldn’t sign you in. Please try again.';
