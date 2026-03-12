import fs from "node:fs";
import path from "node:path";

const args = parseArgs(process.argv.slice(2));

if (!args.project || !args.plan) {
    throw new Error("Usage: node build-map-skeleton.mjs --project C:\\MyGame --plan city-plan.json");
}

const projectDir = path.resolve(args.project);
const dataDir = path.join(projectDir, "data");
const mapInfosPath = path.join(dataDir, "MapInfos.json");
const planPath = path.resolve(args.plan);
const plan = JSON.parse(fs.readFileSync(planPath, "utf8"));

if (!fs.existsSync(mapInfosPath)) {
    throw new Error(`MapInfos.json not found in ${dataDir}`);
}

const mapInfos = JSON.parse(fs.readFileSync(mapInfosPath, "utf8"));
const cityMapId = getNextMapId(mapInfos);

const buildingMapIds = new Map();
let runningMapId = cityMapId + 1;
for (const building of plan.buildings || []) {
    buildingMapIds.set(building.name, runningMapId++);
}

const cityMap = createBlankMap({
    width: Number(plan.width || 60),
    height: Number(plan.height || 45),
    tilesetId: Number(plan.tilesetId || 1),
    displayName: String(plan.displayName || plan.mapName || "New Map"),
    note: Array.isArray(plan.notes) ? plan.notes.join("\n") : ""
});

let eventId = 1;
for (const building of plan.buildings || []) {
    const targetMapId = buildingMapIds.get(building.name);
    cityMap.events[eventId] = createTransferEvent({
        id: eventId,
        name: `${building.name} Entrance`,
        x: Number(building.doorX),
        y: Number(building.doorY),
        targetMapId,
        targetX: centerCoordinate(Number(building.interiorWidth || 17)),
        targetY: Number(building.interiorHeight || 13) - 2,
        direction: 8
    });
    eventId++;
}

for (const exit of plan.cityExits || []) {
    cityMap.events[eventId] = createPlaceholderEvent({
        id: eventId,
        name: String(exit.name || "City Exit"),
        x: Number(exit.x),
        y: Number(exit.y),
        characterName: "!Door1",
        characterIndex: 7,
        speaker: String(exit.name || "Exit"),
        text: `Placeholder exit to ${exit.targetMapName || "another map"}.`
    });
    eventId++;
}

for (const npc of plan.npcs || []) {
    cityMap.events[eventId] = createAiNpcEvent({
        id: eventId,
        name: String(npc.name || `NPC ${eventId}`),
        x: Number(npc.x),
        y: Number(npc.y),
        npcId: String(npc.id || npc.name || `npc_${eventId}`),
        npcName: String(npc.name || "NPC"),
        characterName: String(npc.characterName || "People1"),
        characterIndex: Number(npc.characterIndex || 0),
        locationName: String(plan.displayName || plan.mapName || "Town"),
        openingLine: String(npc.openingLine || ""),
        personaPrompt: String(npc.personaPrompt || ""),
        questContext: String(npc.questContext || ""),
        stateContext: String(npc.stateContext || ""),
        trackedSwitchIds: formatIdList(npc.trackedSwitchIds),
        trackedVariableIds: formatIdList(npc.trackedVariableIds)
    });
    eventId++;
}

writeMapFile(dataDir, cityMapId, cityMap);
mapInfos[cityMapId] = createMapInfo(cityMapId, String(plan.mapName || "New Map"), mapInfos);

for (const building of plan.buildings || []) {
    const mapId = buildingMapIds.get(building.name);
    const width = Number(building.interiorWidth || 17);
    const height = Number(building.interiorHeight || 13);
    const interior = createBlankMap({
        width,
        height,
        tilesetId: Number(plan.tilesetId || 1),
        displayName: String(building.interiorMapName || `${building.name} Interior`),
        note: `<GeneratedInterior:${building.kind || "building"}>`
    });

    interior.events[1] = createTransferEvent({
        id: 1,
        name: `${building.name} Return`,
        x: centerCoordinate(width),
        y: height - 1,
        targetMapId: cityMapId,
        targetX: Number(building.returnX || building.doorX),
        targetY: Number(building.returnY || (building.doorY + 1)),
        direction: 2
    });

    interior.events[2] = createPlaceholderEvent({
        id: 2,
        name: `${building.name} Host`,
        x: centerCoordinate(width),
        y: centerCoordinate(height) - 1,
        characterName: "People2",
        characterIndex: 0,
        speaker: String(building.name || "Host"),
        text: `Placeholder interaction for ${building.name}.`
    });

    writeMapFile(dataDir, mapId, interior);
    mapInfos[mapId] = createMapInfo(mapId, String(building.interiorMapName || `${building.name} Interior`), mapInfos);
}

fs.writeFileSync(mapInfosPath, JSON.stringify(mapInfos, null, 2));
console.log(`Created ${plan.mapName || "map"} skeleton in ${projectDir}`);

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

function getNextMapId(mapInfos) {
    return mapInfos.reduce((maxId, entry) => (entry && entry.id > maxId ? entry.id : maxId), 0) + 1;
}

function createBlankMap({ width, height, tilesetId, displayName, note }) {
    const layers = 6;
    const groundTileId = 2816;
    const data = [];
    for (let layer = 0; layer < layers; layer++) {
        for (let i = 0; i < width * height; i++) {
            data.push(layer === 0 ? groundTileId : 0);
        }
    }
    return {
        autoplayBgm: false,
        autoplayBgs: false,
        battleback1Name: "",
        battleback2Name: "",
        bgm: { name: "", pan: 0, pitch: 100, volume: 90 },
        bgs: { name: "", pan: 0, pitch: 100, volume: 90 },
        disableDashing: false,
        displayName,
        encounterList: [],
        encounterStep: 30,
        height,
        note: note || "",
        parallaxLoopX: false,
        parallaxLoopY: false,
        parallaxName: "",
        parallaxShow: true,
        parallaxSx: 0,
        parallaxSy: 0,
        scrollType: 0,
        specifyBattleback: false,
        tilesetId,
        width,
        data,
        events: [null]
    };
}

function createMapInfo(id, name, mapInfos) {
    const lastOrder = mapInfos.reduce((maxOrder, entry) => (entry && entry.order > maxOrder ? entry.order : maxOrder), 0);
    return {
        id,
        expanded: false,
        name,
        order: lastOrder + 1,
        parentId: 0,
        scrollX: 0,
        scrollY: 0
    };
}

function createTransferEvent({ id, name, x, y, targetMapId, targetX, targetY, direction }) {
    return {
        id,
        name,
        note: "",
        pages: [
            {
                conditions: defaultConditions(),
                directionFix: false,
                image: {
                    tileId: 0,
                    characterName: "",
                    direction: 2,
                    pattern: 0,
                    characterIndex: 0
                },
                list: [
                    {
                        code: 201,
                        indent: 0,
                        parameters: [0, targetMapId, targetX, targetY, direction, 0]
                    },
                    {
                        code: 0,
                        indent: 0,
                        parameters: []
                    }
                ],
                moveFrequency: 3,
                moveRoute: defaultMoveRoute(),
                moveSpeed: 3,
                moveType: 0,
                priorityType: 0,
                stepAnime: false,
                through: false,
                trigger: 1,
                walkAnime: true
            }
        ],
        x,
        y
    };
}

function createPlaceholderEvent({ id, name, x, y, characterName, characterIndex, speaker, text }) {
    return {
        id,
        name,
        note: "",
        pages: [
            {
                conditions: defaultConditions(),
                directionFix: false,
                image: {
                    tileId: 0,
                    characterName,
                    direction: 2,
                    pattern: 1,
                    characterIndex
                },
                list: [
                    {
                        code: 101,
                        indent: 0,
                        parameters: [characterName, characterIndex, 0, 2, speaker]
                    },
                    {
                        code: 401,
                        indent: 0,
                        parameters: [text]
                    },
                    {
                        code: 0,
                        indent: 0,
                        parameters: []
                    }
                ],
                moveFrequency: 3,
                moveRoute: defaultMoveRoute(),
                moveSpeed: 3,
                moveType: 0,
                priorityType: 1,
                stepAnime: false,
                through: false,
                trigger: 0,
                walkAnime: true
            }
        ],
        x,
        y
    };
}

function createAiNpcEvent({
    id,
    name,
    x,
    y,
    npcId,
    npcName,
    characterName,
    characterIndex,
    locationName,
    openingLine,
    personaPrompt,
    questContext,
    stateContext,
    trackedSwitchIds,
    trackedVariableIds
}) {
    const args = {
        npcId,
        npcName,
        locationName,
        openingLine,
        personaPrompt,
        questContext,
        stateContext,
        trackedSwitchIds,
        trackedVariableIds
    };

    return {
        id,
        name,
        note: "<AiNpc>",
        pages: [
            {
                conditions: defaultConditions(),
                directionFix: false,
                image: {
                    tileId: 0,
                    characterName,
                    direction: 2,
                    pattern: 1,
                    characterIndex
                },
                list: [
                    {
                        code: 357,
                        indent: 0,
                        parameters: ["AiNpcDialogueMZ", "openNpcChat", "Open NPC Chat", args]
                    },
                    ...createPluginCommandArgLines(args),
                    {
                        code: 0,
                        indent: 0,
                        parameters: []
                    }
                ],
                moveFrequency: 3,
                moveRoute: defaultMoveRoute(),
                moveSpeed: 3,
                moveType: 0,
                priorityType: 1,
                stepAnime: false,
                through: false,
                trigger: 0,
                walkAnime: true
            }
        ],
        x,
        y
    };
}

function defaultConditions() {
    return {
        actorId: 1,
        actorValid: false,
        itemId: 1,
        itemValid: false,
        selfSwitchCh: "A",
        selfSwitchValid: false,
        switch1Id: 1,
        switch1Valid: false,
        switch2Id: 1,
        switch2Valid: false,
        variableId: 1,
        variableValid: false,
        variableValue: 0
    };
}

function defaultMoveRoute() {
    return {
        list: [{ code: 0, parameters: [] }],
        repeat: true,
        skippable: false,
        wait: false
    };
}

function writeMapFile(dataDir, mapId, mapData) {
    const fileName = `Map${String(mapId).padStart(3, "0")}.json`;
    fs.writeFileSync(path.join(dataDir, fileName), JSON.stringify(mapData, null, 2));
}

function centerCoordinate(length) {
    return Math.max(1, Math.floor(length / 2));
}

function formatIdList(value) {
    if (!Array.isArray(value)) {
        return "";
    }
    return value
        .map(item => Number(item))
        .filter(item => Number.isInteger(item) && item > 0)
        .join(",");
}

function createPluginCommandArgLines(args) {
    return Object.entries(args).map(([key, value]) => ({
        code: 657,
        indent: 0,
        parameters: [`${key} = ${value}`]
    }));
}
