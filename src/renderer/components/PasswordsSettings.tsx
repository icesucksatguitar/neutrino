import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Copy, Eye, EyeOff, Pencil, Trash2, Upload, X } from 'lucide-react';
import { useProfiles } from '../hooks/useProfiles';
import type {
  ConflictChoice,
  CopyResult,
  CredentialListItem,
  CsvExportSteps,
  ImportConflictInfo,
  NotPossibleCause,
  PasswordImportStartResult,
  PasswordIpcErrorStatus,
  RevealResult,
} from '../types';
import {
  CSV_STEP_BROWSERS,
  ENCRYPTION_UNAVAILABLE_MESSAGE,
  UNREADABLE_LABEL,
  VERIFICATION_FAILED_MESSAGE,
  addReveal,
  defaultConflictChoices,
  describePasswordError,
  displayOrigin,
  filterCredentials,
  hideReveal,
  importSummaryText,
  msUntilNextExpiry,
  notPossibleMessage,
  prepareSummaryText,
  pruneReveals,
  type RevealMap,
} from '../utils/passwordSettings';

type SecretAction = 'reveal' | 'copy';
type SecretResult = RevealResult | CopyResult | PasswordIpcErrorStatus;

interface EditDraft {
  id: string;
  username: string;
  password: string;
}

interface PendingConfirm {
  confirmId: string;
  action: SecretAction;
  credential: CredentialListItem;
}

type ImportView =
  | {
      kind: 'review';
      importId: string;
      summary: string;
      conflicts: ImportConflictInfo[];
      choices: Record<number, ConflictChoice>;
    }
  | { kind: 'done'; text: string }
  | { kind: 'not-possible'; cause: NotPossibleCause; steps: CsvExportSteps }
  | { kind: 'error'; text: string };

const MASK = '\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022';

function api() {
  return window.neutrino;
}

/**
 * Saved passwords for the Active_Profile (R9, R10, R11). Revealed plaintext is
 * held only in component state: it expires after REVEAL_MS, and is dropped on
 * profile change and on unmount (the panel unmounts this section when it closes).
 * Nothing here logs or persists a password.
 */
export const PasswordsSettings: React.FC = () => {
  const { activeProfileId } = useProfiles();

  const [encryptionAvailable, setEncryptionAvailable] = useState<boolean | null>(null);
  const [items, setItems] = useState<CredentialListItem[]>([]);
  const [neverList, setNeverList] = useState<string[]>([]);
  const [query, setQuery] = useState('');
  const [revealed, setRevealed] = useState<RevealMap>({});
  const [editing, setEditing] = useState<EditDraft | null>(null);
  const [pendingDelete, setPendingDelete] = useState<CredentialListItem | null>(null);
  const [pendingConfirm, setPendingConfirm] = useState<PendingConfirm | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [importView, setImportView] = useState<ImportView | null>(null);
  const [busy, setBusy] = useState(false);

  // Bumped on profile change and unmount so late responses (and their plaintext) are dropped.
  const generation = useRef(0);
  const openImportId = useRef<string | null>(null);

  const discardOpenImport = useCallback(() => {
    const id = openImportId.current;
    openImportId.current = null;
    if (id) api()?.cancelPasswordImport?.(id)?.catch(() => { });
  }, []);

  const load = useCallback(async (gen: number) => {
    const bridge = api();
    if (!bridge) return;
    const [status, list, never] = await Promise.all([
      bridge.getPasswordStatus?.(),
      bridge.listPasswords?.(),
      bridge.getPasswordNeverList?.(),
    ]);
    if (gen !== generation.current) return;
    setEncryptionAvailable(status && status.ok ? status.encryptionAvailable : null);
    setItems(Array.isArray(list) ? list : []);
    setNeverList(Array.isArray(never) ? never : []);
  }, []);

  // Reload and forget everything profile-specific when the Active_Profile changes.
  useEffect(() => {
    const gen = ++generation.current;
    setRevealed({});
    setEditing(null);
    setPendingDelete(null);
    setPendingConfirm(null);
    setMessage(null);
    setNotice(null);
    setImportView(null);
    discardOpenImport();
    load(gen).catch(() => {
      if (gen === generation.current) setMessage(describePasswordError(undefined));
    });
  }, [activeProfileId, load, discardOpenImport]);

  // Unmount (section closed): invalidate in-flight calls and discard a prepared import.
  useEffect(
    () => () => {
      generation.current++;
      discardOpenImport();
    },
    [discardOpenImport],
  );

  // Hide revealed passwords when they expire (R10.2).
  useEffect(() => {
    const wait = msUntilNextExpiry(revealed, Date.now());
    if (wait === null) return;
    const timer = setTimeout(() => setRevealed((m) => pruneReveals(m, Date.now())), wait + 1);
    return () => clearTimeout(timer);
  }, [revealed]);

  const run = async (fn: (gen: number) => Promise<void>) => {
    const gen = generation.current;
    setBusy(true);
    try {
      await fn(gen);
    } catch {
      if (gen === generation.current) setMessage(describePasswordError(undefined));
    } finally {
      if (gen === generation.current) setBusy(false);
    }
  };

  const reloadList = async (gen: number) => {
    const list = await api()?.listPasswords?.();
    if (gen === generation.current && Array.isArray(list)) setItems(list);
  };

  const handleSecret = (result: SecretResult | undefined, action: SecretAction, credential: CredentialListItem, gen: number) => {
    if (gen !== generation.current) return;
    if (!result) {
      setMessage(describePasswordError('unavailable'));
      return;
    }
    switch (result.status) {
      case 'ok':
        if (action === 'reveal' && result.credentialId === credential.id) {
          setRevealed((m) => addReveal(m, credential.id, result.password, Date.now()));
          setMessage(null);
        }
        return;
      case 'copied':
        setMessage(null);
        setNotice(`Password copied. The clipboard clears in ${Math.round(result.clearAfterMs / 1000)} seconds.`);
        return;
      case 'needs-confirm':
        setPendingConfirm({ confirmId: result.confirmId, action, credential });
        return;
      case 'cancelled':
      case 'failed':
        setNotice(null);
        setMessage(VERIFICATION_FAILED_MESSAGE);
        return;
      default:
        setNotice(null);
        setMessage(describePasswordError(result.error, result.message));
    }
  };

  const requestSecret = (action: SecretAction, credential: CredentialListItem) =>
    run(async (gen) => {
      setMessage(null);
      setNotice(null);
      const bridge = api();
      const res = action === 'reveal'
        ? await bridge?.revealPassword?.(credential.id)
        : await bridge?.copyPassword?.(credential.id);
      handleSecret(res, action, credential, gen);
    });

  const answerConfirm = (accepted: boolean) => {
    const pending = pendingConfirm;
    setPendingConfirm(null);
    if (!pending) return;
    run(async (gen) => {
      const res = await api()?.confirmPasswordAction?.(pending.confirmId, accepted);
      handleSecret(res, pending.action, pending.credential, gen);
    });
  };

  const saveEdit = () => {
    const draft = editing;
    if (!draft) return;
    const original = items.find((c) => c.id === draft.id);
    const patch: { username?: string; password?: string } = {};
    if (!original || draft.username !== original.username) patch.username = draft.username;
    if (draft.password !== '') patch.password = draft.password;
    if (patch.username === undefined && patch.password === undefined) {
      setEditing(null);
      return;
    }
    run(async (gen) => {
      const res = await api()?.editPassword?.(draft.id, patch);
      if (gen !== generation.current) return;
      if (res && res.ok) {
        setEditing(null);
        setRevealed((m) => hideReveal(m, draft.id));
        setItems((list) => list.map((c) => (c.id === draft.id ? res.credential : c)));
        setMessage(null);
      } else {
        setMessage(res ? describePasswordError(res.error, res.message) : describePasswordError('unavailable'));
      }
    });
  };

  const confirmDelete = () => {
    const target = pendingDelete;
    setPendingDelete(null);
    if (!target) return;
    run(async (gen) => {
      const res = await api()?.deletePassword?.(target.id);
      if (gen !== generation.current) return;
      setRevealed((m) => hideReveal(m, target.id));
      if (editing?.id === target.id) setEditing(null);
      if (res && !res.ok) setMessage(describePasswordError(res.error, res.message));
      else if (!res) setMessage(describePasswordError('unavailable'));
      else setMessage(null);
      await reloadList(gen);
    });
  };

  const removeNever = (origin: string) =>
    run(async (gen) => {
      const list = await api()?.removeFromPasswordNeverList?.(origin);
      if (gen === generation.current && Array.isArray(list)) setNeverList(list);
    });

  const commit = async (importId: string, choices: Record<number, ConflictChoice>, gen: number) => {
    openImportId.current = null;
    const res = await api()?.commitPasswordImport?.(importId, choices);
    if (gen !== generation.current) return;
    if (res && res.ok) {
      setImportView({ kind: 'done', text: importSummaryText(res) });
      await reloadList(gen);
    } else {
      setImportView({
        kind: 'error',
        text: res ? describePasswordError(res.error, res.message) : describePasswordError('unavailable'),
      });
    }
  };

  const handleImportStart = async (res: PasswordImportStartResult | undefined, gen: number) => {
    if (gen !== generation.current) {
      if (res && res.ok) api()?.cancelPasswordImport?.(res.importId)?.catch(() => { });
      return;
    }
    if (!res) {
      setImportView({ kind: 'error', text: describePasswordError('unavailable') });
      return;
    }
    if (res.ok) {
      if (res.conflicts.length === 0) {
        await commit(res.importId, {}, gen);
        return;
      }
      openImportId.current = res.importId;
      setImportView({
        kind: 'review',
        importId: res.importId,
        summary: prepareSummaryText(res.counts),
        conflicts: res.conflicts,
        choices: defaultConflictChoices(res.conflicts),
      });
      return;
    }
    if ('reason' in res && res.reason === 'not-possible') {
      setImportView({ kind: 'not-possible', cause: res.cause, steps: res.csvSteps });
      return;
    }
    if ('error' in res) {
      if (res.error === 'cancelled') {
        setImportView(null);
        return;
      }
      if (res.error === 'encryption-unavailable') setEncryptionAvailable(false);
      setImportView({ kind: 'error', text: describePasswordError(res.error, res.message) });
    }
  };

  const startImport = (source: 'csv' | 'browser') =>
    run(async (gen) => {
      discardOpenImport();
      setImportView(null);
      const bridge = api();
      const res = source === 'csv'
        ? await bridge?.importPasswordsCsv?.()
        : await bridge?.importPasswordsFromBrowser?.();
      await handleImportStart(res, gen);
    });

  const cancelReview = () => {
    discardOpenImport();
    setImportView(null);
  };

  const setChoice = (index: number, choice: ConflictChoice) =>
    setImportView((v) => (v && v.kind === 'review' ? { ...v, choices: { ...v.choices, [index]: choice } } : v));

  const visible = filterCredentials(items, query);
  const locked = encryptionAvailable === false;

  return (
    <section className="settings-section settings-passwords" aria-label="Passwords">
      <h3 className="settings-group-title">Passwords</h3>

      {locked && (
        <p className="settings-error" role="alert">
          {ENCRYPTION_UNAVAILABLE_MESSAGE}
        </p>
      )}

      <input
        className="settings-input"
        type="search"
        aria-label="Search saved passwords"
        placeholder="Search sites and usernames"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />

      {items.length === 0 ? (
        <p className="settings-hint">No saved passwords in this profile.</p>
      ) : visible.length === 0 ? (
        <p className="settings-hint">No saved passwords match.</p>
      ) : (
        <ul className="settings-password-list">
          {visible.map((cred) => {
            const shown = revealed[cred.id];
            const label = `${cred.username || 'no username'} on ${displayOrigin(cred.origin)}`;
            if (editing?.id === cred.id) {
              return (
                <li key={cred.id} className="settings-password-item">
                  <span className="settings-password-origin">{displayOrigin(cred.origin)}</span>
                  <form
                    className="settings-add-form"
                    onSubmit={(e) => {
                      e.preventDefault();
                      saveEdit();
                    }}
                  >
                    <input
                      className="settings-input"
                      type="text"
                      aria-label={`Username for ${displayOrigin(cred.origin)}`}
                      placeholder="Username"
                      autoComplete="off"
                      value={editing.username}
                      onChange={(e) => setEditing({ ...editing, username: e.target.value })}
                    />
                    <input
                      className="settings-input"
                      type="password"
                      aria-label={`New password for ${displayOrigin(cred.origin)}`}
                      placeholder="New password (unchanged if empty)"
                      autoComplete="new-password"
                      value={editing.password}
                      onChange={(e) => setEditing({ ...editing, password: e.target.value })}
                    />
                    <button type="submit" className="settings-button" aria-label={`Save ${label}`} disabled={busy || locked}>
                      Save
                    </button>
                    <button
                      type="button"
                      className="settings-button"
                      aria-label="Cancel editing"
                      onClick={() => setEditing(null)}
                    >
                      Cancel
                    </button>
                  </form>
                </li>
              );
            }
            return (
              <li key={cred.id} className="settings-password-item settings-row">
                <span className="settings-password-text">
                  <span className="settings-password-origin">{displayOrigin(cred.origin)}</span>
                  <span className="settings-password-user">{cred.username || 'No username'}</span>
                </span>
                {cred.unreadable ? (
                  <span className="settings-password-badge" title="This password cannot be decrypted">
                    {UNREADABLE_LABEL}
                  </span>
                ) : (
                  <code className="settings-password-secret">{shown ? shown.password : MASK}</code>
                )}
                <span className="settings-password-actions">
                  <button
                    type="button"
                    className="settings-icon-button"
                    aria-label={shown ? `Hide password for ${label}` : `Reveal password for ${label}`}
                    title={shown ? 'Hide' : 'Reveal'}
                    disabled={cred.unreadable || (busy && !shown)}
                    onClick={() =>
                      shown ? setRevealed((m) => hideReveal(m, cred.id)) : requestSecret('reveal', cred)
                    }
                  >
                    {shown ? <EyeOff size={13} aria-hidden="true" /> : <Eye size={13} aria-hidden="true" />}
                  </button>
                  <button
                    type="button"
                    className="settings-icon-button"
                    aria-label={`Copy password for ${label}`}
                    title="Copy"
                    disabled={cred.unreadable || busy}
                    onClick={() => requestSecret('copy', cred)}
                  >
                    <Copy size={13} aria-hidden="true" />
                  </button>
                  <button
                    type="button"
                    className="settings-icon-button"
                    aria-label={`Edit ${label}`}
                    title="Edit"
                    disabled={busy || locked}
                    onClick={() => {
                      setPendingDelete(null);
                      setEditing({ id: cred.id, username: cred.username, password: '' });
                    }}
                  >
                    <Pencil size={13} aria-hidden="true" />
                  </button>
                  <button
                    type="button"
                    className="settings-icon-button"
                    aria-label={`Delete ${label}`}
                    title="Delete"
                    disabled={busy}
                    onClick={() => setPendingDelete(cred)}
                  >
                    <Trash2 size={13} aria-hidden="true" />
                  </button>
                </span>
              </li>
            );
          })}
        </ul>
      )}

      {pendingConfirm && (
        <div className="settings-confirm" role="alertdialog" aria-modal="false" aria-label="Confirm password access">
          <p className="settings-confirm-text">
            Windows Hello is not available. {pendingConfirm.action === 'reveal' ? 'Show' : 'Copy'} the password for{' '}
            {pendingConfirm.credential.username || 'no username'} on {displayOrigin(pendingConfirm.credential.origin)}?
          </p>
          <div className="settings-confirm-actions">
            <button type="button" className="settings-button" aria-label="Cancel password access" onClick={() => answerConfirm(false)}>
              Cancel
            </button>
            <button
              type="button"
              className="settings-button"
              aria-label={pendingConfirm.action === 'reveal' ? 'Confirm reveal password' : 'Confirm copy password'}
              onClick={() => answerConfirm(true)}
            >
              {pendingConfirm.action === 'reveal' ? 'Reveal' : 'Copy'}
            </button>
          </div>
        </div>
      )}

      {pendingDelete && (
        <div className="settings-confirm" role="alertdialog" aria-modal="false" aria-label="Confirm password deletion">
          <p className="settings-confirm-text">
            Delete the saved password for {pendingDelete.username || 'no username'} on{' '}
            {displayOrigin(pendingDelete.origin)}?
          </p>
          <div className="settings-confirm-actions">
            <button type="button" className="settings-button" aria-label="Cancel password deletion" onClick={() => setPendingDelete(null)}>
              Cancel
            </button>
            <button
              type="button"
              className="settings-button settings-button-danger"
              aria-label="Delete saved password"
              onClick={confirmDelete}
            >
              Delete
            </button>
          </div>
        </div>
      )}

      {message && (
        <p className="settings-error" role="alert">
          {message}
        </p>
      )}
      {notice && (
        <p className="settings-hint" role="status">
          {notice}
        </p>
      )}

      <div className="settings-password-subsection">
        <span className="settings-row-label">Never saved for</span>
        {neverList.length === 0 ? (
          <p className="settings-hint">No sites.</p>
        ) : (
          <ul className="settings-password-list">
            {neverList.map((origin) => (
              <li key={origin} className="settings-row settings-space-item">
                <span className="settings-password-origin">{displayOrigin(origin)}</span>
                <button
                  type="button"
                  className="settings-icon-button"
                  aria-label={`Remove ${displayOrigin(origin)} from the never-save list`}
                  title="Remove"
                  disabled={busy}
                  onClick={() => removeNever(origin)}
                >
                  <X size={13} aria-hidden="true" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="settings-password-subsection">
        <span className="settings-row-label">Import</span>
        <div className="settings-add-form">
          <button
            type="button"
            className="settings-button"
            aria-label="Import passwords from a CSV file"
            disabled={busy || locked}
            onClick={() => startImport('csv')}
          >
            <Upload size={13} aria-hidden="true" />
            CSV file
          </button>
          <button
            type="button"
            className="settings-button"
            aria-label="Import passwords from Chrome or Edge"
            disabled={busy || locked}
            onClick={() => startImport('browser')}
          >
            <Upload size={13} aria-hidden="true" />
            Chrome or Edge
          </button>
        </div>

        {importView?.kind === 'review' && (
          <div className="settings-confirm" role="dialog" aria-modal="false" aria-label="Resolve import conflicts">
            <p className="settings-confirm-text">{importView.summary}</p>
            <p className="settings-hint">These logins already have a different saved password. Choose which to keep.</p>
            <ul className="settings-password-list">
              {importView.conflicts.map((c) => {
                const choice = importView.choices[c.index] ?? 'keep';
                const who = `${c.username || 'no username'} on ${displayOrigin(c.origin)}`;
                return (
                  <li key={c.index} className="settings-row settings-password-conflict">
                    <span className="settings-password-text">
                      <span className="settings-password-origin">{displayOrigin(c.origin)}</span>
                      <span className="settings-password-user">
                        {c.username || 'No username'}
                        {c.conflictsWith === 'import' ? ' (listed twice in the file)' : ''}
                      </span>
                    </span>
                    <span className="settings-segmented" role="radiogroup" aria-label={`Conflict for ${who}`}>
                      {(['keep', 'replace'] as const).map((opt) => (
                        <button
                          key={opt}
                          type="button"
                          role="radio"
                          aria-checked={choice === opt}
                          aria-label={`${opt === 'keep' ? 'Keep current password' : 'Replace with imported password'} for ${who}`}
                          className={`settings-segment${choice === opt ? ' active' : ''}`}
                          onClick={() => setChoice(c.index, opt)}
                        >
                          {opt === 'keep' ? 'Keep' : 'Replace'}
                        </button>
                      ))}
                    </span>
                  </li>
                );
              })}
            </ul>
            <div className="settings-confirm-actions">
              <button type="button" className="settings-button" aria-label="Cancel import" onClick={cancelReview}>
                Cancel
              </button>
              <button
                type="button"
                className="settings-button"
                aria-label="Finish import"
                disabled={busy}
                onClick={() => run((gen) => commit(importView.importId, importView.choices, gen))}
              >
                Import
              </button>
            </div>
          </div>
        )}

        {importView?.kind === 'done' && (
          <p className="settings-hint" role="status">
            {importView.text}
          </p>
        )}

        {importView?.kind === 'error' && (
          <p className="settings-error" role="alert">
            {importView.text}
          </p>
        )}

        {importView?.kind === 'not-possible' && (
          <div className="settings-confirm" role="alert" aria-label="Direct import not possible">
            <p className="settings-confirm-text">{notPossibleMessage(importView.cause)}</p>
            {CSV_STEP_BROWSERS.map(({ key, label }) => (
              <div key={key}>
                <span className="settings-row-label">Export from {label}</span>
                <ol className="settings-erase-list settings-steps-list">
                  {(importView.steps[key] ?? []).map((step) => (
                    <li key={step}>{step}</li>
                  ))}
                </ol>
              </div>
            ))}
            <div className="settings-confirm-actions">
              <button type="button" className="settings-button" aria-label="Dismiss import message" onClick={() => setImportView(null)}>
                Close
              </button>
            </div>
          </div>
        )}
      </div>
    </section>
  );
};
