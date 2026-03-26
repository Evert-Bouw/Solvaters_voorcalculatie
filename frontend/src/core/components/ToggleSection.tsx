import { ReactNode } from 'react';

type ToggleSectionProps = {
  title: string;
  description: string;
  open: boolean;
  onToggle: () => void;
  actions?: ReactNode;
  children: ReactNode;
};

export default function ToggleSection({
  title,
  description,
  open,
  onToggle,
  actions,
  children,
}: ToggleSectionProps) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      <div className="flex items-start justify-between gap-4">
        <button type="button" onClick={onToggle} className="flex-1 text-left">
          <h2 className="text-base font-semibold text-slate-900">{title}</h2>
          <p className="mt-1 text-sm text-slate-600">{description}</p>
        </button>
        <div className="flex items-center gap-2">
          {actions}
          <button
            type="button"
            onClick={onToggle}
            className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-700"
          >
            {open ? 'Inklappen' : 'Uitklappen'}
          </button>
        </div>
      </div>
      {open ? <div className="mt-6">{children}</div> : null}
    </section>
  );
}
