# AI-WITH-RPG-MAKER-MZ

> This project was completed with end-to-end support from Codex.

AI workbench for RPG Maker MZ with:

- natural-language map planning
- NPC dialogue powered by a local proxy
- an AI chat scene with timeline dots, jump navigation, and export tools
- a project explorer for browsing maps, submaps, and per-NPC settings
- drag-and-drop NPC relocation between maps and submaps
- a visual stage editor for conditional NPC dialogue states
- NPC profile and quest-state generation
- common event and item scaffolding
- a local web UI for preview, apply, backup, and undo

## Quick Start

Double-click one of these files from the project root:

- `Start AI Workbench.vbs`
  Recommended. Starts the workbench without showing a terminal window.
- `Start AI Workbench.cmd`
  Starts the same workflow with a normal Windows command launcher.

Both launchers will:

- start the local proxy if it is not already running
- open the workbench in your browser at `http://127.0.0.1:43115/`

## Main Files

- `Start AI Workbench.cmd`
- `Start AI Workbench.vbs`
- `tools/ai-rpg-maker/server.mjs`
- `tools/ai-rpg-maker/start-workbench.ps1`
- `tools/ai-rpg-maker/run-workbench-server.ps1`
- `tools/ai-rpg-maker/scaffold-game-from-prompt.mjs`
- `tools/ai-rpg-maker/apply-content-plan.mjs`
- `tools/ai-rpg-maker/web/index.html`
- `newdata/js/plugins/AiNpcDialogueMZ.js`

## Current Workflow

- launch the workbench by double-clicking `Start AI Workbench.vbs`
- load a project overview to browse map -> submap -> NPC structure
- drag NPCs between maps in the tree or change their target map in the editor
- edit background, placement, movement, tracked states, and dialogue stages
- preview generated content before writing it into the project
- apply with automatic backup and restore support

## Supported Now

- [x] One-click local startup by double-clicking `Start AI Workbench.vbs` or `Start AI Workbench.cmd`
- [x] Local web UI for preview, apply, backup, and undo
- [x] Natural-language map planning
- [x] Natural-language content planning for NPCs, quests, items, and events
- [x] One-command scaffold pipeline for generating map plans and content plans together
- [x] RPG Maker MZ map skeleton generation for towns and interiors
- [x] Parent and child map relationships for generated submaps
- [x] AI NPC dialogue plugin for free-text player input
- [x] NPC dialogue scene with timeline dots, jump navigation, and export tools
- [x] NPC profile loading from `AiNpcProfiles.json`
- [x] NPC dialogue that changes with switches, variables, and stage conditions
- [x] Project explorer for browsing map -> submap -> NPC structure
- [x] Per-NPC editor for placement, movement, role, background, notes, and tracked state
- [x] Drag-and-drop NPC relocation between maps and submaps
- [x] Visual stage editor for conditional NPC dialogue states
- [x] Writing generated NPC, quest, and item data into RPG Maker project files
- [x] Automatic backup before apply
- [x] Restore from backup history
- [x] Exporting NPC chat history as TXT or JSON

## Not Supported Yet

- [ ] Real image generation API integration
- [ ] Voice input or speech-to-text for player dialogue
- [ ] NPC voice output or text-to-speech
- [ ] Creating or editing tiles visually inside the RPG Maker editor UI itself
- [ ] Fully automatic city art, tileset art, portrait art, or costume art generation inside this tool
- [ ] Visual map painting or drag-and-drop building layout editing in the workbench
- [ ] Creating new NPC events directly from the project explorer
- [ ] Deleting NPC events directly from the project explorer
- [ ] Bulk multi-select editing for several NPCs at once
- [ ] A condition preview tool that shows which dialogue stage is currently active
- [ ] Visual quest graph editing
- [ ] Battle database editing for skills, enemies, classes, or troop balance
- [ ] Packaging or deployment helpers for shipping a finished game
- [ ] A native desktop app; the workbench currently runs as a local browser UI
- [ ] A built-in model provider bundle; you still need to configure your own API endpoint and key

## Manual Start

If you prefer the terminal flow, start the proxy manually:

```powershell
node "C:\Program Files (x86)\Steam\steamapps\common\RPG Maker MZ\tools\ai-rpg-maker\server.mjs"
```

Open:

```text
http://127.0.0.1:43115/
```

## Current Scope

- Text workflow is connected end to end
- Image prompt generation is supported, but a real image API is not wired yet
- The workflow extends project data and plugins instead of patching the RPG Maker editor itself
