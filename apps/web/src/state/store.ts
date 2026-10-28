import type { GeoLocation } from '@starhome/astro';
import { DEFAULT_LOCATION, DEFAULT_SKY_LAYERS, type Engine, type Hud, type QualityPreset, type SkyLayers, type TargetSummary, type ViewMode } from '@starhome/engine';
import { create } from 'zustand';

export type NavSection = 'galaxy' | 'sky' | 'explore' | 'settings';
export type Theme = 'default' | 'night' | 'contrast';

/** Simulation-time multipliers offered by the time bar (sign gives direction). */
export const TIME_RATES = [1, 10, 100, 1_000, 10_000, 100_000, 1_000_000] as const;

const LOCATION_KEY = 'starhome.location';

/** The observer's location is remembered in this browser only. */
function loadLocation(): GeoLocation {
  try {
    const raw = localStorage.getItem(LOCATION_KEY);
    if (raw) {
      const v = JSON.parse(raw) as GeoLocation;
      if (Number.isFinite(v.latDeg) && Number.isFinite(v.lonDeg)) return { latDeg: v.latDeg, lonDeg: v.lonDeg, heightM: v.heightM || 0 };
    }
  } catch {
    // Blocked storage: use the default.
  }
  return { ...DEFAULT_LOCATION };
}

function saveLocation(loc: GeoLocation): void {
  try {
    localStorage.setItem(LOCATION_KEY, JSON.stringify(loc));
  } catch {
    // Not persisted; fine for this session.
  }
}

interface AppState {
  engine: Engine | null;
  hud: Hud | null;
  targets: TargetSummary[];
  selected: TargetSummary | null;
  nav: NavSection;
  navOpen: boolean;
  /** Flying through the Galaxy, or standing on the Earth looking up. */
  view: ViewMode;
  location: GeoLocation;
  skyLayers: SkyLayers;
  quality: QualityPreset;
  exposure: number;
  /** Brightness of the unresolved Milky Way glow relative to resolved stars. */
  glow: number;
  bloom: boolean;
  orbits: boolean;
  labels: boolean;
  /** Interstellar dust: extinction and reddening of starlight. */
  dust: boolean;
  clusters: boolean;
  arms: boolean;
  nebulae: boolean;
  /** Nebula colours: true emission-line colours, or the Hubble palette. */
  nebulaPalette: 'scientific' | 'enhanced';
  /** Display gain for nebulae (1 = true surface brightness). */
  nebulaBrightness: number;
  theme: Theme;
  rateIndex: number;
  reverse: boolean;
  paused: boolean;

  setEngine: (e: Engine | null) => void;
  setHud: (h: Hud) => void;
  setSelected: (t: TargetSummary | null) => void;
  setNav: (n: NavSection) => void;
  toggleNav: () => void;
  setLocation: (loc: GeoLocation) => void;
  setSkyLayer: (layer: keyof SkyLayers, on: boolean) => void;
  set: (
    patch: Partial<Pick<AppState, 'view' | 'quality' | 'exposure' | 'glow' | 'bloom' | 'orbits' | 'labels' | 'dust' | 'clusters' | 'arms' | 'nebulae' | 'nebulaPalette' | 'nebulaBrightness' | 'theme' | 'rateIndex' | 'reverse' | 'paused'>>,
  ) => void;
}

export const useApp = create<AppState>((set, get) => ({
  engine: null,
  hud: null,
  targets: [],
  selected: null,
  nav: 'galaxy',
  navOpen: true,
  view: 'galaxy',
  location: loadLocation(),
  skyLayers: { ...DEFAULT_SKY_LAYERS },
  quality: 'medium',
  exposure: 20,
  glow: 4,
  bloom: true,
  orbits: true,
  labels: true,
  dust: true,
  clusters: true,
  arms: true,
  nebulae: true,
  nebulaPalette: 'scientific',
  nebulaBrightness: 1,
  theme: 'default',
  rateIndex: 0,
  reverse: false,
  paused: false,

  setEngine: (engine) => set({ engine, targets: engine?.getTargets() ?? [] }),
  setHud: (hud) => set({ hud }),
  setSelected: (selected) => set({ selected }),
  setNav: (nav) => set((s) => ({ nav, navOpen: s.nav === nav ? !s.navOpen : true })),
  toggleNav: () => set((s) => ({ navOpen: !s.navOpen })),
  setLocation: (location) => {
    saveLocation(location);
    // Update the engine before React re-renders, so panels querying it see the new place.
    get().engine?.setLocation(location);
    set({ location });
  },
  setSkyLayer: (layer, on) => set((s) => ({ skyLayers: { ...s.skyLayers, [layer]: on } })),
  set: (patch) => set(patch),
}));
