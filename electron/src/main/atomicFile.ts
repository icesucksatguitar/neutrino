// Pure synchronous atomic JSON file helpers (no Electron dependency so tests run directly).
import fs from 'fs';
import path from 'path';

/** Writes text to a sibling temporary file before renaming over targetPath. */
export function writeFileAtomicSync(targetPath: string, data: string): void {
  const dir = path.dirname(targetPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  const tmpPath = `${targetPath}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(tmpPath, data, 'utf-8');
  try {
    fs.renameSync(tmpPath, targetPath);
  } catch (err) {
    try {
      if (fs.existsSync(tmpPath)) fs.unlinkSync(tmpPath);
    } catch {}
    throw err;
  }
}

/** Reads and parses a JSON file, returning fallback if missing or malformed. */
export function readJsonSafeSync<T>(targetPath: string, fallback: T): T {
  try {
    if (!fs.existsSync(targetPath)) return fallback;
    const raw = fs.readFileSync(targetPath, 'utf-8');
    if (!raw.trim()) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

