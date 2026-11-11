/**
 * Pure CSV parse/serialize for password import (R11.1–11.4).
 *
 * - `parseCsv` / `serializeCsv`: RFC 4180 records (quoted fields, escaped
 *   quotes, embedded commas and newlines, unicode, optional UTF-8 BOM,
 *   CRLF / LF / CR line endings).
 * - `parseCredentialCsv`: detects the url/username/password columns from the
 *   header row (Chrome, Edge, Firefox, Bitwarden-style names).
 * - `classifyImport`: puts every row in exactly one bucket
 *   (imported / duplicate / conflict / invalid) and reports counts.
 *
 * No Electron imports; safe to unit test directly.
 */

export interface CsvCredentialRow {
  url: string;
  username: string;
  password: string;
}

/** A credential already in the vault, with its password decrypted by the caller. */
export interface ExistingCredential {
  origin: string;
  username: string;
  password: string;
}

export interface ImportedRow extends CsvCredentialRow {
  /** Normalized origin (scheme://host[:port]). */
  origin: string;
}

export interface ConflictRow extends ImportedRow {
  /** Where the clashing credential came from: the vault or an earlier row in this file. */
  conflictsWith: 'existing' | 'import';
}

export type InvalidReason = 'missing-url' | 'invalid-url' | 'missing-username' | 'missing-password';

export interface InvalidRow {
  row: CsvCredentialRow;
  reason: InvalidReason;
}

export interface ImportClassification {
  imported: ImportedRow[];
  duplicate: ImportedRow[];
  conflict: ConflictRow[];
  invalid: InvalidRow[];
  counts: { imported: number; duplicate: number; conflict: number; invalid: number; total: number };
}

export interface ColumnMap {
  url: number;
  username: number;
  password: number;
}

export type CredentialCsvResult =
  | { ok: true; rows: CsvCredentialRow[]; columns: ColumnMap }
  | { ok: false; error: 'empty' | 'missing-columns'; missing?: Array<keyof ColumnMap> };

const BOM = '\uFEFF';

// ---------------------------------------------------------------------------
// RFC 4180 parse / serialize
// ---------------------------------------------------------------------------

/**
 * Parse CSV text into records. A leading BOM is stripped. Blank lines (a record
 * holding one empty unquoted field) are skipped. An unterminated quoted field
 * runs to end of input instead of throwing.
 */
export function parseCsv(text: string): string[][] {
  const src = text.startsWith(BOM) ? text.slice(1) : text;
  const records: string[][] = [];
  let record: string[] = [];
  let field = '';
  let quotedField = false; // current field started with a quote
  let inQuotes = false;
  let i = 0;
  const n = src.length;

  const endField = () => {
    record.push(field);
    field = '';
    quotedField = false;
  };
  const endRecord = () => {
    const blank = record.length === 0 && field === '' && !quotedField;
    endField();
    if (!blank) records.push(record);
    record = [];
  };

  while (i < n) {
    const ch = src[i];
    if (inQuotes) {
      if (ch === '"') {
        if (src[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
        i += 1;
        continue;
      }
      field += ch;
      i += 1;
      continue;
    }
    if (ch === '"' && field === '' && !quotedField) {
      inQuotes = true;
      quotedField = true;
      i += 1;
    } else if (ch === ',') {
      endField();
      i += 1;
    } else if (ch === '\r') {
      endRecord();
      i += src[i + 1] === '\n' ? 2 : 1;
    } else if (ch === '\n') {
      endRecord();
      i += 1;
    } else {
      // Lenient: a stray quote inside an unquoted field is kept literally.
      field += ch;
      i += 1;
    }
  }
  // Final record without a trailing newline.
  if (field !== '' || quotedField || record.length > 0) endRecord();
  return records;
}

function needsQuoting(value: string): boolean {
  return /[",\r\n]/.test(value);
}

function serializeField(value: string): string {
  return needsQuoting(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

/** Serialize records with CRLF line endings (RFC 4180). */
export function serializeCsv(records: string[][], opts: { bom?: boolean } = {}): string {
  const body = records
    .map((r) => {
      // A single empty field would read back as a blank line; quote it.
      if (r.length === 1 && r[0] === '') return '""';
      return r.map(serializeField).join(',');
    })
    .map((line) => line + '\r\n')
    .join('');
  return (opts.bom ? BOM : '') + body;
}

// ---------------------------------------------------------------------------
// Credential CSV
// ---------------------------------------------------------------------------

const HEADER_NAMES: Record<keyof ColumnMap, string[]> = {
  // Chrome / Edge: name,url,username,password[,note]; Firefox: url,username,password,...;
  // Bitwarden: login_uri,login_username,login_password
  url: ['url', 'origin', 'origin_url', 'website', 'web site', 'login_uri', 'uri', 'hostname'],
  username: ['username', 'user name', 'login_username', 'login', 'user', 'email'],
  password: ['password', 'login_password', 'pass'],
};

/** Find url/username/password column indexes in a header row, or null for any missing. */
export function detectColumns(header: string[]): { [K in keyof ColumnMap]: number | null } {
  const norm = header.map((h) => h.trim().toLowerCase());
  const find = (names: string[]): number | null => {
    for (const name of names) {
      const idx = norm.indexOf(name);
      if (idx !== -1) return idx;
    }
    return null;
  };
  return {
    url: find(HEADER_NAMES.url),
    username: find(HEADER_NAMES.username),
    password: find(HEADER_NAMES.password),
  };
}

/** Parse a password CSV export. The first record must be a header row. */
export function parseCredentialCsv(text: string): CredentialCsvResult {
  const records = parseCsv(text);
  if (records.length === 0) return { ok: false, error: 'empty' };
  const cols = detectColumns(records[0]);
  const missing = (Object.keys(cols) as Array<keyof ColumnMap>).filter((k) => cols[k] === null);
  if (missing.length > 0) return { ok: false, error: 'missing-columns', missing };
  const columns = cols as ColumnMap;
  const rows = records.slice(1).map((r) => ({
    url: r[columns.url] ?? '',
    username: r[columns.username] ?? '',
    password: r[columns.password] ?? '',
  }));
  return { ok: true, rows, columns };
}

/** Serialize credential rows as a CSV with a `url,username,password` header. */
export function serializeCredentialCsv(rows: CsvCredentialRow[], opts: { bom?: boolean } = {}): string {
  return serializeCsv(
    [['url', 'username', 'password'], ...rows.map((r) => [r.url, r.username, r.password])],
    opts,
  );
}

// ---------------------------------------------------------------------------
// Classification
// ---------------------------------------------------------------------------

/**
 * scheme://host[:port], lowercased, default ports dropped; null for non-http(s).
 * Local copy so this module stays independent of passwords/model.ts.
 */
function originOf(url: string): string | null {
  try {
    const u = new URL(url.trim());
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
    if (!u.hostname) return null;
    return `${u.protocol}//${u.host}`.toLowerCase();
  } catch {
    return null;
  }
}

const keyOf = (origin: string, username: string) => `${origin}\u0000${username}`;

/**
 * Classify import rows against the vault. Each row lands in exactly one bucket:
 * - invalid: no URL, URL not http(s), no username or no password (R11.1)
 * - duplicate: origin+username+password match the vault or an earlier row (R11.3)
 * - conflict: origin+username match with a different password (R11.4)
 * - imported: everything else
 */
export function classifyImport(
  rows: CsvCredentialRow[],
  existing: ExistingCredential[],
): ImportClassification {
  const known = new Map<string, { password: string; source: 'existing' | 'import' }>();
  for (const c of existing) {
    const origin = originOf(c.origin) ?? c.origin.toLowerCase();
    known.set(keyOf(origin, c.username), { password: c.password, source: 'existing' });
  }

  const out: ImportClassification = {
    imported: [],
    duplicate: [],
    conflict: [],
    invalid: [],
    counts: { imported: 0, duplicate: 0, conflict: 0, invalid: 0, total: rows.length },
  };

  for (const row of rows) {
    let reason: InvalidReason | null = null;
    const origin = row.url.trim() ? originOf(row.url) : null;
    if (!row.url.trim()) reason = 'missing-url';
    else if (!origin) reason = 'invalid-url';
    else if (row.username === '') reason = 'missing-username';
    else if (row.password === '') reason = 'missing-password';
    if (reason || !origin) {
      out.invalid.push({ row: { ...row }, reason: reason ?? 'invalid-url' });
      continue;
    }

    const entry: ImportedRow = { ...row, origin };
    const key = keyOf(origin, row.username);
    const hit = known.get(key);
    if (!hit) {
      out.imported.push(entry);
      known.set(key, { password: row.password, source: 'import' });
    } else if (hit.password === row.password) {
      out.duplicate.push(entry);
    } else {
      out.conflict.push({ ...entry, conflictsWith: hit.source });
    }
  }

  out.counts.imported = out.imported.length;
  out.counts.duplicate = out.duplicate.length;
  out.counts.conflict = out.conflict.length;
  out.counts.invalid = out.invalid.length;
  return out;
}
