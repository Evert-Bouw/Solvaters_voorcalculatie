import { AppSettings } from './types';

type AppSettingsSectionProps = {
  settings: AppSettings;
  onChange: (patch: Partial<AppSettings>) => void;
};

export default function AppSettingsSection({ settings, onChange }: AppSettingsSectionProps) {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-base font-semibold text-slate-900">App-instellingen</h2>
        <p className="mt-2 text-sm leading-6 text-slate-600">
          Deze sectie is bewust app-specifiek. Hier beheer je alleen instellingen die de inhoud en beleving van deze
          toepassing sturen, los van de generieke AFAS-basis.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <label className="text-sm md:col-span-2">
          <span className="mb-1 block font-medium text-slate-700">Paginatitel</span>
          <input
            value={settings.pageTitle}
            onChange={(event) => onChange({ pageTitle: event.target.value })}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 outline-none transition focus:border-brand-600"
          />
        </label>

        <label className="text-sm md:col-span-2">
          <span className="mb-1 block font-medium text-slate-700">Leeg canvas titel</span>
          <input
            value={settings.emptyStateTitle}
            onChange={(event) => onChange({ emptyStateTitle: event.target.value })}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 outline-none transition focus:border-brand-600"
          />
        </label>

        <label className="text-sm md:col-span-2">
          <span className="mb-1 block font-medium text-slate-700">Leeg canvas omschrijving</span>
          <textarea
            value={settings.emptyStateDescription}
            onChange={(event) => onChange({ emptyStateDescription: event.target.value })}
            rows={4}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 outline-none transition focus:border-brand-600"
          />
        </label>
      </div>
    </div>
  );
}
