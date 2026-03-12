# Asset Pipeline Notes

This document describes the current asset pipeline shape for the AI RPG Maker MZ workbench.

## Asset Library

The local asset library scans the project `img/` folders and builds an index for:

- `img/characters`
- `img/faces`
- `img/pictures`
- `img/sv_actors`
- `img/parallaxes`

Current goals:

- browse existing project art from the workbench
- reuse a local project asset without copying it
- import an external local file into the correct RPG Maker asset folder
- track which asset is bound to which owner

Current storage:

- `data/AiAssetBindings.json`

## Image Generation

The current implementation does not call a real image API yet.

Instead, the workbench supports prompt-pack generation through the existing text model:

- request portraits
- request item art
- request scene art
- request style guides and prompt bundles

Current goals:

- let designers describe visual targets in natural language
- produce prompt packs that can be sent to an image API later
- keep the prompt workflow separate from the final RPG Maker file binding workflow

## Bind To NPC / Actor / Item

The binding layer is responsible for making generated or imported art usable by the RPG Maker project.

Supported owner types:

- `npc`
- `actor`
- `item`

Supported asset kinds:

- `portrait`
- `picture`
- `face`
- `character`
- `battler`
- `item_art`
- `scene`

Current behavior:

- actor bindings update `Actors.json` where RPG Maker supports it directly
  - `face`
  - `character`
  - `battler`
- npc bindings are stored in `AiAssetBindings.json`
  - `character` bindings also update the matching map event image
  - portrait and picture bindings are stored for future UI/runtime use
- item bindings update `Items.json` note tags and are tracked in `AiAssetBindings.json`

## Why A Separate Binding Layer Exists

RPG Maker project data alone is enough for the most basic integration, but it is not enough for long-term AI-managed art workflows.

The extra binding index is useful for:

- tracking ownership
- tracking variants and stage-based art
- tracking generated prompt notes
- re-binding or replacing a visual without searching the whole project manually
- enabling future runtime portrait systems

## Next Logical Steps

- connect a real image generation API
- support binding previews in the workbench
- expose bound portraits inside the AI NPC dialogue scene
- add create/delete asset binding flows
- add condition previews for stage-based portrait selection
