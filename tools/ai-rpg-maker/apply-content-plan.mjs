import fs from "node:fs";
import path from "node:path";

const args = parseArgs(process.argv.slice(2));

if (!args.project || !args.plan) {
    throw new Error(
        "Usage: node apply-content-plan.mjs --project C:\\MyGame --plan content-plan.json [--write-items true]"
    );
}

const projectDir = path.resolve(args.project);
const dataDir = path.join(projectDir, "data");
const planPath = path.resolve(args.plan);
const writeItems = String(args["write-items"] || "false").toLowerCase() === "true";

ensureDir(dataDir);

const plan = JSON.parse(fs.readFileSync(planPath, "utf8"));
const npcProfilesPath = path.join(dataDir, "AiNpcProfiles.json");
const blueprintsPath = path.join(dataDir, "AiContentBlueprints.json");
const questStateIndexPath = path.join(dataDir, "AiQuestStateIndex.json");
const systemPath = path.join(dataDir, "System.json");
const commonEventsPath = path.join(dataDir, "CommonEvents.json");
const notesPath = path.join(projectDir, "ai-generated-content.md");
const writeQuestEvents = String(args["write-quest-events"] || "true").toLowerCase() !== "false";

const existingProfiles = readJsonOrDefault(npcProfilesPath, { version: 1, worldContext: "", npcs: [] });
const blueprints = buildContentBlueprints(plan);
let questStateIndex = { version: 1, quests: {} };

if (writeQuestEvents && fs.existsSync(systemPath) && fs.existsSync(commonEventsPath)) {
    const system = JSON.parse(fs.readFileSync(systemPath, "utf8"));
    const commonEvents = JSON.parse(fs.readFileSync(commonEventsPath, "utf8"));
    const existingQuestStateIndex = readJsonOrDefault(questStateIndexPath, { version: 1, quests: {} });
    questStateIndex = applyQuestStateData(system, commonEvents, existingQuestStateIndex, plan.quests || []);
    fs.writeFileSync(systemPath, JSON.stringify(system, null, 2));
    fs.writeFileSync(commonEventsPath, JSON.stringify(commonEvents, null, 2));
    fs.writeFileSync(questStateIndexPath, JSON.stringify(questStateIndex, null, 2));
    blueprints.questStateIndex = questStateIndex.quests;
}

const nextProfiles = buildNpcProfiles(existingProfiles, plan, questStateIndex);

fs.writeFileSync(npcProfilesPath, JSON.stringify(nextProfiles, null, 2));
fs.writeFileSync(blueprintsPath, JSON.stringify(blueprints, null, 2));
fs.writeFileSync(notesPath, buildNotesMarkdown(plan), "utf8");

let itemsSummary = "Skipped Items.json update.";
if (writeItems) {
    const itemsPath = path.join(dataDir, "Items.json");
    const itemResult = applyItemsDatabase(itemsPath, plan.items || []);
    itemsSummary = `Updated Items.json with ${itemResult.added} generated item(s).`;
}

console.log(`Wrote ${npcProfilesPath}`);
console.log(`Wrote ${blueprintsPath}`);
if (writeQuestEvents && fs.existsSync(systemPath) && fs.existsSync(commonEventsPath)) {
    console.log(`Wrote ${questStateIndexPath}`);
    console.log(`Updated ${systemPath}`);
    console.log(`Updated ${commonEventsPath}`);
}
console.log(`Wrote ${notesPath}`);
console.log(itemsSummary);

function parseArgs(argv) {
    const result = {};
    for (let i = 0; i < argv.length; i++) {
        const arg = argv[i];
        if (!arg.startsWith("--")) {
            continue;
        }
        result[arg.slice(2)] = argv[i + 1];
        i++;
    }
    return result;
}

function ensureDir(dir) {
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }
}

function readJsonOrDefault(filePath, fallback) {
    if (!fs.existsSync(filePath)) {
        return fallback;
    }
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function buildNpcProfiles(existingProfiles, plan, questStateIndex) {
    const existingById = new Map(
        (Array.isArray(existingProfiles.npcs) ? existingProfiles.npcs : [])
            .filter(Boolean)
            .map(profile => [String(profile.id || ""), profile])
    );

    const generatedNpcs = (Array.isArray(plan.npcs) ? plan.npcs : []).map(npc => {
        const npcId = slugify(String(npc.id || npc.name || "npc"));
        const existing = existingById.get(npcId) || {};
        const questState = getQuestStateForNpc(plan.quests || [], questStateIndex, npcId);
        return {
            id: npcId,
            name: String(npc.name || existing.name || npcId),
            locationName: String(npc.location || existing.locationName || ""),
            openingLine: String(npc.openingLine || existing.openingLine || ""),
            personaPrompt: String(npc.personaPrompt || existing.personaPrompt || ""),
            questContext: String(npc.questContext || existing.questContext || ""),
            stateContext: String(npc.stateContext || existing.stateContext || ""),
            trackedSwitchIds: uniqueIds([
                ...normalizeIdList(npc.trackedSwitchIds ?? existing.trackedSwitchIds),
                ...normalizeIdList(questState.switchIds)
            ]),
            trackedVariableIds: uniqueIds([
                ...normalizeIdList(npc.trackedVariableIds ?? existing.trackedVariableIds),
                ...normalizeIdList(questState.variableIds)
            ]),
            inventory: Array.isArray(npc.inventory) ? npc.inventory : existing.inventory || [],
            stages: Array.isArray(existing.stages) ? existing.stages : []
        };
    });

    return {
        version: 1,
        worldContext: String(plan.worldSummary || existingProfiles.worldContext || ""),
        updatedAt: new Date().toISOString(),
        npcs: generatedNpcs
    };
}

function buildContentBlueprints(plan) {
    return {
        version: 1,
        generatedAt: new Date().toISOString(),
        worldSummary: String(plan.worldSummary || ""),
        items: Array.isArray(plan.items) ? plan.items : [],
        quests: Array.isArray(plan.quests) ? plan.quests : [],
        events: Array.isArray(plan.events) ? plan.events : []
    };
}

function applyQuestStateData(system, commonEvents, existingIndex, quests) {
    const nextIndex = {
        version: 1,
        quests: { ...(existingIndex.quests || {}) }
    };

    for (const quest of quests) {
        const questId = slugify(String(quest.id || quest.name || "quest"));
        const record = nextIndex.quests[questId] || {};
        const startedSwitchId = record.startedSwitchId || allocateNamedSlot(system.switches, `AIQ:${questId}:Started`);
        const completedSwitchId = record.completedSwitchId || allocateNamedSlot(system.switches, `AIQ:${questId}:Completed`);
        const progressVariableId = record.progressVariableId || allocateNamedSlot(system.variables, `AIQ:${questId}:Progress`);
        const stepIds = Array.isArray(record.commonEventIds?.steps) ? record.commonEventIds.steps.slice() : [];
        const stepCount = Math.max(1, Array.isArray(quest.steps) ? quest.steps.length : 1);
        while (stepIds.length < stepCount) {
            stepIds.push(allocateCommonEventId(commonEvents));
        }

        const commonEventIds = {
            start: record.commonEventIds?.start || allocateCommonEventId(commonEvents),
            steps: stepIds,
            complete: record.commonEventIds?.complete || allocateCommonEventId(commonEvents)
        };

        system.switches[startedSwitchId] = `AI Quest ${quest.name} Started`;
        system.switches[completedSwitchId] = `AI Quest ${quest.name} Completed`;
        system.variables[progressVariableId] = `AI Quest ${quest.name} Progress`;

        commonEvents[commonEventIds.start] = createQuestCommonEvent({
            id: commonEventIds.start,
            name: `AI Start: ${quest.name}`,
            comments: [
                `Quest start for ${quest.name}.`,
                String(quest.summary || "No summary.")
            ],
            actions: [
                controlSwitch(startedSwitchId, true),
                controlSwitch(completedSwitchId, false),
                setVariable(progressVariableId, 1)
            ]
        });

        for (let index = 0; index < stepCount; index++) {
            commonEvents[commonEventIds.steps[index]] = createQuestCommonEvent({
                id: commonEventIds.steps[index],
                name: `AI Step ${index + 1}: ${quest.name}`,
                comments: [
                    `Quest step ${index + 1} for ${quest.name}.`,
                    String((quest.steps || [])[index] || "Add event logic here.")
                ],
                actions: [setVariable(progressVariableId, index + 1)]
            });
        }

        commonEvents[commonEventIds.complete] = createQuestCommonEvent({
            id: commonEventIds.complete,
            name: `AI Complete: ${quest.name}`,
            comments: [
                `Quest complete for ${quest.name}.`,
                `Rewards: ${(quest.rewards || []).join(", ") || "None"}`
            ],
            actions: [
                controlSwitch(startedSwitchId, true),
                controlSwitch(completedSwitchId, true),
                setVariable(progressVariableId, stepCount)
            ]
        });

        nextIndex.quests[questId] = {
            id: questId,
            name: quest.name,
            startedSwitchId,
            completedSwitchId,
            progressVariableId,
            commonEventIds
        };
    }

    return nextIndex;
}

function buildNotesMarkdown(plan) {
    const lines = [];
    lines.push("# AI Generated Content");
    lines.push("");
    lines.push(plan.worldSummary ? plan.worldSummary : "No world summary.");
    lines.push("");

    lines.push("## NPCs");
    for (const npc of plan.npcs || []) {
        lines.push(`- ${npc.name} (${npc.role || "npc"}) @ ${npc.location || "Unknown"}`);
        if (npc.questContext) {
            lines.push(`  Quest context: ${npc.questContext}`);
        }
        if (npc.stateContext) {
            lines.push(`  State context: ${npc.stateContext}`);
        }
    }
    lines.push("");

    lines.push("## Quests");
    for (const quest of plan.quests || []) {
        lines.push(`- ${quest.name}: ${quest.summary || ""}`);
        for (const step of quest.steps || []) {
            lines.push(`  - ${step}`);
        }
    }
    lines.push("");

    lines.push("## Items");
    for (const item of plan.items || []) {
        lines.push(`- ${item.name} [${item.kind || "item"}]: ${item.description || ""}`);
    }
    lines.push("");

    lines.push("## Events");
    for (const event of plan.events || []) {
        lines.push(`- ${event.name} @ ${event.map || "Unknown"} (${event.trigger || "action"}): ${event.summary || ""}`);
    }

    return lines.join("\n");
}

function applyItemsDatabase(itemsPath, items) {
    if (!fs.existsSync(itemsPath)) {
        throw new Error(`Items.json not found at ${itemsPath}`);
    }

    const database = JSON.parse(fs.readFileSync(itemsPath, "utf8"));
    const existingNames = new Map();
    for (const entry of database) {
        if (entry?.name) {
            existingNames.set(entry.name, entry);
        }
    }

    let nextId = database.length;
    let added = 0;
    for (const item of items) {
        if (!item?.name || existingNames.has(item.name)) {
            continue;
        }

        database.push(createItemRecord(nextId, item));
        existingNames.set(item.name, true);
        nextId++;
        added++;
    }

    fs.writeFileSync(itemsPath, JSON.stringify(database, null, 2));
    return { added };
}

function createItemRecord(id, item) {
    const kind = String(item.kind || "item");
    const isKeyItem = kind === "keyItem";
    return {
        id,
        animationId: 0,
        consumable: !isKeyItem,
        damage: {
            critical: false,
            elementId: 0,
            formula: "0",
            type: 0,
            variance: 20
        },
        description: String(item.description || ""),
        effects: [],
        hitType: 0,
        iconIndex: 0,
        itypeId: isKeyItem ? 2 : 1,
        name: String(item.name || `Item ${id}`),
        note: "<AiGenerated>",
        occasion: isKeyItem ? 3 : 0,
        price: Number(item.value || 0),
        repeats: 1,
        scope: 7,
        speed: 0,
        successRate: 100,
        tpGain: 0
    };
}

function normalizeIdList(value) {
    if (!Array.isArray(value)) {
        return [];
    }
    return value
        .map(id => Number(id))
        .filter(id => Number.isInteger(id) && id > 0);
}

function slugify(text) {
    return String(text || "")
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "_")
        .replace(/^_+|_+$/g, "") || "npc";
}

function uniqueIds(values) {
    return [...new Set(normalizeIdList(values))];
}

function getQuestStateForNpc(quests, questStateIndex, npcId) {
    const questEntries = Array.isArray(quests) ? quests : [];
    const questStates = questStateIndex?.quests || {};
    const switchIds = [];
    const variableIds = [];

    for (const quest of questEntries) {
        if (slugify(String(quest.startNpcId || "")) !== npcId) {
            continue;
        }
        const state = questStates[slugify(String(quest.id || quest.name || ""))];
        if (!state) {
            continue;
        }
        switchIds.push(state.startedSwitchId, state.completedSwitchId);
        variableIds.push(state.progressVariableId);
    }

    return { switchIds, variableIds };
}

function allocateNamedSlot(array, name) {
    let index = array.findIndex((entry, idx) => idx > 0 && !entry);
    if (index < 0) {
        index = array.length;
        array.push("");
    }
    array[index] = name;
    return index;
}

function allocateCommonEventId(commonEvents) {
    let index = commonEvents.findIndex((entry, idx) => idx > 0 && !entry);
    if (index < 0) {
        index = commonEvents.length;
        commonEvents.push(null);
    }
    commonEvents[index] = commonEvents[index] || {
        id: index,
        list: [{ code: 0, indent: 0, parameters: [] }],
        name: "",
        switchId: 1,
        trigger: 0
    };
    return index;
}

function createQuestCommonEvent({ id, name, comments, actions }) {
    const list = [];
    const commentLines = comments.filter(Boolean);
    if (commentLines.length > 0) {
        list.push({ code: 108, indent: 0, parameters: [commentLines[0]] });
        for (const line of commentLines.slice(1)) {
            list.push({ code: 408, indent: 0, parameters: [line] });
        }
    }
    list.push(...actions);
    list.push({ code: 0, indent: 0, parameters: [] });
    return {
        id,
        list,
        name,
        switchId: 1,
        trigger: 0
    };
}

function controlSwitch(switchId, isOn) {
    return {
        code: 121,
        indent: 0,
        parameters: [switchId, switchId, isOn ? 0 : 1]
    };
}

function setVariable(variableId, value) {
    return {
        code: 122,
        indent: 0,
        parameters: [variableId, variableId, 0, 0, value]
    };
}
