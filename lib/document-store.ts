// The open model, in IndexedDB. This is where the document LIVES.
//
// Not a cache of a file on disk. A model is opened once, edited over a session
// or many, and written back out only when asked — so the browser holds the
// authority and the disk is an export target. That is the same shape design and
// studio use, and it is why nothing here holds a file handle: a handle would
// make the disk the source of truth and the document a view of it, which is the
// opposite arrangement.
//
// TWO records per model, deliberately. The document is the parsed PMX and is
// what every edit rewrites. The source files are the textures beside it, which
// no edit touches and which are far larger — keeping them apart means saving a
// bone rename does not rewrite forty megabytes of PNG.
//
// Every failure path resolves null/false rather than throwing. Browsers evict
// IndexedDB under storage pressure and refuse it outright in private mode, so a
// caller has to treat "gone" as ordinary: the app falls back to the document it
// already has in memory and the user re-opens their folder.

import type { PmxDocument } from "reze-engine"
import { storageKey } from "@/lib/storage"

const DB_NAME = "reze-build"
const DB_VERSION = 1
const DOCUMENTS = "documents"
const SOURCES = "sources"
const KEY = storageKey("open-model")

/** The bytes that came in beside the .pmx — textures, mostly. Kept as they
 *  arrived so an export can put the folder back together. */
export interface SourceFiles {
  pmxPath: string
  files: { path: string; file: File }[]
}

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
      for (const store of [DOCUMENTS, SOURCES]) {
        if (!req.result.objectStoreNames.contains(store)) req.result.createObjectStore(store)
      }
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => resolve(null)
    req.onblocked = () => resolve(null)
  })
}

function put(db: IDBDatabase, store: string, value: unknown): Promise<boolean> {
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(store, "readwrite")
      tx.objectStore(store).put(value, KEY)
      tx.oncomplete = () => resolve(true)
      tx.onerror = () => resolve(false)
      tx.onabort = () => resolve(false)
    } catch {
      resolve(false)
    }
  })
}

function get<T>(db: IDBDatabase, store: string): Promise<T | null> {
  return new Promise((resolve) => {
    try {
      const req = db.transaction(store, "readonly").objectStore(store).get(KEY)
      req.onsuccess = () => resolve((req.result as T | undefined) ?? null)
      req.onerror = () => resolve(null)
    } catch {
      resolve(null)
    }
  })
}

/**
 * Writes the document. Called after every edit, so it must stay cheap — which is
 * why the textures are not in this record.
 *
 * True only once the write actually completed: a caller must not report a model
 * saved when quota refused it.
 */
export async function saveDocument(doc: PmxDocument): Promise<boolean> {
  const db = await open()
  if (!db) return false
  // Uint8Array and the plain objects here all survive structured clone, so the
  // document goes in as it is rather than through JSON — which would turn the
  // index buffer into an array of 90,000 numbers.
  const ok = await put(db, DOCUMENTS, doc)
  db.close()
  return ok
}

export async function loadDocument(): Promise<PmxDocument | null> {
  const db = await open()
  if (!db) return null
  const doc = await get<PmxDocument>(db, DOCUMENTS)
  db.close()
  return doc
}

/** `path` is read here, while the File objects are still live from the picker:
 *  webkitRelativePath does not reliably survive a structured-clone round trip,
 *  so it has to be captured now rather than read back after a restore. */
export async function saveSources(files: File[], pmxFile: File): Promise<boolean> {
  const db = await open()
  if (!db) return false
  const record: SourceFiles = {
    pmxPath: pmxFile.webkitRelativePath || pmxFile.name,
    files: files.map((f) => ({ path: f.webkitRelativePath || f.name, file: f })),
  }
  const ok = await put(db, SOURCES, record)
  db.close()
  return ok
}

export async function loadSources(): Promise<{ files: File[]; pmxFile: File } | null> {
  const db = await open()
  if (!db) return null
  const rec = await get<SourceFiles>(db, SOURCES)
  db.close()
  if (!rec) return null
  const files = rec.files.map((e) => new File([e.file], e.path, { type: e.file.type }))
  const pmxFile = files.find((f) => f.name === rec.pmxPath)
  return pmxFile ? { files, pmxFile } : null
}
