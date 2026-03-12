import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { buildAssetPrompt, buildContentPrompt, buildMapPrompt, mergePlans, slugify } from "./scaffold-lib.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const args = parseArgs(process.argv.slice(2));

if (!args.project || !args.prompt) {
    throw new Error(
        'Usage: node scaffold-game-from-prompt.mjs --project C:\\MyGame --prompt "Create a royal capital with a palace, tavern, inn, hero house, and a main quest..." [--backend http://127.0.0.1:43115] [--slug royal-capital] [--write-items true] [--with-assets true]'
    );
}

const projectDir = path.resolve(args.project);
const backend = args.backend || "http://127.0.0.1:43115";
const slug = slugify(args.slug || args.prompt.slice(0, 48) || "ai-scenario");
const outputDir = path.join(projectDir, "ai-generated", slug);
const mapPlanPath = path.join(outputDir, "map-plan.json");
const contentPlanPath = path.join(outputDir, "content-plan.json");
const mergedMapPlanPath = path.join(outputDir, "map-plan.merged.json");
const assetPromptPath = path.join(outputDir, "asset-prompts.json");
const summaryPath = path.join(outputDir, "scaffold-summary.json");
const writeItems = String(args["write-items"] || "true").toLowerCase() === "true";
const withAssets = String(args["with-assets"] || "false").toLowerCase() === "true";
const installPlugin = String(args["install-plugin"] || "true").toLowerCase() === "true";

ensureDir(outputDir);
assertProjectShape(projectDir);

const mapPrompt = buildMapPrompt(args.prompt);
const mapPlan = await postJson(`${backend.replace(/\/+$/, "")}/map-plan`, { prompt: mapPrompt });
fs.writeFileSync(mapPlanPath, JSON.stringify(mapPlan, null, 2));

const contentPrompt = buildContentPrompt(args.prompt, mapPlan);
const contentPlan = await postJson(`${backend.replace(/\/+$/, "")}/content-plan`, { prompt: contentPrompt });
fs.writeFileSync(contentPlanPath, JSON.stringify(contentPlan, null, 2));

const mergedMapPlan = mergePlans(mapPlan, contentPlan);
fs.writeFileSync(mergedMapPlanPath, JSON.stringify(mergedMapPlan, null, 2));

runNodeScript("build-map-skeleton.mjs", ["--project", projectDir, "--plan", mergedMapPlanPath]);
runNodeScript("apply-content-plan.mjs", [
    "--project",
    projectDir,
    "--plan",
    contentPlanPath,
    "--write-items",
    String(writeItems),
    "--write-quest-events",
    "true"
]);

if (withAssets) {
    const assetPromptRequest = buildAssetPrompt(args.prompt, contentPlan, mergedMapPlan);
    const assetPrompts = await postJson(`${backend.replace(/\/+$/, "")}/asset-prompts`, {
        prompt: assetPromptRequest
    });
    fs.writeFileSync(assetPromptPath, JSON.stringify(assetPrompts, null, 2));
}

if (installPlugin) {
    installPluginFile(projectDir);
}

const summary = {
    generatedAt: new Date().toISOString(),
    projectDir,
    backend,
    slug,
    prompt: args.prompt,
    mapName: mergedMapPlan.mapName || "",
    mapDisplayName: mergedMapPlan.displayName || "",
    files: {
        mapPlan: mapPlanPath,
        contentPlan: contentPlanPath,
        mergedMapPlan: mergedMapPlanPath,
        assetPrompts: withAssets ? assetPromptPath : null
    },
    counts: {
        buildings: Array.isArray(mergedMapPlan.buildings) ? mergedMapPlan.buildings.length : 0,
        npcs: Array.isArray(contentPlan.npcs) ? contentPlan.npcs.length : 0,
        quests: Array.isArray(contentPlan.quests) ? contentPlan.quests.length : 0,
        items: Array.isArray(contentPlan.items) ? contentPlan.items.length : 0
    },
    pluginInstalled: installPlugin
};

fs.writeFileSync(summaryPath, JSON.stringify(summary, null, 2));

console.log(`Scaffolded content into ${projectDir}`);
console.log(`Saved pipeline files in ${outputDir}`);
console.log(`Map plan: ${mapPlanPath}`);
console.log(`Content plan: ${contentPlanPath}`);
console.log(`Merged map plan: ${mergedMapPlanPath}`);
if (withAssets) {
    console.log(`Asset prompts: ${assetPromptPath}`);
}
if (installPlugin) {
    console.log(`Installed plugin file into ${path.join(projectDir, "js", "plugins", "AiNpcDialogueMZ.js")}`);
}
console.log("Reminder: enable AiNpcDialogueMZ in the target project's Plugin Manager if it is not already enabled.");

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

function assertProjectShape(dir) {
    const required = [
        path.join(dir, "data", "MapInfos.json"),
        path.join(dir, "data", "System.json"),
        path.join(dir, "data", "CommonEvents.json"),
        path.join(dir, "data", "Items.json")
    ];
    for (const file of required) {
        if (!fs.existsSync(file)) {
            throw new Error(`Project file not found: ${file}`);
        }
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

    if (!response.ok) {
        throw new Error(await response.text());
    }

    return await response.json();
}

function runNodeScript(scriptName, scriptArgs) {
    execFileSync(
        "node",
        [path.join(__dirname, scriptName), ...scriptArgs],
        {
            stdio: "inherit"
        }
    );
}

function installPluginFile(projectDir) {
    const source = path.join(__dirname, "..", "..", "newdata", "js", "plugins", "AiNpcDialogueMZ.js");
    const targetDir = path.join(projectDir, "js", "plugins");
    ensureDir(targetDir);
    fs.copyFileSync(source, path.join(targetDir, "AiNpcDialogueMZ.js"));
}
