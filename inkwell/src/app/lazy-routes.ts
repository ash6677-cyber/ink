import { lazy } from 'react'

/**
 * One loader per screen, shared by the lazy components below and by the
 * idle prefetcher (`prefetch-routes.ts`) — both call the same `import()`,
 * so warming a route and navigating to it hit the same cached chunk.
 */
export const routeLoaders = {
  ProjectsHome: () => import('@/features/projects/routes/projects-home'),
  BookCreatorWizard: () => import('@/features/book-creator/routes/book-creator-wizard'),
  EditorHome: () => import('@/features/editor/routes/editor-home'),
  CodexHome: () => import('@/features/almanac/routes/codex-home'),
  CodexEntryDetail: () => import('@/features/almanac/routes/codex-entry-detail'),
  PlaygroundShell: () => import('@/features/playground/components/playground-shell'),
  CardsHome: () => import('@/features/playground/routes/cards-home'),
  CardDetail: () => import('@/features/playground/routes/card-detail'),
  ChatsHome: () => import('@/features/playground/routes/chats-home'),
  CardChat: () => import('@/features/playground/routes/card-chat'),
  PersonasHome: () => import('@/features/playground/routes/personas-home'),
  LorebooksHome: () => import('@/features/playground/routes/lorebooks-home'),
  LegacyChatRedirect: () => import('@/features/playground/routes/legacy-chat-redirect'),
  ReaderHome: () => import('@/features/reader/routes/reader-home'),
  SharedReader: () => import('@/features/reader/routes/shared-reader'),
  PlanningHome: () => import('@/features/planning/routes/planning-home'),
  CoversHome: () => import('@/features/covers/routes/covers-home'),
  SeriesHome: () => import('@/features/series/routes/series-home'),
  SeriesDetail: () => import('@/features/series/routes/series-detail'),
  StatsHome: () => import('@/features/stats/routes/stats-home'),
  SettingsHome: () => import('@/features/settings/routes/settings-home'),
}

export const ProjectsHome = lazy(() =>
  routeLoaders.ProjectsHome().then((m) => ({ default: m.ProjectsHome })),
)
export const BookCreatorWizard = lazy(() =>
  routeLoaders.BookCreatorWizard().then((m) => ({ default: m.BookCreatorWizard })),
)
export const EditorHome = lazy(() =>
  routeLoaders.EditorHome().then((m) => ({ default: m.EditorHome })),
)
export const CodexHome = lazy(() => routeLoaders.CodexHome().then((m) => ({ default: m.CodexHome })))
export const CodexEntryDetail = lazy(() =>
  routeLoaders.CodexEntryDetail().then((m) => ({ default: m.CodexEntryDetail })),
)
export const PlaygroundShell = lazy(() =>
  routeLoaders.PlaygroundShell().then((m) => ({ default: m.PlaygroundShell })),
)
export const CardsHome = lazy(() => routeLoaders.CardsHome().then((m) => ({ default: m.CardsHome })))
export const CardDetail = lazy(() =>
  routeLoaders.CardDetail().then((m) => ({ default: m.CardDetail })),
)
export const ChatsHome = lazy(() => routeLoaders.ChatsHome().then((m) => ({ default: m.ChatsHome })))
export const CardChat = lazy(() => routeLoaders.CardChat().then((m) => ({ default: m.CardChat })))
export const PersonasHome = lazy(() =>
  routeLoaders.PersonasHome().then((m) => ({ default: m.PersonasHome })),
)
export const LorebooksHome = lazy(() =>
  routeLoaders.LorebooksHome().then((m) => ({ default: m.LorebooksHome })),
)
export const LegacyChatRedirect = lazy(() =>
  routeLoaders.LegacyChatRedirect().then((m) => ({ default: m.LegacyChatRedirect })),
)
export const ReaderHome = lazy(() =>
  routeLoaders.ReaderHome().then((m) => ({ default: m.ReaderHome })),
)
export const SharedReader = lazy(() =>
  routeLoaders.SharedReader().then((m) => ({ default: m.SharedReader })),
)
export const PlanningHome = lazy(() =>
  routeLoaders.PlanningHome().then((m) => ({ default: m.PlanningHome })),
)
export const CoversHome = lazy(() =>
  routeLoaders.CoversHome().then((m) => ({ default: m.CoversHome })),
)
export const SeriesHome = lazy(() =>
  routeLoaders.SeriesHome().then((m) => ({ default: m.SeriesHome })),
)
export const SeriesDetail = lazy(() =>
  routeLoaders.SeriesDetail().then((m) => ({ default: m.SeriesDetail })),
)
export const StatsHome = lazy(() => routeLoaders.StatsHome().then((m) => ({ default: m.StatsHome })))
export const SettingsHome = lazy(() =>
  routeLoaders.SettingsHome().then((m) => ({ default: m.SettingsHome })),
)
