import { Extension, type Editor } from '@tiptap/core'
import type { Node as ProseMirrorNode } from '@tiptap/pm/model'
import { Plugin, PluginKey } from '@tiptap/pm/state'
import { Decoration, DecorationSet } from '@tiptap/pm/view'

import { buildTicRegex } from '@/lib/editor/style-tics'

/**
 * Underlines the writer's style tics wherever they occur, so a habit the
 * eye has stopped seeing becomes visible on the page. It only ever marks;
 * it never changes a word. Structurally a sibling of the Codex highlighter
 * — a decoration plugin fed a regex — but its own plugin so the two never
 * fight over the same decoration set.
 */

interface TicHighlightState {
  regex: RegExp | null
  decorations: DecorationSet
}

export const ticHighlightPluginKey = new PluginKey<TicHighlightState>('ticHighlight')

function buildDecorations(doc: ProseMirrorNode, regex: RegExp | null): DecorationSet {
  if (!regex) return DecorationSet.empty
  const out: Decoration[] = []
  doc.descendants((node, pos) => {
    if (!node.isText || !node.text) return true
    regex.lastIndex = 0
    let match: RegExpExecArray | null
    while ((match = regex.exec(node.text))) {
      out.push(
        Decoration.inline(pos + match.index, pos + match.index + match[0].length, {
          class: 'tic-highlight',
        }),
      )
      if (match[0].length === 0) regex.lastIndex++
    }
    return true
  })
  return DecorationSet.create(doc, out)
}

export function createTicHighlightPlugin() {
  return new Plugin<TicHighlightState>({
    key: ticHighlightPluginKey,
    state: {
      init: () => ({ regex: null, decorations: DecorationSet.empty }),
      apply(tr, prev) {
        const meta = tr.getMeta(ticHighlightPluginKey) as { tics: string[] } | undefined
        if (meta) {
          const regex = buildTicRegex(meta.tics)
          return { regex, decorations: buildDecorations(tr.doc, regex) }
        }
        if (!tr.docChanged || !prev.regex) return prev
        // The watchlist is small and the full rescan is cheap next to the
        // Codex index; a whole-document pass on change keeps this simple and
        // correct without the block-mapping the Codex plugin needs.
        return { regex: prev.regex, decorations: buildDecorations(tr.doc, prev.regex) }
      },
    },
    props: {
      decorations(state) {
        return ticHighlightPluginKey.getState(state)?.decorations
      },
    },
  })
}

export const TicHighlight = Extension.create({
  name: 'ticHighlight',
  addProseMirrorPlugins() {
    return [createTicHighlightPlugin()]
  },
})

/** Pushes a fresh watchlist into the running editor's tic plugin. */
export function setTicHighlightWords(editor: Editor, tics: string[]) {
  const tr = editor.view.state.tr.setMeta(ticHighlightPluginKey, { tics })
  editor.view.dispatch(tr)
}
