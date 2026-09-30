import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import {
  GoogleAuthProvider,
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
  updateProfile,
  sendPasswordResetEmail,
} from 'firebase/auth';
import { collection, deleteDoc, doc, onSnapshot, setDoc, updateDoc } from 'firebase/firestore';
import { auth, db, firebaseEnabled } from './firebase';
import { capability, dbErrorText, isArtifact, type ArtifactDB } from './artifact';
import {
  COLLECTIONS,
  type CollName,
  type CollectionMap,
  type DataState,
  type NewDoc,
  type Profile,
} from './types';
import { uid as makeId } from './utils';

// ================= Autentifikatsiya =================

export interface AppUser {
  uid: string;
  email: string | null;
  displayName: string | null;
  photoURL: string | null;
}

interface AuthCtx {
  user: AppUser | null;
  loading: boolean;
  /** cloud — Firebase; artifact — claude.ai Artifact xotirasi; local — faqat shu brauzer */
  mode: 'cloud' | 'artifact' | 'local';
  loginGoogle: () => Promise<void>;
  loginEmail: (email: string, password: string) => Promise<void>;
  registerEmail: (name: string, email: string, password: string) => Promise<void>;
  resetPassword: (email: string) => Promise<void>;
  logout: () => Promise<void>;
  enterLocal: () => void;
}

const AuthContext = createContext<AuthCtx | null>(null);
const LOCAL_USER_KEY = 'lifeos:local-user';

/** Artifact rejimida `db` imkoniyati shu yerda saqlanadi (DataProvider undan foydalanadi) */
let artifactDb: ArtifactDB | null = null;

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AppUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [mode, setMode] = useState<AuthCtx['mode']>(isArtifact ? 'artifact' : firebaseEnabled ? 'cloud' : 'local');

  useEffect(() => {
    if (isArtifact) {
      // claude.ai hisobi orqali avtomatik kirish; xotira mavjud bo'lmasa — mahalliy rejim
      let alive = true;
      (async () => {
        const [userCap, dbCap] = await Promise.all([capability('user'), capability('db')]);
        const id = userCap ? await userCap.id().catch(() => null) : null;
        if (!alive) return;
        if (dbCap && id) {
          artifactDb = dbCap;
          setMode('artifact');
          setUser({ uid: id, email: null, displayName: null, photoURL: null });
        } else {
          setMode('local');
          setUser(localUser());
        }
        setLoading(false);
      })();
      return () => {
        alive = false;
      };
    }
    if (!firebaseEnabled || !auth) {
      if (safeGet(LOCAL_USER_KEY)) setUser(localUser());
      setLoading(false);
      return;
    }
    return onAuthStateChanged(auth, (u) => {
      setUser(u ? { uid: u.uid, email: u.email, displayName: u.displayName, photoURL: u.photoURL } : null);
      setLoading(false);
    });
  }, []);

  const value = useMemo<AuthCtx>(
    () => ({
      user,
      loading,
      mode,
      loginGoogle: async () => {
        if (!auth) return;
        await signInWithPopup(auth, new GoogleAuthProvider());
      },
      loginEmail: async (email, password) => {
        if (!auth) return;
        await signInWithEmailAndPassword(auth, email, password);
      },
      registerEmail: async (name, email, password) => {
        if (!auth) return;
        const cred = await createUserWithEmailAndPassword(auth, email, password);
        if (name) {
          await updateProfile(cred.user, { displayName: name });
          setUser({ uid: cred.user.uid, email, displayName: name, photoURL: null });
        }
      },
      resetPassword: async (email) => {
        if (!auth) return;
        await sendPasswordResetEmail(auth, email);
      },
      logout: async () => {
        if (auth) await signOut(auth);
        else {
          safeRemove(LOCAL_USER_KEY);
          setUser(null);
        }
      },
      enterLocal: () => {
        safeSet(LOCAL_USER_KEY, '1');
        setUser(localUser());
      },
    }),
    [user, loading, mode],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

const localUser = (): AppUser => ({ uid: 'local', email: null, displayName: null, photoURL: null });

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth AuthProvider ichida ishlatilishi kerak');
  return ctx;
}

/** Firebase xatolarini o'zbekchaga o'giradi */
export function authErrorText(e: unknown): string {
  const code = (e as { code?: string })?.code ?? '';
  const map: Record<string, string> = {
    'auth/invalid-email': "Email manzili noto'g'ri",
    'auth/invalid-credential': "Email yoki parol noto'g'ri",
    'auth/wrong-password': "Parol noto'g'ri",
    'auth/user-not-found': 'Bunday foydalanuvchi topilmadi',
    'auth/email-already-in-use': "Bu email allaqachon ro'yxatdan o'tgan",
    'auth/weak-password': "Parol juda oddiy (kamida 6 ta belgi)",
    'auth/popup-closed-by-user': 'Kirish oynasi yopildi',
    'auth/network-request-failed': "Internet aloqasi yo'q",
    'auth/too-many-requests': "Juda ko'p urinish. Birozdan so'ng qayta urinib ko'ring",
    'auth/unauthorized-domain': 'Bu domen Firebase Authentication sozlamalarida ruxsat etilmagan',
    'auth/operation-not-allowed': 'Bu kirish usuli Firebase konsolida yoqilmagan',
  };
  return map[code] ?? (e instanceof Error ? e.message : "Noma'lum xatolik");
}

// ================= Saqlash qatlami =================

type AnyDoc = { id: string } & Record<string, unknown>;

interface Backend {
  subscribe(coll: CollName, cb: (docs: AnyDoc[]) => void, onError: (e: Error) => void): () => void;
  set(coll: CollName, id: string, data: AnyDoc): Promise<void>;
  update(coll: CollName, id: string, patch: Record<string, unknown>): Promise<void>;
  remove(coll: CollName, id: string): Promise<void>;
}

function firestoreBackend(userId: string): Backend {
  const col = (c: CollName) => collection(db!, 'users', userId, c);
  const ref = (c: CollName, id: string) => doc(db!, 'users', userId, c, id);
  return {
    subscribe: (c, cb, onError) =>
      onSnapshot(
        col(c),
        (snap) => cb(snap.docs.map((d) => ({ ...(d.data() as Record<string, unknown>), id: d.id }))),
        onError,
      ),
    set: (c, id, data) => setDoc(ref(c, id), data),
    update: (c, id, patch) => updateDoc(ref(c, id), patch),
    remove: (c, id) => deleteDoc(ref(c, id)),
  };
}

/**
 * claude.ai Artifact xotirasi. Har bir foydalanuvchining ma'lumotlari `data/users/<id>/` ostida —
 * boshqalarga (hatto artifact egasiga ham) ko'rinmaydi.
 */
function artifactBackend(store: ArtifactDB, userId: string): Backend {
  const items = (c: CollName) => store.doc(`data/users/${userId}/${c}`).collection('items');
  const cache = new Map<CollName, Map<string, AnyDoc>>();
  const cacheOf = (c: CollName) => {
    let m = cache.get(c);
    if (!m) cache.set(c, (m = new Map()));
    return m;
  };
  const wrap = (p: Promise<void>) =>
    p.catch((e) => {
      throw new Error(dbErrorText(e));
    });
  return {
    subscribe: (c, cb, onError) =>
      items(c).onSnapshot(
        (snap) => {
          // Kelgan hujjatlar muzlatilgan — nusxa olamiz
          const docs = snap.docs
            .filter((d) => d.exists)
            .map((d) => ({ ...(JSON.parse(JSON.stringify(d.data() ?? {})) as Record<string, unknown>), id: d.id }));
          const m = cacheOf(c);
          m.clear();
          docs.forEach((d) => m.set(d.id, d));
          cb(docs);
        },
        (e) => onError(new Error(dbErrorText(e))),
      ),
    set: (c, id, data) => {
      cacheOf(c).set(id, data);
      return wrap(items(c).doc(id).set(data));
    },
    // Firestore bilan bir xil ma'no: yuqori darajadagi maydonlar to'liq almashtiriladi
    // (db.update ichki obyektlarni birlashtiradi, bu esa o'chirilgan kalitlarni qoldirib ketardi)
    update: (c, id, patch) => {
      const cur = cacheOf(c).get(id);
      if (!cur) return wrap(items(c).doc(id).update(patch));
      const next = { ...cur, ...patch };
      cacheOf(c).set(id, next);
      return wrap(items(c).doc(id).set(next));
    },
    remove: (c, id) => {
      cacheOf(c).delete(id);
      return wrap(items(c).doc(id).delete());
    },
  };
}

function localBackend(): Backend {
  const listeners = new Map<CollName, Set<(docs: AnyDoc[]) => void>>();
  const key = (c: CollName) => `lifeos:v1:${c}`;
  const read = (c: CollName): Record<string, AnyDoc> => {
    try {
      return JSON.parse(localStorage.getItem(key(c)) || '{}');
    } catch {
      return {};
    }
  };
  const write = (c: CollName, all: Record<string, AnyDoc>) => {
    try {
      localStorage.setItem(key(c), JSON.stringify(all));
    } catch {
      throw new Error("Brauzer xotirasi to'lgan. Eski rasmlarni o'chiring yoki bulut rejimiga o'ting.");
    }
    listeners.get(c)?.forEach((fn) => fn(Object.values(all)));
  };
  return {
    subscribe: (c, cb) => {
      if (!listeners.has(c)) listeners.set(c, new Set());
      listeners.get(c)!.add(cb);
      cb(Object.values(read(c)));
      return () => listeners.get(c)?.delete(cb);
    },
    set: async (c, id, data) => {
      const all = read(c);
      all[id] = data;
      write(c, all);
    },
    update: async (c, id, patch) => {
      const all = read(c);
      if (!all[id]) throw new Error('Hujjat topilmadi');
      all[id] = { ...all[id], ...patch };
      write(c, all);
    },
    remove: async (c, id) => {
      const all = read(c);
      delete all[id];
      write(c, all);
    },
  };
}

// ================= Ma'lumotlar konteksti =================

export const DEFAULT_PROFILE: Omit<Profile, 'id' | 'createdAt' | 'updatedAt'> = {
  name: '',
  mission: '',
  vision: '',
  values: [],
  currency: 'UZS',
  aiProvider: 'gemini',
  geminiModel: 'gemini-3.8-flash',
  claudeModel: 'claude-opus-5-5',
};

interface DataCtx {
  data: DataState;
  ready: boolean;
  profile: Profile;
  add<K extends CollName>(coll: K, doc: NewDoc<K>): string;
  update<K extends CollName>(coll: K, id: string, patch: Partial<CollectionMap[K]>): void;
  remove(coll: CollName, id: string): void;
  saveProfile(patch: Partial<Profile>): void;
  importAll(dump: Partial<DataState>): Promise<number>;
  error: string | null;
  clearError(): void;
}

const DataContext = createContext<DataCtx | null>(null);

const emptyState = (): DataState =>
  Object.fromEntries(COLLECTIONS.map((c) => [c, []])) as unknown as DataState;

export function DataProvider({ userId, children }: { userId: string; children: React.ReactNode }) {
  const { mode } = useAuth();
  const backend = useMemo(() => {
    if (mode === 'artifact' && artifactDb) return artifactBackend(artifactDb, userId);
    if (mode === 'cloud' && userId !== 'local') return firestoreBackend(userId);
    return localBackend();
  }, [userId, mode]);
  const [data, setData] = useState<DataState>(emptyState);
  const [loaded, setLoaded] = useState<Set<CollName>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const dataRef = useRef(data);
  dataRef.current = data;

  useEffect(() => {
    setData(emptyState());
    setLoaded(new Set());
    const unsubs = COLLECTIONS.map((c) =>
      backend.subscribe(
        c,
        (docs) => {
          setData((prev) => ({ ...prev, [c]: docs }));
          setLoaded((prev) => (prev.has(c) ? prev : new Set(prev).add(c)));
        },
        (e) => {
          setError(`Ma'lumotlarni yuklashda xatolik: ${e.message}`);
          setLoaded((prev) => new Set(prev).add(c));
        },
      ),
    );
    return () => unsubs.forEach((u) => u());
  }, [backend]);

  const fail = useCallback((e: unknown) => {
    setError(e instanceof Error ? e.message : 'Saqlashda xatolik yuz berdi');
  }, []);

  const add = useCallback(
    <K extends CollName>(coll: K, d: NewDoc<K>) => {
      const id = d.id ?? makeId();
      const now = Date.now();
      const full = { ...d, id, createdAt: now, updatedAt: now } as unknown as AnyDoc;
      backend.set(coll, id, full).catch(fail);
      return id;
    },
    [backend, fail],
  );

  const update = useCallback(
    <K extends CollName>(coll: K, id: string, patch: Partial<CollectionMap[K]>) => {
      const { id: _ignored, ...rest } = patch as Record<string, unknown>;
      backend.update(coll, id, { ...rest, updatedAt: Date.now() }).catch(fail);
    },
    [backend, fail],
  );

  const remove = useCallback(
    (coll: CollName, id: string) => {
      backend.remove(coll, id).catch(fail);
    },
    [backend, fail],
  );

  const stored = data.profile.find((p) => p.id === 'main');
  const profile: Profile = useMemo(
    () => ({ ...DEFAULT_PROFILE, id: 'main', createdAt: 0, updatedAt: 0, ...stored }),
    [stored],
  );

  const saveProfile = useCallback(
    (patch: Partial<Profile>) => {
      if (dataRef.current.profile.some((p) => p.id === 'main')) update('profile', 'main', patch);
      else add('profile', { ...DEFAULT_PROFILE, ...patch, id: 'main' } as NewDoc<'profile'>);
    },
    [add, update],
  );

  const importAll = useCallback(
    async (dump: Partial<DataState>) => {
      let count = 0;
      for (const c of COLLECTIONS) {
        const docs = dump[c];
        if (!Array.isArray(docs)) continue;
        for (const d of docs as unknown as AnyDoc[]) {
          if (!d || typeof d.id !== 'string' || !/^[\w\-.~:@+]{1,200}$/.test(d.id)) continue;
          await backend.set(c, d.id, d);
          count++;
        }
      }
      return count;
    },
    [backend],
  );

  const value: DataCtx = {
    data,
    ready: loaded.size >= COLLECTIONS.length,
    profile,
    add,
    update,
    remove,
    saveProfile,
    importAll,
    error,
    clearError: () => setError(null),
  };

  return <DataContext.Provider value={value}>{children}</DataContext.Provider>;
}

export function useData() {
  const ctx = useContext(DataContext);
  if (!ctx) throw new Error('useData DataProvider ichida ishlatilishi kerak');
  return ctx;
}

// ================= Qurilmaga xos sozlamalar (API kalitlari) =================

const KEYS_STORAGE = 'lifeos:api-keys';

export interface ApiKeys {
  gemini: string;
  claude: string;
}

export function getApiKeys(): ApiKeys {
  try {
    const parsed = JSON.parse(safeGet(KEYS_STORAGE) || '{}');
    return { gemini: parsed.gemini ?? '', claude: parsed.claude ?? '' };
  } catch {
    return { gemini: '', claude: '' };
  }
}

export function saveApiKeys(keys: ApiKeys) {
  safeSet(KEYS_STORAGE, JSON.stringify(keys));
}

function safeGet(k: string) {
  try {
    return localStorage.getItem(k);
  } catch {
    return null;
  }
}
function safeSet(k: string, v: string) {
  try {
    localStorage.setItem(k, v);
  } catch {
    /* brauzer xotirasi yopiq */
  }
}
function safeRemove(k: string) {
  try {
    localStorage.removeItem(k);
  } catch {
    /* e'tiborsiz */
  }
}
