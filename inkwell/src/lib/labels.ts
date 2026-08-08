/**
 * Label arithmetic, kept pure so the merge rule is testable on its own:
 * renaming `from` to `to` on a scene that already carries `to` must leave
 * one copy, not two — that single line is the entire difference between
 * "rename" and "merge".
 */
export function mergeLabels(labels: string[], from: string, to: string): string[] {
  return [...new Set(labels.map((label) => (label === from ? to : label)))]
}

/** How many scenes carry each label, sorted alphabetically for display. */
export function countLabels(scenes: { labels: string[] }[]): [string, number][] {
  const counts = new Map<string, number>()
  for (const scene of scenes) {
    for (const label of scene.labels) counts.set(label, (counts.get(label) ?? 0) + 1)
  }
  return [...counts.entries()].sort((a, b) => a[0].localeCompare(b[0]))
}
