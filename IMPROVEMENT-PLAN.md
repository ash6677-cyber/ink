# INKWELL — Improvement Plan

Grounded in the codebase at commit `917643c`. Every file path named below was read during the audit of 4 Aug 2026. Status of the verification gates at time of writing: `npm run typecheck` 0 · `npm run lint` 0 · `npm test` 445 passing · `npm run build` clean.

Two things happened before this plan and are assumed by it:
- The **P0 service-worker fix is already shipped** on the working branch (`917643c`), approved separately. §7 covers what remains.
- The character-card visual upgrade (Parts 1–2: frames/finishes/colour, tilt/parallax) is merged into the codebase this plan describes. Its unbuilt Parts 3–4 are folded into §4 rather than continuing as a separate track.

Effort scale: **S** ≤ half a day · **M** 1–2 days · **L** 3+ days. Priorities: **P0** broken/blocking · **P1** high impact · **P2** valuable · **P3** polish.

---

## 1. Executive summary & current-state assessment

**Current state.** INKWELL is a local-first novel-writing studio: TipTap manuscript editor with focus mode and snapshots (`features/editor/`), a worldbuilding Almanac (`features/codex/` + `features/almanac/`), character cards with AI chat (`features/cards/`), an AI Book Creator wizard (`features/book-creator/`), Cover Studio (`features/covers/`), planning boards (`features/planning/`), a page-flip reader (`features/reader/`), series box sets, stats/goals, a deep theme system (`features/theme/`), Dexie persistence with soft-delete and whole-library backup (`lib/db/`), optional Firestore sync (`lib/sync/`), a PWA path and a Tauri Windows path (`src-tauri/`). It owns its repository and its deployed origin outright.

**What's strong.** Data safety (soft-delete bin, backup round-trip with a schema-completeness test in `lib/db/web-library.test.ts`, honest storage reporting in `storage-health.tsx`); the theme system (partial overrides, OKLCH with contrast guards, per-project looks); a real verification culture (445 unit tests, painted-pixel live suites); one shell for desktop and mobile rather than forked screens; the keyboard-aware viewport system (`lib/viewport.ts`).

**What's weak.** Naming and information architecture ("Cards" hides chat, personas and lorebooks; Book Creator and Lorebooks aren't in the nav at all; the command palette keeps a second nav list that has already drifted); mobile depth beyond the recent dialog/keyboard fixes (the reader has never been audited on a phone); the AI layer's failure UX (a toast, no retry, no visibility into what is sent); two monolithic routes (`editor-home.tsx` ~550 lines, `card-chat.tsx` ~470); the Codex/Almanac feature split across two directories; and wizard state that evaporates on any navigation.

**Five highest-impact changes.**
1. Finish the P0 properly: wizard steps in history, escape routes, the mobile test matrix (§7).
2. Cards → Playground restructure with redirects, plus character import from Codex (§3, §6) — turns three orphaned features into one coherent destination.
3. Prompt/context transparency and provider robustness (§13, §14) — the AI features are only trustworthy if a writer can see what's sent and recover from failure.
4. Mobile overhaul with the reader audited for the first time (§8).
5. Design-system consolidation: one Dial, one nav source of truth, naming pass (§2, §9).

**Verdict.** The foundations (data, theme, verification) are genuinely good and should not be rewritten. The work is organisational and experiential: naming, navigation, mobile depth, AI transparency, and finishing half-connected features (cards ↔ codex ↔ chat) into loops.

---

## 2. Information architecture & navigation

**Current state.** Nav defined once in `src/app/layout/nav-items.ts`, consumed by `nav-rail.tsx` (desktop) and `mobile-topbar.tsx` (sheet). Routes in `src/app/router.tsx` (hash router). The command palette (`src/app/command-palette.tsx` lines 41–48) maintains its **own** destination list, which already lacks Read and Series — live drift. Book Creator (`/book-creator`) and Lorebooks (`/lorebooks`) exist as routes but appear in no nav. Legacy `/codex` → `/almanac` redirects exist and work (`legacy-almanac-redirect.tsx`).

Current sitemap: Projects · Editor · Read · Almanac · Cards (→ detail → chat) · Planning · Covers · Series · Stats · Settings, plus off-nav Book Creator and Lorebooks.

**Problems.**
- "Cards" names a gallery but contains a chat product, personas and (via a corner button, `card-chat.tsx:358`) lorebooks. A writer looking for "talk to my character" has no scent trail.
- Two destination lists (nav-items.ts and command-palette.tsx) means every rename must be done twice and already hasn't been.
- Book Creator is only discoverable from Projects buttons; Lorebooks only from inside a chat.
- Naming audit of each destination against what it does: **Projects** ✓; **Editor** ✓ (though "Write" is warmer — flagged as suggestion, not required); **Read** ✓; **Almanac** ✓ (recently differentiated); **Cards** ✗ (this plan's §3); **Planning** ✓; **Covers** — it's a studio with layers and export, "Cover Studio" says so; **Series** ✓; **Stats** ✓.

**Proposed changes.**
1. Rename Cards → **Playground** end to end (§3 owns the spec).
2. Single source of truth for destinations: command palette imports from `nav-items.ts`; delete its private list.
3. Add Book Creator to the command palette and as a persistent action on Projects (it creates projects; it does not belong in the project-scoped rail).
4. Move Lorebooks into Playground (§3).
5. Rename "Covers" label to "Cover Studio" (label only; route stays `/covers`).
6. Page titles: set `document.title` per route ("Mira Vale — Playground — Inkwell"); currently the title is static "Inkwell" everywhere.

**UX specification.** Rail order after change: Projects · Editor · Read · Almanac · **Playground** · Planning · Cover Studio · Series · Stats. Mobile sheet mirrors it (same source array). Empty/loading/error states unchanged per screen.

**Technical approach.** Modify `nav-items.ts`, `command-palette.tsx`, `router.tsx` (redirects §3), add a `useDocumentTitle` hook applied in each route. No schema changes.

**Risks & dependencies.** Redirect correctness (§3). Persisted state keyed on old names — audited: only `inkwell-preferences` and `inkwell-theme` exist, neither keys on "cards"; no migration needed.

**Effort.** 1: see §3 · 2: S · 3: S · 4: see §3 · 5: S · 6: S.

**Priority.** P1 (2, 6), rest inherited from §3.

**Acceptance criteria.**
- [x] ⌘K lists every rail destination including Read, Series, Book Creator; the private list in command-palette.tsx is gone. *(Verified live: `scripts/nav-check.mjs`, 19/19.)*
- [x] Browser tab title names the screen and project. *(Most specific part first — "Elenya — Almanac — Mira Vale — Inkwell" — rather than the project first as sketched here, because tab labels truncate from the right and the project-first form makes every tab of one book identical.)*
- [x] Rail shows Playground and Cover Studio; palette jumps carry `?project=`; no route 404s from old bookmarks (`/cards`, `/cards/:id`, `/cards/:id/chat`, `/lorebooks` all verified live).

**Shipped (§2.2, §2.3, §2.5, §2.6).** `DESTINATIONS` in `nav-items.ts` is the single list; `NAV_ITEMS` is its `inRail` filter and the palette reads the whole thing. Book Creator and Settings are palette-only. Palette jumps now carry the open book, which the private list never did. `useDocumentTitle` in `lib/hooks/`, applied to all 16 routes, guarded by `app/navigation.test.ts` — which reads the routes directory rather than a hand-kept list, and was shown to fail by deleting one call.

---

## 3. Playground: structure & shell

**Current state.** `/cards` (grid, `cards-home.tsx`), `/cards/:cardId` (`card-detail.tsx`), `/cards/:cardId/chat` (`card-chat.tsx`), `/lorebooks` (`lorebooks-home.tsx`), personas managed inside a chat dialog (`persona-manager-dialog.tsx`). All project-scoped via `?project=`.

**Problems.** Four surfaces, one misleading name, three entry points hidden. Chats are only reachable *through* a card, so past conversations have no home of their own (`chat-store.ts` keeps them per card). Personas are global but buried two levels inside a chat.

**Proposed changes.**
1. New route family: `/playground` (redirects to `/playground/cards`), `/playground/cards`, `/playground/cards/:cardId`, `/playground/chats`, `/playground/chats/:chatId`, `/playground/personas`, `/playground/lorebooks`, all carrying `?project=`.
2. Permanent redirects: `/cards` → `/playground/cards`, `/cards/:id` → `/playground/cards/:id`, `/cards/:id/chat` → resolve the card's latest chat or start one, `/lorebooks` → `/playground/lorebooks`. Same pattern as the proven `/codex` redirects in `router.tsx:56-58`.
3. Playground shell component with a sub-nav (Cards · Chats · Personas · Lorebooks) and shared header; subsections render inside it.
4. Card → chat flow: primary action on a card face and detail page is **Chat**; starting one creates/opens the newest `CardChat` for that card. Chats list shows every conversation across cards with card face thumbnails (`CardFacePreview`, compact).
5. Chat → writeback: message actions "Save to Almanac entry" (appends to linked entry's body) and "Copy as scene note" (§5 specifies).
6. Rename all copy: nav label, page headers, empty states ("No characters yet" stays; container copy becomes Playground), command palette, onboarding text if §19 adds any.

**UX specification.** Desktop: horizontal sub-nav tabs under the page header (pattern matches Settings' `?tab=` tabs in `settings-home.tsx`, which users already know). Mobile: same tabs, horizontally scrollable, sticky under the top bar; **no third navigation layer** — subsections are siblings, back always leaves the subsection to wherever you came from, one press. Empty states per subsection (Chats empty: "Conversations you have with your characters will gather here", action = pick a card). Loading: existing Skeleton pattern. Error: route error boundary already wraps every screen.

**Technical approach.** New `features/playground/` directory owning the shell; move `cards/`, chat, personas, lorebooks routes under it (git mv, keep component names); `router.tsx` gains the family + redirects; `nav-items.ts` swaps the entry. Stores unchanged (`card-store`, `chat-store`, `persona-store`, `lorebook-store`). No schema changes.

**Risks & dependencies.** Redirect of `/cards/:id/chat` needs a chat-resolution step — do it in a tiny redirect component, same shape as `legacy-almanac-redirect.tsx`. Depends on nothing; §4–§6 depend on it.

**Effort.** 1–3: M · 4: S · 5: M (with §5) · 6: S.

**Priority.** P1 (explicit requirement).

**Acceptance criteria.**
- [x] Old URLs (`/cards`, `/cards/:id`, `/cards/:id/chat`, `/lorebooks`) land on the right Playground screen, project param intact.
- [x] All four subsections reachable in **one** tap from anywhere in the Playground on mobile — the tab row is always on screen — and back exits the subsection in one press, because the subsections are siblings rather than a third level.
- [x] A card's Chat button opens a conversation; pressing it again resumes that same one rather than making a second; the conversation appears in Chats.
- [x] No user-visible "Cards" as a top-level destination anywhere. ("Cards" survives as the *subsection* name and in "character cards", which is the thing itself, not the container.)

**Shipped (§3.1–3.4, §3.6).** `features/cards/` → `features/playground/` (git mv, component names kept). Route family `/playground/{cards,chats,personas,lorebooks}` under a `PlaygroundShell` with a tab sub-nav; detail screens opt out of the chrome and draw their own header. Conversations are addressed by their own id (`/playground/chats/:chatId`) instead of through a card, which is what let them be listed together at all — `chat-store` now loads per book rather than per card, and the card's sidebar filters that list. New `Chats` index with `CardFacePreview` thumbnails and last-line previews; new `Personas` screen sharing a `PersonaList` with the in-chat dialog. `LegacyPlaygroundRedirect` for the three static old paths, `LegacyChatRedirect` for `/cards/:id/chat`, which has to resolve a card to a conversation before it can go anywhere.

**Deferred.** §3.5 (chat → "Save to Almanac entry" / "Copy as scene note") stays with §5 in Phase 4, where its spec lives.

---

## 4. Playground: Cards subsection

**Current state.** Grid (`cards-home.tsx`) renders `CharacterCardTile` → shared `CardFace` (`card-face.tsx`) with the new design system: five frames, four finishes, per-name stable accent, gloss/vignette dials (`lib/card-design.ts`, `card-design-panel.tsx`), pointer tilt/parallax (`lib/card-tilt.ts`). Detail page (`card-detail.tsx`) has sticky live preview, portrait upload with crop (`portrait-upload-field.tsx`), prose fields, example dialogue, tags.

**Problems.** No search/filter/sort on the grid — at 20+ characters it's scanning by eye. Tags exist on the record but do nothing. Card design has no presets (every card starts from dials). Nothing renders the character's *substance* on the face (role, epithet) — only name and tags. No card format import/export, so cards can't come from or go to the wider character-card ecosystem. (Parts 3–4 of the earlier upgrade land here, minus anything stat-like, per explicit instruction: **words, not numbers — no ratings, tiers or attribute bars**.)

**Proposed changes.**
1. Grid toolbar: text filter (name/tags), tag chips, sort (name / recently edited).
2. Traits on the face: an optional one-line epithet (`CardDesign` gains `epithet?: string` or card-level field) rendered under the name; up to three tags already render.
3. Design presets: 5–6 named looks (reuse `CardDesign` values) in `card-design-panel.tsx`, same chip pattern as frames.
4. Card file import/export: JSON (own format, versioned like `theme-file.ts`) and PNG with embedded JSON (the de-facto character-card interchange), import validating field-by-field exactly as `readThemeFile` does.
5. Card face PNG export (render `CardFace` with `still` prop to canvas — the prop exists for this).
6. Bulk actions on grid: multi-select → delete to bin / export.

**UX specification.** Toolbar collapses to a search icon + filter sheet on mobile. Import: drop zone + file picker on the grid; shows a preview card + field list before committing. Export: per-card menu item + bulk. Empty grid state keeps current copy plus "Import characters" (§6) and "Import card file" actions.

**Technical approach.** `features/playground/lib/card-file.ts` (serialize/parse, PNG tEXt chunk embed), tests mirroring `theme-file` tests; grid state local to route. Schema: one optional field (`epithet`), no migration needed (optional-by-absence pattern used throughout).

**Risks & dependencies.** PNG-embedded import is untrusted input — same validation posture as theme files. Depends on §3 shell.

**Effort.** 1: S · 2: S · 3: S · 4: M · 5: M · 6: M.

**Priority.** P1 (1, 3), P2 (2, 4, 5), P3 (6).

**Acceptance criteria.**
- [x] Typing in the filter narrows the grid live; tag chip filters combine (all tags must match — narrowing, not widening).
- [x] A preset restyles a card in one tap and shows in the grid identically. Presets deliberately leave the accent alone.
- [ ] Export a card to JSON and to PNG… **§4.4/4.5 not in this phase** (roadmap puts them in Phase 9).
- [ ] A card face exports as a PNG… **§4.5, Phase 9.**

---

## 5. Playground: character chat

**Current state.** `card-chat.tsx` (~470 lines): interview/roleplay modes, personas, per-message swipes (regeneration variants — `chat-store.ts:156-168`), streaming via `use-ai-generation.ts`, prompt assembly `buildChatPrompt` from card + persona + lorebooks + preset + history, context panel duplicated desktop/mobile via Sheet.

**Problems.** The route is a monolith. What gets sent to the model is invisible (writers can't see why the character "forgot" something). Lorebook injection is all-or-nothing per project. Nothing a character says can reach the manuscript or Almanac without copy-paste. Swipes exist but the affordance is subtle (arrow only, `card-chat.tsx:440`). No per-chat model/preset override visible at the point of use.

**Proposed changes.**
1. Split the route: `chat-thread.tsx`, `chat-composer.tsx`, `chat-context-panel.tsx` under `features/playground/components/` — behaviour-preserving refactor first.
2. Context preview: a "What the model sees" drawer showing the assembled prompt sections (card, persona, lorebook entries matched, history window) with token estimates — read-only truth, built on the same `buildChatPrompt` output (§14 shares this machinery).
3. Message actions: copy · regenerate (existing swipe, given a visible button) · **Save to Almanac** (append to the card's linked entry, or pick an entry) · **Save as scene note** (append to a chosen scene's `summary`).
4. Preset/model switcher in the chat header (reads `ai-store` presets; per-chat `aiPresetId` already exists on `CardChat`).
5. Branching clarity: swipe dots under assistant messages showing variant count/position.

**UX specification.** Mobile: context panel stays a Sheet; message actions in a long-press/⋯ menu; composer respects `--vvh` (already does via shell). Streaming state: existing incremental render; add a stop button (abort exists in the hook — verify; if not, add AbortController). Error: inline retry chip on the failed message rather than only a toast.

**Technical approach.** No schema changes (uses `codexEntryId`, `summary`, `aiPresetId`). New pure helper `describePrompt(built)` for the preview. Depends on §3 move.

**Risks & dependencies.** The refactor must be behaviour-preserving before features land — chat is the most stateful screen. Depends on §13 for retry semantics.

**Effort.** 1: M · 2: M · 3: M · 4: S · 5: S.

**Priority.** P1 (2, 3), P2 (1, 4, 5).

**Acceptance criteria.**
- [x] Preview drawer lists every prompt section and the lorebook entries actually injected for the next send — and the ones that were not, with reasons (§14).
- [x] "Keep this line" appends visibly to a chosen Almanac entry or a scene's notes, attributed to the speaker. Appends only — a chat is where you discover things and the Almanac is where you keep them, so nothing is ever replaced.
- [x] A failed send shows an inline retry that works (§13); stop halts a stream mid-sentence and keeps what arrived.
- [x] Swipe variants show as dots up to six, a count beyond that, and switching persists. Message actions are also visible without hover, which is the only way they exist at all on a touch screen.

---

## 6. Character import from novel / project / series

**Current state.** No import exists. Codex character entries (`CodexEntry` with `type: 'character'`, fields `name/aliases/summary/body/attributes/relationships/imageId/tags`) and cards (`CharacterCard`) are linked only when Book Creator created both (`book-creator-wizard.tsx:196-230` sets `codexEntryId`); nothing syncs afterwards.

**Problems.** A writer with thirty Codex characters starts the Playground empty. The one existing link (`codexEntryId`) has no semantics — edits drift silently.

**Proposed changes.**
1. **Import characters** flow in Playground: entry points on the Cards empty state and grid toolbar.
2. Source picker: this project (default) · another project · a series (union of member projects' codex entries, using `Project.seriesId`).
3. Selection: list with portraits/type badges, single-tap select, select-all, count in the confirm button.
4. Mapping preview before commit — one screen showing exactly: `name → displayName`, `summary → description`, `body (plain text) → personality`, `imageId → avatarImageId` (copied blob), `tags → tags`, aliases noted in description header. Fields with no source shown as "left blank".
5. Duplicate handling, chosen up front, per run: **Skip** existing (match on `codexEntryId`, else case-insensitive name) · **Replace** (overwrite card fields, keep design/chat) · **Copy** (new card, "(2)" suffix).
6. Linked vs snapshot: **recommend Linked** as default — `codexEntryId` set, card shows a "linked" badge, and a one-way refresh action ("Pull latest from Almanac") re-runs the mapping. Full two-way live sync is deliberately *not* proposed: conflict resolution between free-text fields silently mangles prose, the exact failure §3.2 forbids. Snapshot (no link) offered as a per-import toggle since it's one field. Tradeoff stated: linked keeps one source of truth and enables refresh + writeback (§5); snapshot protects roleplay divergence from later Codex edits.
7. Progress + result: for bulk, a progress count, then a summary ("14 imported · 3 skipped · 1 replaced") with **Undo** — created cards were bin-able already (`soft-delete.ts`), so undo = bin the created ids, restore replaced fields from a kept pre-image.
8. Reverse direction (cheap, so included): per-card "Send to Almanac" — creates or updates the linked entry with the inverse mapping.

**UX specification.** A single dialog with three steps (Source → Select → Review), reusing the wizard-stepper look; mobile-safe by construction (dialog primitive already keyboard/viewport-aware). Loading: entries stream into the list; Error: per-item failure marks the row, run continues; Success: summary + undo toast pinned 30s.

**Technical approach.** `features/playground/lib/import-characters.ts`: pure `mapEntryToCard(entry)` + `planImport(entries, existingCards, strategy)` returning create/replace/skip lists (unit-testable), then a thin executor over `cardRepo`/`imageAssetRepo` (blob copy, not shared id). Undo journal kept in memory + bin. No schema change: `codexEntryId` exists.

**Risks & dependencies.** Image blob duplication cost at scale (acceptable: one-off, and the writer owns their own device); series scope needs `codexRepo` query by multiple projectIds (index exists on `projectId`). Depends on §3.

**Effort.** 1–3: M · 4–5: M · 6: S · 7: M · 8: S.

**Priority.** P1 (explicit requirement).

**Acceptance criteria.**
- [x] Import all characters from a series spanning two projects; count matches; portraits copied (copied blob, not a shared id — verified in unit tests and live).
- [x] Mapping screen shows every field pair before anything writes, blanks included, plus an explicit list of what an update never touches.
- [x] Each duplicate strategy behaves as labelled, verified live against a name collision: Skip leaves the card alone, Update refreshes only the written fields, Add-a-second numbers the copy.
- [x] Undo after a bulk import leaves the card list identical to before — design, scenario, first message and voice notes of the updated card all intact (`scripts/import-check.mjs`, 16/16). Only `updatedAt` differs, which is bookkeeping rather than content.
- [x] "Pull from Almanac" updates a linked card; "Add to Almanac" creates the entry and links it; "Send to Almanac" pushes the card's fields back. Verified round trip (`scripts/writeback-check.mjs`, 7/7). A pull that would change nothing says "Already up to date" rather than flashing a success it did not earn.

**Shipped (§6.1–6.7).** `lib/import-characters.ts` decides (pure: mapping, duplicate detection preferring the link over the name, copy numbering that projects the run's own results so two copies become "(2)" and "(3)"); `lib/run-import.ts` writes, behind an injected pair of repositories so undo can be proved without a database; `lib/import-source.ts` resolves this book / another book / a series to its character entries. Three-step dialog (Source → Select → Review) with a 30-second Undo in the result toast. Linked by default with a per-run snapshot toggle.

---

## 7. P0 — mobile Book Creator back-navigation bug

**Current state.** Root-caused and reproduced, not guessed. The "legacy menu" was **a second app's cached menu**, served by its stale service worker (registered at scope `/` when that app owned the site root, cache-first `cached || network`, `'./'` precached). The deploy commit `8a7403a` (1 Aug) moved INKWELL to the root; that worker's path-based INKWELL carve-out (`/inkwell/`) stopped matching, so on any phone from before the move, a document navigation to the root got the old app's dead menu. Book Creator is where back bites because the wizard (`book-creator-wizard.tsx`) keeps steps in component state — verified live: from step 2, **one** browser-back exits the whole wizard, and the next crosses the document boundary the stale SW hijacks.

**Fix shipped** (`917643c`, approved out-of-band): `registration.update()` on every load (`durability.ts`); each SW deletes only own-prefix caches (ends the mutual cache destruction — the neighbour's 10 precache entries verified surviving an INKWELL SW update); INKWELL's SW surgically evicts the older app's poison entries for its own scope (verified: `poisonedRootEntries: []` post-heal). One hijacked load on an already-stale phone remains physically unavoidable; heal is now first-visit. The second app has since been removed from the repository entirely, so no new poisoning is possible; the eviction stays because browsers that already hold it will not clean themselves.

**Problems remaining.**
- Wizard steps push no history entries: back discards up to four steps of typed work silently, on every platform.
- No draft persistence: any exit loses everything.
- There was never a legacy in-app menu to retire (verified: no file ever deleted under `features/book-creator/`); the menu came from outside the app, and the app it came from is now gone from the repository.

**Proposed changes.**
1. Represent the step in the URL (`/book-creator?step=cast`): stepper and Next/Back drive `setSearchParams`, back/forward/swipe map to steps. Entry push, exit at step 0 goes to Projects.
2. Draft persistence: serialize wizard state to `localStorage` (`inkwell-book-draft`) on change; on mount with a draft, offer Resume/Discard.
3. Escape route audit: Cancel is already in the header every step (`book-creator-wizard.tsx:253`) — keep, and add a confirm when a draft has content.
4. Test matrix, run in mobile emulation and on-device: for each of the 4 steps × {browser back, forward after back, hardware back (Android), iOS swipe-back, in-app Back, Cancel} → expected state documented; plus the stale-SW scenario re-run (`repro-sw-trap.mjs` pattern) after any SW edit.

**UX specification.** Back from step N goes to step N−1 with state intact; back from Concept exits to Projects (confirm if dirty). Resume banner on re-entry, dismissible.

**Technical approach.** `useSearchParams` in the wizard; a small `useWizardDraft` hook; no schema changes.

**Risks & dependencies.** None upstream. §15 builds on the same file.

**Effort.** 1: M · 2: S · 3: S · 4: S (write-up) + per-release run.

**Priority.** P0.

**Acceptance criteria.**
- [x] On mobile emulation: advance to Cast, press back twice → Outline, Concept, with all fields intact; third back → Projects.
- [x] Kill the tab mid-wizard, reopen → Resume restores every field.
- [x] The stale-SW repro heals on first visit and a neighbouring site's cache survives untouched. *(The neighbour has since been deleted from the repository; the heal path is unchanged and still needed for browsers that already hold the stale entries.)*
- [x] Matrix executed and written up: `inkwell/docs/BOOK_CREATOR_NAVIGATION.md`, harness `inkwell/scripts/wizard-nav-matrix.mjs`, 32/32 at iPhone 12 metrics — and shown to go red for the right reason by reverting only the wizard.

**Shipped.** Step in the URL via `useSearchParams`; draft in `localStorage` behind `lib/wizard-draft.ts` (debounced 400 ms, flushed on `pagehide`); Cancel confirms with Leave / Discard draft / Keep writing; a dismissible "Picked up where you left off" notice with **Start fresh**. Two things went slightly beyond the letter of the section, both because this section is what exercises them: `AlertDialogContent` gained the `--vvh`/`--vvtop` viewport treatment `DialogContent` already had, so the Cancel confirmation cannot be pushed off-screen by a keyboard; and the stepper's buttons gained `aria-label`, since below `sm` their only accessible name was the step number.

---

## 8. Mobile & responsive overhaul

**Current state.** One shell (`app-shell.tsx`) — `NavRail` ≥lg, `MobileTopBar` + Sheet below; no forked mobile components. Keyboard/viewport system in `lib/viewport.ts` (`--vvh/--vvtop`), dialog actions pinned top on `max-sm:` (`components/ui/dialog.tsx`), sheets bounded to `--vvh`. Duplicated *mounts* (same component twice): `ChapterSceneTree` in `editor-home.tsx` (sidebar + Sheet), context panel in `card-chat.tsx`.

**Problems.**
- The reader (`features/reader/`) has **never been opened at phone width in any audit** — fixed-geometry two-page spread is the most likely casualty in the app.
- Touch targets unaudited app-wide (tree rows, board cards, palette items).
- iOS swipe-back vs the reader's horizontal page-drag will conflict.
- Safe areas: `viewport-fit=cover` is set (`index.html`) but no `env(safe-area-inset-*)` padding exists anywhere — content can sit under the home indicator on installed PWAs.
- Duplicated mounts double render cost and drift risk, though they aren't forked implementations.

**Proposed changes.**
1. Reader mobile audit + fix pass: single-page mode below `sm`, tap zones for page turns, gesture handling that yields the left screen edge to the OS.
2. Safe-area pass: `padding: env(safe-area-inset-*)` on shell chrome (rail sheet, top bar, wizard footer, reader controls).
3. Touch-target sweep: minimum 44px hit areas on tree rows (`tree-items.tsx`), board items, palette rows — measured by a live probe like the dialog suites.
4. De-duplicate mounts: one `<ManuscriptTree>` rendered in a layout slot that is a sidebar ≥lg and a Sheet below, driven by one piece of state.
5. Device-matrix live suite: extend the existing 360×640/390×844 suites to cover every route (currently dialogs, create-flow, keyboard only).

**UX specification.** Per surface, states unchanged; reader single-page mode mirrors desktop behaviours (front page, pageNumber) with turn buttons + tap zones; sheet gestures standard.

**Technical approach.** CSS + component slots; no schema. Reader work isolated to `features/reader/`.

**Risks & dependencies.** Reader changes touch the GPU-tuned CSS (`reader.css` compositing notes) — keep the constraints documented there. §7 first.

**Effort.** 1: L · 2: S · 3: M · 4: M · 5: M.

**Priority.** P1 (1, 2, 5), P2 (3, 4).

**Acceptance criteria.**
- [x] Reader at 360×640: readable type, working turns, no horizontal body scroll, exit reachable (`scripts/reader-mobile-check.mjs`, 9/9).
- [x] Installed-PWA emulation shows no control under safe-area insets. Insets route through `--safe-*` variables so a headless browser can be given a notch; `env()` cannot be overridden and would have made this untestable.
- [x] Probe suite reports zero interactive elements under 44px on phone widths.
- [x] Every route passes the device-matrix suite — 28 screens (14 routes × 2 sizes), 28 clean, `--strict` available for CI.

**Shipped (§8.1–8.5).** Buttons, inputs, selects and tabs grow below `sm`; `.touch-target` gives an invisible 44px hit box to the few controls that cannot grow; hover-only grips and row menus are visible on touch. Safe-area padding on shell chrome and the reader's controls. Reader: ragged right below 640px, tap-to-turn, and the left 24px yielded to the OS back gesture. `ChapterSceneTree` and the chat list are each mounted once, chosen by measurement rather than by a `hidden` class that leaves the copy mounted anyway.

**Correction to this section's premise.** The reader's "fixed-geometry two-page spread" was named here as the most likely casualty in the app. It isn't — the reader already collapses to a single page below `sm`. What was actually wrong needed opening it to see: justified text opening rivers at a thirty-character measure, and a tap that began a turn, moved it nowhere and settled it back, so the page refused to turn for anyone who did not think to swipe.

---

## 9. Visual design system

**Current state.** Tokens in `src/index.css`: OKLCH palette (violet primary restored at `9fad09c`), elevation set per mode, single-knob `--radius`/`--ui-scale`/`--motion-scale`/`--wash-strength`, three font faces routed through `--ui-font/--display-font/--mono-font`. Contrast guards in `oklch.test.ts`. Icons: lucide throughout.

**Problems.** Four identical `Dial` components (`page-edge-editor.tsx`, `shape-editor.tsx`, `typography-editor.tsx`, `card-design-panel.tsx`); chip-button pattern (aria-pressed pills) hand-rolled in five places; spacing is convention rather than scale (mix of `space-y-3/4/5/8` with no rule); settings panels visually denser than the rest of the app; light mode gets less attention than dark in newer surfaces (cards were designed dark-first).

**Proposed changes.**
1. Extract `components/ui/dial.tsx` and `components/ui/choice-chips.tsx`; replace all five call sites each.
2. Spacing rule written down (4/8/12/16/24/32 with usage notes) in a `DESIGN.md`; fix outliers as touched, not as a sweep.
3. Light-mode parity pass over Playground and theme editors (screenshot both modes per surface; fix deltas).
4. Density: settings panels adopt the same 12px-gap card rhythm as Projects.

**UX specification.** No layout changes beyond consistency; before/after intent per surface: settings (calmer, fewer borders), playground grid (unchanged), dialogs (already consolidated).

**Technical approach.** Component extraction + call-site swaps; zero schema.

**Risks & dependencies.** Extraction must not change painted output (live suites already assert dial labels/values — they double as regression nets).

**Effort.** 1: M · 2: S · 3: M · 4: S.

**Priority.** P2, except 3 (P1 — parity is correctness).

**Acceptance criteria.**
- [ ] One Dial, one ChoiceChips; grep shows no local `function Dial(`.
- [ ] Existing theme/card live suites pass unchanged after extraction.
- [ ] Light/dark screenshots per major surface reviewed with no unreadable pairs (contrast probe ≥4.5 on text).

---

## 10. Motion & micro-interactions

**Current state.** Duration tokens ride `--motion-scale` (`index.css` `--animate-*`); reduced-motion honoured in cards CSS and tilt gate (`card-tilt.ts` `motionAllowed`); skeletons exist on Projects/Editor; streaming renders incrementally in chat; reader page-turn is compositor-tuned (`reader.css` header comment).

**Problems.** Route changes are hard cuts; some async actions give no pressed/busy feedback (Import/Export buttons in settings); no consistent success affordance beyond toasts.

**Proposed changes.**
1. Subtle route-level fade/slide (respecting `--motion-scale`, none under reduced motion) via the existing `--animate-fade-in` on route mount.
2. Busy states: every async button gets the `Loader2` pattern already used by Book Creator's Create.
3. Skeletons for Playground grid and Almanac list (copy Projects' pattern).
4. Press feedback on cards/board items (scale 0.99 on active, motion-gated).

**UX specification.** Durations 180–260ms; all gated by the two motion switches, verified the way `verify-card-motion.mjs` does.

**Technical approach.** CSS + small component edits. No schema.

**Risks & dependencies.** None. After §9 extraction to avoid churn.

**Effort.** Each S.

**Priority.** P3, except 2 (P2 — missing busy states read as broken).

**Acceptance criteria.**
- [ ] Reduced-motion and motion-scale-0 kill every new transition (probe-verified).
- [ ] No async button in Settings/Playground lacks a busy state.

---

## 11. Manuscript editor

**Current state.** `editor-home.tsx` (~550 lines: tree, editor mount, details panel, search, goals strip), `scene-editor.tsx` (TipTap, focus mode via `FocusDim`, typewriter scroll, `page-edge` styling, `measureWidthCh` from project settings), snapshots with diff dialog, `manuscript-search-panel.tsx` (find/replace), per-kind chapter numbering, autosave via editor-store (silent).

**Problems.** Autosave is invisible — writers have no "saved" signal, and the one data-loss anxiety local-first apps must answer goes unanswered. Word-goal editing lives in project settings, three interactions from the status display. Find/replace is manuscript-wide only (no per-scene scope). The route monolith makes every change riskier. Formatting surface is minimal (fine for prose, but em-dash/ellipsis smart input is unverified).

**Proposed changes.**
1. Saved indicator: unobtrusive "Saved · 12:04" in the status strip, driven by the existing autosave completion; error state if a write fails.
2. Click-to-edit daily/target goal in the status strip (writes to `goals` table; source: `stats-store`).
3. Find/replace scope toggle: scene/chapter/manuscript.
4. Split `editor-home.tsx` into tree, main, details-panel components (behaviour-preserving).
5. Smart typography input rules (—, …, curly quotes) as a preference toggle (`preferences-store`).

**UX specification.** Status strip: words · goal (editable) · saved-state; focus mode hides it (it already hides chrome). Mobile unchanged beyond §8.

**Technical approach.** TipTap input rules for 5; component split; no schema (goals table exists).

**Risks & dependencies.** Split before features. None external.

**Effort.** 1: S · 2: S · 3: M · 4: M · 5: S.

**Priority.** P1 (1, 2), P2 (3, 4, 5).

**Acceptance criteria.**
- [x] Typing then waiting shows "Saved · 12:04"; a failed write shows a destructive-coloured alert that says the text is still there rather than a silent nothing.
- [ ] Goal editable from the editor in ≤2 clicks; Stats reflects it.
- [ ] Replace-in-scene leaves other scenes untouched (live-verified).

---

## 12. Codex (Almanac)

**Current state.** Machinery in `features/codex/` (routes, entry form, attributes/relationships lists, body editor, image upload), differentiation layer in `features/almanac/` (mentions index `mentions.ts`, survey, appearances). Entry model rich (`types/codex.ts`): types, aliases, attributes, relationships, `aiContext` + `aiContextTokenBudget`. Editor highlighting shares the mentions matcher (`lib/editor/codex-highlight.ts` re-export).

**Problems.** One feature, two directories, two names in code — every future contributor pays the tax. Relationships are stored but only rendered as a flat list. `aiContextTokenBudget` is stored but unenforced anywhere (checked: no consumer). Mention scanning runs over full plaintext per entry — fine at current scale, unmeasured at 200 entries × 100k words (§23 sets the number).

**Proposed changes.**
1. Directory/name consolidation: merge `features/codex/` into `features/almanac/`, rename stores/components to Almanac naming; **keep table/type names** (`codexEntries`, `CodexEntry`) — renaming synced tables is migration risk for zero user value (documented in code).
2. Relationship chips become links that navigate to the target entry; reverse relationships shown ("Mentioned by").
3. Enforce or remove `aiContextTokenBudget` — proposal: enforce in §14's context builder; until then the field is dishonest UI.
4. Alias management UX: chips input rather than comma text field.
5. Performance guard: mentions index build measured and memoised per entry-set hash (numbers in §23).

**UX specification.** No layout change; entry detail gains a "Connections" block (relationships + appearances, which already exist via `appearances-list.tsx`).

**Technical approach.** git mv + import updates (mechanical, lint-verified); relationship reverse lookup is a computed view over the store.

**Risks & dependencies.** The move touches many imports — do it in a quiet window, single commit, gates + live almanac suite.

**Effort.** 1: M · 2: S · 3: S (with §14) · 4: S · 5: M.

**Priority.** P2 (1, 2, 4), P1 (3 — dishonest UI), P2 (5).

**Acceptance criteria.**
- [ ] One feature directory; `verify-almanac` suite passes unchanged.
- [ ] Relationship chip navigates; target shows the reverse link.
- [ ] Token budget either visibly caps context in the §14 preview, or the field is gone.

---

## 13. AI engine & provider layer

**Current state.** Providers: `openai | anthropic | openrouter | openai-compatible` (`types/ai.ts`), stored in Dexie (`aiProviders`, deliberately excluded from backups — `web-library.ts`), managed in `provider-form-dialog.tsx`; presets (model, temperature, topP, `isDefault`) in `preset-form-dialog.tsx`; streaming in `lib/ai/use-ai-generation.ts`; consumers: editor AI actions, beats, chat, Book Creator.

**Problems.** No connection test — a bad key is discovered mid-generation. Failure UX is a toast with no retry. No token/latency visibility. Model is a free-text field (typos silently 404). Default preset is global only — no per-feature defaults (chat wants different settings than outline generation). Keys never leave the device (good) but that guarantee isn't stated in the UI.

**Proposed changes.**
1. "Test connection" on the provider form (1-token ping, shows model list where the API offers one; model field becomes combo with suggestions, still free-entry for compatibles).
2. Failure taxonomy surfaced inline: auth / rate-limit (with retry-after countdown) / network (auto-retry ×2 with backoff) / content — each with its own recovery affordance.
3. Stop button + AbortController through `use-ai-generation` (verify existing; complete if partial).
4. Per-feature default preset: `preferences-store` map `{ chat, editorActions, bookCreator } → presetId`, falling back to global default.
5. Usage line after each generation: tokens in/out (from response usage where provided), duration. No cost tables (model pricing drifts; showing wrong prices is worse than none — honest limitation, revisit if providers expose price APIs).
6. Key privacy note in provider form: "Stored only on this device; never included in backups" — true today, now stated.

**UX specification.** Provider form gains Test row with success/failure detail; generation surfaces get a consistent status line (streaming… / 812 tokens · 6.4s / failed: rate limited, retrying in 12s).

**Technical approach.** Extend `use-ai-generation` return with usage + error kind; provider ping per kind in `lib/ai/`. No schema change (presets already carry model).

**Risks & dependencies.** Provider API differences for model listing — feature-detect, degrade to free text. §14 consumes the same plumbing.

**Effort.** 1: M · 2: M · 3: S · 4: S · 5: S · 6: S.

**Priority.** P1 (1, 2, 3), P2 (4, 5, 6).

**Acceptance criteria.**
- [x] Wrong key fails at Test, not mid-chat, with the auth-specific message — and no retry button, because retrying an identical wrong key cannot work.
- [x] Network failure auto-retries twice with backoff (announced as "trying again", not as a failure), then shows an inline notice with a retry that works. Chat retries in place rather than appending a second empty reply.
- [x] Stop halts generation and keeps the partial text — an abort returns what arrived rather than discarding it. Stop button now in the chat composer as well as the editor panel.
- [ ] Per-feature default presets (§13.4). **P2, not in this phase.**

**Shipped (§13.1–3, §13.6, part of §13.5).** `lib/ai/failure.ts` classifies six kinds with a retryable flag and the provider's own wording preserved; adapters throw `AiRequestError`; `KeyValidationResult` carries the failure rather than a string, so a rate limit's `Retry-After` survives to the UI. One `AiFailureNotice` used by the chat, the editor panel and the provider form. Test connection on the provider form, plus the key-privacy statement (§13.6). A usage line (characters + duration) after each editor generation — deliberately not token counts, since providers disagree about what they report, and not cost, since a wrong price is worse than none (§13.5's honest subset).

---

## 14. Prompt & context control

**Current state.** Prompt assembly is per-feature: `book-creator/lib/prompts.ts` (build + parse with fallbacks), chat's `buildChatPrompt` (card/persona/lorebooks/history), editor actions' own prompts. Codex entries carry `aiContext: 'always' | 'when-relevant' | 'never'` and an unenforced token budget. Scene records carry `linkedCodexIds` (set manually, used for context by editor actions — verified in editor flow).

**Problems.** No writer-visible answer to "what did you just send?". Budgets unenforced (§12.3). No reusable prompt library — presets carry sampling params but not system-prompt text beyond the card override. Per-scene context is only the manual `linkedCodexIds` with no UI showing effective context.

**Proposed changes.**
1. One `lib/ai/context-builder.ts` producing a structured `ContextPlan` (sections, sources, token estimates, inclusions/exclusions with reasons) consumed by chat, editor actions, Book Creator — and rendered by the preview drawer (§5.2) everywhere.
2. Enforce `aiContext` + token budget in that builder (trim `when-relevant` entries by relevance = mention proximity, already computable from `almanac/lib/mentions.ts`).
3. Prompt/preset library: extend `AiPreset` with optional `systemPrompt`; UI in Settings → AI; selectable per feature (§13.4).
4. Per-scene context editor: on the scene details panel, show effective context (linked entries + always-included) with add/remove.

**UX specification.** Preview drawer identical across features: sections with token counts and a total against the model's window; over-budget rows flagged with what was trimmed and why.

**Technical approach.** Builder is pure + unit-tested (token estimation via chars/4 heuristic, labelled as estimate). Schema: one optional field on `AiPreset` (backup-safe: presets are in `BACKED_UP_TABLES`).

**Risks & dependencies.** Depends on §13.5 plumbing; feeds §5.2. Token estimates must be labelled estimates — honesty over precision.

**Effort.** 1: L · 2: M · 3: M · 4: M.

**Priority.** P1 (1, 2), P2 (3, 4).

**Acceptance criteria.**
- [x] The same preview component shows the plan in chat and editor actions. *(Book Creator uses its own two-shot prompt builder with no context selection to explain; folded into §15 rather than forced here.)*
- [x] An entry set to `never` provably never appears (asserted against the prompt text itself); a budgeted entry is trimmed with a visible reason, and a dropped one names which of four reasons applied.
- [ ] A custom system prompt saved in the library changes what the preview shows, verbatim. **§14.3 prompt library is P2, not in this phase** — a preset's existing `systemPrompt` already appears in the preview as "Your own instructions".

---

## 15. Book Creator wizard

**Current state.** Four steps (Concept/Outline/Cast/Review), AI generate with hand-editing fallback on parse failure (`prompts.ts` returns null → inline error + manual add), creates project + chapters/scenes + codex entries + cards on completion (`book-creator-wizard.tsx:143-240`), navigates to the editor.

**Problems.** §7's history/draft issues. The wizard ignores `manuscriptTemplates` entirely — two competing definitions of "how a book starts" (`templates.ts` `BUILT_IN_TEMPLATES` vs the wizard's flat chapters), and wizard books get no prologue/epilogue structure. Validation is title-only. No skip affordance ("just make the project"). Chapters created with `status: 'outline'` but scenes' summaries carry the outline — reasonable, but invisible in the handoff (writer lands in the editor with no tour of what was made).

**Proposed changes.**
1. §7.1–7.3 (history, draft, escapes) — counted there.
2. Template integration: Concept step gains the format picker used by New Project (`template-picker.tsx`); generated outline maps into the template's parts (prologue keeps title, chapters fill `{n}`).
3. Skip: "Create with just the concept" action from step 1.
4. Completion handoff: land on the editor with a one-time banner ("12 chapters, 4 characters created — cast lives in Playground") linking to Playground.
5. Per-step validation messages (outline: ≥1 chapter; cast: names non-empty already enforced by trim-skip — make it visible).

**UX specification.** Stepper unchanged (it's good); template picker matches project dialog; banner dismisses permanently per project.

**Technical approach.** Reuse `applyTemplate` (`features/templates/lib/apply-template.ts`) then merge outline content; draft hook from §7.

**Risks & dependencies.** §7 first. Template-merge is the only tricky logic — unit-test the mapping.

**Effort.** 2: M · 3: S · 4: S · 5: S.

**Priority.** P1 (2 — two sources of truth), P2 (3, 4, 5).

**Acceptance criteria.**
- [x] A wizard book built on "Standard novel" has Prologue/Chapters/Epilogue with outline content in the right places.
- [x] Skip from step 1 yields a usable empty project. *(It yields a usable project laid out in the chosen format, which is better than empty and no more work.)*
- [x] Banner appears once, links work, never returns after dismiss.

**Done** — `merge-outline.ts` + `step-advice.ts` + `handoff.ts`, `scripts/wizard-template-check.mjs` (24 checks).

---

## 16. Cover Studio

**Current state.** `covers-home.tsx` + `cover-preview.tsx` (live preview), `typography-layer-row.tsx` (text layers), `render-cover.ts` (canvas export), `resolve-cover.ts` (single resolver with cache — solid, tested), aspect presets (`aspect.ts`). Design persists on the `covers` table keyed by `projectId`; exports save to `imageAssets` (`Project.coverId` documents this trap).

**Problems.** Image placement is slider-based, not direct-manipulation — precision crop/position by drag doesn't exist. Text layers lack per-layer colour-from-image or stroke/shadow options beyond current fields (verify per-field during build). No overlays (gradients/textures) beyond background treatment. One design per project (no drafts/variants). Export targets fixed (PNG; sizes per aspect) — no KDP-style dimension presets with bleed. Re-editability is good (design is data), but undo within the studio doesn't exist.

**Proposed changes.**
1. Direct manipulation: drag-to-position and pinch/wheel-zoom the source image on the preview, writing the same crop fields the sliders write (sliders stay for precision).
2. Layer options: per-text-layer shadow/stroke toggles, and an eyedropper that samples the uploaded image (canvas readback).
3. Overlay layer: top/bottom gradient scrim with colour + strength (two fields), for legibility over busy art.
4. Variants: covers table already keys by project — add `name` and allow multiple rows per project with an active flag; picker in the studio. (Schema: additive fields + index unchanged; migration: existing row becomes "Cover 1", active.)
5. Export presets: named dimension sets (e-book 1600×2560, KDP paperback with computed spine given page count) — spine maths flagged as a **suggestion**, not required scope.
6. Studio-local undo: command stack over design state (session-only).

**UX specification.** Canvas-first layout; layer list right (sheet on mobile); every control writes through the live preview; export dialog shows target dimensions and file size after render.

**Technical approach.** Pointer handlers on preview writing crop state (same pattern as card tilt: pure math + thin DOM layer); overlay rendered in both preview CSS and `render-cover.ts` canvas (parity test: render then pixel-probe, as `verify-front-page` does).

**Risks & dependencies.** Preview/export parity is the risk — every visual feature lands in both paths or not at all; the pixel-probe suite is the gate. Independent of other sections.

**Effort.** 1: M · 2: M · 3: S · 4: M · 5: M · 6: M.

**Priority.** P1 (1, 3 — the stated "cover maker upgrade" core), P2 (2, 4, 6), P3/suggestion (5 spine maths).

**Acceptance criteria.**
- [x] Drag the image; exported PNG matches the preview position within a pixel-probe tolerance. *(They match exactly, not within a tolerance — both now read one geometry.)*
- [x] Scrim makes white text legible over a light image (contrast probe on the export). **Correction to this section's premise:** the scrim already existed (`cover.overlay`, in both the preview and `render-cover.ts`); what was missing was any proof it worked, which is what the probe adds.
- [x] Two variants switchable; box set and front page use the active one (`resolve-cover` tests extended).
- [x] Undo reverts the last ten operations in-session. *(Fifty, gesture-grained, with redo.)*

**Done: 16.1–16.4, 16.6** — `crop-geometry.ts`, `design-history.ts`, variant picker + eyedropper + outline; `scripts/cover-crop-check.mjs` (17 checks) and `scripts/cover-studio-check.mjs` (14 checks). Remaining: 16.5 (KDP spine maths), which this plan already flags as a suggestion rather than scope.

---

## 17. Planning & outlining tools

**Current state.** Corkboard (`corkboard-view.tsx` + items) and status board (`status-board-view.tsx` + items) over chapters/scenes; scene records carry `beats[]`, `labels[]`, `status`, `summary` (`types/editor.ts`); goals/stats separate (§11).

**Problems.** Beats exist in data and in the AI flow but have no dedicated editing surface outside the scene panel. No timeline view. Board/corkboard mobile ergonomics unaudited (drag on touch). Labels are free strings with no management (rename/merge nowhere).

**Proposed changes.**
1. Beats editor on the corkboard card flip (tap to flip: summary ⇄ beats list) — matches the index-card metaphor already in play.
2. Label manager: rename/merge/delete across a project (small dialog; store-level update).
3. Touch drag audit for boards (pointer sensors, 44px handles) — part of §8.3 sweep.
4. Timeline view: **deferred, P3** — valuable but a new data dimension (dates/order beyond chapter order); flagged as suggestion pending demand.

**UX specification.** Flip animation motion-gated; label manager lists usage counts; empty planning state links to Book Creator outline step.

**Technical approach.** No schema (beats/labels exist).

**Risks & dependencies.** §8 for touch.

**Effort.** 1: M · 2: S · 3: with §8 · 4: L (deferred).

**Priority.** P2 (1, 2), P3 (4).

**Acceptance criteria.**
- [ ] Beats editable from the corkboard; changes appear in the editor's scene panel.
- [ ] Merging two labels updates every scene carrying them.

---

## 18. Search, command palette & keyboard shortcuts

**Current state.** Palette (`command-palette.tsx`): its own nav list (drifted — missing Read/Series) + actions (theme toggle, shortcuts dialog, focus mode, manuscript search, new chapter). Global shortcuts in `global-shortcuts.tsx`; static shortcut list rendered by `shortcuts-settings.tsx` from a `SHORTCUTS` constant; no customisation. Search: manuscript-only (`manuscript-search-panel.tsx`); Almanac has list filtering; no global search.

**Problems.** Palette drift (§2.2 fixes). No cross-entity search — "where is Mira mentioned" spans manuscript (exists), Almanac names, cards, chats, none unified. Shortcuts are fixed and the list is the only discoverability.

**Proposed changes.**
1. Palette results become search results too: typing beyond commands searches scenes (title+text via stores), Almanac entries (name/aliases), cards (name), navigating on select.
2. Shortcut customisation: `preferences-store` map over the existing `SHORTCUTS` ids; capture UI in `shortcuts-settings.tsx`; conflict detection against the fixed set; reset per binding. Scope: app shortcuts only, not TipTap editing keys (honest boundary — remapping editor keys fights the editor).
3. Cheatsheet: the existing shortcuts dialog gains print-friendly layout and the palette lists it (already does — keep).

**UX specification.** Palette sections: Commands · Scenes · Almanac · Characters, keyboard-navigable; per-result subtitle shows project. Empty query = commands as today.

**Technical approach.** Search over in-memory stores for the current project first (honest scope; cross-project search deferred until §23 indexes exist). Custom bindings validated at capture.

**Risks & dependencies.** Store loading discipline (§ audit note): palette must trigger loads it needs. §2.2 first.

**Effort.** 1: M · 2: M · 3: S.

**Priority.** P1 (1), P2 (2, 3).

**Acceptance criteria.**
- [x] ⌘K "salt road" lists the scene and opens it at the editor — `scripts/palette-search-check.mjs` proves it lands with the find bar seeded and the match at "1 of 1".
- [x] Rebinding focus-mode to a free key works after reload; a conflicting key is refused with the holder named (same harness, live).

---

## 19. Onboarding, empty states & in-app help

**Current state.** Per-surface `EmptyState` component used across routes (good copy, actions). No first-run experience; no sample project; help is docs files in `inkwell/docs/` (auth setup) not surfaced in-app. The backup nudge (`backup-nudge.tsx`) is the one proactive teaching moment.

**Problems.** A new writer lands on an empty Projects screen with two buttons and no sense of the app's breadth (Almanac, Playground, Reader invisible until a project exists). Nothing explains local-first/data ownership up front — the app's best property is undiscoverable.

**Proposed changes.**
1. First-run panel on empty Projects (replaces the plain empty state once): three cards — Start writing (New project) · Let AI draft the shape (Book Creator) · **Explore a sample** (seeds a small public-domain project: 3 chapters, 4 Almanac entries, 2 cards with designs, a cover). Deletable like any project.
2. Sample generator as code (`lib/db/sample-project.ts`), not shipped data — versionable, tiny.
3. One-line data promise on first run: "Everything stays on this device unless you sign in" with a link to the Data tab.
4. Contextual help: sparse "?" links on complex surfaces (context preview, theme editor) opening short in-app sheets, not external docs.

**UX specification.** First-run shows once (preference flag); sample project badge "Sample" on its card; help sheets ≤150 words each.

**Technical approach.** Seeder uses existing repos; flag in `preferences-store`.

**Risks & dependencies.** None. After §3 so sample cards land in Playground naming.

**Effort.** 1: M · 2: M · 3: S · 4: M.

**Priority.** P2.

**Acceptance criteria.**
- [ ] Fresh profile: first-run appears; seeding the sample yields a browsable book, cast and cover in under 2s; deleting it bins everything (cascade verified).
- [ ] Second launch: normal Projects screen.

---

## 20. Settings & customisation

**Current state.** Tabs in `settings-home.tsx`: AI (providers/presets), Appearance (manuscript typeface, focus-mode toggles, full theme system), Shortcuts (static list), Data (export/restore, storage health, trash), Account (auth). Preferences persisted in `preferences-store` (editor font, typewriter, dim). Theme system already deep (themes, shape, typography, page edges, per-project looks).

**Problems.** Several behaviours are hardcoded that writers will reasonably want to set: autosave debounce, snapshot cadence/retention, default export format, backup-nudge thresholds, smart-typography (§11.5), per-feature AI presets (§13.4), density (§9.4). Settings aren't searchable, and the Appearance tab is now three screens long.

**Proposed changes.**
1. New **Editor** tab: typeface (moved from Appearance), focus-mode toggles (moved), smart typography, autosave interval, snapshot retention.
2. New **Defaults** group under Data or per-feature: export format, new-project template, per-feature AI presets.
3. Settings search: flat index of setting labels → tab+anchor; input at the top of Settings (in-memory, trivial).
4. Every added setting ships with the sensible current value as default — progressive disclosure: nothing new is required reading.

**UX specification.** Tab list grows to: Editor · Appearance · AI · Shortcuts · Data · Account. Search filters visible panels live. Mobile: tabs scroll horizontally (existing pattern).

**Technical approach.** `preferences-store` fields with defaults; a `SETTINGS_INDEX` array colocated with panels.

**Risks & dependencies.** Move of typeface/focus toggles must keep persisted keys (same store — no migration).

**Effort.** 1: M · 2: S · 3: S · 4: —.

**Priority.** P2.

**Acceptance criteria.**
- [ ] Searching "autosave" lands on the control; changing it changes observed debounce.
- [ ] All previous preferences survive the tab reshuffle (same stored values).

---

## 21. Data layer, persistence & safety

**Current state.** Strong: Dexie v3 with additive versioning (`schema.ts`), soft-delete bin with 30-day sweep + cascade (`soft-delete.ts`, `cascade.ts`), whole-library backup with schema-completeness test (`web-library.ts` + test), migration filter on import (`library-schema.ts` `migrateLibrary`), storage persistence honestly reported (`durability.ts`, `storage-health.tsx`), Tauri disk port (`tauri-db.ts`), optional Firestore sync (`lib/sync/`), scene snapshots with diff UI.

**Problems.** Sync conflict policy is last-write-wins implicitly — never surfaced to the writer (two-device edits silently lose one side). Snapshot retention is unbounded (storage growth on long books). `CardChat.messages` embedded array rewrites whole rows per message (§ audit) — fine now, a scaling cliff later. No integrity self-check surface (backup verifies on import only).

**Proposed changes.**
1. Sync conflict copies: when sync would overwrite a locally-newer scene, keep the loser as a snapshot labelled "Conflicting edit from other device" — never silent loss. (Scenes first; other tables are lower-stakes.)
2. Snapshot retention policy: keep all ≤7 days, then daily-latest ≤90, then weekly (setting in §20.1); sweep with the bin sweep.
3. Chat message pagination boundary: split `messages` into a `chatMessages` table keyed by chatId at Dexie v4 with an in-place migration — **only when** §5 lands message actions; until then, documented ceiling.
4. Integrity check action in Data tab: runs the backup builder in dry-run, reports counts per table, flags orphans (cascade lib already knows the graph).

**UX specification.** Conflict snapshots appear in existing history UI with a distinct label; integrity report is a plain list with copy button.

**Technical approach.** 1 hooks `sync-engine.ts` apply path; 2 extends the boot sweep; 3 is the only schema migration in this plan (additive table + copy + delete field, guarded, reversible by backup).

**Risks & dependencies.** 3 is the riskiest single item in the plan — schedule alone, behind a backup prompt.

**Effort.** 1: M · 2: S · 3: L · 4: M.

**Priority.** P1 (1), P2 (2, 4), P2-deferred (3).

**Acceptance criteria.**
- [x] A remote scene that would overwrite different local text preserves the local copy as a labelled snapshot before resolving. Unit-tested on the decision; wired into `applyRemote`, which is the single point every remote scene write goes through.
- [x] Snapshot counts obey the policy after sweep on a seeded history — a year of four-a-day thinned from 1,461 to 153, stable on a second run, conflict copies untouched (`scripts/data-safety-check.mjs`).
- [x] Integrity check on a doctored library names the broken link and the record; on a healthy one it says so.

**Shipped (§21.1, §21.2, §21.4).** `lib/sync/conflict.ts` decides when local text would be lost; `lib/db/snapshot-retention.ts` is the retention policy, pure and testable at any age; `lib/db/sweep-snapshots.ts` applies it once a session beside the bin sweep; `lib/db/integrity.ts` + the Library check in Settings → Data read and report without ever repairing.

---

## 22. Import & export / interoperability

**Current state.** Per-project manuscript export: markdown/text/html/docx/epub (`features/export/lib/exporters.ts`). Whole-library `.inkwell` backup/restore (§21). Theme files (`theme-file.ts`). Desktop menu wires export (`desktop-menu-bridge.tsx`). No character-card interchange (§4.4 adds), no Codex-only export, no inbound manuscript import.

**Problems.** No way *in* for an existing manuscript (the biggest adoption blocker for writers mid-book). Codex knowledge can't leave alone (only inside full backup). Export defaults re-chosen every time.

**Proposed changes.**
1. Manuscript import: Markdown (chapter per `#`/file) and .docx (headings → chapters, using a parse-only path of the existing `docx` dependency) into a new or existing project — with a preview of the detected structure before commit (same review pattern as §6.4).
2. Almanac export/import: JSON per project (schema-versioned like theme files).
3. Export defaults remembered (§20.2).
4. Migrating from other tools (Scrivener/NovelCrafter): **suggestion only** — each is its own format research project; not planned scope.

**UX specification.** Import lives on Projects ("Import manuscript…") and in the project menu; structure preview lists chapters/scene counts with rename before create.

**Technical approach.** `features/export/lib/importers.ts` mirroring exporters; pure parse + preview model + executor.

**Risks & dependencies.** Docx structure variance — preview step is the safety valve. None upstream.

**Effort.** 1: L · 2: S · 3: S.

**Priority.** P1 (1), P2 (2, 3).

**Acceptance criteria.**
- [x] A 30-chapter Markdown file imports with structure matching the preview exactly; word counts sum correctly.
- [x] Almanac JSON round-trips entries, attributes, relationships (images included as base64, matching backup format conventions).

**Done: 22.1, 22.2, 22.3** — `features/import/` (28 harness checks), `features/codex/lib/almanac-file.ts` + `run-almanac-io.ts` (`scripts/almanac-io-check.mjs`, 12 checks), and the export dialog remembers its format. 22.1 landed under `features/import/` rather than `features/export/lib/importers.ts`: reading a foreign document has nothing in common with writing one of ours, and the parse is the whole of the work.

---

## 23. Performance

**Current state (measured this audit).** Build chunks: `vendor` 824K, `vendor-three` 520K (Three.js — series box set only), `vendor-firebase` 464K, `vendor-tiptap` 348K (pre-gzip); route-level code splitting already in place (`lazy-routes.tsx`), so heavy chunks load on demand. 445 unit tests in ~3s. No measured startup or large-corpus numbers exist yet — that absence is itself the finding.

**Problems.** No baseline numbers, so regressions are invisible. Mentions scanning (§12.5) and the palette search (§18.1) are O(corpus) on the main thread. Cards/Almanac grids unvirtualised. Firebase chunk loads for signed-out users (verify: import graph may pull it eagerly via auth-store).

**Proposed changes + targets (the numbers to hit).**
1. Instrument first: a `perf.md` with the measurement recipe (Playwright CDP traces on a seeded 150k-word, 200-entry, 60-card project — the "big book" fixture).
2. Targets: cold start to interactive Projects **< 2.5s** on 4× CPU throttle; editor open on big book **< 1.5s**; keystroke→paint p95 **< 33ms** in a 5k-word scene; Almanac list filter **< 100ms**; card grid 60 cards **60fps** hover (no long task > 50ms); initial route JS (gz) **< 350KB**.
3. Defer Firebase behind sign-in intent if the graph shows it eager (dynamic import at the auth boundary).
4. Virtualise Almanac list and card grid at >100 items (only then — virtualisation below that costs UX).
5. Move mentions index build to a worker if the big-book fixture exceeds 50ms main-thread (measure first; don't pre-optimise).

**UX specification.** None user-visible beyond speed; loading states already exist.

**Technical approach.** Fixture seeder shared with §19.2; CI-runnable perf script reporting against targets (advisory, not blocking initially).

**Risks & dependencies.** Numbers may prove some fears unfounded — that's success; delete the task, keep the fixture.

**Effort.** 1: M · 2: — (definition) · 3: S · 4: M · 5: M.

**Priority.** P1 (1, 3), P2 (4, 5).

**Acceptance criteria.**
- [ ] `perf.md` exists with reproducible commands and the current numbers table.
- [ ] Signed-out cold start downloads no Firebase bytes (network log).
- [ ] Big-book fixture meets every target above, or the miss is documented with a follow-up.

---

## 24. Accessibility & robustness

**Current state.** Radix primitives (focus traps, roles) throughout `components/ui/`; aria-labels added systematically during past audits (trash restore, card menus, dial sliders all labelled); contrast guarded by tests (`oklch.test.ts` default pairs, card ink sweep); reduced-motion + motion-scale honoured; per-route error boundaries (`router.tsx` `screen()`); offline shell via SW; `aria-live` on toasts (Radix).

**Problems.** Keyboard reach untested for: manuscript tree reorder, corkboard/status drag, reader page turns (arrow keys exist? unverified on mobile toolbar). Focus mode hides chrome — screen-reader announcement of mode change unverified. No skip-to-content link. Autosave state (§11.1) needs `aria-live` from birth. High-contrast theme exists but no systematic axe pass has ever run.

**Proposed changes.**
1. Axe pass per route (Playwright + axe-core) wired into the live-suite family; fix criticals.
2. Keyboard parity for drag interactions: move-up/down menu items already exist in tree (`tree-items.tsx` — verify) — extend the pattern to boards.
3. Skip link + landmark roles in `app-shell.tsx`.
4. Announcements: focus-mode toggle, autosave state, generation start/stop via a single `aria-live` region helper.
5. Robustness: error boundary fallbacks get "copy error" + "report" affordances; IndexedDB open-failure path shows the storage-health screen rather than a blank app (verify current behaviour under simulated failure).

**UX specification.** Invisible when unneeded, standard when needed.

**Technical approach.** axe suite joins the scratchpad verification set; `useAnnounce()` helper.

**Risks & dependencies.** None; after major layout changes (§3, §8) to avoid re-testing twice.

**Effort.** 1: M · 2: M · 3: S · 4: S · 5: M.

**Priority.** P1 (1, 5), P2 (2, 3, 4).

**Acceptance criteria.**
- [ ] Axe: zero critical violations per route.
- [ ] Full app tour possible keyboard-only (documented walkthrough).
- [ ] Simulated IDB failure lands on an explanatory screen with export guidance, not white.

---

## 25. Execution roadmap

Ordered phases; each ends with the standing gates (typecheck 0 · lint 0 · tests green · build clean) plus the named live suites, one section at a time per hard rule 6.

| Phase | Contents | Effort | Risk | Definition of done |
|---|---|---|---|---|
| **0 — done** | SW war fix (`917643c`) | S | low | shipped; repro suites green |
| **1 — done** | §7.1–7.4 wizard history/draft/matrix | M | low | shipped; §7 boxes ticked, 32/32 matrix |
| **2 — done** | §2.2/2.5/2.6, §2.3, §3.1–3.4/3.6 | M+M | med (redirects) | shipped; §2 + §3 boxes ticked, 22/22 + 21/21 live. §3.5 deferred to Phase 4 with §5 |
| **3 — done** | §6.1–6.7, §4.1/4.3 | L | med (undo correctness) | shipped; undo byte-check green (16/16 live, 27 unit). §6.8 Send/Pull outstanding |
| **4 — done** | §13.1–3/13.6, §14.1–2, §5.2–3/5.5, §3.5, §6.8 | L | med | shipped; 47 new unit tests, 3 live suites (10/10, 7/7 + earlier). §13.4–5, §14.3–4 are P2, deferred |
| **5 — done** | §8.1–8.5 | L | med (reader CSS) | shipped; 28/28 device matrix, reader 9/9 |
| **6 — done** | §21.1/21.2/21.4, §11.1 | M | med (sync path) | shipped; data-safety 8/8, 17 new unit tests. §11.2 goal editing and §12.3 remain |
| **7 — Creation flows** | §15.2–5, §22.1, §16.1+3 | L | med | wizard-template + import previews |
| **8 — Customisation** | §20, §13.4–6, §14.3–4, §18 | L | low | settings search; palette search |
| **9 — Consolidation & polish** | §9, §10, §12.1, §4 rest, §16 rest, §17, §19 | L | low | greps + suites per section |
| **10 — Perf & a11y hardening** | §23, §24 | M | low | numbers table + axe zero-critical |

Dependencies flow downward only. Windows path (`src-tauri/`, installer workflow) is untouched by every phase; anything touching `lib/db` schema (only §21.3, deferred) is flagged before execution. Cosmetic work deliberately last (rule: P0 first, restructure early, polish last).

---

## Open questions

1. ~~**Second-app tenancy.**~~ **Resolved.** The co-tenant has been deleted from the repository; INKWELL owns the root and the deploy publishes it alone. Cache-prefix discipline stays in `public/sw.js` regardless, because a `github.io` origin is shared by all of an owner's project sites.
2. **Playground substructure** is proposed as Cards · Chats · Personas · Lorebooks (§3). Bless or amend before Phase 2 — it's the one rename users will feel.
3. **Linked-vs-snapshot default** for character import: plan recommends Linked with per-import toggle (§6.6). Confirm.
4. **"Editor" → "Write"** and any other label changes beyond the required ones (§2 naming audit): approve individually — cheap to do, personal taste, not assumed.
5. **Chat message table migration** (§21.3): approve the *principle* now (it gates unbounded roleplay length) or defer until someone actually hits the ceiling?
6. **Sample project content** (§19): any preference for the public-domain text used, or shall I pick something short and neutral?
7. **KDP spine maths** (§16.5) and **Scrivener/NovelCrafter import** (§22.4) are logged as suggestions, not scope. Pull either in?
