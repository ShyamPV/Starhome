import { pickSurprise } from '../catalog';
import { useApp } from '../state/store';
import { applyUpdate, usePwa } from '../state/pwa';
import { shareUrl } from '../state/urlSync';
import { DiceIcon, LinkIcon } from './icons';

const btn = 'glass flex h-10 items-center gap-1.5 rounded-xl px-3 text-xs text-ink-dim hover:border-violet/50 hover:text-ink';

/** Beside the search box: "Surprise me" and copying a link to the current view. */
export function TopActions() {
  const engine = useApp((s) => s.engine);
  const targets = useApp((s) => s.targets);
  const view = useApp((s) => s.view);
  const selected = useApp((s) => s.selected);
  const { set, showToast } = useApp.getState();

  const surprise = () => {
    const t = pickSurprise(targets, selected?.id ?? null);
    if (!engine || !t) return;
    if (view === 'sky') {
      engine.setViewMode('galaxy');
      set({ view: 'galaxy' });
    }
    void engine.flyTo(t.id);
  };

  const share = async () => {
    if (!engine) return;
    const url = shareUrl(engine);
    try {
      await navigator.clipboard.writeText(url);
      showToast(view === 'sky' ? 'Link copied (includes your location, rounded to ~10 km)' : 'Link copied');
    } catch {
      // No clipboard permission: the address bar holds the same link.
      window.history.replaceState(window.history.state, '', url);
      showToast('Copy the link from the address bar');
    }
  };

  return (
    <div className="flex gap-2">
      <button onClick={surprise} className={btn} title="Fly somewhere at random">
        <DiceIcon width={16} height={16} />
        Surprise me
      </button>
      <button onClick={() => void share()} className={btn} title="Copy a link to this view: camera, time and selection">
        <LinkIcon width={16} height={16} />
        Share
      </button>
    </div>
  );
}

/** Short confirmations ("Link copied"). */
export function Toast() {
  const toast = useApp((s) => s.toast);
  if (!toast) return null;
  return (
    <div className="glass pointer-events-none rounded-full px-3 py-1.5 text-[11px] text-ink" role="status">
      {toast}
    </div>
  );
}

/** A new version is ready, or the connection is gone. */
export function AppNotices() {
  const waiting = usePwa((s) => s.waiting);
  const online = usePwa((s) => s.online);
  return (
    <>
      {waiting && (
        <div className="glass pointer-events-auto flex items-center gap-2 rounded-full py-1 pr-1 pl-3 text-[11px] text-ink" role="status">
          A new version of Starhome is ready
          <button onClick={applyUpdate} className="rounded-full bg-violet/40 px-2.5 py-0.5 text-white hover:bg-violet/60">
            Reload
          </button>
        </div>
      )}
      {!online && (
        <div className="glass pointer-events-none rounded-full px-3 py-1.5 text-[11px] text-ink-dim" role="status">
          Offline: using stored data. Satellite positions may be out of date.
        </div>
      )}
    </>
  );
}
