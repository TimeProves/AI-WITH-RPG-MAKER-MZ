# AI RPG Maker Frontend Notes

## Goal

Provide a project-side assistant UI for RPG Maker MZ creators so they can:

- describe a town, quest line, or NPC in natural language
- preview generated maps, NPC profiles, quests, items, and common events
- apply changes into the current project without touching shell commands

## Recommended UX

### Main Layout

- Left panel: chat-style prompt history
- Center panel: structured preview tabs
- Right panel: apply and rollback controls

### Preview Tabs

- `Map`
  - planned exterior map name
  - building list
  - entrance/exit list
  - NPC anchor positions
- `NPCs`
  - NPC profile cards
  - active quest giver labels
  - tracked switch and variable IDs
- `Quests`
  - start NPC
  - generated steps
  - generated common event names
- `Items`
  - generated key items and normal items
- `Files`
  - exact target files that will change

### Core Actions

- `Generate`
  - runs the full scaffold pipeline from one prompt
- `Preview Only`
  - generates plans but does not write files
- `Apply To Project`
  - writes map files, NPC profiles, quest state data, and common events
- `Rebuild NPC Dialogue`
  - refreshes `AiNpcProfiles.json` only
- `Undo Last Apply`
  - restores the previous project snapshot

## Safety Features

- create a timestamped backup before each apply
- show a file diff summary before writing
- warn if existing map IDs or quest slots will be reused
- keep generated artifacts under `project/ai-generated/<slug>/`

## Best First Version

- desktop web UI served by the local proxy
- one prompt box
- one project path field
- one `Generate` button
- one `Apply` button
- one status area for success and error logs

## Why This Fits RPG Maker

- creators stay in a familiar "event and data" mindset
- AI output stays structured instead of directly editing random files
- shell commands become optional, not required
