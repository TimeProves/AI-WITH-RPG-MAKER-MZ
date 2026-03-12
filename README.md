# AI-WITH-RPG-MAKER-MZ

> This project was completed with end-to-end support from Codex.
>
> 本项目在 Codex 的全程支持下完成。

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
