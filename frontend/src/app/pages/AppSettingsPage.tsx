import { useEffect, useState } from 'react';
import { Navigate, Link } from 'react-router-dom';
import LegacySettingsPage from '../../pages/SettingsPage';
import BlockingOverlay from '../../core/components/BlockingOverlay';
import { DEFAULT_BOOTSTRAP_STATUS, fetchBootstrapStatus } from '../../core/api/client';
import type { BootstrapStatus } from '../../core/types';

export default function AppSettingsPage() {
  const [loading, setLoading] = useState(true);
  const [bootstrapStatus, setBootstrapStatus] = useState<BootstrapStatus>(DEFAULT_BOOTSTRAP_STATUS);
  const [statusError, setStatusError] = useState('');
  const [bootstrapOverlayDismissed, setBootstrapOverlayDismissed] = useState(false);

  useEffect(() => {
    let active = true;
    void fetchBootstrapStatus()
      .then((status) => {
        if (!active) return;
        setBootstrapStatus(status);
        setStatusError('');
      })
      .catch((error) => {
        if (!active) return;
        setStatusError((error as Error).message || 'Bootstrap-status kon niet worden geladen.');
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  if (loading) {
    return <div className="p-6 text-sm text-slate-700">Instellingen laden...</div>;
  }

  if (bootstrapStatus.settingsAllowed) {
    return <Navigate to="/settings/advanced" replace />;
  }

  if (bootstrapStatus.bootstrapAllowed) {
    return (
      <div className="relative">
        <LegacySettingsPage />
        {!bootstrapOverlayDismissed ? (
          <BlockingOverlay
            title="Bootstrap-toegang herkend"
            message={
              bootstrapStatus.message ||
              'Je bent als bootstrap user herkend. Via deze app-instellingen kun je de basisconfiguratie alsnog aanpassen.'
            }
            actions={
              <>
                <button
                  type="button"
                  onClick={() => setBootstrapOverlayDismissed(true)}
                  className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-brand-700"
                >
                  Instellingen openen
                </button>
                <Link
                  to="/settings/advanced"
                  className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
                >
                  Geavanceerde pagina proberen
                </Link>
              </>
            }
          />
        ) : null}
      </div>
    );
  }

  return (
    <div className="p-6">
      <div className="mx-auto max-w-xl rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-500">Instellingen</p>
        <h1 className="mt-3 text-2xl font-semibold text-slate-900">Toegang nog geblokkeerd</h1>
        <p className="mt-3 text-sm leading-6 text-slate-600">
          {statusError || bootstrapStatus.message || 'De huidige sessie heeft nog geen toegang tot de instellingen.'}
        </p>
        <div className="mt-6 flex flex-wrap gap-3">
          <Link
            to="/settings/advanced"
            className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-brand-700"
          >
            Geavanceerde controle openen
          </Link>
        </div>
      </div>
    </div>
  );
}
