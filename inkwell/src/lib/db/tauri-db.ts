import { base64ToBlob, blobToBase64 } from '@/lib/base64'
import type {
  AiPreset,
  AiProviderConfig,
  CardChat,
  CharacterCard,
  Chapter,
  CodexEntry,
  Cover,
  Goal,
  ImageAsset,
  Lorebook,
  ManuscriptTemplate,
  Theme,
  Persona,
  Project,
  RevisionPass,
  Scene,
  Series,
  SessionLog,
  Snapshot,
  StoryPromise,
  Submission,
  WorldMap,
} from '@/types'

import {
  createBackup as createBackupIpc,
  exportLibraryRaw,
  importLibraryRaw,
  listBackups as listBackupsIpc,
  loadLibraryRaw,
  restoreBackupRaw,
  saveLibraryRaw,
  type BackupInfo,
} from './tauri-bridge'
import { CURRENT_SCHEMA_VERSION, emptyLibrary, migrateLibrary, type LibraryDocument } from './library-schema'
import { MemoryTable } from './memory-table'

const AUTOSAVE_DEBOUNCE_MS = 600

const projects = new Map<string, Project>()
const series = new Map<string, Series>()
const chapters = new Map<string, Chapter>()
const scenes = new Map<string, Scene>()
const snapshots = new Map<string, Snapshot>()
const codexEntries = new Map<string, CodexEntry>()
const characterCards = new Map<string, CharacterCard>()
const cardChats = new Map<string, CardChat>()
const personas = new Map<string, Persona>()
const lorebooks = new Map<string, Lorebook>()
const covers = new Map<string, Cover>()
const aiPresets = new Map<string, AiPreset>()
const aiProviders = new Map<string, AiProviderConfig>()
const imageAssets = new Map<string, ImageAsset>()
const goals = new Map<string, Goal>()
const sessionLogs = new Map<string, SessionLog>()
const manuscriptTemplates = new Map<string, ManuscriptTemplate>()
const themes = new Map<string, Theme>()
const revisionPasses = new Map<string, RevisionPass>()
const promises = new Map<string, StoryPromise>()
const worldMaps = new Map<string, WorldMap>()
const submissions = new Map<string, Submission>()

let saveTimer: ReturnType<typeof setTimeout> | null = null
let readyPromise: Promise<void> | null = null
let hasBackedUpThisSession = false

function scheduleSave() {
  if (saveTimer) clearTimeout(saveTimer)
  saveTimer = setTimeout(() => {
    saveTimer = null
    void persist()
  }, AUTOSAVE_DEBOUNCE_MS)
}

async function serialize(): Promise<LibraryDocument> {
  const storedImageAssets = await Promise.all(
    Array.from(imageAssets.values()).map(async (asset) => ({
      id: asset.id,
      createdAt: asset.createdAt,
      updatedAt: asset.updatedAt,
      mimeType: asset.mimeType,
      width: asset.width,
      height: asset.height,
      fileName: asset.fileName,
      dataBase64: await blobToBase64(asset.blob),
    })),
  )
  return {
    schemaVersion: CURRENT_SCHEMA_VERSION,
    projects: Array.from(projects.values()),
    series: Array.from(series.values()),
    chapters: Array.from(chapters.values()),
    scenes: Array.from(scenes.values()),
    snapshots: Array.from(snapshots.values()),
    codexEntries: Array.from(codexEntries.values()),
    characterCards: Array.from(characterCards.values()),
    cardChats: Array.from(cardChats.values()),
    personas: Array.from(personas.values()),
    lorebooks: Array.from(lorebooks.values()),
    covers: Array.from(covers.values()),
    aiPresets: Array.from(aiPresets.values()),
    aiProviders: Array.from(aiProviders.values()),
    imageAssets: storedImageAssets,
    goals: Array.from(goals.values()),
    sessionLogs: Array.from(sessionLogs.values()),
    manuscriptTemplates: Array.from(manuscriptTemplates.values()),
    themes: Array.from(themes.values()),
    revisionPasses: Array.from(revisionPasses.values()),
    promises: Array.from(promises.values()),
    worldMaps: Array.from(worldMaps.values()),
    submissions: Array.from(submissions.values()),
  }
}

function fillMap<T extends { id: string }>(map: Map<string, T>, items: T[]) {
  map.clear()
  for (const item of items) map.set(item.id, item)
}

async function hydrate(doc: LibraryDocument) {
  fillMap(projects, doc.projects)
  fillMap(series, doc.series)
  fillMap(chapters, doc.chapters)
  fillMap(scenes, doc.scenes)
  fillMap(snapshots, doc.snapshots)
  fillMap(codexEntries, doc.codexEntries)
  fillMap(characterCards, doc.characterCards)
  fillMap(cardChats, doc.cardChats)
  fillMap(personas, doc.personas)
  fillMap(lorebooks, doc.lorebooks)
  fillMap(covers, doc.covers)
  fillMap(aiPresets, doc.aiPresets)
  fillMap(aiProviders, doc.aiProviders)
  fillMap(goals, doc.goals)
  fillMap(sessionLogs, doc.sessionLogs)
  fillMap(manuscriptTemplates, doc.manuscriptTemplates)
  fillMap(themes, doc.themes)
  fillMap(revisionPasses, doc.revisionPasses)
  fillMap(promises, doc.promises)
  fillMap(worldMaps, doc.worldMaps)
  fillMap(submissions, doc.submissions)

  imageAssets.clear()
  for (const stored of doc.imageAssets) {
    imageAssets.set(stored.id, {
      id: stored.id,
      createdAt: stored.createdAt,
      updatedAt: stored.updatedAt,
      mimeType: stored.mimeType,
      width: stored.width,
      height: stored.height,
      fileName: stored.fileName,
      blob: base64ToBlob(stored.dataBase64, stored.mimeType),
    })
  }
}

async function persist(): Promise<void> {
  const doc = await serialize()
  // One backup per session, taken just before the first write — cheap
  // insurance against a bad save without copying the file on every keystroke.
  if (!hasBackedUpThisSession) {
    hasBackedUpThisSession = true
    await createBackupIpc().catch(() => undefined)
  }
  await saveLibraryRaw(JSON.stringify(doc))
}

export async function initTauriDb(): Promise<void> {
  if (!readyPromise) {
    readyPromise = (async () => {
      const raw = await loadLibraryRaw()
      const doc = raw ? migrateLibrary(JSON.parse(raw)) : emptyLibrary()
      await hydrate(doc)
    })()
  }
  return readyPromise
}

/** Forces any pending debounced write to happen immediately — used before
 * quitting and before destructive operations like import. */
export async function flushPendingSave(): Promise<void> {
  if (saveTimer) {
    clearTimeout(saveTimer)
    saveTimer = null
  }
  await persist()
}

export async function exportLibraryToFile(destPath: string): Promise<void> {
  const doc = await serialize()
  await exportLibraryRaw(destPath, JSON.stringify(doc))
}

export async function importLibraryFromFile(srcPath: string): Promise<void> {
  const raw = await importLibraryRaw(srcPath)
  const doc = migrateLibrary(JSON.parse(raw))
  // Preserve the pre-import state as a recovery point before replacing it.
  await createBackupIpc().catch(() => undefined)
  await hydrate(doc)
  await persist()
}

export async function listLibraryBackups(): Promise<BackupInfo[]> {
  return listBackupsIpc()
}

export async function restoreFromBackup(filename: string): Promise<void> {
  const raw = await restoreBackupRaw(filename)
  const doc = migrateLibrary(JSON.parse(raw))
  // Preserve the pre-restore state too, in case the wrong backup was picked.
  await createBackupIpc().catch(() => undefined)
  await hydrate(doc)
  await persist()
}

export const tauriTables = {
  projects: new MemoryTable(projects, scheduleSave),
  series: new MemoryTable(series, scheduleSave),
  chapters: new MemoryTable(chapters, scheduleSave),
  scenes: new MemoryTable(scenes, scheduleSave),
  snapshots: new MemoryTable(snapshots, scheduleSave),
  codexEntries: new MemoryTable(codexEntries, scheduleSave),
  characterCards: new MemoryTable(characterCards, scheduleSave),
  cardChats: new MemoryTable(cardChats, scheduleSave),
  personas: new MemoryTable(personas, scheduleSave),
  lorebooks: new MemoryTable(lorebooks, scheduleSave),
  covers: new MemoryTable(covers, scheduleSave),
  aiPresets: new MemoryTable(aiPresets, scheduleSave),
  aiProviders: new MemoryTable(aiProviders, scheduleSave),
  imageAssets: new MemoryTable(imageAssets, scheduleSave),
  goals: new MemoryTable(goals, scheduleSave),
  sessionLogs: new MemoryTable(sessionLogs, scheduleSave),
  manuscriptTemplates: new MemoryTable(manuscriptTemplates, scheduleSave),
  themes: new MemoryTable(themes, scheduleSave),
  revisionPasses: new MemoryTable(revisionPasses, scheduleSave),
  promises: new MemoryTable(promises, scheduleSave),
  worldMaps: new MemoryTable(worldMaps, scheduleSave),
  submissions: new MemoryTable(submissions, scheduleSave),
}
