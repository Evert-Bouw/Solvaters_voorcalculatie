import { ReactNode, useEffect, useMemo, useState } from 'react';
import { useLocation } from 'react-router-dom';
import CoreRouteGuard from './core/components/CoreRouteGuard';
import {
  DEFAULT_BOOTSTRAP_STATUS,
  exchangeIframeSession,
  fetchBootstrapStatus,
} from './core/api/client';
import { BootstrapStatus } from './core/types';

type GuardedRouteWithOverrideProps = {
  children: ReactNode;
  scope: 'app' | 'settings';
  settingsLink?: {
    to: string;
    label: string;
    requireSettingsAllowed?: boolean;
  };
};

const overlayOverrideStorageKey = 'solvaters_overlay_override';

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

function getStoredOverride() {
  return sessionStorage.getItem(overlayOverrideStorageKey) === '1';
}

function OverlayOverrideButton({
  visible,
  active,
  onEnable,
  onDisable,
}: {
  visible: boolean;
  active: boolean;
  onEnable: () => void;
  onDisable: () => void;
}) {
  if (!visible && !active) return null;

  return (
    <button
      type="button"
      onClick={active ? onDisable : onEnable}
      aria-label={active ? 'Overlay override uitschakelen' : 'Overlay sluiten'}
      title={active ? 'Overlay override uitschakelen' : 'Overlay sluiten'}
      className="fixed right-4 top-4 z-[80] inline-flex h-8 w-8 items-center justify-center rounded-full border border-slate-300 bg-white/95 text-slate-400 shadow-sm transition hover:text-slate-600"
    >
      <span className="text-lg leading-none">{active ? '↺' : '×'}</span>
    </button>
  );
}

export default function GuardedRouteWithOverride({
  children,
  scope,
  settingsLink,
}: GuardedRouteWithOverrideProps) {
  const location = useLocation();
  const [bootstrapStatus, setBootstrapStatus] = useState<BootstrapStatus>(DEFAULT_BOOTSTRAP_STATUS);
  const [loadingStatus, setLoadingStatus] = useState(true);
  const [overrideEnabled, setOverrideEnabled] = useState(() => getStoredOverride());

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      setLoadingStatus(true);
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

        const nextBootstrapStatus = await fetchBootstrapStatus();
        if (!cancelled) {
          setBootstrapStatus(nextBootstrapStatus);
        }
      } catch {
        if (!cancelled) {
          setBootstrapStatus(DEFAULT_BOOTSTRAP_STATUS);
        }
      } finally {
        if (!cancelled) {
          setLoadingStatus(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [location.pathname, location.search, overrideEnabled]);

  const blocked = useMemo(() => {
    if (loadingStatus) return false;
    return scope === 'app' ? !bootstrapStatus.ready : !bootstrapStatus.settingsAllowed;
  }, [bootstrapStatus.ready, bootstrapStatus.settingsAllowed, loadingStatus, scope]);

  function enableOverride() {
    sessionStorage.setItem(overlayOverrideStorageKey, '1');
    setOverrideEnabled(true);
  }

  function disableOverride() {
    sessionStorage.removeItem(overlayOverrideStorageKey);
    setOverrideEnabled(false);
  }

  return (
    <>
      {overrideEnabled ? children : (
        <CoreRouteGuard scope={scope} settingsLink={settingsLink}>
          {children}
        </CoreRouteGuard>
      )}
      <OverlayOverrideButton
        visible={blocked}
        active={overrideEnabled}
        onEnable={enableOverride}
        onDisable={disableOverride}
      />
    </>
  );
}
