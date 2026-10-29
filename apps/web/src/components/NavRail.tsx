import type { QualityPreset } from '@starhome/engine';
import type { ReactNode } from 'react';
import { useEffect } from 'react';
import { useApp, type NavSection, type Theme } from '../state/store';
import { ChevronIcon, ExploreIcon, GalaxyIcon, SettingsIcon, SkyIcon } from './icons';
import { SkyPanel } from './SkyPanel';

const SECTIONS: { id: NavSection; label: string; Icon: typeof GalaxyIcon }[] = [
  { id: 'galaxy', label: 'Galaxy', Icon: GalaxyIcon },
  { id: 'sky', label: 'Sky', Icon: SkyIcon },
  { id: 'explore', label: 'Explore', Icon: ExploreIcon },
  { id: 'settings', label: 'Settings', Icon: SettingsIcon },
];

const DESTINATIONS: { id: string; label: string; hint: string }[] = [
  { id: 'sun', label: 'Solar System', hint: 'Our home system' },
  { id: 'earth', label: 'Earth', hint: 'Third planet' },
  { id: 'proxima', label: 'Proxima Centauri', hint: 'Nearest star, 1.30 pc' },
  { id: 'betelgeuse', label: 'Betelgeuse', hint: 'Red supergiant in Orion' },
  { id: 'milky-way', label: 'The whole Galaxy', hint: 'Seen from above the disc' },
  { id: 'sgr-a-star', label: 'Galactic centre', hint: 'Sagittarius A*' },
  { id: 'ngc-5139', label: 'Omega Centauri', hint: 'Largest globular cluster, 5.2 kpc' },
  { id: 'm42', label: 'Orion Nebula', hint: 'Fly into a star-forming region' },
  { id: 'm16', label: 'Pillars of Creation', hint: 'Eagle Nebula, 1.7 kpc' },
  { id: 'lmc', label: 'Large Magellanic Cloud', hint: 'Satellite galaxy, 50 kpc' },
];

function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex cursor-pointer items-center justify-between py-1.5 text-sm text-ink-dim">
      {label}
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="peer sr-only" />
      <span className="relative h-5 w-9 rounded-full bg-white/10 transition peer-checked:bg-violet/70 peer-focus-visible:outline-2 peer-focus-visible:outline-teal after:absolute after:top-0.5 after:left-0.5 after:size-4 after:rounded-full after:bg-ink after:transition peer-checked:after:translate-x-4" />
    </label>
  );
}

function Heading({ children }: { children: ReactNode }) {
  return <h3 className="mt-4 mb-1.5 text-[10px] font-semibold tracking-[0.14em] text-ink-faint uppercase first:mt-0">{children}</h3>;
}

function GalaxyPanel() {
  const { engine, orbits, labels, dust, clusters, arms, nebulae, nebulaPalette, view, set } = useApp();
  const go = (id: string) => {
    // Destinations are places in the Galaxy: leave the view from the ground first.
    if (view === 'sky') {
      engine?.setViewMode('galaxy');
      set({ view: 'galaxy' });
    }
    engine?.flyTo(id);
  };
  return (
    <>
      <Heading>Go to</Heading>
      <ul className="space-y-0.5">
        {DESTINATIONS.map((d) => (
          <li key={d.id}>
            <button onClick={() => go(d.id)} className="group w-full rounded-lg px-2 py-1.5 text-left hover:bg-violet/10">
              <span className="block text-sm text-ink group-hover:text-white">{d.label}</span>
              <span className="block text-[11px] text-ink-faint">{d.hint}</span>
            </button>
          </li>
        ))}
      </ul>
      <Heading>Layers</Heading>
      <Toggle label="Orbits" checked={orbits} onChange={(v) => set({ orbits: v })} />
      <Toggle label="Labels" checked={labels} onChange={(v) => set({ labels: v })} />
      <Toggle label="Dust and extinction" checked={dust} onChange={(v) => set({ dust: v })} />
      <Toggle label="Globular clusters" checked={clusters} onChange={(v) => set({ clusters: v })} />
      <Toggle label="Spiral arm labels" checked={arms} onChange={(v) => set({ arms: v })} />
      <Toggle label="Nebulae" checked={nebulae} onChange={(v) => set({ nebulae: v })} />
      <Toggle label="Hubble-palette colours" checked={nebulaPalette === 'enhanced'} onChange={(v) => set({ nebulaPalette: v ? 'enhanced' : 'scientific' })} />
      <Heading>Controls</Heading>
      <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-[11px] text-ink-dim">
        <dt className="font-mono text-ink">Drag</dt>
        <dd>Orbit</dd>
        <dt className="font-mono text-ink">Right-drag</dt>
        <dd>Pan</dd>
        <dt className="font-mono text-ink">Wheel</dt>
        <dd>Zoom (log scale)</dd>
        <dt className="font-mono text-ink">W A S D</dt>
        <dd>Fly · R/F up/down · Shift ×5</dd>
        <dt className="font-mono text-ink">Dbl-click</dt>
        <dd>Label to travel</dd>
      </dl>
    </>
  );
}

function ComingSoon({ title, deliverable, items }: { title: string; deliverable: number; items: string[] }) {
  return (
    <div className="text-sm text-ink-dim">
      <p className="text-ink">{title}</p>
      <p className="mt-1 text-xs text-ink-faint">Arrives in deliverable {deliverable}:</p>
      <ul className="mt-2 list-disc space-y-1 pl-4 text-xs">
        {items.map((i) => (
          <li key={i}>{i}</li>
        ))}
      </ul>
    </div>
  );
}

function SettingsPanel() {
  const { quality, exposure, glow, nebulaBrightness, bloom, theme, set } = useApp();
  const presets: QualityPreset[] = ['low', 'medium', 'high', 'ultra'];
  const themes: { id: Theme; label: string }[] = [
    { id: 'default', label: 'Default' },
    { id: 'night', label: 'Night vision' },
    { id: 'contrast', label: 'High contrast' },
  ];
  return (
    <>
      <Heading>Quality</Heading>
      <div className="grid grid-cols-4 gap-1 rounded-xl bg-white/5 p-1">
        {presets.map((p) => (
          <button key={p} onClick={() => set({ quality: p })} className={`rounded-lg py-1 text-xs capitalize ${quality === p ? 'bg-violet/40 text-white' : 'text-ink-dim hover:text-ink'}`}>
            {p}
          </button>
        ))}
      </div>
      <Heading>Exposure</Heading>
      <input type="range" min={1} max={80} step={0.5} value={exposure} onChange={(e) => set({ exposure: Number(e.target.value) })} className="w-full" aria-label="Exposure" />
      <Heading>Milky Way glow</Heading>
      <input type="range" min={1} max={12} step={0.5} value={glow} onChange={(e) => set({ glow: Number(e.target.value) })} className="w-full" aria-label="Milky Way glow" />
      <Heading>Nebula brightness</Heading>
      <input
        type="range"
        min={0.2}
        max={5}
        step={0.1}
        value={nebulaBrightness}
        onChange={(e) => set({ nebulaBrightness: Number(e.target.value) })}
        className="w-full"
        aria-label="Nebula brightness"
      />
      <p className="text-[10px] leading-snug text-ink-faint">Each nebula is exposed for its own surface brightness, like a photograph; this scales them all.</p>
      <Toggle label="Bloom" checked={bloom} onChange={(v) => set({ bloom: v })} />
      <Heading>Theme</Heading>
      <div className="grid grid-cols-3 gap-1 rounded-xl bg-white/5 p-1">
        {themes.map((t) => (
          <button key={t.id} onClick={() => set({ theme: t.id })} className={`rounded-lg py-1 text-[11px] ${theme === t.id ? 'bg-violet/40 text-white' : 'text-ink-dim hover:text-ink'}`}>
            {t.label}
          </button>
        ))}
      </div>
    </>
  );
}

/** Collapsible left navigation: icon rail plus a panel for the active section. */
export function NavRail() {
  const { nav, navOpen, setNav, toggleNav } = useApp();
  return (
    <nav className="pointer-events-auto flex h-full gap-2" aria-label="Main">
      <div className="glass flex w-14 flex-col items-center gap-1 rounded-2xl py-3">
        <div className="mb-3 grid size-9 place-items-center rounded-xl bg-gradient-to-br from-violet to-teal text-void" title="Starhome">
          <GalaxyIcon width={20} height={20} strokeWidth={2.2} />
        </div>
        {SECTIONS.map(({ id, label, Icon }) => (
          <button
            key={id}
            onClick={() => setNav(id)}
            className={`flex w-12 flex-col items-center gap-0.5 rounded-xl py-2 text-[10px] transition ${nav === id && navOpen ? 'bg-violet/20 text-white' : 'text-ink-faint hover:text-ink'}`}
            aria-current={nav === id ? 'page' : undefined}
          >
            <Icon />
            {label}
          </button>
        ))}
        <button onClick={toggleNav} className="mt-auto rounded-lg p-1.5 text-ink-faint hover:text-ink" aria-label={navOpen ? 'Collapse panel' : 'Expand panel'}>
          <ChevronIcon className={`transition ${navOpen ? '' : 'rotate-180'}`} width={16} height={16} />
        </button>
      </div>
      {navOpen && (
        <div className="glass w-64 overflow-y-auto rounded-2xl p-4">
          <h2 className="mb-3 text-base font-semibold tracking-tight">{SECTIONS.find((s) => s.id === nav)!.label}</h2>
          {nav === 'galaxy' && <GalaxyPanel />}
          {nav === 'sky' && <SkyPanel />}
          {nav === 'explore' && (
            <ComingSoon
              title="Catalogue hub"
              deliverable={6}
              items={['Stars, exoplanets, nebulae, clusters, black holes', 'Filters, favourites and visited history', 'Visible tonight, closest, most extreme', 'Daily featured object']}
            />
          )}
          {nav === 'settings' && <SettingsPanel />}
        </div>
      )}
    </nav>
  );
}

/** Pushes settings from the store into the engine and the document theme. */
export function useEngineSettings() {
  const { engine, quality, exposure, glow, bloom, orbits, labels, dust, clusters, arms, nebulae, nebulaPalette, nebulaBrightness, theme, view, location, skyLayers } = useApp();
  useEffect(() => engine?.setQuality(quality), [engine, quality]);
  useEffect(() => engine?.setExposure(exposure), [engine, exposure]);
  useEffect(() => engine?.setDiffuseGain(glow), [engine, glow]);
  useEffect(() => engine?.setLocation(location), [engine, location]);
  useEffect(() => engine?.setSkyLayers(skyLayers), [engine, skyLayers]);
  useEffect(() => engine?.setViewMode(view), [engine, view]);
  useEffect(() => engine?.setBloom(bloom), [engine, bloom]);
  useEffect(() => engine?.setOrbitsVisible(orbits), [engine, orbits]);
  useEffect(() => engine?.setLabelsVisible(labels), [engine, labels]);
  useEffect(() => engine?.setLayerVisible('dust', dust), [engine, dust]);
  useEffect(() => engine?.setLayerVisible('clusters', clusters), [engine, clusters]);
  useEffect(() => engine?.setLayerVisible('arms', arms), [engine, arms]);
  useEffect(() => engine?.setLayerVisible('nebulae', nebulae), [engine, nebulae]);
  useEffect(() => engine?.setNebulaPalette(nebulaPalette), [engine, nebulaPalette]);
  useEffect(() => engine?.setNebulaBrightness(nebulaBrightness), [engine, nebulaBrightness]);
  useEffect(() => {
    document.documentElement.classList.remove('theme-night', 'theme-contrast');
    if (theme !== 'default') document.documentElement.classList.add(`theme-${theme}`);
  }, [theme]);
}
