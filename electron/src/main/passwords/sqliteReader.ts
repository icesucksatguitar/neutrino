/**
 * Minimal, dependency-free SQLite3 reader (task 10.9, R11.5/11.6).
 *
 * Chromium stores saved logins in a `Login Data` file, which is a standard
 * SQLite3 database. The project ships no SQLite library and no native deps
 * (see design.md "Import"), so this module reads the file format directly:
 * the 100-byte file header, table b-tree pages (leaf type `0x0d`, interior
 * type `0x05`), the record (serial type) format and overflow page chains.
 *
 * Scope is deliberately tiny: resolve a table's root page from the
 * `sqlite_master` schema, then walk that one table's b-tree and return each
 * row's column values. Index b-trees, writing, journals/WAL, incremental
 * vacuum and encryption are all out of scope — we only ever read a copy of
 * the file. The reader operates on an in-memory buffer so unit tests can feed
 * a hand-built fixture (task 10.10).
 *
 * Every public function is total over the buffer it is given: malformed input
 * throws `SqliteError`, which the caller turns into the "direct import not
 * possible" fallback (R11.7). No Node or Electron imports here.
 */

export class SqliteError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SqliteError';
  }
}

/** A decoded SQLite cell value. TEXT is decoded as UTF-8, BLOB stays raw. */
export type SqliteValue = null | number | bigint | string | Uint8Array;

export interface SqliteRow {
  rowid: bigint;
  values: SqliteValue[];
}

export interface SqliteTable {
  /** Column names parsed from the table's CREATE statement, in declared order. */
  columns: string[];
  rows: SqliteRow[];
}

const HEADER_SIZE = 100;
const MAGIC = 'SQLite format 3\u0000';

const PAGE_INTERIOR_TABLE = 0x05;
const PAGE_LEAF_TABLE = 0x0d;

interface DbInfo {
  bytes: Uint8Array;
  view: DataView;
  pageSize: number;
  /** Usable bytes per page: pageSize minus the reserved region at header[20]. */
  usable: number;
  pageCount: number;
}

function toView(bytes: Uint8Array): DataView {
  return new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
}

function openDb(bytes: Uint8Array): DbInfo {
  if (!(bytes instanceof Uint8Array)) throw new SqliteError('input is not a byte buffer');
  if (bytes.length < HEADER_SIZE) throw new SqliteError('file smaller than SQLite header');
  for (let i = 0; i < MAGIC.length; i++) {
    if (bytes[i] !== MAGIC.charCodeAt(i)) throw new SqliteError('bad SQLite magic header');
  }
  const view = toView(bytes);
  const rawPageSize = view.getUint16(16, false);
  // Per spec, a stored value of 1 means a 65536-byte page.
  const pageSize = rawPageSize === 1 ? 65536 : rawPageSize;
  if (pageSize < 512 || (pageSize & (pageSize - 1)) !== 0) {
    throw new SqliteError(`invalid page size ${pageSize}`);
  }
  const reserved = bytes[20];
  const usable = pageSize - reserved;
  if (usable < 480) throw new SqliteError('usable page size too small');
  const pageCount = view.getUint32(28, false) || Math.floor(bytes.length / pageSize);
  return { bytes, view, pageSize, usable, pageCount };
}

// ---------------------------------------------------------------------------
// Varints
// ---------------------------------------------------------------------------

/** Decode a SQLite big-endian varint (1–9 bytes). Returns value and byte length. */
export function readVarint(bytes: Uint8Array, offset: number): { value: bigint; length: number } {
  let result = 0n;
  for (let i = 0; i < 8; i++) {
    const pos = offset + i;
    if (pos >= bytes.length) throw new SqliteError('varint runs past end of buffer');
    const byte = bytes[pos];
    result = (result << 7n) | BigInt(byte & 0x7f);
    if ((byte & 0x80) === 0) return { value: result, length: i + 1 };
  }
  // 9th byte contributes all 8 bits.
  const pos = offset + 8;
  if (pos >= bytes.length) throw new SqliteError('varint runs past end of buffer');
  result = (result << 8n) | BigInt(bytes[pos]);
  return { value: result, length: 9 };
}

function asNumber(value: bigint, what: string): number {
  if (value < 0n || value > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new SqliteError(`${what} out of range`);
  }
  return Number(value);
}

// ---------------------------------------------------------------------------
// Page access
// ---------------------------------------------------------------------------

/** Byte offset within a page where its b-tree header begins (page 1 follows the file header). */
function pageBodyStart(pageNumber: number): number {
  return pageNumber === 1 ? HEADER_SIZE : 0;
}

function pageOffset(db: DbInfo, pageNumber: number): number {
  if (pageNumber < 1) throw new SqliteError(`invalid page number ${pageNumber}`);
  const offset = (pageNumber - 1) * db.pageSize;
  if (offset + db.pageSize > db.bytes.length + 1) {
    // Allow the final page to be short, but reject pages entirely past EOF.
    if (offset >= db.bytes.length) throw new SqliteError(`page ${pageNumber} past end of file`);
  }
  return offset;
}

interface PageHeader {
  type: number;
  cellCount: number;
  headerStart: number;
  cellPointerStart: number;
  rightMostPointer: number | null;
}

function readPageHeader(db: DbInfo, pageNumber: number): PageHeader {
  const base = pageOffset(db, pageNumber);
  const headerStart = base + pageBodyStart(pageNumber);
  const type = db.bytes[headerStart];
  const isInterior = type === PAGE_INTERIOR_TABLE;
  const isLeaf = type === PAGE_LEAF_TABLE;
  if (!isInterior && !isLeaf) {
    throw new SqliteError(`page ${pageNumber} is not a table b-tree page (type ${type})`);
  }
  const cellCount = db.view.getUint16(headerStart + 3, false);
  const btreeHeaderSize = isInterior ? 12 : 8;
  const rightMostPointer = isInterior ? db.view.getUint32(headerStart + 8, false) : null;
  return {
    type,
    cellCount,
    headerStart,
    cellPointerStart: headerStart + btreeHeaderSize,
    rightMostPointer,
  };
}

function cellOffset(db: DbInfo, pageNumber: number, header: PageHeader, index: number): number {
  const ptr = header.cellPointerStart + index * 2;
  const rawOffset = db.view.getUint16(ptr, false);
  // Cell offsets are relative to the start of the page.
  return pageOffset(db, pageNumber) + rawOffset;
}

// ---------------------------------------------------------------------------
// Payload assembly (local bytes + overflow chain)
// ---------------------------------------------------------------------------

function assemblePayload(db: DbInfo, payloadSize: number, localStart: number): Uint8Array {
  const U = db.usable;
  const maxLocal = U - 35;
  const minLocal = Math.floor(((U - 12) * 32) / 255) - 23;

  let localBytes: number;
  if (payloadSize <= maxLocal) {
    localBytes = payloadSize;
  } else {
    const k = minLocal + ((payloadSize - minLocal) % (U - 4));
    localBytes = k <= maxLocal ? k : minLocal;
  }
  if (localStart + localBytes > db.bytes.length) {
    throw new SqliteError('payload local region runs past end of file');
  }

  const out = new Uint8Array(payloadSize);
  out.set(db.bytes.subarray(localStart, localStart + localBytes), 0);
  let written = localBytes;

  if (written < payloadSize) {
    let nextPage = db.view.getUint32(localStart + localBytes, false);
    const seen = new Set<number>();
    while (nextPage !== 0 && written < payloadSize) {
      if (seen.has(nextPage)) throw new SqliteError('overflow page cycle');
      seen.add(nextPage);
      const base = pageOffset(db, nextPage);
      const chunk = Math.min(U - 4, payloadSize - written);
      if (base + 4 + chunk > db.bytes.length) {
        throw new SqliteError('overflow page runs past end of file');
      }
      out.set(db.bytes.subarray(base + 4, base + 4 + chunk), written);
      written += chunk;
      nextPage = db.view.getUint32(base, false);
    }
    if (written < payloadSize) throw new SqliteError('overflow chain ended early');
  }
  return out;
}

// ---------------------------------------------------------------------------
// Record decoding
// ---------------------------------------------------------------------------

const textDecoder = new TextDecoder('utf-8');

/** Decode a record (payload) into column values per the serial-type header. */
export function decodeRecord(payload: Uint8Array): SqliteValue[] {
  const { value: headerLenBig, length: hl } = readVarint(payload, 0);
  const headerLen = asNumber(headerLenBig, 'record header length');
  if (headerLen > payload.length) throw new SqliteError('record header longer than payload');

  const serialTypes: bigint[] = [];
  let p = hl;
  while (p < headerLen) {
    const { value, length } = readVarint(payload, p);
    serialTypes.push(value);
    p += length;
  }

  const values: SqliteValue[] = [];
  let body = headerLen;
  for (const st of serialTypes) {
    const { value, size } = decodeSerial(st, payload, body);
    values.push(value);
    body += size;
    if (body > payload.length) throw new SqliteError('record body runs past payload');
  }
  return values;
}

function decodeSerial(serialType: bigint, payload: Uint8Array, offset: number): { value: SqliteValue; size: number } {
  const view = toView(payload);
  switch (serialType) {
    case 0n:
      return { value: null, size: 0 };
    case 1n:
      return { value: view.getInt8(offset), size: 1 };
    case 2n:
      return { value: view.getInt16(offset, false), size: 2 };
    case 3n: {
      const b = payload;
      let v = (b[offset] << 16) | (b[offset + 1] << 8) | b[offset + 2];
      if (v & 0x800000) v -= 0x1000000;
      return { value: v, size: 3 };
    }
    case 4n:
      return { value: view.getInt32(offset, false), size: 4 };
    case 5n: {
      const hi = view.getInt16(offset, false);
      const lo = view.getUint32(offset + 2, false);
      return { value: hi * 0x100000000 + lo, size: 6 };
    }
    case 6n:
      return { value: view.getBigInt64(offset, false), size: 8 };
    case 7n:
      return { value: view.getFloat64(offset, false), size: 8 };
    case 8n:
      return { value: 0, size: 0 };
    case 9n:
      return { value: 1, size: 0 };
    case 10n:
    case 11n:
      throw new SqliteError('reserved serial type');
    default: {
      const n = serialType;
      if (n >= 12n && n % 2n === 0n) {
        const len = asNumber((n - 12n) / 2n, 'blob length');
        return { value: payload.subarray(offset, offset + len), size: len };
      }
      // Odd, >= 13: TEXT.
      const len = asNumber((n - 13n) / 2n, 'text length');
      return { value: textDecoder.decode(payload.subarray(offset, offset + len)), size: len };
    }
  }
}

// ---------------------------------------------------------------------------
// Table b-tree walk
// ---------------------------------------------------------------------------

function walkTable(db: DbInfo, rootPage: number): SqliteRow[] {
  const rows: SqliteRow[] = [];
  const visited = new Set<number>();
  const stack: number[] = [rootPage];

  while (stack.length > 0) {
    const pageNumber = stack.pop()!;
    if (visited.has(pageNumber)) throw new SqliteError('b-tree page cycle');
    visited.add(pageNumber);
    if (visited.size > db.pageCount + 1) throw new SqliteError('b-tree larger than file');

    const header = readPageHeader(db, pageNumber);

    if (header.type === PAGE_LEAF_TABLE) {
      for (let i = 0; i < header.cellCount; i++) {
        const cell = cellOffset(db, pageNumber, header, i);
        const { value: payloadSizeBig, length: pl } = readVarint(db.bytes, cell);
        const payloadSize = asNumber(payloadSizeBig, 'payload size');
        const { value: rowid, length: rl } = readVarint(db.bytes, cell + pl);
        const payload = assemblePayload(db, payloadSize, cell + pl + rl);
        rows.push({ rowid, values: decodeRecord(payload) });
      }
    } else {
      // Interior table page: each cell points at a child page; push children
      // and the right-most pointer. Order does not matter for a full scan.
      for (let i = 0; i < header.cellCount; i++) {
        const cell = cellOffset(db, pageNumber, header, i);
        const child = db.view.getUint32(cell, false);
        stack.push(child);
      }
      if (header.rightMostPointer) stack.push(header.rightMostPointer);
    }
  }
  return rows;
}

// ---------------------------------------------------------------------------
// Schema (sqlite_master) and CREATE TABLE column parsing
// ---------------------------------------------------------------------------

const CONSTRAINT_KEYWORDS = new Set([
  'primary',
  'unique',
  'check',
  'foreign',
  'constraint',
]);

/**
 * Parse column names from a `CREATE TABLE ... (col1 ..., col2 ..., constraint...)`
 * statement. Table-level constraints are skipped. Identifiers may be bare,
 * `"quoted"`, `[bracketed]` or `` `backticked` ``. Best effort: returns an empty
 * list if no column list is found.
 */
export function parseCreateTableColumns(sql: string): string[] {
  if (typeof sql !== 'string') return [];
  const open = sql.indexOf('(');
  if (open === -1) return [];
  // Find the matching close paren for the opening one.
  let depth = 0;
  let close = -1;
  for (let i = open; i < sql.length; i++) {
    const ch = sql[i];
    if (ch === '(') depth++;
    else if (ch === ')') {
      depth--;
      if (depth === 0) {
        close = i;
        break;
      }
    }
  }
  if (close === -1) close = sql.length;
  const body = sql.slice(open + 1, close);

  // Split on top-level commas (ignoring commas inside nested parens or quotes).
  const parts: string[] = [];
  let current = '';
  let d = 0;
  let quote = '';
  for (let i = 0; i < body.length; i++) {
    const ch = body[i];
    if (quote) {
      current += ch;
      if (ch === quote) quote = '';
      continue;
    }
    if (ch === '"' || ch === "'" || ch === '`') {
      quote = ch;
      current += ch;
    } else if (ch === '[') {
      quote = ']';
      current += ch;
    } else if (ch === '(') {
      d++;
      current += ch;
    } else if (ch === ')') {
      d--;
      current += ch;
    } else if (ch === ',' && d === 0) {
      parts.push(current);
      current = '';
    } else {
      current += ch;
    }
  }
  if (current.trim()) parts.push(current);

  const columns: string[] = [];
  for (const part of parts) {
    const name = firstIdentifier(part.trim());
    if (name === null) continue;
    if (CONSTRAINT_KEYWORDS.has(name.toLowerCase())) continue;
    columns.push(name);
  }
  return columns;
}

/** Read the first identifier token of a column definition, unquoting it. */
function firstIdentifier(text: string): string | null {
  if (text.length === 0) return null;
  const ch = text[0];
  const closers: Record<string, string> = { '"': '"', "'": "'", '`': '`', '[': ']' };
  if (closers[ch]) {
    const closer = closers[ch];
    let out = '';
    for (let i = 1; i < text.length; i++) {
      if (text[i] === closer) {
        if (closer !== ']' && text[i + 1] === closer) {
          out += closer;
          i++;
          continue;
        }
        return out;
      }
      out += text[i];
    }
    return out;
  }
  const match = /^[A-Za-z0-9_$]+/.exec(text);
  return match ? match[0] : null;
}

interface SchemaEntry {
  type: string;
  name: string;
  rootPage: number;
  sql: string;
}

function readSchema(db: DbInfo): SchemaEntry[] {
  // sqlite_master is a leaf/interior table b-tree rooted at page 1. Columns:
  // (type TEXT, name TEXT, tbl_name TEXT, rootpage INTEGER, sql TEXT).
  const rows = walkTable(db, 1);
  const entries: SchemaEntry[] = [];
  for (const row of rows) {
    const [type, name, , rootpage, sql] = row.values;
    entries.push({
      type: typeof type === 'string' ? type : '',
      name: typeof name === 'string' ? name : '',
      rootPage: typeof rootpage === 'number' ? rootpage : Number(rootpage ?? 0),
      sql: typeof sql === 'string' ? sql : '',
    });
  }
  return entries;
}

// ---------------------------------------------------------------------------
// Public entry point
// ---------------------------------------------------------------------------

/**
 * Read all rows of a single table by name from an in-memory SQLite database.
 * Throws `SqliteError` for a missing table or any malformed structure.
 */
export function readTable(bytes: Uint8Array, tableName: string): SqliteTable {
  const db = openDb(bytes);
  const schema = readSchema(db);
  const entry = schema.find((e) => e.type === 'table' && e.name === tableName);
  if (!entry) throw new SqliteError(`table "${tableName}" not found`);
  if (entry.rootPage < 1) throw new SqliteError(`table "${tableName}" has no root page`);
  const columns = parseCreateTableColumns(entry.sql);
  const rows = walkTable(db, entry.rootPage);
  return { columns, rows };
}
