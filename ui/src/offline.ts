import { syncDeepInsert } from './api';

// --- Types (local copies to avoid circular imports) ---
type Form = { ID: string; formName: string; active: boolean };
type Question = { ID: string; form_ID: string; question: string; type_code: number };

// Stores: queue (submissions), forms (catalog), questions (per form)
const DB_NAME = 'rioforms-db';
const STORE_QUEUE = 'queue';
const STORE_FORMS = 'forms';
const STORE_QUESTIONS = 'questions';
const DB_VERSION = 2; // keep your current version

let dbPromise: Promise<IDBDatabase> | null = null;
function openDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_QUEUE)) db.createObjectStore(STORE_QUEUE, { keyPath: 'id', autoIncrement: true });
      if (!db.objectStoreNames.contains(STORE_FORMS)) db.createObjectStore(STORE_FORMS, { keyPath: 'ID' });
      if (!db.objectStoreNames.contains(STORE_QUESTIONS)) db.createObjectStore(STORE_QUESTIONS, { keyPath: 'form_ID' });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

// -------- Catalog (forms & questions) ----------
export async function saveForms(forms: Form[]): Promise<void> {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction([STORE_FORMS], 'readwrite');
    const store = tx.objectStore(STORE_FORMS);
    store.clear().onsuccess = () => { forms.forEach(f => store.put(f)); };
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}
export async function getForms(): Promise<Form[]> {
  const db = await openDb();
  return await new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_FORMS, 'readonly');
    const req = tx.objectStore(STORE_FORMS).getAll();
    req.onsuccess = () => resolve(req.result as Form[]);
    req.onerror = () => reject(req.error);
  });
}
export async function saveQuestions(form_ID: string, items: Question[]): Promise<void> {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_QUESTIONS, 'readwrite');
    tx.objectStore(STORE_QUESTIONS).put({ form_ID, items });
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}
export async function getQuestions(form_ID: string): Promise<Question[]> {
  const db = await openDb();
  return await new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_QUESTIONS, 'readonly');
    const req = tx.objectStore(STORE_QUESTIONS).get(form_ID);
    req.onsuccess = () => resolve((req.result?.items as Question[]) || []);
    req.onerror = () => reject(req.error);
  });
}

// -------- Submission queue with idempotency ----------
function uuid() {
  // Prefer crypto.randomUUID when available
  // @ts-ignore
  return (crypto?.randomUUID?.() || 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = Math.random()*16|0, v = c === 'x' ? r : (r&0x3|0x8); return v.toString(16);
  })) as string;
}

type QueuedPayload = {
  // stable IDs to make deep-insert idempotent
  ID: string; // FormRecord ID
  form_ID: string;
  firstName: string;
  lastName: string;
  answerRecords: Array<{ ID: string; question_ID: string; textAnswer?: string; boolAnswer?: boolean }>;
};

type QueueRow = { id?: number; ts: number; payload: QueuedPayload };

export async function queueSubmission(payload: {
  form_ID: string;
  firstName: string;
  lastName: string;
  answerRecords: Array<{ question_ID: string; textAnswer?: string; boolAnswer?: boolean }>;
}): Promise<void> {
  const db = await openDb();

  // add stable IDs when queuing
  const q: QueuedPayload = {
    ID: uuid(),
    form_ID: payload.form_ID,
    firstName: payload.firstName,
    lastName: payload.lastName,
    answerRecords: payload.answerRecords.map(a => ({ ID: uuid(), ...a }))
  };

  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_QUEUE, 'readwrite');
    tx.objectStore(STORE_QUEUE).add({ ts: Date.now(), payload: q });
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function getQueue(): Promise<QueueRow[]> {
  const db = await openDb();
  return await new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_QUEUE, 'readonly');
    const req = tx.objectStore(STORE_QUEUE).getAll();
    req.onsuccess = () => resolve(req.result as QueueRow[]);
    req.onerror = () => reject(req.error);
  });
}
async function deleteItem(id: number): Promise<void> {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_QUEUE, 'readwrite');
    tx.objectStore(STORE_QUEUE).delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

// Single-flight guard to avoid concurrent flushes
let flushing = false;

export async function flushQueue(): Promise<number> {
  if (!navigator.onLine) return 0;
  if (flushing) return 0;
  flushing = true;
  try {
    const items = await getQueue();
    let ok = 0;
    for (const it of items) {
      // If old queue items lack IDs (from a previous version), patch them now
      if (!(it.payload as any).ID) {
        (it.payload as any).ID = uuid();
        (it.payload as any).answerRecords = (it.payload as any).answerRecords.map((a: any) => ({ ID: uuid(), ...a }));
      }
      const res = await syncDeepInsert(it.payload, /* tolerateConflict */ true);
      if (res.ok) {
        if (it.id != null) await deleteItem(it.id);
        ok++;
      } else {
        // Stop on hard failures (e.g., 401/403) to avoid hammering
        break;
      }
    }
    return ok;
  } finally {
    flushing = false;
  }
}
