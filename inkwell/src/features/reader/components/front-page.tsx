import { useLiveQuery } from 'dexie-react-hooks'

import { resolveCoverThumbnail } from '@/features/covers/lib/resolve-cover'
import { useObjectUrl } from '@/lib/hooks/use-object-url'
import type { PageMetrics } from '@/features/reader/components/page-surface'

interface FrontPageProps {
  projectId: string
  title: string
  author: string
  metrics: PageMetrics
  /** A cover that arrived with a shared book, already vetted. When set it
   * wins outright — a shared reader has no local library to look in. */
  coverDataUrl?: string | null
}

/** Drawn at print width so the art is sharp on the page and on a retina screen. */
const COVER_WIDTH = 1200

/**
 * The page the book opens on.
 *
 * The reader used to begin mid-sentence at chapter one, which is the one way
 * a book never begins. A cover exists for most projects by now — the studio
 * makes one, the shelf shows it, the box set prints it — and this is the
 * place a reader most expects to meet it.
 *
 * A project with no cover art still gets a front page rather than none: a
 * title page is what a book has when it has no jacket, and opening on the
 * title and the author's name is the right first thing either way.
 */
export function FrontPage({ projectId, title, author, metrics, coverDataUrl }: FrontPageProps) {
  const coverBlob = useLiveQuery(
    // A shared book has no library to look in; don't even ask.
    () => (projectId ? resolveCoverThumbnail(projectId, COVER_WIDTH) : Promise.resolve(null)),
    [projectId],
  )
  const localUrl = useObjectUrl(coverBlob)
  const coverUrl = coverDataUrl ?? localUrl

  return (
    <div
      className="book-page book-front-page"
      style={{ width: metrics.width, height: metrics.height }}
    >
      {coverUrl ? (
        // Contained rather than cropped. A cover is a composition someone
        // laid out; filling the page would cut the title off it.
        <img src={coverUrl} alt={`Cover of ${title}`} className="book-front-art" />
      ) : (
        <div className="book-front-type">
          <h1 className="book-front-title">{title}</h1>
          {author && <p className="book-front-author">{author}</p>}
        </div>
      )}
    </div>
  )
}
