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

/** Takes the copy down. The local book is untouched; only the share dies. */
export async function revokeShare(project: Project): Promise<void> {
  if (!project.shareId) return
  const { fs, db } = await deps()
  const count = project.shareChapterCount ?? 0
  for (let i = 0; i < count; i++) {
    await fs.deleteDoc(fs.doc(db, 'shares', project.shareId, 'chapters', String(i)))
  }
  await fs.deleteDoc(fs.doc(db, 'shares', project.shareId))
  await projectRepo.update(project.id, { shareId: null, shareChapterCount: 0 })
}
