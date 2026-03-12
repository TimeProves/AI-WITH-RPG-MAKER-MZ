import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync, spawn } from "node:child_process";

const rootDir = path.resolve(path.join(import.meta.dirname, "..", "..", ".."));
const toolsDir = path.join(rootDir, "tools", "ai-rpg-maker");
const tempProject = path.join(os.tmpdir(), "rmmz-bdd-smoke");
const healthUrl = "http://127.0.0.1:43115/health";
const examplePlanPath = path.join(toolsDir, "example-city-plan.json");
const examplePlan = readJson(examplePlanPath);
const sampleAssetFolders = ["faces", "pictures", "characters"];

const scenarios = [
    {
        title: "Generated interiors are nested under the main map",
        run: context => {
            const mapInfos = readJson(path.join(context.projectDir, "data", "MapInfos.json"));
            const generatedMaps = mapInfos.filter(Boolean);
            const expectedRootName = String(examplePlan.mapName || "").toLowerCase();
            const rootMap = generatedMaps.find(entry => String(entry.name || "").toLowerCase() === expectedRootName);
            assert.ok(rootMap, "Expected the generated city root map to exist.");

            const interiorMaps = generatedMaps.filter(entry => entry && entry.id !== rootMap.id && Number(entry.parentId || 0) === rootMap.id);
            assert.ok(interiorMaps.length >= 1, "Expected at least one generated interior map to reference the city map as parent.");

            context.rootMap = rootMap;
            context.interiorMaps = interiorMaps;
        }
    },
    {
        title: "Project overview returns a map to NPC directory tree",
        run: async context => {
            const overview = await postJson("http://127.0.0.1:43115/project/overview", { projectDir: context.projectDir });
            assert.ok(overview?.overview?.summary?.maps >= 1, "Expected at least one map in the overview.");
            assert.ok(overview?.overview?.summary?.npcCount >= 1, "Expected at least one NPC in the overview.");
            assert.ok(Array.isArray(overview?.overview?.tree) && overview.overview.tree.length >= 1, "Expected the overview tree to contain at least one root node.");

            context.overview = overview.overview;
            context.npc = overview.overview.npcs.find(entry => entry.id === "captain_rowan") || overview.overview.npcs[0];
            assert.ok(context.npc, "Expected an AI NPC entry in the project overview.");
        }
    },
    {
        title: "Saving an NPC updates profile and event data",
        run: async context => {
            const npc = context.npc;
            const saveResult = await postJson("http://127.0.0.1:43115/project/npc/save", {
                projectDir: context.projectDir,
                npc: {
                    ...npc,
                    sourceMapId: npc.mapId,
                    sourceEventId: npc.eventId,
                    background: "BDD smoke background",
                    notes: "BDD smoke notes",
                    moveType: 1,
                    moveSpeed: 4,
                    moveFrequency: 5
                }
            });

            const profileStore = readJson(path.join(context.projectDir, "data", "AiNpcProfiles.json"));
            const profile = (profileStore.npcs || []).find(entry => entry.id === npc.id);
            assert.equal(profile.background, "BDD smoke background");

            const mapData = readJson(mapFilePath(context.projectDir, npc.mapId));
            const event = mapData.events[npc.eventId];
            assert.ok(event, "Expected the source map event to still exist after a same-map save.");
            assert.equal(event.pages[0].moveType, 1);

            context.overview = saveResult.overview;
            context.npc = saveResult.overview.npcs.find(entry => entry.id === npc.id);
        }
    },
    {
        title: "Moving an NPC to another map preserves its stages",
        run: async context => {
            const npc = context.npc;
            const targetMap = context.overview.maps.find(entry => Number(entry.id) !== Number(npc.mapId));
            assert.ok(targetMap, "Expected another map to move the NPC into.");

            const moveResult = await postJson("http://127.0.0.1:43115/project/npc/save", {
                projectDir: context.projectDir,
                npc: {
                    ...npc,
                    sourceMapId: npc.mapId,
                    sourceEventId: npc.eventId,
                    mapId: targetMap.id,
                    stages: [
                        {
                            id: "gate_closed",
                            openingLine: "The gate is closed.",
                            questContext: "Do not let the player in yet.",
                            stateContext: "Pre-quest stage.",
                            trackedSwitchIds: [1],
                            trackedVariableIds: [2],
                            when: {
                                switchAllOff: [1],
                                variableMin: { "2": 3 }
                            }
                        }
                    ]
                }
            });

            const movedNpc = moveResult.overview.npcs.find(entry => entry.id === npc.id);
            assert.ok(movedNpc, "Expected the moved NPC to remain present in the overview.");
            assert.equal(Number(movedNpc.mapId), Number(targetMap.id));

            const oldMap = readJson(mapFilePath(context.projectDir, npc.mapId));
            assert.equal(oldMap.events[npc.eventId], null, "Expected the old map event slot to be cleared after moving the NPC.");

            const newMap = readJson(mapFilePath(context.projectDir, movedNpc.mapId));
            assert.ok(newMap.events[movedNpc.eventId], "Expected the target map to contain the moved NPC event.");

            const profileStore = readJson(path.join(context.projectDir, "data", "AiNpcProfiles.json"));
            const profile = (profileStore.npcs || []).find(entry => entry.id === npc.id);
            assert.equal(profile.stages.length, 1);
            assert.equal(profile.stages[0].id, "gate_closed");
        }
    },
    {
        title: "Asset library indexes local image folders",
        run: async context => {
            const library = await postJson("http://127.0.0.1:43115/project/assets", {
                projectDir: context.projectDir
            });
            assert.ok(library?.assets?.summary?.assetFiles >= 1, "Expected the asset library to discover at least one image file.");
            assert.ok((library.assets.owners.npcs || []).length >= 1, "Expected NPC owners to be exposed.");
            assert.ok((library.assets.owners.actors || []).length >= 1, "Expected actor owners to be exposed.");
            assert.ok((library.assets.owners.items || []).length >= 1, "Expected item owners to be exposed.");
            context.assetLibrary = library.assets;
        }
    },
    {
        title: "Saving asset bindings updates project data",
        run: async context => {
            const faceAsset = context.assetLibrary.assets.find(asset => asset.folder === "faces");
            const pictureAsset = context.assetLibrary.assets.find(asset => asset.folder === "pictures");
            const characterAsset = context.assetLibrary.assets.find(asset => asset.folder === "characters");
            const actorOwner = context.assetLibrary.owners.actors[0];
            const itemOwner = context.assetLibrary.owners.items[0];
            const npcOwner = context.assetLibrary.owners.npcs[0];
            assert.ok(faceAsset, "Expected at least one face asset in the project.");
            assert.ok(pictureAsset, "Expected at least one picture asset in the project.");
            assert.ok(characterAsset, "Expected at least one character asset in the project.");
            assert.ok(actorOwner, "Expected at least one actor owner.");
            assert.ok(itemOwner, "Expected at least one item owner.");
            assert.ok(npcOwner, "Expected at least one NPC owner.");

            await postJson("http://127.0.0.1:43115/project/asset/save", {
                projectDir: context.projectDir,
                binding: {
                    ownerType: "actor",
                    ownerId: String(actorOwner.id),
                    assetKind: "face",
                    existingProjectPath: faceAsset.projectPath,
                    targetFileName: faceAsset.fileName,
                    faceIndex: 0
                }
            });

            await postJson("http://127.0.0.1:43115/project/asset/save", {
                projectDir: context.projectDir,
                binding: {
                    ownerType: "item",
                    ownerId: String(itemOwner.id),
                    assetKind: "item_art",
                    existingProjectPath: pictureAsset.projectPath,
                    targetFileName: pictureAsset.fileName
                }
            });

            const npcBindingResult = await postJson("http://127.0.0.1:43115/project/asset/save", {
                projectDir: context.projectDir,
                binding: {
                    ownerType: "npc",
                    ownerId: String(npcOwner.id),
                    ownerName: String(npcOwner.name || npcOwner.id),
                    assetKind: "character",
                    existingProjectPath: characterAsset.projectPath,
                    targetFileName: characterAsset.fileName,
                    characterIndex: 0
                }
            });

            const actors = readJson(path.join(context.projectDir, "data", "Actors.json"));
            const actor = actors.find(entry => entry && Number(entry.id) === Number(actorOwner.id));
            assert.ok(actor, "Expected the target actor to remain present.");
            assert.equal(actor.faceName, path.parse(faceAsset.projectPath).name);

            const items = readJson(path.join(context.projectDir, "data", "Items.json"));
            const item = items.find(entry => entry && Number(entry.id) === Number(itemOwner.id));
            assert.ok(item, "Expected the target item to remain present.");
            assert.match(item.note, /<AiAssetPicture:/);

            const profileStore = readJson(path.join(context.projectDir, "data", "AiNpcProfiles.json"));
            const npcProfile = (profileStore.npcs || []).find(entry => String(entry.id) === String(npcOwner.id));
            assert.ok(npcProfile, "Expected the target NPC profile to remain present.");
            assert.ok(
                Array.isArray(npcProfile.assetBindings)
                    && npcProfile.assetBindings.some(entry => entry.assetKind === "character"),
                "Expected the NPC profile to record its bound character asset."
            );

            context.overview = npcBindingResult.overview;
            const npcLocation = npcBindingResult.overview.npcs.find(entry => String(entry.id) === String(npcOwner.id));
            assert.ok(npcLocation, "Expected the target NPC to remain visible in the project overview.");
            const npcMap = readJson(mapFilePath(context.projectDir, npcLocation.mapId));
            const npcEvent = npcMap.events[npcLocation.eventId];
            assert.ok(npcEvent?.pages?.[0], "Expected the target NPC event page to remain present.");
            assert.equal(npcEvent.pages[0].image.characterName, path.parse(characterAsset.projectPath).name);

            const bindingStore = readJson(path.join(context.projectDir, "data", "AiAssetBindings.json"));
            assert.ok((bindingStore.assets || []).length >= 3, "Expected asset bindings to be persisted.");
        }
    }
];

async function main() {
    prepareTempProject();

    let serverProcess = null;
    let startedServer = false;
    if (!(await isHealthy())) {
        serverProcess = spawn("node", [path.join(toolsDir, "server.mjs")], {
            cwd: rootDir,
            stdio: ["ignore", "pipe", "pipe"]
        });
        startedServer = true;
        await waitForHealth();
    }

    const context = { projectDir: tempProject };
    let passed = 0;

    try {
        for (const scenario of scenarios) {
            try {
                await scenario.run(context);
                passed += 1;
                console.log(`PASS ${scenario.title}`);
            } catch (error) {
                console.error(`FAIL ${scenario.title}`);
                throw error;
            }
        }
        console.log(`\n${passed}/${scenarios.length} scenarios passed.`);
    } finally {
        if (startedServer && serverProcess) {
            serverProcess.kill();
        }
    }
}

function prepareTempProject() {
    fs.rmSync(tempProject, { recursive: true, force: true });
    fs.mkdirSync(tempProject, { recursive: true });
    fs.cpSync(path.join(rootDir, "newdata", "data"), path.join(tempProject, "data"), { recursive: true });
    copySampleAssets();
    execFileSync("node", [
        path.join(toolsDir, "build-map-skeleton.mjs"),
        "--project",
        tempProject,
        "--plan",
        examplePlanPath
    ], {
        cwd: rootDir,
        stdio: "pipe"
    });
}

function copySampleAssets() {
    for (const folder of sampleAssetFolders) {
        const sourceDir = path.join(rootDir, "newdata", "img", folder);
        const targetDir = path.join(tempProject, "img", folder);
        fs.mkdirSync(targetDir, { recursive: true });

        let copied = 0;
        for (const fileName of fs.readdirSync(sourceDir)) {
            const sourcePath = path.join(sourceDir, fileName);
            const stat = fs.statSync(sourcePath);
            if (!stat.isFile()) {
                continue;
            }
            fs.copyFileSync(sourcePath, path.join(targetDir, fileName));
            copied += 1;
            if (copied >= 3) {
                break;
            }
        }
    }
}

async function waitForHealth() {
    for (let attempt = 0; attempt < 20; attempt += 1) {
        if (await isHealthy()) {
            return;
        }
        await new Promise(resolve => setTimeout(resolve, 500));
    }
    throw new Error("Timed out waiting for the local workbench server.");
}

async function isHealthy() {
    try {
        const response = await fetch(healthUrl);
        return response.ok;
    } catch (error) {
        return false;
    }
}

async function postJson(url, body) {
    const response = await fetch(url, {
        method: "POST",
        headers: {
            "Content-Type": "application/json"
        },
        body: JSON.stringify(body)
    });
    const text = await response.text();
    const json = text ? JSON.parse(text) : {};
    if (!response.ok) {
        throw new Error(json.error || text || `Request failed: ${response.status}`);
    }
    return json;
}

function readJson(filePath) {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function mapFilePath(projectDir, mapId) {
    return path.join(projectDir, "data", `Map${String(Number(mapId)).padStart(3, "0")}.json`);
}

main().catch(error => {
    console.error(error instanceof Error ? error.stack || error.message : String(error));
    process.exitCode = 1;
});
