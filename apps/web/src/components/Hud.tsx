import { KM_PER_UNIT, bestDistanceUnit, formatDistance, formatSpeed } from '@starhome/astro';
import { useApp } from '../state/store';

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex justify-between gap-4">
      <span className="text-ink-faint">{k}</span>
      <span className="tabular font-mono text-ink">{v}</span>
    </div>
  );
}

/** Galactic position read-out: (l, b, d), Galactocentric (x, y, z), region, nearest object, speed. */
export function Hud() {
  const hud = useApp((s) => s.hud);
  if (!hud) return null;
  const [x, y, z] = hud.galactocentricPc.map((c) => c / 1000);
  const dPcKm = hud.dPc * KM_PER_UNIT.pc;

  return (
    <section className="glass pointer-events-auto w-72 rounded-2xl px-4 py-3 text-xs" aria-label="Galactic position">
      <div className="mb-2 flex items-center justify-between gap-2">
        <h2 className="truncate text-sm font-semibold tracking-tight">{hud.region}</h2>
        {hud.modeled ? (
          <span className="shrink-0 rounded-full border border-amber/40 bg-amber/10 px-2 py-0.5 text-[10px] font-medium tracking-wide text-amber uppercase" title="No real star catalogue covers this region; stars are generated from the Galaxy model.">
            Modeled
          </span>
        ) : (
          <span className="shrink-0 rounded-full border border-teal/40 bg-teal/10 px-2 py-0.5 text-[10px] font-medium tracking-wide text-teal uppercase" title="Within real catalogue coverage of the Sun's neighbourhood.">
            Real + modeled
          </span>
        )}
      </div>
      <div className="space-y-1">
        <Row k="Galactic l, b" v={`${hud.l.toFixed(3)}°, ${hud.b >= 0 ? '+' : ''}${hud.b.toFixed(3)}°`} />
        <Row k="Distance from Sun" v={formatDistance(dPcKm)} />
        <Row k="Galactocentric x, y, z" v={`${x.toFixed(2)}, ${y.toFixed(2)}, ${z.toFixed(3)} kpc`} />
        {hud.nearest && <Row k="Nearest" v={`${hud.nearest.name} · ${formatDistance(hud.nearest.distanceKm)}`} />}
        <Row k="Speed" v={formatSpeed(hud.speedKmS)} />
      </div>
      <div className="mt-2 flex justify-between border-t border-line pt-2 text-[10px] text-ink-faint">
        <span className="tabular font-mono">{Math.round(hud.fps)} fps</span>
        <span className="tabular font-mono" title="Glow particles · streamed synthetic stars · catalogue stars">
          {(hud.stars.glow / 1e6).toFixed(1)}M · {(hud.stars.cells / 1e3).toFixed(0)}k · {(hud.stars.catalog / 1e3).toFixed(1)}k {hud.stars.catalogSource === 'hipparcos' ? 'HIP' : ''}
        </span>
      </div>
    </section>
  );
}

const NICE = [1, 2, 5];

/** Scale bar sized to a round distance in the most readable unit. */
export function ScaleBar() {
  const kmPerPixel = useApp((s) => s.hud?.kmPerPixel);
  const distance = useApp((s) => s.hud?.distanceToTargetKm);
  if (!kmPerPixel || !distance) return null;
  const maxKm = kmPerPixel * 140;
  const unit = bestDistanceUnit(maxKm);
  const maxInUnit = maxKm / KM_PER_UNIT[unit];
  const mag = 10 ** Math.floor(Math.log10(maxInUnit));
  let nice = mag;
  for (const n of NICE) if (n * mag <= maxInUnit) nice = n * mag;
  const px = (nice * KM_PER_UNIT[unit]) / kmPerPixel;
  const label = `${nice >= 1000 ? nice.toLocaleString('en-US') : nice < 1 ? nice.toPrecision(1) : nice} ${unit}`;

  return (
    <div className="glass pointer-events-auto rounded-xl px-3 py-2 text-[11px]">
      <div className="flex items-end gap-3">
        <div>
          <div className="tabular mb-1 font-mono text-ink">{label}</div>
          <div className="h-1.5 border-x border-b border-ink/80" style={{ width: px }} />
        </div>
        <div className="text-right text-ink-faint">
          <div>to target</div>
          <div className="tabular font-mono text-ink-dim">{formatDistance(distance)}</div>
        </div>
      </div>
    </div>
  );
}

export function LoadingPill() {
  const hudLoading = useApp((s) => s.hud?.loading);
  const loading = hudLoading ?? ['Starting engine'];
  if (loading.length === 0) return null;
  return (
    <div className="glass pointer-events-none flex items-center gap-2 rounded-full px-3 py-1.5 text-[11px] text-ink-dim" role="status">
      <span className="size-1.5 animate-pulse rounded-full bg-teal" />
      Generating: {loading.join(' · ')}
    </div>
  );
}
