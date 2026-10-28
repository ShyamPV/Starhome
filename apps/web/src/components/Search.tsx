import type { TargetSummary } from '@vialactea/engine';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useApp } from '../state/store';
import { SearchIcon } from './icons';

const KIND_LABEL: Record<TargetSummary['kind'], string> = {
  star: 'Star',
  planet: 'Planet',
  'dwarf-planet': 'Dwarf planet',
  moon: 'Moon',
  'black-hole': 'Black hole',
  galaxy: 'Galaxy',
  region: 'Region',
};

/** Top search box; Ctrl/Cmd+K focuses it, Enter flies to the highlighted result. */
export function Search() {
  const targets = useApp((s) => s.targets);
  const engine = useApp((s) => s.engine);
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        inputRef.current?.focus();
        inputRef.current?.select();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    return targets
      .map((t) => {
        const name = t.name.toLowerCase();
        const score = name.startsWith(q) ? 0 : name.includes(q) ? 1 : t.subtitle.toLowerCase().includes(q) ? 2 : 9;
        return { t, score };
      })
      .filter((r) => r.score < 9)
      .sort((a, b) => a.score - b.score || a.t.name.localeCompare(b.t.name))
      .slice(0, 8)
      .map((r) => r.t);
  }, [query, targets]);

  const go = (t: TargetSummary) => {
    engine?.flyTo(t.id);
    setQuery('');
    setOpen(false);
    inputRef.current?.blur();
  };

  return (
    <div className="relative w-full max-w-md">
      <label className="glass flex h-10 items-center gap-2 rounded-xl px-3 text-ink-dim focus-within:border-violet/50">
        <SearchIcon width={17} height={17} />
        <input
          ref={inputRef}
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setActive(0);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 120)}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown') setActive((a) => Math.min(a + 1, results.length - 1));
            else if (e.key === 'ArrowUp') setActive((a) => Math.max(a - 1, 0));
            else if (e.key === 'Enter' && results[active]) go(results[active]);
            else if (e.key === 'Escape') inputRef.current?.blur();
          }}
          placeholder="Search stars, planets, galaxies…"
          className="h-full flex-1 bg-transparent text-sm text-ink placeholder:text-ink-faint focus:outline-none"
          aria-label="Search"
          role="combobox"
          aria-expanded={open && results.length > 0}
          aria-controls="search-results"
        />
        <kbd className="rounded border border-line px-1.5 py-0.5 font-mono text-[10px] text-ink-faint">Ctrl K</kbd>
      </label>
      {open && results.length > 0 && (
        <ul id="search-results" role="listbox" className="glass absolute top-12 right-0 left-0 z-30 overflow-hidden rounded-xl py-1">
          {results.map((t, i) => (
            <li key={t.id} role="option" aria-selected={i === active}>
              <button
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => go(t)}
                onMouseEnter={() => setActive(i)}
                className={`flex w-full items-baseline justify-between gap-3 px-3 py-2 text-left ${i === active ? 'bg-violet/15' : ''}`}
              >
                <span className="text-sm text-ink">{t.name}</span>
                <span className="truncate text-xs text-ink-faint">
                  {KIND_LABEL[t.kind]} · {t.subtitle}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
