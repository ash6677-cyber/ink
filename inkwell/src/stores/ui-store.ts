import { create } from 'zustand'

/** A palette search result on its way to the editor: which scene, and what
 * to put in the find bar once that scene is on screen. */
export interface PendingFind {
  sceneId: string
  query: string
}

interface UiState {
  sidebarCollapsed: boolean
  focusMode: boolean
  commandPaletteOpen: boolean
  manuscriptSearchOpen: boolean
  mobileNavOpen: boolean
  /** Bumped by the native "New Project" menu item so the Projects page can react from any route. */
  newProjectRequestNonce: number
  /** Set by the command palette when a prose match is chosen from another
   * route; the editor consumes it once the scene is mounted. */
  pendingFind: PendingFind | null
  toggleSidebar: () => void
  setFocusMode: (value: boolean) => void
  setCommandPaletteOpen: (value: boolean) => void
  setManuscriptSearchOpen: (value: boolean) => void
  setMobileNavOpen: (value: boolean) => void
  requestNewProject: () => void
  requestFindInScene: (sceneId: string, query: string) => void
  clearPendingFind: () => void
}

export const useUiStore = create<UiState>((set) => ({
  sidebarCollapsed: false,
  focusMode: false,
  commandPaletteOpen: false,
  manuscriptSearchOpen: false,
  mobileNavOpen: false,
  newProjectRequestNonce: 0,
  pendingFind: null,
  toggleSidebar: () => set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed })),
  setFocusMode: (value) => set({ focusMode: value }),
  setCommandPaletteOpen: (value) => set({ commandPaletteOpen: value }),
  setManuscriptSearchOpen: (value) => set({ manuscriptSearchOpen: value }),
  setMobileNavOpen: (value) => set({ mobileNavOpen: value }),
  requestNewProject: () => set((s) => ({ newProjectRequestNonce: s.newProjectRequestNonce + 1 })),
  requestFindInScene: (sceneId, query) => set({ pendingFind: { sceneId, query } }),
  clearPendingFind: () => set({ pendingFind: null }),
}))
