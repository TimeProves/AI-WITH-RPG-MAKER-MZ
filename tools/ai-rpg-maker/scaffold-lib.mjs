export function buildMapPrompt(prompt) {
    return [
        prompt,
        "Include a main exterior map, clear building entrances, city exits, and NPC placements.",
        "Prefer implementation-friendly coordinates and add at least one main-quest NPC on the exterior map."
    ].join("\n\n");
}

export function buildContentPrompt(prompt, mapPlan) {
    const buildingSummary = (mapPlan.buildings || [])
        .map(building => `${building.name} (${building.kind || "building"})`)
        .join(", ");
    const npcSummary = (mapPlan.npcs || []).map(npc => npc.name || npc.role || "npc").join(", ");
    return [
        prompt,
        `Map context: ${mapPlan.displayName || mapPlan.mapName || "Unnamed map"} with buildings: ${buildingSummary || "none"}.`,
        `Map NPC anchors: ${npcSummary || "none"}.`,
        "Generate NPCs, quests, items, and events that fit these locations. Prefer assigning quest-giver NPCs to the named map anchors when possible."
    ].join("\n\n");
}

export function buildAssetPrompt(prompt, contentPlan, mapPlan) {
    const npcNames = (contentPlan.npcs || []).map(npc => npc.name).join(", ");
    const locationNames = [
        mapPlan.displayName || mapPlan.mapName || "",
        ...(mapPlan.buildings || []).map(building => building.interiorMapName || building.name)
    ]
        .filter(Boolean)
        .join(", ");
    return [
        prompt,
        `Generate portrait, sprite, and location illustration prompts for: ${npcNames || "the main cast"}.`,
        `Key locations: ${locationNames || "the main city"}.`
    ].join("\n\n");
}

export function mergePlans(mapPlan, contentPlan) {
    const contentById = new Map();
    const contentByName = new Map();

    for (const npc of contentPlan.npcs || []) {
        const byId = slugify(String(npc.id || npc.name || ""));
        const byName = normalizeName(npc.name || npc.id || "");
        if (byId) {
            contentById.set(byId, npc);
        }
        if (byName) {
            contentByName.set(byName, npc);
        }
    }

    const mergedNpcs = (mapPlan.npcs || []).map((npc, index) => {
        const npcId = slugify(String(npc.id || npc.name || `npc_${index + 1}`));
        const contentNpc =
            contentById.get(npcId) ||
            contentByName.get(normalizeName(npc.name || "")) ||
            null;

        if (!contentNpc) {
            return {
                ...npc,
                id: npcId
            };
        }

        return {
            ...npc,
            ...pickContentNpcFields(contentNpc),
            id: slugify(String(contentNpc.id || npcId)),
            name: contentNpc.name || npc.name || `NPC ${index + 1}`
        };
    });

    return {
        ...mapPlan,
        npcs: mergedNpcs,
        notes: uniqueStrings([
            ...(Array.isArray(mapPlan.notes) ? mapPlan.notes : []),
            `Merged with content plan at ${new Date().toISOString()}`
        ])
    };
}

export function slugify(text) {
    return String(text || "")
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "_")
        .replace(/^_+|_+$/g, "") || "ai_scenario";
}

function pickContentNpcFields(npc) {
    return {
        openingLine: npc.openingLine || "",
        personaPrompt: npc.personaPrompt || "",
        questContext: npc.questContext || "",
        stateContext: npc.stateContext || "",
        trackedSwitchIds: Array.isArray(npc.trackedSwitchIds) ? npc.trackedSwitchIds : [],
        trackedVariableIds: Array.isArray(npc.trackedVariableIds) ? npc.trackedVariableIds : []
    };
}

function normalizeName(text) {
    return String(text || "")
        .trim()
        .toLowerCase()
        .replace(/\s+/g, " ");
}

function uniqueStrings(values) {
    return [...new Set(values.filter(Boolean))];
}
