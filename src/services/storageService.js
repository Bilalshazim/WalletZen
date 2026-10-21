/**
 * Storage abstraction shared by the Firestore and localStorage backends.
 *
 * A store exposes:
 *   subscribe(collection, callback) -> unsubscribe
 *   commit(ops)                     -> Promise (all ops applied atomically)
 *   newId()                         -> string
 *
 * Ops: { type: 'set', collection, id, data }
 *      { type: 'update', collection, id, data?, increment?: { field: delta } }
 *      { type: 'delete', collection, id }
 */
import {
  collection as fsCollection,
  doc,
  increment as fsIncrement,
  onSnapshot,
  writeBatch,
} from 'firebase/firestore';
import { db } from './firebase';

export const COLLECTIONS = ['accounts', 'transactions', 'bills', 'committees', 'contacts', 'ledger'];

const newId = () =>
  globalThis.crypto?.randomUUID?.() ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;

function createFirestoreStore(uid) {
  const ref = (name, id) => doc(db, 'users', uid, name, id);

  return {
    newId,
    subscribe(name, callback) {
      return onSnapshot(
        fsCollection(db, 'users', uid, name),
        (snap) => callback(snap.docs.map((d) => ({ id: d.id, ...d.data() }))),
        (error) => console.error(`[WalletZen] ${name} subscription failed`, error),
      );
    },
    async commit(ops) {
      const batch = writeBatch(db);
      for (const op of ops) {
        const target = ref(op.collection, op.id);
        if (op.type === 'set') batch.set(target, op.data);
        if (op.type === 'delete') batch.delete(target);
        if (op.type === 'update') {
          const patch = { ...op.data };
          for (const [field, delta] of Object.entries(op.increment ?? {})) patch[field] = fsIncrement(delta);
          batch.update(target, patch);
        }
      }
      // With the persistent cache, the write is applied locally right away; don't block the UI offline.
      if (!navigator.onLine) {
        batch.commit().catch((error) => console.error('[WalletZen] offline write failed', error));
        return;
      }
      await batch.commit();
    },
  };
}

function createLocalStore(uid) {
  const key = (name) => `walletzen:${uid}:${name}`;
  const listeners = new Map(COLLECTIONS.map((name) => [name, new Set()]));

  const read = (name) => {
    try {
      return JSON.parse(localStorage.getItem(key(name))) ?? {};
    } catch {
      return {};
    }
  };
  const toList = (map) => Object.entries(map).map(([id, data]) => ({ id, ...data }));

  return {
    newId,
    subscribe(name, callback) {
      listeners.get(name).add(callback);
      callback(toList(read(name)));
      return () => listeners.get(name).delete(callback);
    },
    async commit(ops) {
      // Apply every op to in-memory copies first so a failure leaves storage untouched.
      const touched = new Map();
      const get = (name) => {
        if (!touched.has(name)) touched.set(name, read(name));
        return touched.get(name);
      };

      for (const op of ops) {
        const map = get(op.collection);
        if (op.type === 'set') map[op.id] = op.data;
        if (op.type === 'delete') delete map[op.id];
        if (op.type === 'update') {
          if (!map[op.id]) throw new Error(`${op.collection}/${op.id} does not exist`);
          const next = { ...map[op.id], ...op.data };
          for (const [field, delta] of Object.entries(op.increment ?? {})) next[field] = (Number(next[field]) || 0) + delta;
          map[op.id] = next;
        }
      }

      for (const [name, map] of touched) localStorage.setItem(key(name), JSON.stringify(map));
      for (const [name, map] of touched) listeners.get(name).forEach((cb) => cb(toList(map)));
    },
  };
}

export function createStore(user) {
  return user.isLocal ? createLocalStore(user.uid) : createFirestoreStore(user.uid);
}

// ---------- Guest → cloud migration ----------

export const GUEST_UID = 'local';
const guestKey = (name) => `walletzen:${GUEST_UID}:${name}`;
const MIGRATION_CHUNK = 450; // Firestore batches allow 500 writes

function readGuestCollection(name) {
  try {
    return JSON.parse(localStorage.getItem(guestKey(name))) ?? {};
  } catch {
    return {};
  }
}

/** Number of records (accounts, transactions, bills, committees) saved in guest mode on this device. */
export function guestItemCount() {
  return COLLECTIONS.reduce((sum, name) => sum + Object.keys(readGuestCollection(name)).length, 0);
}

/** One `set` op per guest record, keeping its id so a retried migration overwrites instead of duplicating. */
export function buildGuestMigrationOps() {
  return COLLECTIONS.flatMap((name) =>
    Object.entries(readGuestCollection(name)).map(([id, data]) => ({ type: 'set', collection: name, id, data })),
  );
}

/**
 * Copies all guest data into the signed-in user's Firestore account, then clears it from this device.
 * Guest data is only removed after every batch succeeded. Resolves to the number of records moved.
 */
export async function migrateGuestData(uid) {
  const ops = buildGuestMigrationOps();
  if (!ops.length) return 0;
  const cloud = createFirestoreStore(uid);
  for (let i = 0; i < ops.length; i += MIGRATION_CHUNK) await cloud.commit(ops.slice(i, i + MIGRATION_CHUNK));
  COLLECTIONS.forEach((name) => localStorage.removeItem(guestKey(name)));
  return ops.length;
}
