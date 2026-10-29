import { useEffect, useRef, useState } from 'react';
import { useApp } from '../state/store';
import { CloseIcon } from './icons';

const SHORTCUTS: [string, string][] = [
  ['Drag', 'Orbit (look around in the sky view)'],
  ['Right-drag, Shift-drag', 'Pan'],
  ['Wheel', 'Zoom (field of view in the sky view)'],
  ['W A S D', 'Fly (turn in the sky view)'],
  ['R / F', 'Up / down'],
  ['Q / E', 'Turn'],
  ['Shift', 'Five times faster'],
  ['Ctrl/⌘ K', 'Search'],
  ['Double-click a label', 'Travel there'],
  ['Esc', 'Close details'],
  ['?', 'This list'],
];

const typing = (t: EventTarget | null) => t instanceof HTMLElement && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable);

/** "?" shows the keyboard and mouse controls; Escape closes it, or else closes the details panel. */
export function Shortcuts() {
  const [open, setOpen] = useState(false);
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (typing(e.target)) return;
      if (e.key === '?') {
        e.preventDefault();
        setOpen((o) => !o);
      } else if (e.key === 'Escape') {
        if (open) setOpen(false);
        else useApp.getState().engine?.select(null);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  useEffect(() => {
    if (open) closeRef.current?.focus();
  }, [open]);

  if (!open) return null;
  return (
    <div className="pointer-events-auto absolute inset-0 z-40 grid place-items-center bg-void/50" onClick={() => setOpen(false)}>
      <div role="dialog" aria-modal="true" aria-labelledby="shortcuts-title" className="glass w-[26rem] max-w-[calc(100vw-2rem)] rounded-2xl p-5" onClick={(e) => e.stopPropagation()}>
        <div className="mb-3 flex items-center justify-between">
          <h2 id="shortcuts-title" className="text-base font-semibold tracking-tight">
            Controls
          </h2>
          <button ref={closeRef} onClick={() => setOpen(false)} className="rounded-lg p-1 text-ink-dim hover:bg-white/5 hover:text-ink" aria-label="Close controls">
            <CloseIcon width={18} height={18} />
          </button>
        </div>
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-xs">
          {SHORTCUTS.map(([k, v]) => (
            <div key={k} className="contents">
              <dt>
                <kbd className="rounded border border-line px-1.5 py-0.5 font-mono text-[11px] text-ink">{k}</kbd>
              </dt>
              <dd className="self-center text-ink-dim">{v}</dd>
            </div>
          ))}
        </dl>
      </div>
    </div>
  );
}
