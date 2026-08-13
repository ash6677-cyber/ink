import type { StoryPromise } from '@/types'

/**
 * The promises & payoffs ledger — Chekhov's gun, tracked.
 *
 * A promise is made in one scene (the setup) and paid off in another, or
 * not yet. Everything here is arithmetic over reading order: how far a
 * promise has been left waiting, whether its payoff lands before its setup
 * (which is a wiring mistake, not a flashback), and the screen every
 * reader wishes writers had — what is still unpaid at the end of the book.
 */

export type PromiseStatus = 'open' | 'paid' | 'backwards'

export interface LedgerEntry {
  promise: StoryPromise
  status: PromiseStatus
  /** Index of the setup scene in reading order, or null if that scene is gone. */
  setupIndex: number | null
  setupTitle: string
  payoffIndex: number | null
  payoffTitle: string | null
  /** Scenes the promise spans: setup → payoff when paid, setup → end when open. */
  span: number
}

export interface PromiseLedger {
  entries: LedgerEntry[]
  open: number
  paid: number
  /** Open promises in the order they were made — the end-of-book screen. */
  unpaid: LedgerEntry[]
}

/** A short title suggested from the marked passage — first words, tidied. */
export function suggestTitle(quote: string, maxWords = 6): string {
  const words = quote.replace(/\s+/g, ' ').trim().split(' ').filter(Boolean)
  if (words.length === 0) return ''
  const head = words.slice(0, maxWords).join(' ')
  const tidy = head.replace(/[,;:.!?"'“”‘’]+$/, '')
  return words.length > maxWords ? `${tidy}…` : tidy
}

export function buildLedger(
  promises: StoryPromise[],
  orderedScenes: { id: string; title: string }[],
): PromiseLedger {
  const indexById = new Map(orderedScenes.map((scene, index) => [scene.id, index]))
  const titleById = new Map(orderedScenes.map((scene) => [scene.id, scene.title]))
  const lastIndex = orderedScenes.length - 1

  const entries = promises.map((promise): LedgerEntry => {
    const setupIndex = indexById.get(promise.setupSceneId) ?? null
    const payoffIndex = promise.payoffSceneId
      ? (indexById.get(promise.payoffSceneId) ?? null)
      : null

    let status: PromiseStatus = payoffIndex === null ? 'open' : 'paid'
    // A payoff the reader meets before its setup isn't a payoff at all.
    if (setupIndex !== null && payoffIndex !== null && payoffIndex < setupIndex) {
      status = 'backwards'
    }

    const span =
      setupIndex === null
        ? 0
        : payoffIndex !== null
          ? Math.abs(payoffIndex - setupIndex)
          : Math.max(0, lastIndex - setupIndex)

    return {
      promise,
      status,
      setupIndex,
      setupTitle: titleById.get(promise.setupSceneId) ?? 'A deleted scene',
      payoffIndex,
      payoffTitle: promise.payoffSceneId
        ? (titleById.get(promise.payoffSceneId) ?? 'A deleted scene')
        : null,
      span,
    }
  })

  // Reading order — the order the promises are made in the book, promises
  // whose setup scene has vanished gathered at the end.
  entries.sort((a, b) => (a.setupIndex ?? Infinity) - (b.setupIndex ?? Infinity))

  const unpaid = entries.filter((entry) => entry.status !== 'paid')
  return {
    entries,
    open: unpaid.length,
    paid: entries.length - unpaid.length,
    unpaid,
  }
}
