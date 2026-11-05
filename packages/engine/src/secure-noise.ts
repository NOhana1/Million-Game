// The server's noise source. The repo is public, so anyone can read the generator. HMAC-SHA256
// means that even with the code and every past price, the secret and future prices stay unknown.
// This is a separate entry point because browsers don't have node:crypto.

import { createHmac } from 'node:crypto';

import type { Noise } from './world.ts';

export const secureNoise =
  (secret: string): Noise =>
  (key) => {
    const digest = createHmac('sha256', secret).update(key).digest();
    return Array.from({ length: 8 }, (_, i) => digest.readUInt32BE(i * 4));
  };
