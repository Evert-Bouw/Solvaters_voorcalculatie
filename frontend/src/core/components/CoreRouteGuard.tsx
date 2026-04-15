import { Fragment, ReactNode, useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import {
  DEFAULT_BOOTSTRAP_STATUS,
  exchangeIframeSession,
  fetchBootstrapStatus,
  fetchIframeSessionProfile,
} from '../api/client';
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

function readIframeExchangePayload() {
  const params = new URLSearchParams(window.location.search);
  const tokenurl = params.get('tokenurl')?.trim() || '';
  const code = params.get('code')?.trim() || '';
  const publickey = params.get('publickey')?.trim() || '';
  const sessionid = params.get('sessionid')?.trim() || '';
  return { tokenurl, code, publickey, sessionid };
}

function clearIframeExchangePayloadFromUrl() {
  const url = new URL(window.location.href);
  let changed = false;
  ['tokenurl', 'code', 'publickey', 'sessionid'].forEach((key) => {
    if (url.searchParams.has(key)) {
      url.searchParams.delete(key);
      changed = true;
    }
  });
  if (!changed) return;
  const nextUrl = `${url.pathname}${url.search}${url.hash}`;
  window.history.replaceState({}, document.title, nextUrl);
}

export default function CoreRouteGuard({ children, scope, settingsLink }: CoreRouteGuardProps) {
  const location = useLocation();
  const [loading, setLoading] = useState(true);
  const [bootstrapStatus, setBootstrapStatus] = useState<BootstrapStatus>(DEFAULT_BOOTSTRAP_STATUS);
  const [hasActiveIframeSession, setHasActiveIframeSession] = useState(false);
  const [contentRevision, setContentRevision] = useState(0);
  const [refreshVersion, setRefreshVersion] = useState(0);

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
        const iframeExchange = readIframeExchangePayload();
        if (
          iframeExchange.tokenurl &&
          iframeExchange.code &&
          iframeExchange.publickey &&
          iframeExchange.sessionid
        ) {
          await exchangeIframeSession(iframeExchange);
          clearIframeExchangePayloadFromUrl();
        }

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
