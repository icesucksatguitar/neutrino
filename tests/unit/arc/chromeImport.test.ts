import { describe, it, expect } from 'vitest';
import { createCipheriv, randomBytes } from 'node:crypto';
import { classifyChromeBlob, decryptV10 } from '../../../src/main/passwords/chromeImport';

function encryptV10(key: Buffer, nonce: Buffer, plaintext: Buffer): Buffer {
  const cipher = createCipheriv('aes-256-gcm', key, nonce);
  const ct = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  return Buffer.concat([Buffer.from('v10'), nonce, ct, cipher.getAuthTag()]);
}

describe('classifyChromeBlob', () => {
  it('classifies by version prefix', () => {
    expect(classifyChromeBlob(encryptV10(randomBytes(32), randomBytes(12), Buffer.from('pw')))).toBe('v10');
    expect(classifyChromeBlob(Buffer.concat([Buffer.from('v20'), randomBytes(40)]))).toBe('v20-app-bound');
    expect(classifyChromeBlob(Buffer.from('v20'))).toBe('v20-app-bound');
  });

  it('returns undecryptable for empty, truncated, other prefixes and non-bytes', () => {
    expect(classifyChromeBlob(new Uint8Array())).toBe('undecryptable');
    expect(classifyChromeBlob(Buffer.from('v10short'))).toBe('undecryptable');
    expect(classifyChromeBlob(Buffer.concat([Buffer.from('v11'), randomBytes(40)]))).toBe('undecryptable');
    expect(classifyChromeBlob(Buffer.from([0x01, 0x00, 0x00, 0x00]))).toBe('undecryptable');
    expect(classifyChromeBlob(null as unknown as Uint8Array)).toBe('undecryptable');
  });
});

describe('decryptV10', () => {
  it('round-trips plaintext, including empty', () => {
    const key = randomBytes(32);
    for (const text of ['hunter2', '', 'pässwörd 🔑']) {
      const blob = encryptV10(key, randomBytes(12), Buffer.from(text, 'utf8'));
      expect(decryptV10(key, blob)?.toString('utf8')).toBe(text);
    }
  });

  it('returns null on wrong key, tampered blob, bad key size or non-v10 blob', () => {
    const key = randomBytes(32);
    const blob = encryptV10(key, randomBytes(12), Buffer.from('secret'));
    expect(decryptV10(randomBytes(32), blob)).toBeNull();
    const tampered = Buffer.from(blob);
    tampered[20] ^= 0xff;
    expect(decryptV10(key, tampered)).toBeNull();
    expect(decryptV10(randomBytes(16), blob)).toBeNull();
    expect(decryptV10(key, Buffer.concat([Buffer.from('v20'), blob.subarray(3)]))).toBeNull();
  });
});
