// Tiny IndexedDB key-value wrapper with a localStorage fallback.

const DB = 'fiveohfive';
const STORE = 'kv';

let dbp: Promise<IDBDatabase> | null = null;
const open = () => {
  if (dbp) return dbp;
  dbp = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbp;
};

export const kvGet = async <T>(key: string): Promise<T | undefined> => {
  try {
    const db = await open();
    return await new Promise<T | undefined>((resolve, reject) => {
      const r = db.transaction(STORE, 'readonly').objectStore(STORE).get(key);
      r.onsuccess = () => resolve(r.result as T | undefined);
      r.onerror = () => reject(r.error);
    });
  } catch {
    try {
      const s = localStorage.getItem(`${DB}:${key}`);
      return s ? (JSON.parse(s) as T) : undefined;
    } catch {
      return undefined;
    }
  }
};

export const kvSet = async (key: string, value: unknown): Promise<void> => {
  try {
    const db = await open();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).put(value, key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch {
    try {
      localStorage.setItem(`${DB}:${key}`, JSON.stringify(value));
    } catch {
      /* storage unavailable */
    }
  }
};

export const lsGet = (key: string, fallback = '') => {
  try {
    return localStorage.getItem(`${DB}:${key}`) ?? fallback;
  } catch {
    return fallback;
  }
};
export const lsSet = (key: string, value: string) => {
  try {
    localStorage.setItem(`${DB}:${key}`, value);
  } catch {
    /* ignore */
  }
};

export const downloadFile = (name: string, data: BlobPart, type: string) => {
  const url = URL.createObjectURL(new Blob([data], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
};

export const pickFile = (accept: string): Promise<File | null> =>
  new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = accept;
    input.onchange = () => resolve(input.files?.[0] ?? null);
    input.click();
  });
