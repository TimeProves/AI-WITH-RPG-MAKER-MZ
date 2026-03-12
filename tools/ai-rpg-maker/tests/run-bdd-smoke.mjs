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
