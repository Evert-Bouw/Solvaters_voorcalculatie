import { ReactNode } from 'react';

export default function BlockingOverlay({
  title,
  message,
  actions,
}: {
  title: string;
  message: string;
  actions?: ReactNode;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/55 p-6 backdrop-blur-sm">
      <div className="w-full max-w-xl rounded-3xl border border-white/20 bg-white p-8 shadow-2xl">
        <div className="space-y-3">
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-500">Toegang geblokkeerd</p>
          <h2 className="text-2xl font-semibold text-slate-900">{title}</h2>
          <p className="text-sm leading-6 text-slate-600">{message}</p>
        </div>
        {actions ? <div className="mt-6 flex flex-wrap gap-3">{actions}</div> : null}
      </div>
    </div>
  );
}
