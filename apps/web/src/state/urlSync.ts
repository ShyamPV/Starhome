import { dateToJulian } from '@starhome/astro';
import { decodeViewState, encodeViewState, type Engine } from '@starhome/engine';
import { useEffect } from 'react';
import { useApp } from './store';

/** Within this of the clock, running at 1x, a link follows "now" instead of fixing a time. */
const LIVE_TOLERANCE_DAYS = 2 / 1440;

/** The current view as a URL fragment (no '#'). */
function currentFragment(engine: Engine): string {
  const s = useApp.getState();
  const v = engine.getViewState();
  const live = s.rateIndex === 0 && !s.reverse && !s.paused && Math.abs(v.jd! - dateToJulian(new Date())) < LIVE_TOLERANCE_DAYS;
  return encodeViewState({ ...v, jd: live ? null : v.jd });
}

/** A link to exactly this view: camera, time, selection (and, in the sky view, the place, rounded). */
export function shareUrl(engine: Engine): string {
  const url = new URL(window.location.href);
  url.hash = currentFragment(engine);
  return url.toString();
}

function applyFragment(engine: Engine, hash: string): void {
  const v = decodeViewState(hash);
  if (!v) return;
  const { set } = useApp.getState();
  if (v.view === 'sky') {
    // A shared place applies for this visit only; the visitor's saved location stays.
    if (v.sky?.location) useApp.setState({ location: { ...v.sky.location, heightM: 0 } });
    engine.setLocation(useApp.getState().location);
    engine.setViewMode('sky');
    set({ view: 'sky' });
  } else if (engine.view === 'sky') {
    engine.setViewMode('galaxy');
    set({ view: 'galaxy' });
  }
  engine.applyViewState(v);
}

/** Restores a shared view on load (and when a link is pasted), and keeps the address bar current. */
export function useUrlSync(): void {
  const engine = useApp((s) => s.engine);
  useEffect(() => {
    if (!engine) return;
    applyFragment(engine, window.location.hash);
    let last = window.location.hash.slice(1);
    const onHash = () => {
      if (window.location.hash.slice(1) === last) return;
      last = window.location.hash.slice(1);
      applyFragment(engine, window.location.hash);
    };
    // replaceState does not add history entries or fire hashchange.
    const timer = window.setInterval(() => {
      if (document.hidden) return;
      const frag = currentFragment(engine);
      if (frag === last) return;
      last = frag;
      window.history.replaceState(window.history.state, '', `#${frag}`);
    }, 1000);
    window.addEventListener('hashchange', onHash);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener('hashchange', onHash);
    };
  }, [engine]);
}
