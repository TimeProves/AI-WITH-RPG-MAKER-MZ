# AI-WITH-RPG-MAKER-MZ

AI workbench for RPG Maker MZ with:

- natural-language map planning
- NPC dialogue powered by a local proxy
- an AI chat scene with timeline dots, jump navigation, and export tools
- a project explorer for browsing maps, submaps, and per-NPC settings
- NPC profile and quest-state generation
- common event and item scaffolding
- a local web UI for preview, apply, backup, and undo

## Main Files

- `tools/ai-rpg-maker/server.mjs`
- `tools/ai-rpg-maker/scaffold-game-from-prompt.mjs`
- `tools/ai-rpg-maker/apply-content-plan.mjs`
- `tools/ai-rpg-maker/web/index.html`
- `newdata/js/plugins/AiNpcDialogueMZ.js`

## Local Web UI

Start the proxy:

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
