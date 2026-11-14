// Shared fake of Electron `safeStorage` for vault/password tests.
// encryptString = tag + reversed text; decryptString is the inverse and throws
// on anything without the tag (the "corrupt input" path). `setAvailable(false)`
// simulates DPAPI being unavailable: encryption then throws like Electron does.
import type { VaultCipher } from '../../../../src/main/passwords/vault';

export const FAKE_TAG = 'FAKE1:';

export interface FakeSafeStorage extends VaultCipher {
  setAvailable(available: boolean): void;
  /** Number of encryptString calls that produced a blob. */
  readonly encryptCalls: number;
}

function reverse(s: string): string {
  // Code-point reverse so surrogate pairs stay valid.
  return Array.from(s).reverse().join('');
}

export function createFakeSafeStorage(opts: { available?: boolean } = {}): FakeSafeStorage {
  let available = opts.available ?? true;
  let encryptCalls = 0;
  return {
    isEncryptionAvailable: () => available,
    encryptString(plainText: string): Buffer {
      if (!available) throw new Error('Encryption is not available.');
      encryptCalls++;
      return Buffer.from(FAKE_TAG + reverse(plainText), 'utf8');
    },
    decryptString(encrypted: Buffer): string {
      const s = encrypted.toString('utf8');
      if (!s.startsWith(FAKE_TAG)) throw new Error('Error while decrypting the ciphertext provided');
      return reverse(s.slice(FAKE_TAG.length));
    },
    setAvailable(v: boolean) {
      available = v;
    },
    get encryptCalls() {
      return encryptCalls;
    },
  };
}

/** A base64 `passwordEnc` value that the fake cipher cannot decrypt. */
export function corruptBlob(seed = 'garbage'): string {
  return Buffer.from(`CORRUPT:${seed}`, 'utf8').toString('base64');
}
