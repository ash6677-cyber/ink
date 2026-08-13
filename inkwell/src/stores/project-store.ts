import { create } from 'zustand'

import { applyTemplate } from '@/features/templates/lib/apply-template'
import { db } from '@/lib/db/schema'
import { binProject } from '@/stores/trash-store'
import { findTemplate, templateChoices, useTemplateStore } from '@/stores/template-store'
import { projectRepo } from '@/lib/db/repositories'
import type { BookMatter, Project } from '@/types'

export interface ProjectFormInput {
  title: string
  author: string
  genre: string
  synopsis: string
  targetWordCount: number
  status: Project['status']
  pov: Project['settings']['pov']
  tense: Project['settings']['tense']
  structureMode: Project['settings']['structureMode']
  /** A look of this book's own, or null to follow the app's. */
  themeId: string | null
  /**
   * Which format to lay the manuscript out in. Only read when creating —
   * a book already has its shape, and re-applying a template to it would
   * add a second prologue rather than change anything.
   */
  templateId?: string | null
  /** Front & back matter — dedication, epigraph, acknowledgments, about
   * the author. Absent sections stay empty strings. */
  matter?: BookMatter
}

type LoadStatus = 'idle' | 'loading' | 'ready' | 'error'

interface ProjectStoreState {
  projects: Project[]
  wordCounts: Record<string, number>
  status: LoadStatus
  error: string | null
  fetchProjects: () => Promise<void>
  createProject: (input: ProjectFormInput) => Promise<Project>
  updateProject: (id: string, input: ProjectFormInput) => Promise<void>
  deleteProject: (id: string) => Promise<void>
}

export const useProjectStore = create<ProjectStoreState>((set, get) => ({
  projects: [],
  wordCounts: {},
  status: 'idle',
  error: null,

  fetchProjects: async () => {
    set({ status: 'loading', error: null })
    try {
      const [projects, scenes] = await Promise.all([projectRepo.list(), db.scenes.toArray()])
      projects.sort((a, b) => b.updatedAt - a.updatedAt)
      const wordCounts: Record<string, number> = {}
      for (const scene of scenes) {
        wordCounts[scene.projectId] = (wordCounts[scene.projectId] ?? 0) + scene.wordCount
      }
      set({ projects, wordCounts, status: 'ready' })
    } catch {
      set({ status: 'error', error: 'Could not load your projects from local storage.' })
    }
  },

  createProject: async (input) => {
    const project = await projectRepo.create({
      title: input.title,
      author: input.author,
      synopsis: input.synopsis,
      genre: input.genre,
      targetWordCount: input.targetWordCount,
      coverId: null,
      seriesId: null,
      seriesOrder: 0,
      themeId: input.themeId,
      status: input.status,
      settings: {
        defaultAiPresetId: null,
        pov: input.pov,
        tense: input.tense,
        measureWidthCh: 68,
        structureMode: input.structureMode,
      },
    })
    // Laid out after the project exists so a template that fails leaves a
    // usable empty book rather than no book at all.
    const template = findTemplate(templateChoices(useTemplateStore.getState().custom), input.templateId)
    if (template && template.parts.length > 0) {
      await applyTemplate(project.id, template, input.structureMode)
    }

    set({ projects: [project, ...get().projects] })
    return project
  },

  updateProject: async (id, input) => {
    await projectRepo.update(id, {
      title: input.title,
      author: input.author,
      synopsis: input.synopsis,
      genre: input.genre,
      targetWordCount: input.targetWordCount,
      themeId: input.themeId,
      status: input.status,
      // Only written when the form actually carried it — an update built
      // without matter must not wipe what the writer already wrote.
      ...(input.matter !== undefined ? { matter: input.matter } : {}),
      settings: {
        ...get().projects.find((p) => p.id === id)!.settings,
        pov: input.pov,
        tense: input.tense,
        structureMode: input.structureMode,
      },
    })
    const updated = await projectRepo.get(id)
    if (!updated) return
    set({
      projects: get()
        .projects.map((p) => (p.id === id ? updated : p))
        .sort((a, b) => b.updatedAt - a.updatedAt),
    })
  },

  deleteProject: async (id) => {
    // Was a bare `remove(id)`, which deleted one row and left every chapter,
    // scene, snapshot and cover belonging to it stranded in storage with no
    // parent and no way to reach them. Binning takes the lot, as one event
    // that can be undone as one.
    await binProject(id)
    set({ projects: get().projects.filter((p) => p.id !== id) })
  },
}))
