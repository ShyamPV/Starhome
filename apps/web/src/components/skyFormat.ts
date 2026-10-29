import { julianToDate } from '@starhome/astro';

const COMPASS = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];

export function compass(azDeg: number): string {
  return COMPASS[Math.round((((azDeg % 360) + 360) % 360) / 22.5) % 16]!;
}

export function formatAltAz(alt: number, az: number): string {
  return `${alt >= 0 ? '+' : ''}${alt.toFixed(1)}° alt · ${az.toFixed(0)}° ${compass(az)}`;
}

/** RA in hours and minutes, Dec in degrees and arcminutes. */
export function formatRaDec(raDeg: number, decDeg: number): string {
  const h = (((raDeg % 360) + 360) % 360) / 15;
  const hh = Math.floor(h);
  const mm = Math.floor((h - hh) * 60);
  const sign = decDeg < 0 ? '−' : '+';
  const d = Math.abs(decDeg);
  const dd = Math.floor(d);
  const dm = Math.round((d - dd) * 60);
  return `${hh}h ${String(mm).padStart(2, '0')}m, ${sign}${dd}° ${String(dm).padStart(2, '0')}′`;
}

export function formatLatLon(lat: number, lon: number): string {
  return `${Math.abs(lat).toFixed(2)}° ${lat >= 0 ? 'N' : 'S'}, ${Math.abs(lon).toFixed(2)}° ${lon >= 0 ? 'E' : 'W'}`;
}

/** Clock time in the browser's time zone, with the weekday when it isn't the reference day. */
export function formatTime(jd: number | null, referenceJd?: number): string {
  if (jd === null) return '—';
  const d = julianToDate(jd);
  const time = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  if (referenceJd === undefined) return time;
  const ref = julianToDate(referenceJd);
  return d.toDateString() === ref.toDateString() ? time : `${d.toLocaleDateString([], { weekday: 'short' })} ${time}`;
}

export function skyCondition(sunAlt: number): string {
  if (sunAlt > 0) return 'Daytime';
  if (sunAlt > -6) return 'Civil twilight';
  if (sunAlt > -12) return 'Nautical twilight';
  if (sunAlt > -18) return 'Astronomical twilight';
  return 'Night';
}
