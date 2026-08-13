/**
 * What goes into the bin alongside the thing you actually deleted.
 *
 * Deleting a project used to remove one row and leave everything underneath
 * it — every chapter, scene, snapshot, cover and session — stranded in
 * storage with no parent and no way to reach them. Deleting a chapter removed
 * its scenes but not their snapshots. Both were quiet data leaks as well as
 * bugs: the library grew and nothing ever reclaimed the space.
 *
 * Working it out is arithmetic over ids, so it lives here as a pure function
 * and is tested as one. Nothing in this file touches storage.
 */

/** Only the fields the cascade needs, so callers can pass whole records. */
export interface CascadeSource {
  chapters: { id: string; projectId: string }[]
  scenes: { id: string; projectId: string; chapterId: string }[]
  snapshots: { id: string; sceneId: string }[]
  covers: { id: string; projectId: string }[]
  goals: { id: string; projectId: string | null }[]
  sessionLogs: { id: string; projectId: string }[]
  revisionPasses: { id: string; projectId: string }[]
  promises: { id: string; projectId: string; setupSceneId: string }[]
  worldMaps: { id: string; projectId: string }[]
  submissions: { id: string; projectId: string }[]
  codexEntries: { id: string; projectId: string | null }[]
  characterCards: { id: string; projectId: string }[]
  cardChats: { id: string; projectId: string }[]
  lorebooks: { id: string; projectId: string }[]
}

/** Table name to the ids of its records caught by the cascade. */
export type CascadePlan = Partial<Record<keyof CascadeSource, string[]>>

export function emptyCascadeSource(): CascadeSource {
  return {
    chapters: [], scenes: [], snapshots: [], covers: [], goals: [],
    sessionLogs: [], revisionPasses: [], promises: [], worldMaps: [], submissions: [], codexEntries: [], characterCards: [], cardChats: [], lorebooks: [],
  }
}

/** Everything belonging to a project. */
export function cascadeForProject(projectId: string, source: CascadeSource): CascadePlan {
  const scenes = source.scenes.filter((scene) => scene.projectId === projectId)
  const sceneIds = new Set(scenes.map((scene) => scene.id))

  return prune({
    chapters: ids(source.chapters, (c) => c.projectId === projectId),
    scenes: scenes.map((scene) => scene.id),
    snapshots: ids(source.snapshots, (s) => sceneIds.has(s.sceneId)),
    covers: ids(source.covers, (c) => c.projectId === projectId),
    // A goal with a null project is the library-wide target and belongs to
    // nobody's project, so it survives.
    goals: ids(source.goals, (g) => g.projectId === projectId),
    sessionLogs: ids(source.sessionLogs, (s) => s.projectId === projectId),
    revisionPasses: ids(source.revisionPasses, (s) => s.projectId === projectId),
    promises: ids(source.promises, (p) => p.projectId === projectId),
    worldMaps: ids(source.worldMaps, (m) => m.projectId === projectId),
    submissions: ids(source.submissions, (s) => s.projectId === projectId),
    // Likewise a codex entry scoped to a series rather than a project: the
    // other books in the series still need it.
    codexEntries: ids(source.codexEntries, (e) => e.projectId === projectId),
    characterCards: ids(source.characterCards, (c) => c.projectId === projectId),
    cardChats: ids(source.cardChats, (c) => c.projectId === projectId),
    lorebooks: ids(source.lorebooks, (l) => l.projectId === projectId),
  })
}

/** A chapter, its scenes, and those scenes' history. */
export function cascadeForChapter(chapterId: string, source: CascadeSource): CascadePlan {
  const scenes = source.scenes.filter((scene) => scene.chapterId === chapterId)
  const sceneIds = new Set(scenes.map((scene) => scene.id))

  return prune({
    scenes: scenes.map((scene) => scene.id),
    snapshots: ids(source.snapshots, (s) => sceneIds.has(s.sceneId)),
    // A promise whose setup scene is gone points at nothing; one whose
    // payoff scene is gone merely reopens, so those survive untouched.
    promises: ids(source.promises, (p) => sceneIds.has(p.setupSceneId)),
  })
}

/** A scene, its history, and any promises set up in it. */
export function cascadeForScene(sceneId: string, source: CascadeSource): CascadePlan {
  return prune({
    snapshots: ids(source.snapshots, (s) => s.sceneId === sceneId),
    promises: ids(source.promises, (p) => p.setupSceneId === sceneId),
  })
}

/** How many records a deletion would take with it, for the confirmation. */
export function cascadeSize(plan: CascadePlan): number {
  return Object.values(plan).reduce((total, list) => total + (list?.length ?? 0), 0)
}

function ids<T extends { id: string }>(rows: T[], keep: (row: T) => boolean): string[] {
  return rows.filter(keep).map((row) => row.id)
}

/** Drops empty entries so a plan only names tables it actually touches. */
function prune(plan: CascadePlan): CascadePlan {
  const out: CascadePlan = {}
  for (const [table, list] of Object.entries(plan) as [keyof CascadeSource, string[]][]) {
    if (list.length > 0) out[table] = list
  }
  return out
}
