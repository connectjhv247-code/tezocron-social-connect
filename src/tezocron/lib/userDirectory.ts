import { doc, onSnapshot, Unsubscribe } from 'firebase/firestore';
import { db } from '../firebase';
import { UserProfile } from '../types';

/**
 * Shared live cache of public user profile fields (name + picture).
 * One Firestore listener per user is shared across every component,
 * so a profile picture change is reflected instantly everywhere.
 */

export interface PublicUserSummary {
  uid: string;
  displayName?: string;
  photoURL?: string;
}

type Listener = (summary: PublicUserSummary) => void;

interface Entry {
  summary: PublicUserSummary;
  listeners: Set<Listener>;
  unsubscribe: Unsubscribe;
}

const entries = new Map<string, Entry>();

export function getCachedUser(uid: string): PublicUserSummary | undefined {
  return entries.get(uid)?.summary;
}

export function subscribeToPublicUser(uid: string, listener: Listener): () => void {
  if (!uid) return () => {};

  let entry = entries.get(uid);

  if (!entry) {
    const created: Entry = {
      summary: { uid },
      listeners: new Set<Listener>(),
      unsubscribe: () => {},
    };
    entries.set(uid, created);

    created.unsubscribe = onSnapshot(
      doc(db, 'users', uid),
      (snap) => {
        if (!snap.exists()) return;
        const data = snap.data() as UserProfile;
        created.summary = {
          uid,
          displayName: data.displayName,
          photoURL: data.photoURL,
        };
        created.listeners.forEach((l) => l(created.summary));
      },
      () => {
        // Non-fatal: keep whatever data callers already have
      }
    );

    entry = created;
  }

  entry.listeners.add(listener);
  listener(entry.summary);

  return () => {
    const current = entries.get(uid);
    if (!current) return;
    current.listeners.delete(listener);
    if (current.listeners.size === 0) {
      current.unsubscribe();
      entries.delete(uid);
    }
  };
}
