import { dateToJulian, julianToDate } from '@vialactea/astro';
import { useEffect } from 'react';
import { TIME_RATES, useApp } from '../state/store';
import { FasterIcon, PauseIcon, PlayIcon, ReverseIcon, SlowerIcon } from './icons';

function rateLabel(rate: number): string {
  if (rate >= 1_000_000) return `${rate / 1_000_000}M×`;
  if (rate >= 1_000) return `${rate / 1_000}k×`;
  return `${rate}×`;
}

function toLocalInput(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

const btn = 'grid size-8 place-items-center rounded-lg text-ink-dim hover:bg-white/5 hover:text-ink disabled:opacity-30';

/** Bottom time controls: now, pause, x1 to x1M forward and reverse, date picker. */
export function TimeBar() {
  const engine = useApp((s) => s.engine);
  const jd = useApp((s) => s.hud?.jd);
  const { rateIndex, reverse, paused, set } = useApp();

  useEffect(() => {
    if (!engine) return;
    engine.timeRate = TIME_RATES[rateIndex]! * (reverse ? -1 : 1);
    engine.paused = paused;
  }, [engine, rateIndex, reverse, paused]);

  const date = jd !== undefined ? julianToDate(jd) : new Date();
  const valid = !Number.isNaN(date.getTime());

  return (
    <div className="glass pointer-events-auto flex items-center gap-1 rounded-2xl px-2 py-1.5">
      <button
        onClick={() => {
          engine?.setTime(dateToJulian(new Date()));
          set({ rateIndex: 0, reverse: false, paused: false });
        }}
        className="rounded-lg px-2.5 py-1 text-xs font-medium text-teal hover:bg-teal/10"
      >
        Now
      </button>
      <span className="mx-1 h-5 w-px bg-line" />
      <button className={`${btn} ${reverse ? 'text-violet' : ''}`} onClick={() => set({ reverse: !reverse })} aria-pressed={reverse} aria-label="Reverse time">
        <ReverseIcon width={16} height={16} />
      </button>
      <button className={btn} onClick={() => set({ rateIndex: Math.max(0, rateIndex - 1) })} disabled={rateIndex === 0} aria-label="Slower">
        <SlowerIcon width={16} height={16} />
      </button>
      <button className={btn} onClick={() => set({ paused: !paused })} aria-label={paused ? 'Play' : 'Pause'}>
        {paused ? <PlayIcon width={16} height={16} /> : <PauseIcon width={16} height={16} />}
      </button>
      <button className={btn} onClick={() => set({ rateIndex: Math.min(TIME_RATES.length - 1, rateIndex + 1) })} disabled={rateIndex === TIME_RATES.length - 1} aria-label="Faster">
        <FasterIcon width={16} height={16} />
      </button>
      <span className="tabular w-16 text-center font-mono text-xs text-ink">
        {reverse ? '−' : ''}
        {rateLabel(TIME_RATES[rateIndex]!)}
      </span>
      <span className="mx-1 h-5 w-px bg-line" />
      <input
        type="datetime-local"
        aria-label="Simulation date and time"
        value={valid ? toLocalInput(date) : ''}
        onChange={(e) => {
          const d = new Date(e.target.value);
          if (!Number.isNaN(d.getTime())) engine?.setTime(dateToJulian(d));
        }}
        className="tabular rounded-lg bg-transparent px-1.5 py-1 font-mono text-xs text-ink [color-scheme:dark] focus:outline-none"
      />
    </div>
  );
}
