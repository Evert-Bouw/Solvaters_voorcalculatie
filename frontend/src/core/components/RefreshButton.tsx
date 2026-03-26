type RefreshButtonProps = {
  onRefresh?: () => void;
};

export default function RefreshButton({ onRefresh }: RefreshButtonProps) {
  function handleRefresh() {
    if (onRefresh) {
      onRefresh();
      return;
    }
    window.location.reload();
  }

  return (
    <button
      type="button"
      onClick={handleRefresh}
      className="inline-flex h-9 w-9 items-center justify-center rounded bg-slate-200 text-slate-700 transition hover:bg-slate-300"
      title="Pagina verversen"
      aria-label="Pagina verversen"
    >
      <svg viewBox="0 0 20 20" aria-hidden="true" className="h-4 w-4 fill-current">
        <path d="M10 3a7 7 0 1 0 6.65 9.18 1 1 0 1 0-1.9-.62A5 5 0 1 1 13.5 6.5H11a1 1 0 1 0 0 2h5V3.5a1 1 0 1 0-2 0v1.43A6.96 6.96 0 0 0 10 3z" />
      </svg>
    </button>
  );
}
