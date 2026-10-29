import Dexie, { type EntityTable } from 'dexie';

export interface Favourite {
  id: string;
  addedAt: number;
}

export interface Visit {
  id: string;
  firstAt: number;
  lastAt: number;
  count: number;
}

/** Favourites and visited objects, kept in this browser's IndexedDB. */
class UserDb extends Dexie {
  favourites!: EntityTable<Favourite, 'id'>;
  visited!: EntityTable<Visit, 'id'>;

  constructor() {
    super('starhome');
    this.version(1).stores({ favourites: 'id, addedAt', visited: 'id, lastAt' });
  }
}

let db: UserDb | null = null;
function open(): UserDb | null {
  try {
    db ??= new UserDb();
    return db;
  } catch {
    return null;
  }
}

/**
 * Every call tolerates blocked storage (private windows, disabled site data): the app
 * then keeps favourites and visits in memory for the session.
 */
export async function loadUserData(): Promise<{ favourites: Favourite[]; visited: Visit[] }> {
  try {
    const d = open();
    if (!d) return { favourites: [], visited: [] };
    const [favourites, visited] = await Promise.all([d.favourites.toArray(), d.visited.toArray()]);
    return { favourites, visited };
  } catch {
    return { favourites: [], visited: [] };
  }
}

export async function saveFavourite(id: string, on: boolean): Promise<void> {
  try {
    const d = open();
    if (!d) return;
    if (on) await d.favourites.put({ id, addedAt: Date.now() });
    else await d.favourites.delete(id);
  } catch {
    // Session only.
  }
}

export async function saveVisit(v: Visit): Promise<void> {
  try {
    await open()?.visited.put(v);
  } catch {
    // Session only.
  }
}
