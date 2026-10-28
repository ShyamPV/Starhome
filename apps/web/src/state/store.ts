import type { Engine, Hud, QualityPreset, TargetSummary } from '@vialactea/engine';
import { create } from 'zustand';

export type NavSection = 'galaxy' | 'sky' | 'explore' | 'settings';
export type Theme = 'default' | 'night' | 'contrast';

/** Simulation-time multipliers offered by the time bar (sign gives direction). */
export const TIME_RATES = [1, 10, 100, 1_000, 10_000, 100_000, 1_000_000] as const;

interface AppState {
  engine: Engine | null;
  hud: Hud | null;
  targets: TargetSummary[];
  selected: TargetSummary | null;
  nav: NavSection;
  navOpen: boolean;
  quality: QualityPreset;
  exposure: number;
  bloom: boolean;
  orbits: boolean;
  labels: boolean;
  theme: Theme;
  rateIndex: number;
  reverse: boolean;
  paused: boolean;

  setEngine: (e: Engine | null) => void;
  setHud: (h: Hud) => void;
  setSelected: (t: TargetSummary | null) => void;
  setNav: (n: NavSection) => void;
  toggleNav: () => void;
  set: (patch: Partial<Pick<AppState, 'quality' | 'exposure' | 'bloom' | 'orbits' | 'labels' | 'theme' | 'rateIndex' | 'reverse' | 'paused'>>) => void;
}

export const useApp = create<AppState>((set) => ({
  engine: null,
  hud: null,
  targets: [],
  selected: null,
  nav: 'galaxy',
  navOpen: true,
  quality: 'medium',
  exposure: 8,
  bloom: true,
  orbits: true,
  labels: true,
  theme: 'default',
  rateIndex: 0,
  reverse: false,
  paused: false,

  setEngine: (engine) => set({ engine, targets: engine?.getTargets() ?? [] }),
  setHud: (hud) => set({ hud }),
  setSelected: (selected) => set({ selected }),
  setNav: (nav) => set((s) => ({ nav, navOpen: s.nav === nav ? !s.navOpen : true })),
  toggleNav: () => set((s) => ({ navOpen: !s.navOpen })),
  set: (patch) => set(patch),
}));
