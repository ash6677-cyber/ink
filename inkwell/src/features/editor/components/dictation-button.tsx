import type { Editor } from '@tiptap/react'
import { Loader2, Mic, MicOff } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'

import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { useToast } from '@/components/ui/use-toast'
import { applySpokenCommands } from '@/features/editor/lib/dictation'
import { useAiStore } from '@/stores/ai-store'
import { usePreferencesStore } from '@/stores/preferences-store'

/** The browser's own recognizer, under either of its names. */
type RecognitionCtor = new () => {
  continuous: boolean
  interimResults: boolean
  lang: string
  onresult: ((event: { resultIndex: number; results: ArrayLike<{ isFinal: boolean; 0: { transcript: string } }> }) => void) | null
  onend: (() => void) | null
  onerror: ((event: { error: string }) => void) | null
  start: () => void
  stop: () => void
}

function browserRecognition(): RecognitionCtor | null {
  const w = window as unknown as {
    SpeechRecognition?: RecognitionCtor
    webkitSpeechRecognition?: RecognitionCtor
  }
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null
}

/**
 * Talk a scene in. Browser speech recognition where it exists — free,
 * on-device — with a Whisper-compatible fallback on the writer's own key
 * where it doesn't. Spoken punctuation ("comma", "new paragraph") lands
 * as marks, and everything goes into the editor at the cursor.
 */
export function DictationButton({ editor }: { editor: Editor | null }) {
  const { toast } = useToast()
  const providers = useAiStore((s) => s.providers)
  const featureProviders = usePreferencesStore((s) => s.featureProviders)

  const [listening, setListening] = useState(false)
  const [transcribing, setTranscribing] = useState(false)
  const recognitionRef = useRef<InstanceType<RecognitionCtor> | null>(null)
  const recorderRef = useRef<MediaRecorder | null>(null)
  // Kept in a ref so a long-running recognition session always inserts
  // into the editor that exists NOW, not the one from when it started.
  const editorRef = useRef(editor)
  useEffect(() => {
    editorRef.current = editor
  }, [editor])

  useEffect(() => () => {
    recognitionRef.current?.stop()
    recorderRef.current?.stop()
  }, [])

  function insert(text: string) {
    const target = editorRef.current
    if (!target || !text.trim()) return
    const typed = applySpokenCommands(text)
    const escape = (part: string) =>
      part.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    const parts = typed.split(/\n{2,}/)
    // A spoken paragraph break becomes a real paragraph; anything shorter
    // flows in at the cursor as plain text.
    const content =
      parts.length === 1 ? escape(typed) : parts.map((part) => `<p>${escape(part)}</p>`).join('')
    target.chain().focus().insertContent(content).run()
  }

  function startBrowser(Recognition: RecognitionCtor) {
    const recognition = new Recognition()
    recognition.continuous = true
    recognition.interimResults = false
    recognition.lang = navigator.language || 'en-US'
    recognition.onresult = (event) => {
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i]
        if (result.isFinal) insert(` ${result[0].transcript}`)
      }
    }
    recognition.onerror = (event) => {
      setListening(false)
      if (event.error !== 'aborted') {
        toast({ title: 'Dictation stopped', description: event.error, variant: 'destructive' })
      }
    }
    recognition.onend = () => setListening(false)
    recognitionRef.current = recognition
    recognition.start()
    setListening(true)
  }

  /** The BYOK fallback: record, then POST to the key's Whisper-compatible
   * /audio/transcriptions. Only the writer's own configured endpoint. */
  async function startWhisper() {
    const provider =
      providers.find((p) => p.id === featureProviders.dictation && p.enabled) ??
      providers.find((p) => p.enabled)
    if (!provider) {
      toast({ title: 'Add an AI key in Settings first', description: 'This browser has no built-in speech recognition, so dictation needs your Whisper-compatible key.', variant: 'destructive' })
      return
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const recorder = new MediaRecorder(stream)
      const parts: Blob[] = []
      recorder.ondataavailable = (e) => parts.push(e.data)
      recorder.onstop = () => {
        void (async () => {
          stream.getTracks().forEach((t) => t.stop())
          setListening(false)
          setTranscribing(true)
          try {
            const form = new FormData()
            form.append('file', new Blob(parts, { type: recorder.mimeType }), 'dictation.webm')
            form.append('model', 'whisper-1')
            const base = provider.baseUrl?.replace(/\/$/, '') ?? ''
            const res = await fetch(`${base}/audio/transcriptions`, {
              method: 'POST',
              headers: { Authorization: `Bearer ${provider.apiKey}` },
              body: form,
            })
            if (!res.ok) throw new Error(`The endpoint said ${res.status}.`)
            const data = (await res.json()) as { text?: string }
            if (data.text) insert(` ${data.text}`)
          } catch (error) {
            toast({
              title: 'Transcription failed',
              description: error instanceof Error ? error.message : undefined,
              variant: 'destructive',
            })
          } finally {
            setTranscribing(false)
          }
        })()
      }
      recorderRef.current = recorder
      recorder.start()
      setListening(true)
    } catch {
      toast({ title: 'Microphone unavailable', variant: 'destructive' })
    }
  }

  function toggle() {
    if (listening) {
      recognitionRef.current?.stop()
      recognitionRef.current = null
      if (recorderRef.current?.state === 'recording') recorderRef.current.stop()
      recorderRef.current = null
      setListening(false)
      return
    }
    const Recognition = browserRecognition()
    if (Recognition) startBrowser(Recognition)
    else void startWhisper()
  }

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant={listening ? 'secondary' : 'ghost'}
          size="icon"
          onClick={toggle}
          aria-label={listening ? 'Stop dictation' : 'Dictate into this scene'}
          aria-pressed={listening}
          data-dictating={listening || undefined}
        >
          {transcribing ? (
            <Loader2 className="size-4 animate-spin" />
          ) : listening ? (
            <MicOff className="size-4 text-destructive" />
          ) : (
            <Mic className="size-4" />
          )}
        </Button>
      </TooltipTrigger>
      <TooltipContent>
        {listening
          ? 'Stop dictation'
          : 'Dictate — say “comma”, “period”, “new paragraph” for punctuation'}
      </TooltipContent>
    </Tooltip>
  )
}
