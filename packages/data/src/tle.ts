/**
 * Satellite orbital elements (two-line element sets) from CelesTrak. CelesTrak updates
 * its data a few times a day and asks clients not to download the same group more often
 * than every two hours, so each group is cached in the browser for TLE_CACHE_HOURS.
 */
export interface Tle {
  name: string;
  line1: string;
  line2: string;
}

export const TLE_CACHE_HOURS = 4;
/** Space stations (ISS, Tiangong) and the ~150 brightest satellites. */
export const TLE_GROUPS = ['stations', 'visual'] as const;
export type TleGroup = (typeof TLE_GROUPS)[number];

export function tleUrl(group: TleGroup): string {
  return `https://celestrak.org/NORAD/elements/gp.php?GROUP=${group}&FORMAT=tle`;
}

/** Parse three-line TLE text (name line, then lines 1 and 2). */
export function parseTleText(text: string): Tle[] {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trimEnd())
    .filter((l) => l.length > 0);
  const out: Tle[] = [];
  for (let i = 0; i < lines.length; ) {
    const [a, b, c] = [lines[i], lines[i + 1], lines[i + 2]];
    if (a && b?.startsWith('1 ') && c?.startsWith('2 ')) {
      out.push({ name: a.trim(), line1: b, line2: c });
      i += 3;
    } else {
      i += 1;
    }
  }
  return out;
}

interface CacheEntry {
  fetchedAt: number;
  text: string;
}

function readCache(group: TleGroup): CacheEntry | null {
  try {
    const raw = localStorage.getItem(`starhome.tle.${group}`);
    return raw ? (JSON.parse(raw) as CacheEntry) : null;
  } catch {
    return null;
  }
}

function writeCache(group: TleGroup, entry: CacheEntry): void {
  try {
    localStorage.setItem(`starhome.tle.${group}`, JSON.stringify(entry));
  } catch {
    // Storage full or blocked: the next visit simply downloads again.
  }
}

/**
 * Load the TLE groups, from the cache when fresh. Falls back to a stale cache when the
 * network fails; resolves to an empty list when nothing is available.
 */
export async function loadTles(groups: readonly TleGroup[] = TLE_GROUPS, now = Date.now()): Promise<{ tles: Tle[]; fetchedAt: number | null }> {
  const byName = new Map<string, Tle>();
  let oldest: number | null = null;
  for (const group of groups) {
    let entry = readCache(group);
    if (!entry || now - entry.fetchedAt > TLE_CACHE_HOURS * 3_600_000) {
      try {
        const res = await fetch(tleUrl(group));
        if (res.ok) {
          const text = await res.text();
          if (parseTleText(text).length > 0) {
            entry = { fetchedAt: now, text };
            writeCache(group, entry);
          }
        }
      } catch {
        // Offline: use whatever is cached.
      }
    }
    if (!entry) continue;
    oldest = oldest === null ? entry.fetchedAt : Math.min(oldest, entry.fetchedAt);
    // Satellites appear in several groups; keep one copy by catalogue number.
    for (const t of parseTleText(entry.text)) byName.set(t.line1.slice(2, 7), t);
  }
  return { tles: [...byName.values()], fetchedAt: oldest };
}
