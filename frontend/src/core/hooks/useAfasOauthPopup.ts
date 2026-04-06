import { useEffect, useRef, useState } from 'react';
import {
  fetchAfasOAuthStartUrl,
  fetchIframeSessionProfile,
  isTrustedPopupMessageOrigin,
} from '../api/client';
import { IframeSessionProfile } from '../types';

type UseAfasOauthPopupOptions = {
  onBeforeStart?: () => void;
  onStatusChange?: (message: string) => void;
  onIframeSessionChange?: (session: IframeSessionProfile | null) => void;
  onDebugLine?: (message: string) => void;
  onSuccess?: () => Promise<void> | void;
  onFailure?: (message: string) => Promise<void> | void;
};

export function useAfasOauthPopup(options: UseAfasOauthPopupOptions = {}) {
  const popupPollRef = useRef<number | null>(null);
  const popupTimeoutRef = useRef<number | null>(null);
  const popupMessageReceivedRef = useRef(false);
  const optionsRef = useRef(options);
  const [busy, setBusy] = useState(false);

  optionsRef.current = options;

  function clearPopupWatchers() {
    if (popupPollRef.current !== null) {
      window.clearInterval(popupPollRef.current);
      popupPollRef.current = null;
    }
    if (popupTimeoutRef.current !== null) {
      window.clearTimeout(popupTimeoutRef.current);
      popupTimeoutRef.current = null;
    }
  }

  async function finishFailure(message: string) {
    optionsRef.current.onStatusChange?.(message);
    await optionsRef.current.onFailure?.(message);
    setBusy(false);
  }

  async function finishSuccess() {
    await optionsRef.current.onSuccess?.();
    setBusy(false);
  }

  useEffect(() => {
    function onMessage(event: MessageEvent) {
      if (!isTrustedPopupMessageOrigin(event.origin)) return;
      const payload = event.data as { type?: string; ok?: boolean; message?: string } | null;
      if (!payload || payload.type !== 'afas-oauth-complete') return;
      popupMessageReceivedRef.current = true;
      clearPopupWatchers();
      optionsRef.current.onDebugLine?.(`popup bericht: ok=${String(payload.ok)} message=${payload.message || '-'}`);
      if (payload.ok) {
        void finishSuccess();
        return;
      }
      void finishFailure(payload.message ?? 'AFAS OAuth-login is mislukt.');
    }

    window.addEventListener('message', onMessage);
    return () => {
      window.removeEventListener('message', onMessage);
      clearPopupWatchers();
    };
  }, []);

  async function startLogin() {
    if (busy) return;
    setBusy(true);
    optionsRef.current.onBeforeStart?.();
    optionsRef.current.onStatusChange?.('Aanmelden via AFAS gestart...');
    optionsRef.current.onDebugLine?.('OAuth-login gestart.');

    // Open the popup synchronously within the user-gesture context before any
    // await, otherwise browsers (especially inside iframes) will block it.
    const popupName = `afas-oauth-${Date.now()}`;
    const popup = window.open('about:blank', popupName, 'popup,width=560,height=760');
    if (!popup) {
      await finishFailure('OAuth-popup is geblokkeerd door de browser.');
      return;
    }
    optionsRef.current.onDebugLine?.('OAuth-popup geopend (about:blank).');

    clearPopupWatchers();
    popupMessageReceivedRef.current = false;

    try {
      const iframeResult = await fetchIframeSessionProfile();
      optionsRef.current.onIframeSessionChange?.(iframeResult.session);
      optionsRef.current.onDebugLine?.(
        `OAuth preflight iframe ok: ${iframeResult.session.userId} / ${iframeResult.session.sessionId}`,
      );
      const url = await fetchAfasOAuthStartUrl({ iframeSessionId: iframeResult.session.sessionId });
      optionsRef.current.onDebugLine?.('OAuth start-url ontvangen.');
      popup.location.href = url;
      optionsRef.current.onDebugLine?.('OAuth-popup genavigeerd naar AFAS.');
      popupPollRef.current = window.setInterval(() => {
        if (popup.closed && !popupMessageReceivedRef.current) {
          clearPopupWatchers();
          void finishFailure('OAuth-venster gesloten zonder terugmelding.');
        }
      }, 400);
      popupTimeoutRef.current = window.setTimeout(() => {
        if (!popupMessageReceivedRef.current) {
          clearPopupWatchers();
          try {
            popup.close();
          } catch {
            // Ignore close errors from browser popup restrictions.
          }
          void finishFailure('OAuth-login timed out zonder bevestiging uit AFAS.');
        }
      }, 45000);
    } catch (error) {
      clearPopupWatchers();
      popupMessageReceivedRef.current = false;
      try {
        popup.close();
      } catch {
        // Ignore close errors from browser popup restrictions.
      }
      const message = (error as Error).message || 'AFAS OAuth-login kon niet worden gestart.';
      optionsRef.current.onDebugLine?.(`OAuth start fout: ${message}`);
      await finishFailure(message);
    }
  }

  return {
    busy,
    startLogin,
  };
}
