// Who is signed in. For now this is the local API's sign-in, where the token is simply a
// random id kept in this browser. Real Firebase sign-in replaces this file, and nothing else.

const KEY = 'portfolio-league-token';

export const newId = () => globalThis.crypto.randomUUID();

function storage(): Storage | null {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null; // private windows can refuse access
  }
}

export const savedToken = () => storage()?.getItem(KEY) ?? null;

export function saveToken(token: string) {
  storage()?.setItem(KEY, token);
}

export function forgetToken() {
  storage()?.removeItem(KEY);
}
