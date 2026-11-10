import React, { useEffect, useState } from 'react';
import { ExternalLink, Link2, X } from 'lucide-react';
import type { AuthHandoffNotice as Notice } from '../types';

type Phase = { kind: 'ask' } | { kind: 'busy' } | { kind: 'opened' } | { kind: 'copied' } | { kind: 'error'; message: string };

/**
 * Shown when Google refuses a sign-in inside Neutrino. Offers to continue in the default browser
 * and says plainly that the user will be signed in there, not in Neutrino. Failures to open the
 * browser are shown with a "Copy link" fallback instead of failing silently.
 */
export const AuthHandoffNotice: React.FC = () => {
  const [notice, setNotice] = useState<Notice | null>(null);
  const [phase, setPhase] = useState<Phase>({ kind: 'ask' });

  useEffect(() => {
    const unsubscribe = window.neutrino?.onAuthHandoffRequired?.((next) => {
      setNotice(next);
      setPhase({ kind: 'ask' });
    });
    return () => unsubscribe?.();
  }, []);

  // Confirmation states close themselves; questions and errors wait for the user.
  useEffect(() => {
    if (phase.kind !== 'opened' && phase.kind !== 'copied') return;
    const timer = setTimeout(() => setNotice(null), 9000);
    return () => clearTimeout(timer);
  }, [phase]);

  if (!notice) return null;
  const { handoffId, siteHost } = notice;

  const openInBrowser = async () => {
    setPhase({ kind: 'busy' });
    const result = await window.neutrino?.openAuthHandoff?.(handoffId);
    if (result?.ok) setPhase({ kind: 'opened' });
    else setPhase({ kind: 'error', message: result?.error ?? 'Could not open your default browser.' });
  };

  const copyLink = async () => {
    const result = await window.neutrino?.copyAuthHandoffLink?.(handoffId);
    if (result?.ok) setPhase({ kind: 'copied' });
    else setPhase({ kind: 'error', message: result?.error ?? 'Could not copy the link.' });
  };

  const dismiss = () => {
    if (phase.kind === 'ask' || phase.kind === 'error') {
      void window.neutrino?.dismissAuthHandoff?.(handoffId);
    }
    setNotice(null);
  };

  const reasonText =
    notice.reason === 'disallowed-useragent'
      ? 'Google does not allow this sign-in inside an embedded browser.'
      : 'Google blocked this sign-in in Neutrino ("This browser or app may not be secure").';

  return (
    <div className="auth-handoff-notice" role={phase.kind === 'error' ? 'alert' : 'status'} aria-live="polite">
      <div className="auth-handoff-body">
        {phase.kind === 'opened' && (
          <p className="auth-handoff-title">
            Opened {siteHost} in your default browser. Finish signing in there.
          </p>
        )}
        {phase.kind === 'copied' && (
          <p className="auth-handoff-title">Link copied. Paste it into your default browser to sign in to {siteHost}.</p>
        )}
        {(phase.kind === 'ask' || phase.kind === 'busy') && (
          <>
            <p className="auth-handoff-title">Continue Google sign-in for {siteHost} in your browser?</p>
            <p className="auth-handoff-text">
              {reasonText} You will be signed in to {siteHost} in your default browser, not in Neutrino.
            </p>
          </>
        )}
        {phase.kind === 'error' && (
          <>
            <p className="auth-handoff-title">{phase.message}</p>
            <p className="auth-handoff-text">Copy the link and open it in your browser to sign in to {siteHost}.</p>
          </>
        )}
      </div>

      <div className="auth-handoff-actions">
        {(phase.kind === 'ask' || phase.kind === 'busy') && (
          <button type="button" className="auth-handoff-primary" onClick={openInBrowser} disabled={phase.kind === 'busy'}>
            <ExternalLink size={13} />
            <span>{phase.kind === 'busy' ? 'Opening…' : 'Continue in browser'}</span>
          </button>
        )}
        {phase.kind === 'error' && (
          <>
            <button type="button" className="auth-handoff-primary" onClick={copyLink}>
              <Link2 size={13} />
              <span>Copy link</span>
            </button>
            <button type="button" className="auth-handoff-secondary" onClick={openInBrowser}>
              Try again
            </button>
          </>
        )}
        <button type="button" className="auth-handoff-close" onClick={dismiss} aria-label="Dismiss" title="Dismiss">
          <X size={14} />
        </button>
      </div>
    </div>
  );
};
