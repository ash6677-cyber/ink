import { EditorContent, useEditor } from '@tiptap/react'
import { useEffect, useRef } from 'react'

import { createProseExtensions } from '@/lib/editor/extensions'
import type { RichContent } from '@/types'

interface CodexBodyEditorProps {
  entryId: string
  content: RichContent
  onChange: (input: { content: RichContent; plainText: string }) => void
}

export function CodexBodyEditor({ entryId, content, onChange }: CodexBodyEditorProps) {
  const onChangeRef = useRef(onChange)
  useEffect(() => {
    onChangeRef.current = onChange
  }, [onChange])

  const editor = useEditor(
    {
      extensions: createProseExtensions('Write everything worth remembering about this entry…'),
      content: content ?? '',
      autofocus: false,
      editorProps: {
        attributes: { class: 'editor-prose focus:outline-none', spellcheck: 'true' },
      },
      onUpdate: ({ editor }) => {
        onChangeRef.current({ content: editor.getJSON(), plainText: editor.getText() })
      },
    },
    [entryId],
  )

  useEffect(() => {
    return () => {
      editor?.destroy()
    }
  }, [editor])

  return <EditorContent editor={editor} />
}
