import { useEffect, useState } from 'react';
import { useApp } from '../state/store';
import { CloseIcon, NextIcon, PauseIcon, PlayIcon, PrevIcon } from './icons';

/** Slow orbit while the narration is read, rad/s. */
const TOUR_ROTATE = 0.035;

/** Seconds at a stop: enough to read the narration, then a few to look. */
export function dwellOf(text: string, dwellS?: number): number {
  return dwellS ?? Math.min(22, Math.max(9, text.split(/\s+/).length / 3 + 4));
}

const btn = 'grid size-8 place-items-center rounded-lg text-ink-dim hover:bg-white/5 hover:text-ink disabled:opacity-30';

/**
 * Plays the active tour: flies to each stop, reads out its narration, orbits slowly,
 * then moves on. Taking the controls mid-flight pauses it.
 */
export function TourPlayer() {
  const engine = useApp((s) => s.engine);
  const active = useApp((s) => s.tour);
  const { setTour, endTour, set } = useApp.getState();
  const [phase, setPhase] = useState<'flying' | 'here'>('flying');
  const tour = active?.tour;
  const index = active?.index ?? 0;
  const stop = tour?.stops[index];
  const last = tour ? index === tour.stops.length - 1 : false;

  // Fly to the stop.
  useEffect(() => {
    if (!engine || !tour || !stop) return;
    let alive = true;
    if (engine.view === 'sky') {
      engine.setViewMode('galaxy');
      set({ view: 'galaxy' });
    }
    engine.setAutoRotate(0);
    setPhase('flying');
    void engine.flyTo(stop.id, { distanceKm: stop.viewDistanceKm }).then((arrived) => {
      if (!alive) return;
      setPhase('here');
      engine.setAutoRotate(TOUR_ROTATE);
      // The visitor took the controls: stay here until they press play.
      if (!arrived) setTour({ playing: false });
    });
    return () => {
      alive = false;
    };
  }, [engine, tour, stop, set, setTour]);

  // Then stay a while, and move on.
  useEffect(() => {
    if (!stop || phase !== 'here' || !active?.playing) return;
    const t = window.setTimeout(() => {
      if (last) setTour({ playing: false });
      else setTour({ index: index + 1 });
    }, dwellOf(stop.text, stop.dwellS) * 1000);
    return () => window.clearTimeout(t);
  }, [stop, phase, active?.playing, last, index, setTour]);

  // Stop orbiting when the tour ends.
  useEffect(() => {
    if (!tour) engine?.setAutoRotate(0);
  }, [engine, tour]);

  if (!tour || !stop || !active) return null;
  const done = last && phase === 'here' && !active.playing;

  return (
    <section className="glass pointer-events-auto w-[30rem] max-w-[calc(100vw-2rem)] rounded-2xl px-4 py-3" aria-label="Guided tour" aria-live="polite">
      <header className="flex items-center justify-between gap-2 text-[10px] font-semibold tracking-[0.14em] text-ink-faint uppercase">
        <span className="truncate">Tour · {tour.title}</span>
        <span className="flex shrink-0 items-center gap-2">
          <span className="tabular font-mono tracking-normal">
            {index + 1} / {tour.stops.length}
          </span>
          <button onClick={endTour} className="rounded-md p-0.5 text-ink-dim hover:bg-white/5 hover:text-ink" aria-label="End tour">
            <CloseIcon width={14} height={14} />
          </button>
        </span>
      </header>
      <h2 className="mt-1 text-base font-semibold tracking-tight">{stop.title}</h2>
      <p className="mt-1 min-h-[3.75rem] text-[13px] leading-snug text-ink-dim">{phase === 'flying' ? <span className="text-ink-faint">Travelling…</span> : stop.text}</p>
      <footer className="mt-2 flex items-center gap-1">
        <button className={btn} onClick={() => setTour({ index: index - 1, playing: true })} disabled={index === 0} aria-label="Previous stop">
          <PrevIcon width={16} height={16} />
        </button>
        {done ? (
          <button className="rounded-lg px-2 py-1 text-xs text-teal hover:bg-teal/10" onClick={() => setTour({ index: 0, playing: true })}>
            Restart
          </button>
        ) : (
          <button className={btn} onClick={() => setTour({ playing: !active.playing })} aria-label={active.playing ? 'Pause tour' : 'Play tour'}>
            {active.playing ? <PauseIcon width={16} height={16} /> : <PlayIcon width={16} height={16} />}
          </button>
        )}
        <button className={btn} onClick={() => setTour({ index: index + 1, playing: true })} disabled={last} aria-label="Next stop">
          <NextIcon width={16} height={16} />
        </button>
        <ol className="ml-auto flex gap-1" aria-label="Tour progress">
          {tour.stops.map((s, i) => (
            <li key={`${s.id}-${i}`}>
              <button
                onClick={() => setTour({ index: i, playing: true })}
                className={`block size-2 rounded-full ${i === index ? 'bg-violet' : i < index ? 'bg-violet/50' : 'bg-white/15 hover:bg-white/30'}`}
                aria-label={`Stop ${i + 1}: ${s.title}`}
                aria-current={i === index ? 'step' : undefined}
              />
            </li>
          ))}
        </ol>
      </footer>
    </section>
  );
}
