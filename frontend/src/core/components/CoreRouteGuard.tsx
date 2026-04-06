import { Fragment, ReactNode, useEffect, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { DEFAULT_BOOTSTRAP_STATUS, fetchBootstrapStatus, fetchIframeSessionProfile } from '../api/client';
import { BootstrapStatus } from '../types';
import CoreAccessOverlay from './CoreAccessOverlay';
import { useAfasOauthPopup } from '../hooks/useAfasOauthPopup';

type CoreRouteGuardProps = {
  children: ReactNode;
  scope: 'app' | 'settings';
  settingsLink?: {
    to: string;
    label: string;
    requireSettingsAllowed?: boolean;
  };
};

export default function CoreRouteGuard({ children, scope, settingsLink }: CoreRouteGuardProps) {
  const location = useLocation();
  const [loading, setLoading] = useState(true);
  const [bootstrapStatus, setBootstrapStatus] = useState<BootstrapStatus>(DEFAULT_BOOTSTRAP_STATUS);
  const [hasActiveIframeSession, setHasActiveIframeSession] = useState(false);
  const [contentRevision, setContentRevision] = useState(0);
  const [refreshVersion, setRefreshVersion] = useState(0);
  const autoRetryDoneRef = useRef(false);

  function scheduleFullReload(delayMs = 3000) {
    window.setTimeout(() => {
      window.location.reload();
    }, delayMs);
  }

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      setLoading(true);
      try {
        const [nextBootstrapStatus, iframeResult] = await Promise.all([
          fetchBootstrapStatus(),
          fetchIframeSessionProfile().catch(() => undefined),
        ]);
        if (cancelled) return;
        setBootstrapStatus(nextBootstrapStatus);
        setHasActiveIframeSession(Boolean(iframeResult?.session?.sessionId));
      } catch {
        if (cancelled) return;
        setBootstrapStatus(DEFAULT_BOOTSTRAP_STATUS);
        setHasActiveIframeSession(false);
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [location.pathname, refreshVersion]);

  // When the initial bootstrap sees no iframe session (iframe_required), the
  // AFAS iframe exchange in AppPage may still be in progress. Auto-retry once
  // after a short delay so the user doesn't have to click "opnieuw controleren"
  // manually just to get past the race condition on first load.
  useEffect(() => {
    if (loading) return;
    if (bootstrapStatus.blockReason !== 'iframe_required') return;
    if (autoRetryDoneRef.current) return;
    autoRetryDoneRef.current = true;
    const timer = window.setTimeout(() => {
      setRefreshVersion((v) => v + 1);
    }, 2500);
    return () => window.clearTimeout(timer);
  }, [loading, bootstrapStatus.blockReason]);

  async function refreshGuard(options?: { remountContent?: boolean }) {
    setRefreshVersion((current) => current + 1);
    if (options?.remountContent) {
      setContentRevision((current) => current + 1);
    }
  }

  const oauthLogin = useAfasOauthPopup({
    onIframeSessionChange: (session) => setHasActiveIframeSession(Boolean(session?.sessionId)),
    onSuccess: async () => {
      await refreshGuard({ remountContent: true });
      scheduleFullReload();
    },
    onFailure: async () => {
      await refreshGuard();
    },
  });

  return (
    <>
      <Fragment key={contentRevision}>{children}</Fragment>
      <CoreAccessOverlay
        loading={loading}
        scope={scope}
        bootstrapStatus={bootstrapStatus}
        onRefresh={() => void refreshGuard({ remountContent: true })}
        oauthLoginBusy={oauthLogin.busy}
        onStartOauth={() => void oauthLogin.startLogin()}
        settingsLink={settingsLink}
      />
    </>
  );
}
