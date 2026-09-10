// The open models, in IndexedDB. This is where an EDITED document lives
// between sessions — one record per model id, so switching cast members (or
// reopening the app days later) restores each one's own edits rather than
// whichever was saved last.
//
// Not a cache of a file on disk. A model is opened once, edited over a
// session or many, and written back out only when asked — so the browser
// holds the authority and the disk is an export target. That is the same
// shape design and studio use, and it is why nothing here holds a file
// handle: a handle would make the disk the source of truth and the document
// a view of it, which is the opposite arrangement.
//
// Textures are NOT kept here. A locally uploaded model's whole folder
// already lives durably in the scene's own asset bundle (lib/asset-store.ts)
// — this store's only job is the edited PMX bytes on top of it. A
// served-folder model's textures stay a live fetch against their original
// URL, same as before any edit.
//
// Every failure path resolves null/false rather than throwing. Browsers
// evict IndexedDB under storage pressure and refuse it outright in private
// mode, so a caller has to treat "gone" as ordinary: the app falls back to
// the original source it already knows how to read.

import type { PmxDocument } from "reze-engine"
import { storageKey } from "@/lib/storage"

const DB_NAME = "reze-build"
const DB_VERSION = 1
const DOCUMENTS = "documents"

function open(): Promise<IDBDatabase | null> {
  if (typeof indexedDB === "undefined") return Promise.resolve(null)
  return new Promise((resolve) => {
    let req: IDBOpenDBRequest
    try {
      req = indexedDB.open(DB_NAME, DB_VERSION)
    } catch {
      return resolve(null) // private mode, in some browsers
    }
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(DOCUMENTS)) req.result.createObjectStore(DOCUMENTS)
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => resolve(null)
    req.onblocked = () => resolve(null)
  })
}

function put(db: IDBDatabase, key: string, value: unknown): Promise<boolean> {
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(DOCUMENTS, "readwrite")
      tx.objectStore(DOCUMENTS).put(value, key)
      tx.oncomplete = () => resolve(true)
      tx.onerror = () => resolve(false)
      tx.onabort = () => resolve(false)
    } catch {
      resolve(false)
    }
  })
}

function get<T>(db: IDBDatabase, key: string): Promise<T | null> {
  return new Promise((resolve) => {
    try {
      const req = db.transaction(DOCUMENTS, "readonly").objectStore(DOCUMENTS).get(key)
      req.onsuccess = () => resolve((req.result as T | undefined) ?? null)
      req.onerror = () => resolve(null)
    } catch {
      resolve(null)
    }
  })
}

function del(db: IDBDatabase, key: string): Promise<void> {
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(DOCUMENTS, "readwrite")
      tx.objectStore(DOCUMENTS).delete(key)
      tx.oncomplete = () => resolve()
      tx.onerror = () => resolve()
      tx.onabort = () => resolve()
    } catch {
      resolve()
    }
  })
}

const keyFor = (modelId: string) => storageKey(`open-model/${modelId}`)

/**
 * Writes one model's document, under its id. Called after every edit, so it
 * must stay cheap — which is why this is the ONLY thing this store holds; the
 * textures beside it are unaffected by any edit here and are far larger.
 *
 * True only once the write actually completed: a caller must not report a
 * model saved when quota refused it.
 */
export async function saveDocument(modelId: string, doc: PmxDocument): Promise<boolean> {
  const db = await open()
  if (!db) return false
  // Uint8Array/Uint32Array and the plain objects here all survive structured
  // clone, so the document goes in as it is rather than through JSON — which
  // would turn the index buffer into an array of tens of thousands of numbers.
  const ok = await put(db, keyFor(modelId), doc)
  db.close()
  return ok
}

export async function loadDocument(modelId: string): Promise<PmxDocument | null> {
  const db = await open()
  if (!db) return null
  const doc = await get<PmxDocument>(db, keyFor(modelId))
  db.close()
  return doc
}

/** Drops one model's saved edit. Reset and a model's removal both want the
 *  NEXT load of that id to see the original again, not whatever was last
 *  saved here — a stale record left behind reads as a reset that did not work. */
export async function clearDocument(modelId: string): Promise<void> {
  const db = await open()
  if (!db) return
  await del(db, keyFor(modelId))
  db.close()
}
