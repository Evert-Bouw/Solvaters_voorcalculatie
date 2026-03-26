import { useEffect, useState } from 'react';

function isFullscreenActive() {
  return Boolean(document.fullscreenElement);
}

export default function FullscreenToggleButton() {
  const [isFullscreen, setIsFullscreen] = useState(() => isFullscreenActive());

  useEffect(() => {
    function handleFullscreenChange() {
      setIsFullscreen(isFullscreenActive());
    }

    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
  }, []);

  async function onToggleFullscreen() {
    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen();
        return;
      }

      await document.documentElement.requestFullscreen();
    } catch {
      setIsFullscreen(isFullscreenActive());
    }
  }

  return (
    <button
      type="button"
      onClick={() => void onToggleFullscreen()}
      className="inline-flex h-9 w-9 items-center justify-center rounded bg-slate-200 text-slate-700 transition hover:bg-slate-300"
      title={isFullscreen ? 'Fullscreen verlaten' : 'Fullscreen openen'}
      aria-label={isFullscreen ? 'Fullscreen verlaten' : 'Fullscreen openen'}
    >
      {isFullscreen ? (
        <svg viewBox="0 0 20 20" aria-hidden="true" className="h-4 w-4 fill-current">
          <path d="M3 8V3h5v2H5v3H3zm9-5h5v5h-2V5h-3V3zM3 12h2v3h3v2H3v-5zm12 3v-3h2v5h-5v-2h3z" />
        </svg>
      ) : (
        <svg viewBox="0 0 20 20" aria-hidden="true" className="h-4 w-4 fill-current">
          <path d="M3 3h5v2H5v3H3V3zm12 0v5h-2V5h-3V3h5zM3 12h2v3h3v2H3v-5zm10 3v-3h2v5h-5v-2h3z" />
        </svg>
      )}
    </button>
  );
}
