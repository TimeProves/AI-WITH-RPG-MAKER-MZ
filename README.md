# AI-WITH-RPG-MAKER-MZ

> This project was completed with end-to-end support from Codex.

AI workbench for RPG Maker MZ with:

- natural-language map planning
- NPC dialogue powered by a local proxy
- an AI chat scene with timeline dots, jump navigation, and export tools
- a project explorer for browsing maps, submaps, and per-NPC settings
- drag-and-drop NPC relocation between maps and submaps
- a visual stage editor for conditional NPC dialogue states
- an asset library for browsing local project images and binding them to actors, NPCs, and items
- a Database Studio for actors, items, weapons, armors, and skills
- an Event Composer for reusable event templates and conditioned map events
- NPC profile and quest-state generation
- common event and item scaffolding
- BDD-style feature templates and smoke tests for core local behaviors
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
- `tools/ai-rpg-maker/asset-pipeline-notes.md`
- `tools/ai-rpg-maker/tests/rpg-maker-bdd-template.feature`
- `tools/ai-rpg-maker/tests/workbench-smoke.feature`
- `tools/ai-rpg-maker/tests/run-bdd-smoke.mjs`
- `tools/ai-rpg-maker/web/index.html`
- `newdata/js/plugins/AiNpcDialogueMZ.js`

## Current Workflow

- launch the workbench by double-clicking `Start AI Workbench.vbs`
- load a project overview to browse map -> submap -> NPC structure
- drag NPCs between maps in the tree or change their target map in the editor
- edit background, placement, movement, tracked states, and dialogue stages
- browse discovered project art in the asset library and bind it to actors, NPCs, or items
- load Database Studio to edit actor backgrounds, items, equipment, and skills
- use Event Composer to draft and apply simple conditioned event templates
- preview generated content before writing it into the project
- apply with automatic backup and restore support
- run the BDD smoke suite to validate local project behaviors after major changes

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
- [x] Asset library for scanning `img/faces`, `img/characters`, `img/pictures`, `img/sv_actors`, and `img/parallaxes`
- [x] Asset preview for the currently selected project image
- [x] Binding an existing or imported local image to an actor, NPC, item, weapon, armor, or skill
- [x] Persisting asset ownership in `AiAssetBindings.json`
- [x] Database Studio for editing actors, items, weapons, armors, and skills
- [x] Actor metadata fields for backstory, personality, relationship notes, and intimate history
- [x] Event Composer for `showPicture`, `transfer`, `commonEvent`, `treasure`, and `switchControl` templates
- [x] Applying generated or hand-authored event templates into map event data
- [x] Writing generated NPC, quest, and item data into RPG Maker project files
- [x] Automatic backup before apply
- [x] Restore from backup history
- [x] Exporting NPC chat history as TXT or JSON
- [x] BDD feature template for RPG Maker AI workflow acceptance scenarios
- [x] Executable smoke suite for deterministic local workbench behaviors

## Not Supported Yet

- [ ] Real image generation API integration that creates final art inside the workbench
- [ ] Inpainting, outpainting, or direct AI editing of existing art assets
- [ ] Voice input or speech-to-text for player dialogue
- [ ] NPC voice output or text-to-speech
- [ ] Creating or editing tiles visually inside the RPG Maker editor UI itself
- [ ] Fully automatic city art, tileset art, portrait art, or costume art generation inside this tool
- [ ] A full visual equipment/skill balance dashboard with trait and effect editors
- [ ] Direct thumbnail gallery management for generated scene art versions
- [ ] Visual map painting or drag-and-drop building layout editing in the workbench
- [ ] Creating new NPC events directly from the project explorer
- [ ] Deleting NPC events directly from the project explorer
- [ ] Bulk multi-select editing for several NPCs at once
- [ ] A condition preview tool that shows which dialogue stage is currently active
- [ ] Visual quest graph editing
- [ ] Enemy, class, state, and troop balance editing
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

## Tests

BDD files live in `tools/ai-rpg-maker/tests/`.

- `rpg-maker-bdd-template.feature`
  Reusable acceptance-test template for maps, NPCs, dialogue stages, asset binding, exports, and backup flows.
- `workbench-smoke.feature`
  Current smoke scenarios for the local workbench behavior, including asset-library, database, and event-template coverage.
- `run-bdd-smoke.mjs`
  Executable smoke runner for deterministic behaviors that do not depend on live model output.

Run the smoke suite with:

```powershell
node "C:\Program Files (x86)\Steam\steamapps\common\RPG Maker MZ\tools\ai-rpg-maker\tests\run-bdd-smoke.mjs"
```

## Current Scope

- Text workflow is connected end to end
- Image prompt generation, asset browsing, asset previews, and local asset binding are supported
- Actor, item, equipment, and skill editing are supported inside the local workbench
- Reusable event template generation and apply flows are supported for common map-event patterns
- A real image API is not wired yet, so final image creation still depends on an external provider or manually supplied files
- The workflow extends project data and plugins instead of patching the RPG Maker editor itself
