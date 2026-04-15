import { NavLink } from 'react-router-dom';
import { BootstrapStatus } from '../types';
import BlockingOverlay from './BlockingOverlay';

type CoreAccessScope = 'app' | 'settings';

type SettingsLinkConfig = {
  to: string;
  label: string;
  requireSettingsAllowed?: boolean;
};

type CoreAccessOverlayProps = {
  loading: boolean;
  scope: CoreAccessScope;
  bootstrapStatus: BootstrapStatus;
  onRefresh: () => void;
  oauthLoginBusy?: boolean;
  onStartOauth?: () => void;
  settingsLink?: SettingsLinkConfig;
};

function getOverlayTitle(scope: CoreAccessScope, bootstrapStatus: BootstrapStatus) {
  if (bootstrapStatus.blockReason === 'iframe_required') return 'Open deze app vanuit AFAS';
  if (bootstrapStatus.blockReason === 'oauth_login_required') return 'Aanmelden vereist';
  if (scope === 'settings') return 'Geen toegang tot instellingen';
  return 'Configuratie vereist';
}

function getOverlayMessage(bootstrapStatus: BootstrapStatus, oauthLoginBusy: boolean) {
  if (oauthLoginBusy) {
    return 'Aanmelden via AFAS is bezig. Wacht even terwijl we controleren of de sessie correct is gekoppeld.';
  }
  if (bootstrapStatus.blockReason === 'classic_token_missing') {
    return 'Classic authenticatie is geselecteerd, maar er is nog geen actief token gevonden. Werk eerst de AFAS-verbinding bij.';
  }
  if (bootstrapStatus.blockReason === 'oauth_config_missing') {
    return 'OAuth namens gebruiker staat aan, maar de basisconfiguratie is nog niet afgerond. Werk eerst de basisinstellingen en AFAS-verbinding bij.';
  }
  if (bootstrapStatus.blockReason === 'oauth_login_required') {
    return 'De basisconfiguratie staat goed. Meld je nu aan via AFAS om verder te gaan.';
  }
  return bootstrapStatus.message;
}

export default function CoreAccessOverlay({
  loading,
  scope,
  bootstrapStatus,
  onRefresh,
  oauthLoginBusy = false,
  onStartOauth,
  settingsLink,
}: CoreAccessOverlayProps) {
  const blocked = !loading && (scope === 'app' ? !bootstrapStatus.ready : !bootstrapStatus.settingsAllowed);
  if (!blocked) return null;

  const canStartOauth =
    bootstrapStatus.writeAuthMode === 'oauth_user' &&
    bootstrapStatus.oauthConfigured &&
    !oauthLoginBusy;
  const showSettingsLink =
    Boolean(settingsLink) &&
    (!settingsLink?.requireSettingsAllowed || bootstrapStatus.settingsAllowed);

  return (
    <BlockingOverlay
      title={getOverlayTitle(scope, bootstrapStatus)}
      message={getOverlayMessage(bootstrapStatus, oauthLoginBusy)}
      actions={
        <>
          <button
            type="button"
            onClick={onRefresh}
            disabled={oauthLoginBusy}
            className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
          >
            Opnieuw controleren
          </button>
          {showSettingsLink && settingsLink ? (
            <NavLink
              to={settingsLink.to}
              className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
            >
              {settingsLink.label}
            </NavLink>
          ) : null}
          {bootstrapStatus.writeAuthMode === 'oauth_user' && onStartOauth ? (
            <button
              type="button"
              onClick={onStartOauth}
              disabled={!canStartOauth}
              className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {oauthLoginBusy ? 'Aanmelden bezig...' : 'Aanmelden via AFAS'}
            </button>
          ) : null}
        </>
      }
    />
  );
}
