import { EditorContent, useEditor, type Editor } from '@tiptap/react'
import { useEffect, useRef, useState } from 'react'

import { CodexHoverCard } from '@/features/editor/components/codex-hover-card'
import { CodexHighlight, setCodexHighlightEntries } from '@/lib/editor/codex-highlight'
import { createProseExtensions } from '@/lib/editor/extensions'
import { FocusDim, setFocusDimEnabled } from '@/lib/editor/focus-dim'
import { TicHighlight, setTicHighlightWords } from '@/lib/editor/tic-highlight'
import { findScrollParent } from '@/lib/editor/scroll-utils'
import { cn } from '@/lib/utils'
import { usePreferencesStore } from '@/stores/preferences-store'
import type { CodexEntry, RichContent } from '@/types'

function recenterCaret(editor: Editor, behavior: ScrollBehavior = 'auto') {
  const { from } = editor.state.selection
  const coords = editor.view.coordsAtPos(from)
  const container = findScrollParent(editor.view.dom as HTMLElement)
  if (!container) return
  const containerRect = container.getBoundingClientRect()
  const targetY = containerRect.top + containerRect.height * 0.4
  const delta = coords.top - targetY
  if (Math.abs(delta) > 2) container.scrollTo({ top: container.scrollTop + delta, behavior })
}

interface SceneEditorProps {
  sceneId: string
  content: RichContent
  measureWidthCh: number
  focusMode: boolean
  projectId: string
  codexEntries: CodexEntry[]
  /**
   * Fired on every edit with the live editor — and deliberately nothing
   * else. Serialising a document costs time proportional to its length,
   * and doing it per keystroke made a 20,000-word scene type three times
   * slower than a normal one. The owner serialises once, when it actually
   * saves.
   */
  onChange: (editor: Editor) => void
  onEditorInstance?: (editor: Editor | null) => void
}

const HOVER_HIDE_DELAY_MS = 150

export function SceneEditor({
  sceneId,
  content,
  measureWidthCh,
  focusMode,
  projectId,
  codexEntries,
  onChange,
  onEditorInstance,
}: SceneEditorProps) {
  const onChangeRef = useRef(onChange)
  const onEditorInstanceRef = useRef(onEditorInstance)
  useEffect(() => {
    onChangeRef.current = onChange
    onEditorInstanceRef.current = onEditorInstance
  }, [onChange, onEditorInstance])

  const typewriterMode = usePreferencesStore((s) => s.typewriterMode)
  const dimInactiveParagraphs = usePreferencesStore((s) => s.dimInactiveParagraphs)
  const styleTics = usePreferencesStore((s) => s.styleTics)
  const typewriterActiveRef = useRef(false)
  useEffect(() => {
    typewriterActiveRef.current = focusMode && typewriterMode
  }, [focusMode, typewriterMode])

  const [hover, setHover] = useState<{ entryId: string; rect: DOMRect } | null>(null)
  const hideTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  function cancelHide() {
    if (hideTimeoutRef.current) {
      clearTimeout(hideTimeoutRef.current)
      hideTimeoutRef.current = null
    }
  }

  function scheduleHide() {
    cancelHide()
    hideTimeoutRef.current = setTimeout(() => setHover(null), HOVER_HIDE_DELAY_MS)
  }

  const editor = useEditor(
    {
      extensions: [...createProseExtensions(), CodexHighlight, TicHighlight, FocusDim],
      content: content ?? '',
      autofocus: false,
      editorProps: {
        attributes: {
          class: 'editor-prose focus:outline-none',
          spellcheck: 'true',
        },
        handleDOMEvents: {
          mouseover: (_view, event) => {
            const target = (event.target as HTMLElement).closest<HTMLElement>(
              '[data-codex-entry-id]',
            )
            if (!target) return false
            cancelHide()
            setHover({
              entryId: target.dataset.codexEntryId!,
              rect: target.getBoundingClientRect(),
            })
            return false
          },
          mouseout: (_view, event) => {
            const target = (event.target as HTMLElement).closest<HTMLElement>(
              '[data-codex-entry-id]',
            )
            if (!target) return false
            scheduleHide()
            return false
          },
        },
      },
      onCreate: ({ editor }) => onEditorInstanceRef.current?.(editor),
      onUpdate: ({ editor }) => {
        onChangeRef.current(editor)
        if (typewriterActiveRef.current) recenterCaret(editor)
      },
      onSelectionUpdate: ({ editor }) => {
        if (typewriterActiveRef.current) recenterCaret(editor)
      },
    },
    [sceneId],
  )

  useEffect(() => {
    return () => {
      onEditorInstanceRef.current?.(null)
      editor?.destroy()
    }
  }, [editor])

  useEffect(() => {
    if (!editor) return
    setCodexHighlightEntries(editor, codexEntries)
  }, [editor, codexEntries])

  useEffect(() => {
    if (!editor) return
    setTicHighlightWords(editor, styleTics)
  }, [editor, styleTics])

  useEffect(() => {
    if (!editor) return
    setFocusDimEnabled(editor, focusMode && dimInactiveParagraphs)
  }, [editor, focusMode, dimInactiveParagraphs])

  useEffect(() => {
    if (!editor || !focusMode || !typewriterMode) return
    // After the sheet's 200ms width transition, not during it: measuring
    // mid-transition centres the caret against a page width that is still
    // changing, and the caret lands visibly off the line it was promised.
    // The entry glide is the one place smooth scrolling belongs — every
    // keystroke after it recenters instantly, because animation under a
    // moving caret reads as seasickness, not polish.
    const timer = setTimeout(() => {
      const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
      recenterCaret(editor, reduced ? 'auto' : 'smooth')
    }, 230)
    return () => clearTimeout(timer)
  }, [editor, focusMode, typewriterMode])

  const hoveredEntry = hover ? codexEntries.find((e) => e.id === hover.entryId) : undefined

  return (
    // A page to write on, rather than prose floating on the app's background.
    // A writing surface is the one thing this app exists to show, and it had
    // less presence than a settings panel: the measure was right but there
    // was no edge to it, so nothing said where the page stopped and the
    // furniture began.
    //
    // In focus mode the sheet stays — it is the writing surface, not
    // decoration — but its border and shadow go, because those are chrome and
    // focus mode is for removing chrome.
    <div
      className={cn(
        'mx-auto w-full transition-[max-width,box-shadow,border-color,background-color] duration-200',
        'px-7 sm:px-10',
        focusMode
          ? // No edge at all here, and that is the whole point of focus mode:
            // a glow around the page is exactly the sort of thing you want
            // until the moment you are actually trying to write.
            //
            // With typewriter scrolling on, the page gets a long runway of
            // padding below the last line. Without it the scrollbar clamps
            // at the bottom and the caret physically cannot be held at 40%
            // of the view — which is to say typewriter mode stops working
            // exactly where a writer lives: the end of the draft.
            typewriterMode
            ? 'my-0 min-h-full bg-transparent pt-16 pb-[55vh]'
            : 'my-0 min-h-full bg-transparent py-16'
          : // Tall enough to reach the bottom of the view even when the scene
            // is two paragraphs long. A sheet that stopped at the last line
            // read as a card containing prose rather than a page being
            // written on, and left nothing to click into below the text.
            'page-edge my-6 min-h-[calc(100%-3rem)] bg-card py-10 sm:my-8 sm:min-h-[calc(100%-4rem)]',
      )}
      style={{ maxWidth: `calc(${measureWidthCh}ch + 5rem)` }}
    >
      <EditorContent editor={editor} />
      {hover && hoveredEntry && (
        <CodexHoverCard
          entry={hoveredEntry}
          rect={hover.rect}
          projectId={projectId}
          onMouseEnter={cancelHide}
          onMouseLeave={scheduleHide}
        />
      )}
    </div>
  )
}
