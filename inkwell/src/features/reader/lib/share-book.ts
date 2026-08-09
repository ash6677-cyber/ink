/**
 * A book as a read-only share: the shapes, the ids, and the reader-side
 * fetch — everything except the authenticated writes (those live in
 * `share-actions.ts`, behind the writer's sign-in).
 *
 * The recipient's half deliberately uses Firestore's plain REST endpoint
 * with `fetch`: a beta reader clicking a link should not download the
 * Firebase SDK to read a book. Scene prose travels as a JSON string field
 * per chapter, so the REST decode is one `JSON.parse` instead of a walk
 * through Firestore's typed value trees.
 */

import type { BookChapter } from '@/features/reader/lib/compile-book'
import { hasRealConfig, useEmulator } from '@/lib/firebase/cloud-flags'
import type { Scene } from '@/types'

export interface SharedSceneData {
  title: string
  content: unknown
  plainText: string
  wordCount: number
}

export interface SharedChapterData {
  title: string
  kind: string
  number: number | null
  order: number
  scenes: SharedSceneData[]
}

export interface SharedBookMeta {
  title: string
  author: string
  chapterCount: number
  updatedAt: number
}

/**
 * 22 characters of crypto-random base36 — the link *is* the access control,
 * so it has to be unguessable (~113 bits here), and it must never be
 * derived from anything meaningful like the project id.
 */
export function newShareId(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16))
  return [...bytes].map((b) => b.toString(36).padStart(2, '0')).join('').slice(0, 22)
}

/** What each chapter document carries up. */
export function chapterPayload(chapter: BookChapter, order: number): SharedChapterData {
  return {
    title: chapter.title,
    kind: chapter.kind,
    number: chapter.number,
    order,
    scenes: chapter.scenes.map((scene) => ({
      title: scene.title,
      content: scene.content,
      plainText: scene.plainText,
      wordCount: scene.wordCount,
    })),
  }
}

/** Rebuilds the reader's book shape from fetched share data. */
export function bookFromShared(chapters: SharedChapterData[]): BookChapter[] {
  return [...chapters]
    .sort((a, b) => a.order - b.order)
    .map((chapter, index) => ({
      id: `shared-${index}`,
      title: chapter.title,
      kind: chapter.kind as BookChapter['kind'],
      number: chapter.number,
      scenes: chapter.scenes.map(
        (scene, sceneIndex) =>
          ({
            id: `shared-${index}-${sceneIndex}`,
            createdAt: 0,
            updatedAt: 0,
            projectId: '',
            chapterId: `shared-${index}`,
            title: scene.title,
            order: sceneIndex,
            content: scene.content,
            plainText: scene.plainText,
            wordCount: scene.wordCount,
            status: 'done',
            povCharacterId: null,
            locationCodexId: null,
            summary: '',
            beats: [],
            labels: [],
            linkedCodexIds: [],
          }) as Scene,
      ),
      wordCount: chapter.scenes.reduce((sum, scene) => sum + scene.wordCount, 0),
    }))
}

// Must resolve to the same project the SDK writes to (`config.ts`), which
// keys off the API key's presence — a build with the key blanked falls back
// to `demo-inkwell` even if a project id is still set in the env, and the
// REST reads here have to follow it there.
const PROJECT_ID = hasRealConfig
  ? (import.meta.env.VITE_FIREBASE_PROJECT_ID as string)
  : 'demo-inkwell'

function restBase(): string {
  return useEmulator
    ? `http://127.0.0.1:8080/v1/projects/${PROJECT_ID}/databases/(default)/documents`
    : `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents`
}

type RestValue = { stringValue?: string; integerValue?: string; doubleValue?: number; nullValue?: null }
type RestDoc = { fields?: Record<string, RestValue> }

const str = (doc: RestDoc, key: string): string => doc.fields?.[key]?.stringValue ?? ''
const num = (doc: RestDoc, key: string): number => {
  const v = doc.fields?.[key]
  if (v?.integerValue !== undefined) return Number(v.integerValue)
  if (v?.doubleValue !== undefined) return v.doubleValue
  return 0
}

export type FetchedShare =
  | { state: 'found'; meta: SharedBookMeta; chapters: SharedChapterData[] }
  | { state: 'gone' }
  | { state: 'error' }

/** The whole share, or an honest reason there isn't one. */
export async function fetchShare(shareId: string): Promise<FetchedShare> {
  // The id goes into a URL path; anything outside its own alphabet is not a
  // share id and gets the not-found screen without a network trip.
  if (!/^[a-z0-9]{10,40}$/.test(shareId)) return { state: 'gone' }
  try {
    const metaRes = await fetch(`${restBase()}/shares/${shareId}`)
    if (metaRes.status === 404 || metaRes.status === 403) return { state: 'gone' }
    if (!metaRes.ok) return { state: 'error' }
    const metaDoc = (await metaRes.json()) as RestDoc
    const meta: SharedBookMeta = {
      title: str(metaDoc, 'title'),
      author: str(metaDoc, 'author'),
      chapterCount: num(metaDoc, 'chapterCount'),
      updatedAt: num(metaDoc, 'updatedAt'),
    }

    const chaptersRes = await fetch(`${restBase()}/shares/${shareId}/chapters?pageSize=300`)
    if (!chaptersRes.ok) return { state: 'error' }
    const listing = (await chaptersRes.json()) as { documents?: RestDoc[] }
    const chapters = (listing.documents ?? []).map((doc) => {
      const parsed = JSON.parse(str(doc, 'data') || '{}') as SharedChapterData
      return parsed
    })
    return { state: 'found', meta, chapters }
  } catch {
    return { state: 'error' }
  }
}

/** The link a beta reader receives. */
export function shareUrl(shareId: string): string {
  return `${window.location.origin}${window.location.pathname}#/shared/${shareId}`
}

/* ---- reader notes -------------------------------------------------------
   A suggestion box on the share: anyone holding the link can drop a note
   in (create-only, validated hard by the security rules), and only the
   book's owner can read the box. The reader's half posts through the same
   plain REST door the book is fetched through — still zero SDK bytes. */

export const NOTE_MAX = 2000
export const QUOTE_MAX = 300
export const NAME_MAX = 60

export interface ReaderNoteDraft {
  chapterIndex: number
  /** The passage the note is about, if the reader selected one. */
  quote: string
  note: string
  /** However the reader wants to sign it; empty is fine. */
  name: string
}

/**
 * Drops the pulse ping for this visit: a bare timestamp, nothing else —
 * "your book was opened", never who by. Throttled to one ping per device
 * per hour so a reader paging back and forth doesn't read as a crowd.
 * Fire-and-forget; a failed ping is nobody's problem.
 */
export function pingSharePulse(shareId: string): void {
  if (!/^[a-z0-9]{10,40}$/.test(shareId)) return
  const throttleKey = `inkwell-share-pulse-${shareId}`
  try {
    const last = Number(localStorage.getItem(throttleKey) ?? 0)
    if (Date.now() - last < 60 * 60 * 1000) return
    localStorage.setItem(throttleKey, String(Date.now()))
  } catch {
    // Storage blocked: ping anyway, just unthrottled.
  }
  void fetch(`${restBase()}/shares/${shareId}/pulse`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ fields: { at: { integerValue: String(Date.now()) } } }),
  }).catch(() => undefined)
}

/** Where this device last left off in a shared book — remembered locally,
 * never sent anywhere. */
export function readSharedBookmark(shareId: string): number {
  try {
    return Math.max(0, Number(localStorage.getItem(`inkwell-shared-bookmark-${shareId}`) ?? 0))
  } catch {
    return 0
  }
}

export function writeSharedBookmark(shareId: string, pageIndex: number): void {
  try {
    localStorage.setItem(`inkwell-shared-bookmark-${shareId}`, String(pageIndex))
  } catch {
    // Storage blocked: the reader simply starts from the cover next time.
  }
}

/** Posts a note into the share's box. Resolves false when the box refuses —
 * link revoked, rules not yet live, or the parcel over-size. */
export async function submitReaderNote(shareId: string, draft: ReaderNoteDraft): Promise<boolean> {
  if (!/^[a-z0-9]{10,40}$/.test(shareId)) return false
  const body = {
    fields: {
      chapterIndex: { integerValue: String(Math.max(0, Math.floor(draft.chapterIndex))) },
      quote: { stringValue: draft.quote.slice(0, QUOTE_MAX) },
      note: { stringValue: draft.note.slice(0, NOTE_MAX) },
      name: { stringValue: draft.name.slice(0, NAME_MAX) },
      createdAt: { integerValue: String(Date.now()) },
    },
  }
  try {
    const res = await fetch(`${restBase()}/shares/${shareId}/comments`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    return res.ok
  } catch {
    return false
  }
}
