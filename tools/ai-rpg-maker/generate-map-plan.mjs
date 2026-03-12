import fs from "node:fs";
import path from "node:path";

const args = parseArgs(process.argv.slice(2));

if (!args.prompt) {
    throw new Error("Usage: node generate-map-plan.mjs --prompt \"Create a capital city...\" [--backend http://127.0.0.1:43115] [--out city-plan.json]");
}

const backend = args.backend || "http://127.0.0.1:43115";
const outputPath = path.resolve(process.cwd(), args.out || "city-plan.json");

const response = await fetch(`${backend.replace(/\/+$/, "")}/map-plan`, {
    method: "POST",
    headers: {
        "Content-Type": "application/json"
    },
    body: JSON.stringify({
        prompt: args.prompt
    })
});

if (!response.ok) {
    throw new Error(await response.text());
}

const json = await response.json();
fs.writeFileSync(outputPath, JSON.stringify(json, null, 2));
console.log(`Saved map plan to ${outputPath}`);

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
