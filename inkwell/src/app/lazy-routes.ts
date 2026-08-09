import { lazy } from 'react'

export const ProjectsHome = lazy(() =>
  import('@/features/projects/routes/projects-home').then((m) => ({ default: m.ProjectsHome })),
)
export const BookCreatorWizard = lazy(() =>
  import('@/features/book-creator/routes/book-creator-wizard').then((m) => ({
    default: m.BookCreatorWizard,
  })),
)
export const EditorHome = lazy(() =>
  import('@/features/editor/routes/editor-home').then((m) => ({ default: m.EditorHome })),
)
export const CodexHome = lazy(() =>
  import('@/features/almanac/routes/codex-home').then((m) => ({ default: m.CodexHome })),
)
export const CodexEntryDetail = lazy(() =>
  import('@/features/almanac/routes/codex-entry-detail').then((m) => ({
    default: m.CodexEntryDetail,
  })),
)
export const PlaygroundShell = lazy(() =>
  import('@/features/playground/components/playground-shell').then((m) => ({
    default: m.PlaygroundShell,
  })),
)
export const CardsHome = lazy(() =>
  import('@/features/playground/routes/cards-home').then((m) => ({ default: m.CardsHome })),
)
export const CardDetail = lazy(() =>
  import('@/features/playground/routes/card-detail').then((m) => ({ default: m.CardDetail })),
)
export const ChatsHome = lazy(() =>
  import('@/features/playground/routes/chats-home').then((m) => ({ default: m.ChatsHome })),
)
export const CardChat = lazy(() =>
  import('@/features/playground/routes/card-chat').then((m) => ({ default: m.CardChat })),
)
export const PersonasHome = lazy(() =>
  import('@/features/playground/routes/personas-home').then((m) => ({ default: m.PersonasHome })),
)
export const LorebooksHome = lazy(() =>
  import('@/features/playground/routes/lorebooks-home').then((m) => ({ default: m.LorebooksHome })),
)
export const LegacyChatRedirect = lazy(() =>
  import('@/features/playground/routes/legacy-chat-redirect').then((m) => ({
    default: m.LegacyChatRedirect,
  })),
)
export const ReaderHome = lazy(() =>
  import('@/features/reader/routes/reader-home').then((m) => ({ default: m.ReaderHome })),
)

export const PlanningHome = lazy(() =>
  import('@/features/planning/routes/planning-home').then((m) => ({ default: m.PlanningHome })),
)
export const CoversHome = lazy(() =>
  import('@/features/covers/routes/covers-home').then((m) => ({ default: m.CoversHome })),
)
export const SeriesHome = lazy(() =>
  import('@/features/series/routes/series-home').then((m) => ({ default: m.SeriesHome })),
)
export const SeriesDetail = lazy(() =>
  import('@/features/series/routes/series-detail').then((m) => ({ default: m.SeriesDetail })),
)
export const StatsHome = lazy(() =>
  import('@/features/stats/routes/stats-home').then((m) => ({ default: m.StatsHome })),
)
export const SettingsHome = lazy(() =>
  import('@/features/settings/routes/settings-home').then((m) => ({ default: m.SettingsHome })),
)
