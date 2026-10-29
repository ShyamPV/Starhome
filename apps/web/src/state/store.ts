import type { GeoLocation } from '@starhome/astro';
import type { ExoplanetCatalog, Tour } from '@starhome/data';
import { DEFAULT_LOCATION, DEFAULT_SKY_LAYERS, type Engine, type Hud, type QualityPreset, type SkyLayers, type TargetSummary, type ViewMode } from '@starhome/engine';
import { create } from 'zustand';
import { loadUserData, saveFavourite, saveVisit, type Visit } from './userDb';

export type NavSection = 'galaxy' | 'sky' | 'explore' | 'settings';
export type Theme = 'default' | 'night' | 'contrast';
export type ExploreTab = 'discover' | 'stars' | 'exoplanets' | 'tours';

/** A guided tour in progress. */
export interface ActiveTour {
  tour: Tour;
  index: number;
  playing: boolean;
}

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
  /** NASA Exoplanet Archive snapshot, once loaded. */
  exoplanets: ExoplanetCatalog | null;
  exploreTab: ExploreTab;
  /** Favourite object ids, with when they were added (IndexedDB-backed). */
  favourites: Record<string, number>;
  /** Objects flown to, with when and how often (IndexedDB-backed). */
  visited: Record<string, Visit>;
  tour: ActiveTour | null;
  /** A short confirmation shown at the bottom of the screen. */
  toast: string | null;
  exoplanetMarkers: boolean;
  habitableZones: boolean;
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
  /** Render below full resolution while the frame rate is low. */
  adaptiveResolution: boolean;
  rateIndex: number;
  reverse: boolean;
  paused: boolean;

  setEngine: (e: Engine | null) => void;
  setHud: (h: Hud) => void;
  setSelected: (t: TargetSummary | null) => void;
  setTargets: (t: TargetSummary[]) => void;
  setExoplanets: (c: ExoplanetCatalog) => void;
  setNav: (n: NavSection) => void;
  toggleNav: () => void;
  setLocation: (loc: GeoLocation) => void;
  setSkyLayer: (layer: keyof SkyLayers, on: boolean) => void;
  loadUser: () => Promise<void>;
  toggleFavourite: (id: string) => void;
  markVisited: (id: string) => void;
  startTour: (tour: Tour) => void;
  setTour: (patch: Partial<Pick<ActiveTour, 'index' | 'playing'>>) => void;
  endTour: () => void;
  showToast: (text: string) => void;
  set: (
    patch: Partial<Pick<AppState, 'view' | 'exploreTab' | 'exoplanetMarkers' | 'habitableZones' | 'quality' | 'exposure' | 'glow' | 'bloom' | 'orbits' | 'labels' | 'dust' | 'clusters' | 'arms' | 'nebulae' | 'nebulaPalette' | 'nebulaBrightness' | 'theme' | 'adaptiveResolution' | 'rateIndex' | 'reverse' | 'paused'>>,
  ) => void;
}

/** Display settings remembered in this browser (layers, quality, theme...). */
const SETTINGS_KEY = 'starhome.settings';
const PERSISTED = [
  'quality',
  'exposure',
  'glow',
  'bloom',
  'orbits',
  'labels',
  'dust',
  'clusters',
  'arms',
  'nebulae',
  'nebulaPalette',
  'nebulaBrightness',
  'exoplanetMarkers',
  'habitableZones',
  'theme',
  'adaptiveResolution',
] as const satisfies readonly (keyof AppState)[];
type Persisted = Pick<AppState, (typeof PERSISTED)[number]>;

function loadSettings(): Partial<Persisted> {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (raw) {
      const v = JSON.parse(raw) as Record<string, unknown>;
      return Object.fromEntries(PERSISTED.filter((k) => k in v).map((k) => [k, v[k]])) as Partial<Persisted>;
    }
  } catch {
    // Blocked or corrupt storage: defaults.
  }
  // First visit: follow the system's high-contrast preference.
  return typeof window !== 'undefined' && window.matchMedia?.('(prefers-contrast: more)').matches ? { theme: 'contrast' } : {};
}

export const useApp = create<AppState>((set, get) => ({
  engine: null,
  hud: null,
  targets: [],
  selected: null,
  exoplanets: null,
  exploreTab: 'discover',
  favourites: {},
  visited: {},
  tour: null,
  toast: null,
  exoplanetMarkers: false,
  habitableZones: true,
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
  adaptiveResolution: true,
  rateIndex: 0,
  reverse: false,
  paused: false,

  setEngine: (engine) => set({ engine, targets: engine?.getTargets() ?? [] }),
  setHud: (hud) => set({ hud }),
  setSelected: (selected) => set({ selected }),
  setTargets: (targets) => set({ targets }),
  setExoplanets: (exoplanets) => set({ exoplanets }),
  setNav: (nav) => set((s) => ({ nav, navOpen: s.nav === nav ? !s.navOpen : true })),
  toggleNav: () => set((s) => ({ navOpen: !s.navOpen })),
  setLocation: (location) => {
    saveLocation(location);
    // Update the engine before React re-renders, so panels querying it see the new place.
    get().engine?.setLocation(location);
    set({ location });
  },
  setSkyLayer: (layer, on) => set((s) => ({ skyLayers: { ...s.skyLayers, [layer]: on } })),
  loadUser: async () => {
    const { favourites, visited } = await loadUserData();
    // Merge with anything recorded before the database answered.
    set((s) => ({
      favourites: { ...Object.fromEntries(favourites.map((f) => [f.id, f.addedAt])), ...s.favourites },
      visited: { ...Object.fromEntries(visited.map((v) => [v.id, v])), ...s.visited },
    }));
  },
  toggleFavourite: (id) => {
    const on = !(id in get().favourites);
    set((s) => {
      const favourites = { ...s.favourites };
      if (on) favourites[id] = Date.now();
      else delete favourites[id];
      return { favourites };
    });
    void saveFavourite(id, on);
  },
  markVisited: (id) => {
    const now = Date.now();
    const prev = get().visited[id];
    const v: Visit = prev ? { ...prev, lastAt: now, count: prev.count + 1 } : { id, firstAt: now, lastAt: now, count: 1 };
    set((s) => ({ visited: { ...s.visited, [id]: v } }));
    void saveVisit(v);
  },
  // The side panel would hide half the view: fold it away while the tour plays.
  startTour: (tour) => set({ tour: { tour, index: 0, playing: true }, navOpen: false }),
  setTour: (patch) => set((s) => (s.tour ? { tour: { ...s.tour, ...patch } } : {})),
  endTour: () => set({ tour: null }),
  showToast: (toast) => {
    set({ toast });
    window.setTimeout(() => set((s) => (s.toast === toast ? { toast: null } : {})), 2500);
  },
  set: (patch) => set(patch),
  ...loadSettings(),
}));

useApp.subscribe((s, prev) => {
  if (!PERSISTED.some((k) => s[k] !== prev[k])) return;
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(Object.fromEntries(PERSISTED.map((k) => [k, s[k]]))));
  } catch {
    // Not persisted; fine for this session.
  }
});
