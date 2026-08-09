/**
 * The writer's half of sharing: publish, update, revoke. Loads the Firebase
 * SDK dynamically — these run behind a sign-in, where the SDK is already
 * paid for — and writes under rules that let anyone read a share but only
 * its owner touch it.
 */

import type { BookChapter } from '@/features/reader/lib/compile-book'
import { chapterPayload, newShareId } from '@/features/reader/lib/share-book'
import { projectRepo } from '@/lib/db/repositories'
import type { Project } from '@/types'

async function deps() {
  const [fs, cfg] = await Promise.all([import('firebase/firestore'), import('@/lib/firebase/config')])
  const uid = (await import('@/stores/auth-store')).useAuthStore.getState().user?.uid
  if (!uid) throw new Error('Sharing needs a signed-in account.')
  return { fs, db: cfg.firestore, uid }
}

/**
 * Publishes (or refreshes) the read-only copy and returns the share id.
 * The id is minted once and kept on the project, so the link survives
 * updates — re-sharing a revised draft never breaks the URL already sent.
 */
export async function publishShare(project: Project, book: BookChapter[]): Promise<string> {
  const { fs, db, uid } = await deps()
  const shareId = project.shareId ?? newShareId()

  const previousCount = project.shareChapterCount ?? 0

  await fs.setDoc(fs.doc(db, 'shares', shareId), {
    ownerUid: uid,
    title: project.title,
    author: project.author,
    chapterCount: book.length,
    updatedAt: Date.now(),
  })
  for (let i = 0; i < book.length; i++) {
    await fs.setDoc(fs.doc(db, 'shares', shareId, 'chapters', String(i)), {
      order: i,
      data: JSON.stringify(chapterPayload(book[i], i)),
    })
  }
  // A shorter book than last time leaves stale chapter docs behind unless
  // they're swept — a beta reader would see the deleted ending.
  for (let i = book.length; i < previousCount; i++) {
    await fs.deleteDoc(fs.doc(db, 'shares', shareId, 'chapters', String(i)))
  }

  await projectRepo.update(project.id, { shareId, shareChapterCount: book.length })
  return shareId
}

/** Takes the copy down. The local book is untouched; only the share dies —
 * chapters, reader notes and all. */
export async function revokeShare(project: Project): Promise<void> {
  if (!project.shareId) return
  const { fs, db } = await deps()
  const count = project.shareChapterCount ?? 0
  for (let i = 0; i < count; i++) {
    await fs.deleteDoc(fs.doc(db, 'shares', project.shareId, 'chapters', String(i)))
  }
  const notes = await fs.getDocsFromServer(fs.collection(db, 'shares', project.shareId, 'comments'))
  for (const doc of notes.docs) {
    await fs.deleteDoc(doc.ref)
  }
  const pings = await fs.getDocsFromServer(fs.collection(db, 'shares', project.shareId, 'pulse'))
  for (const doc of pings.docs) {
    await fs.deleteDoc(doc.ref)
  }
  await fs.deleteDoc(fs.doc(db, 'shares', project.shareId))
  await projectRepo.update(project.id, { shareId: null, shareChapterCount: 0 })
}

export interface ReaderNote {
  id: string
  chapterIndex: number
  quote: string
  note: string
  name: string
  createdAt: number
}

/** The suggestion box, newest first. Owner-only by rule.
 *
 * `getDocsFromServer`, not `getDocs`: reader notes are written by strangers
 * over plain REST, so they never pass through this SDK's IndexedDB cache.
 * A cache-first read returns an empty box every time — the notes are on the
 * server and nowhere the cache has looked. */
export async function fetchReaderNotes(shareId: string): Promise<ReaderNote[]> {
  const { fs, db } = await deps()
  const snapshot = await fs.getDocsFromServer(fs.collection(db, 'shares', shareId, 'comments'))
  return snapshot.docs
    .map((doc) => {
      const data = doc.data()
      return {
        id: doc.id,
        chapterIndex: Number(data.chapterIndex ?? 0),
        quote: String(data.quote ?? ''),
        note: String(data.note ?? ''),
        name: String(data.name ?? ''),
        createdAt: Number(data.createdAt ?? 0),
      }
    })
    .sort((a, b) => b.createdAt - a.createdAt)
}

export async function deleteReaderNote(shareId: string, noteId: string): Promise<void> {
  const { fs, db } = await deps()
  await fs.deleteDoc(fs.doc(db, 'shares', shareId, 'comments', noteId))
}

export interface SharePulse {
  opens: number
  lastOpenedAt: number | null
}

/** How often the shared book has been opened, and when last. Server-read
 * for the same reason as the notes: pings arrive from outside this SDK. */
export async function fetchSharePulse(shareId: string): Promise<SharePulse> {
  const { fs, db } = await deps()
  const snapshot = await fs.getDocsFromServer(fs.collection(db, 'shares', shareId, 'pulse'))
  let last = 0
  for (const doc of snapshot.docs) {
    const at = Number(doc.data().at ?? 0)
    if (at > last) last = at
  }
  return { opens: snapshot.size, lastOpenedAt: last > 0 ? last : null }
}
