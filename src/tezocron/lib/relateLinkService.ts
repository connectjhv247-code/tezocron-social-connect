import {
  doc,
  getDoc,
  setDoc,
  collection,
  query,
  where,
  limit,
  getDocs,
} from 'firebase/firestore';
import { db } from '../firebase';
import { UserProfile } from '../types';

/**
 * Relate Link system.
 *
 * Every member gets a unique, shareable public handle (never an internal id,
 * email or account reference). The handle resolves back to that member's
 * real TEZOCRON profile so others can open it and send a Relate request.
 */

const HANDLE_ALPHABET = 'abcdefghijkmnpqrstuvwxyz23456789';

function randomSuffix(length = 5): string {
  let out = '';
  const values =
    typeof crypto !== 'undefined' && crypto.getRandomValues
      ? crypto.getRandomValues(new Uint32Array(length))
      : null;
  for (let i = 0; i < length; i++) {
    const n = values ? values[i] : Math.floor(Math.random() * HANDLE_ALPHABET.length);
    out += HANDLE_ALPHABET[n % HANDLE_ALPHABET.length];
  }
  return out;
}

function slugifyName(name: string): string {
  const base = (name || '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 18);
  return base || 'member';
}

export function isValidRelateHandle(handle: string): boolean {
  return /^[a-z0-9][a-z0-9-]{2,39}$/.test(handle);
}

async function handleIsTaken(handle: string, ownerUid: string): Promise<boolean> {
  const snap = await getDocs(
    query(collection(db, 'users'), where('relateHandle', '==', handle), limit(1))
  );
  if (snap.empty) return false;
  return snap.docs[0].id !== ownerUid;
}

/**
 * Returns the member's personal Relate handle, creating one on first use.
 */
export async function ensureRelateHandle(
  userId: string,
  displayName?: string
): Promise<string | null> {
  if (!userId) return null;

  try {
    const userRef = doc(db, 'users', userId);
    const snap = await getDoc(userRef);
    const existing = snap.exists() ? (snap.data() as UserProfile).relateHandle : undefined;
    if (existing && isValidRelateHandle(existing)) return existing;

    const base = slugifyName(displayName || (snap.data() as UserProfile | undefined)?.displayName || '');

    for (let attempt = 0; attempt < 5; attempt++) {
      const candidate = `${base}-${randomSuffix()}`;
      if (await handleIsTaken(candidate, userId)) continue;
      await setDoc(userRef, { relateHandle: candidate }, { merge: true });
      return candidate;
    }
    return null;
  } catch (err) {
    console.warn('Relate link setup notice:', err);
    return null;
  }
}

/**
 * Resolves a shared Relate handle to the member it belongs to.
 */
export async function resolveRelateHandle(handle: string): Promise<{
  uid: string;
  displayName: string;
  photoURL?: string;
} | null> {
  const clean = (handle || '').trim().toLowerCase();
  if (!isValidRelateHandle(clean)) return null;

  try {
    const snap = await getDocs(
      query(collection(db, 'users'), where('relateHandle', '==', clean), limit(1))
    );
    if (snap.empty) return null;
    const docSnap = snap.docs[0];
    const data = docSnap.data() as UserProfile;
    return {
      uid: docSnap.id,
      displayName: data.displayName || 'Member',
      photoURL: data.photoURL,
    };
  } catch (err) {
    console.warn('Relate link resolve notice:', err);
    return null;
  }
}

/** Public website that hosts TEZOCRON Relate Links. */
export const RELATE_LINK_BASE = 'https://tezocron.com';

/** Builds the full public Relate Link for sharing outside the app. */
export function buildRelateLink(handle: string): string {
  return `${RELATE_LINK_BASE}/relate/${handle}`;
}

export function buildRelateShareMessage(displayName: string, link: string): string {
  return `Connect with ${displayName} on TEZOCRON — open my Relate Link to relate with me: ${link}`;
}
