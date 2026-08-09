import { useLiveQuery } from 'dexie-react-hooks'
import { ImagePlus, Loader2, X } from 'lucide-react'
import { useRef, useState } from 'react'

import { Button } from '@/components/ui/button'
import { useToast } from '@/components/ui/use-toast'
import { imageAssetRepo } from '@/lib/db/repositories'
import { useObjectUrl } from '@/lib/hooks/use-object-url'
import { storeImageFile } from '@/lib/image-upload'

interface ImageUploadFieldProps {
  imageId: string | null
  onChange: (imageId: string | null) => void
}

export function ImageUploadField({ imageId, onChange }: ImageUploadFieldProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)
  const { toast } = useToast()

  const image = useLiveQuery(
    () => (imageId ? imageAssetRepo.get(imageId) : Promise.resolve(undefined)),
    [imageId],
  )
  const imageUrl = useObjectUrl(image?.blob)

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    if (!file.type.startsWith('image/')) {
      toast({ title: 'Please choose an image file', variant: 'destructive' })
      return
    }
    setUploading(true)
    try {
      const asset = await storeImageFile(file)
      onChange(asset.id)
    } catch {
      toast({ title: 'Could not read that image', variant: 'destructive' })
    } finally {
      setUploading(false)
    }
  }

  return (
    <div className="group relative flex aspect-[4/3] items-center justify-center overflow-hidden rounded-lg border border-dashed border-border bg-muted">
      {imageUrl ? (
        <>
          <img src={imageUrl} alt="" className="size-full object-cover" />
          <div className="absolute inset-0 flex items-center justify-center gap-2 bg-black/40 opacity-0 transition-opacity group-hover:opacity-100">
            <Button
              type="button"
              size="sm"
              variant="secondary"
              onClick={() => inputRef.current?.click()}
            >
              Replace
            </Button>
            <Button
              type="button"
              size="sm"
              variant="secondary"
              onClick={() => onChange(null)}
              aria-label="Remove image"
            >
              <X className="size-3.5" />
            </Button>
          </div>
        </>
      ) : (
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={uploading}
          className="flex flex-col items-center gap-1.5 text-muted-foreground hover:text-foreground"
        >
          {uploading ? (
            <Loader2 className="size-6 animate-spin" />
          ) : (
            <ImagePlus className="size-6" strokeWidth={1.5} />
          )}
          <span className="text-xs">{uploading ? 'Uploading…' : 'Add image'}</span>
        </button>
      )}
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        onChange={handleFileChange}
        className="hidden"
      />
    </div>
  )
}
