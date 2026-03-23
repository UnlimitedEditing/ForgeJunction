# Graydient Skill Editor — Build Spec
> Block-Based MVP for Claude Code

---

## What We're Building

A single-page React app for authoring Graydient workflow skills. Skills are structured documents with typed blocks. The editor enforces skill anatomy without restricting content, and exports output identical to hand-written `.txt` skill files.

No backend. No auth. `localStorage` only.

---

## Tech Stack

| Layer | Choice |
|---|---|
| Framework | React + Vite |
| State | Zustand |
| Drag/Drop | dnd-kit |
| Code fields | CodeMirror 6 |
| Styling | Tailwind CSS |
| Storage | localStorage |
| Export | File System Access API + `.txt` fallback |

---

## Data Model

```ts
type SkillDocument = {
  id: string                  // uuid
  meta: SkillMeta
  blocks: Block[]
  createdAt: string
  updatedAt: string
  version: number
}

type SkillMeta = {
  name: string
  slug: string
  targetWorkflow: string      // e.g. "flux2", "zimage-turbo", "render", "edit-qwen"
  commandType: "txt2img" | "img2img" | "wf" | "render" | "custom"
  tags: string[]
  status: "draft" | "active" | "archived"
}

// Block union type
type Block =
  | PurposeBlock
  | WorkflowBlock
  | RuleBlock
  | CommandTemplateBlock
  | ExampleBlock
  | WarningBlock
  | NoteBlock
  | RawBlock

type BlockBase = {
  id: string
  type: Block["type"]
  order: number
}

type PurposeBlock          = BlockBase & { type: "purpose";           content: string }
type WorkflowBlock         = BlockBase & { type: "workflow";          slug: string; commandType: string; notes: string }
type RuleBlock             = BlockBase & { type: "rule";              content: string; priority: "required" | "optional" | "never" }
type CommandTemplateBlock  = BlockBase & { type: "command_template";  template: string; variables: TemplateVariable[] }
type ExampleBlock          = BlockBase & { type: "example";           userInput: string; command: string; notes: string }
type WarningBlock          = BlockBase & { type: "warning";           content: string; severity: "info" | "caution" | "critical" }
type NoteBlock             = BlockBase & { type: "note";              content: string }
type RawBlock              = BlockBase & { type: "raw";               content: string }

type TemplateVariable = {
  name: string
  description: string
  required: boolean
  default?: string
}
```

Storage keys:
- `skill:index` — string[] of skill IDs
- `skill:{id}` — JSON serialized SkillDocument
- `skill:events` — append-only JSON array of SkillEvent (see Data Collection)

---

## App Structure

```
/src
  /app
    App.tsx
    router.tsx

  /features
    /editor
      EditorPage.tsx            — main editing canvas
      BlockList.tsx             — ordered block array with drag-to-reorder
      BlockToolbar.tsx          — add block buttons
      ExportBar.tsx             — export .txt, copy to clipboard, rate skill

      /blocks
        PurposeBlock.tsx
        WorkflowBlock.tsx
        RuleBlock.tsx
        CommandTemplateBlock.tsx
        ExampleBlock.tsx
        WarningBlock.tsx
        NoteBlock.tsx
        RawBlock.tsx
        BlockWrapper.tsx        — shared chrome: drag handle, type label, delete

    /library
      LibraryPage.tsx           — skill list, filter/sort
      SkillCard.tsx
      ImportSkill.tsx           — paste raw .txt → parse into blocks

    /preview
      PreviewPane.tsx           — live markdown render of the skill

  /shared
    /components
      TagInput.tsx
      CommandTokenizer.tsx      — highlights /wf /run: /size: tokens
      VariableHighlighter.tsx   — highlights {CURLY_BRACE} variables
    /hooks
      useSkillStorage.ts
      useSkillExport.ts
    /utils
      parser.ts                 — raw .txt → Block[]
      serializer.ts             — Block[] → raw .txt
      validator.ts              — completeness checks
      events.ts                 — event log helpers
```

---

## Editor Layout

Two-column split. Left: block canvas. Right: live preview (collapsible).

**Validation bar** pinned at top of the canvas. Live completeness score:
- Has purpose block
- Has workflow block
- Has ≥ 1 rule block
- Has command template block
- Has ≥ 2 example blocks
- No undefined `{VARIABLES}` in template

Score shown as `4/6 complete` with inline hints for what's missing.

---

## Block Behaviours

| Block | Input | Detail |
|---|---|---|
| `purpose` | Textarea | Character count shown |
| `workflow` | Slug text + commandType dropdown + notes | Slug autocompletes from known workflows |
| `rule` | Textarea + priority toggle | Border color: green/yellow/red per priority |
| `command_template` | CodeMirror monospace editor | Variables auto-extracted into a table below. `/wf`, `/run:`, `/size:` tokens highlighted |
| `example` | Two fields: User Input (plain) + Command (monospace) + collapsible notes | |
| `warning` | Textarea + severity toggle | Background tinted by severity |
| `note` | Plain textarea | No special behaviour |
| `raw` | Plain textarea | Escape hatch. Injected verbatim into export |

All blocks share:
- Drag handle (left edge)
- Type badge (top left)
- Collapse/expand toggle
- Delete button (top right)
- Collapsed state shows one-line summary

---

## Serializer: Block[] → .txt

Produces output structurally identical to hand-written skill files.

```
# {meta.name}

## Purpose
{purpose.content}

## Target Workflow
- Slug: {workflow.slug}
- Type: {workflow.commandType}
{workflow.notes}

## Rules
- [REQUIRED] {rule.content}
- [OPTIONAL] {rule.content}
- [NEVER] {rule.content}

## Command Template
{command_template.template}

Variables:
| Variable | Description | Required | Default |
|...|

## Examples

User: {example.userInput}
Command: {example.command}

## Warnings
> [{warning.severity}] {warning.content}

## Notes
{note.content}

---
{raw.content}
```

Rules sort order in output: required → optional → never.
Raw blocks inject at their position in the block order.

---

## Parser: .txt → Block[]

Import flow: user pastes raw skill text → parser decomposes into typed blocks → review screen shows each parsed block with confidence badge → user confirms or changes block types before saving.

Parsing heuristics:
- `# Heading` → skill name (meta)
- `## Purpose` section body → PurposeBlock
- `## Target` section → WorkflowBlock (extract slug, type)
- `- bullet lines` under Rules → RuleBlocks (detect REQUIRED/OPTIONAL/NEVER prefix if present)
- Lines starting `/wf` or `/render` → ExampleBlock command field
- `User:` prefix lines → ExampleBlock user input
- `> ` prefix lines → WarningBlock
- Everything unmatched → RawBlock with flag

Low-confidence blocks shown with yellow badge. All raw blocks flagged for review.

---

## Library View

Grid of SkillCards. Each card shows:
- Name + slug
- Workflow badge
- Status dot (draft / active / archived)
- Completeness score
- Example count
- Rating (thumbs up / down / unrated)
- Last edited timestamp

**Filters:** workflow, status, rating, completeness threshold
**Sort:** last edited, name, completeness, example count

---

## Export Flow

Export button opens a small modal:
1. Preview of the serialized `.txt`
2. Download as `.txt` or Copy to clipboard
3. **"Did this skill produce correct output?"** — Thumbs up / Thumbs down / Skip

Rating is written back to the skill document and logged as an event.

---

## Data Collection

Every meaningful interaction appended to `skill:events` in localStorage.

```ts
type SkillEvent = {
  skillId: string
  eventType:
    | "skill_created"
    | "skill_imported"
    | "block_added"
    | "block_edited"
    | "block_deleted"
    | "block_reordered"
    | "example_added"
    | "rule_priority_changed"
    | "export_triggered"
    | "skill_rated"
    | "validation_passed"
  payload: Record<string, unknown>
  timestamp: string
}
```

Key events and their payloads:

```ts
// skill_rated
{ rating: "thumbs_up" | "thumbs_down", completenessScore: number, exampleCount: number, workflow: string }

// block_added
{ blockType: Block["type"], position: number, totalBlocks: number }

// example_added
{ userInputLength: number, commandLength: number, skillWorkflow: string }

// export_triggered
{ completenessScore: number, blockCount: number, exampleCount: number, ruleCount: number }
```

**Library export:** a "Export data bundle" button in Library settings exports the full corpus as a single JSON:
```json
{
  "exportedAt": "...",
  "skills": [ ...all SkillDocuments ],
  "events": [ ...all SkillEvents ]
}
```

This bundle is the handoff artifact for the LLM integration layer later.

---

## Known Workflows Registry

Hardcoded initially, editable in settings:

```ts
const KNOWN_WORKFLOWS = [
  { slug: "flux2",         commandType: "txt2img", label: "Flux 2" },
  { slug: "zimage-turbo",  commandType: "txt2img", label: "Zimage Turbo" },
  { slug: "render",        commandType: "txt2img", label: "Render (Anime/SDXL)" },
  { slug: "edit-qwen",     commandType: "img2img", label: "Qwen Edit" },
]
```

Used for slug autocomplete in WorkflowBlock and workflow filter in Library.

---

## Milestones

| # | Deliverable | Effort |
|---|---|---|
| 1 | Data model + localStorage CRUD + Zustand store | 1 day |
| 2 | All 8 block types rendered and editable | 2 days |
| 3 | Serializer + export modal + rating prompt | 1 day |
| 4 | Parser + import review flow | 1 day |
| 5 | Drag reorder (dnd-kit) + validation bar | 1 day |
| 6 | Library view + filters + sort | 1 day |
| 7 | Live preview pane | 0.5 day |
| 8 | Event logging throughout | 0.5 day |
| 9 | Data bundle export | 0.5 day |
| 10 | Polish + edge cases | 1 day |

**~9.5 days total**

---

## Out of Scope

- Backend, auth, sync — localStorage only
- LLM assistance of any kind
- Version history beyond current document
- Collaboration / multi-user
- Any Graydient API integration

These are intentionally deferred. The data bundle export in milestone 9 is the only forward-looking hook needed.
