import { Suspense } from 'react'
import { createHashRouter, Navigate } from 'react-router-dom'

import {
  BookCreatorWizard,
  CardChat,
  CardDetail,
  CardsHome,
  ChatsHome,
  CodexEntryDetail,
  CodexHome,
  CoversHome,
  EditorHome,
  LegacyChatRedirect,
  LorebooksHome,
  PersonasHome,
  PlanningHome,
  PlaygroundShell,
  ReaderHome,
  ProjectsHome,
  SeriesDetail,
  SeriesHome,
  SettingsHome,
  SharedReader,
  StatsHome,
} from '@/app/lazy-routes'
import { AppShell } from '@/app/layout/app-shell'
import { RouteError } from '@/components/common/route-error'
import { RouteLoading } from '@/components/common/route-loading'
import { LegacyAlmanacRedirect } from '@/app/legacy-almanac-redirect'
import { LegacyPlaygroundRedirect } from '@/app/legacy-playground-redirect'

function withSuspense(element: React.ReactNode) {
  return <Suspense fallback={<RouteLoading />}>{element}</Suspense>
}

/**
 * Every screen gets its own error boundary so a failure stays inside the
 * content area and the nav survives — a writer who hits a broken screen can
 * still click their way back to the manuscript. A route without one would
 * bubble to the root and take the whole shell down with it.
 */
function screen(path: string, element: React.ReactNode) {
  return { path, element: withSuspense(element), errorElement: <RouteError /> }
}

// Hash-based routing (`#/projects` instead of `/projects`) so the app works
// identically whether it's served by a dev server with SPA fallback or
// loaded as static files from a packaged desktop shell, which has no server
// to rewrite arbitrary paths back to index.html.
export const router = createHashRouter([
  // The beta-reader page lives outside the shell on purpose: someone opening
  // a share link is a guest, not a user — they get the book, not the app's
  // nav rail, command palette, or sync machinery.
  screen('shared/:shareId', <SharedReader />),
  {
    element: <AppShell />,
    errorElement: <RouteError />,
    children: [
      { index: true, element: <Navigate to="/projects" replace /> },
      screen('projects', <ProjectsHome />),
      screen('book-creator', <BookCreatorWizard />),
      screen('editor', <EditorHome />),
      screen('almanac', <CodexHome />),
      screen('almanac/:entryId', <CodexEntryDetail />),
      // The Almanac used to be called the Codex. Any link a writer bookmarked
      // or pasted into their own notes under the old path still opens.
      { path: 'codex', element: <Navigate to="/almanac" replace /> },
      { path: 'codex/:entryId', element: <LegacyAlmanacRedirect /> },

      // The Playground. One destination with four rooms, where there used to
      // be a gallery called "Cards" that quietly also contained a chat, a set
      // of personas and the lorebooks those chats draw on.
      {
        path: 'playground',
        element: withSuspense(<PlaygroundShell />),
        errorElement: <RouteError />,
        children: [
          { index: true, element: <LegacyPlaygroundRedirect to="cards" /> },
          screen('cards', <CardsHome />),
          screen('cards/:cardId', <CardDetail />),
          screen('chats', <ChatsHome />),
          screen('chats/:chatId', <CardChat />),
          screen('personas', <PersonasHome />),
          screen('lorebooks', <LorebooksHome />),
        ],
      },

      // The addresses those four rooms had before they were one place. Every
      // one of them keeps `?project=`, so a bookmark opens the same book it
      // was saved from.
      { path: 'cards', element: <LegacyPlaygroundRedirect to="cards" /> },
      { path: 'cards/:cardId', element: <LegacyPlaygroundRedirect to="cards" param="cardId" /> },
      { path: 'cards/:cardId/chat', element: withSuspense(<LegacyChatRedirect />) },
      { path: 'lorebooks', element: <LegacyPlaygroundRedirect to="lorebooks" /> },

      screen('planning', <PlanningHome />),
      screen('read', <ReaderHome />),
      screen('covers', <CoversHome />),
      screen('series', <SeriesHome />),
      screen('series/:seriesId', <SeriesDetail />),
      screen('stats', <StatsHome />),
      screen('settings', <SettingsHome />),
      { path: '*', element: <Navigate to="/projects" replace /> },
    ],
  },
])
