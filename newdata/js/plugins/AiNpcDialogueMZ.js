//=============================================================================
// RPG Maker MZ - AI NPC Dialogue
//=============================================================================

/*:
 * @target MZ
 * @plugindesc Adds a free-text AI NPC dialogue scene backed by a local proxy service.
 * @author Codex
 *
 * @param backendBaseUrl
 * @text Backend Base URL
 * @type string
 * @default http://127.0.0.1:43115
 *
 * @param chatEndpoint
 * @text Chat Endpoint
 * @type string
 * @default /npc-chat
 *
 * @param globalWorldContext
 * @text Global World Context
 * @type multiline_string
 * @default
 *
 * @param requestTimeoutMs
 * @text Request Timeout
 * @type number
 * @min 1000
 * @default 30000
 *
 * @param maxHistoryMessages
 * @text Max History Messages
 * @type number
 * @min 2
 * @default 12
 *
 * @param playerDisplayName
 * @text Player Display Name
 * @type string
 * @default Hero
 *
 * @param thinkingText
 * @text Thinking Text
 * @type string
 * @default ...
 *
 * @param failureText
 * @text Failure Text
 * @type string
 * @default The NPC seems distracted right now.
 *
 * @param hintLabel
 * @text Hint Label
 * @type string
 * @default Hint
 *
 * @param submitLabel
 * @text Submit Hint
 * @type string
 * @default Enter send / Esc close
 *
 * @param debugMode
 * @text Debug Mode
 * @type boolean
 * @default false
 *
 * @command setGlobalContext
 * @text Set Global Context
 * @desc Updates the global lore or story context sent to the backend.
 *
 * @arg worldContext
 * @text World Context
 * @type multiline_string
 * @default
 *
 * @command openNpcChat
 * @text Open NPC Chat
 * @desc Opens the AI chat scene for the selected NPC.
 *
 * @arg npcId
 * @text NPC ID
 * @type string
 * @default guide_npc
 *
 * @arg npcName
 * @text NPC Name
 * @type string
 * @default Guide
 *
 * @arg locationName
 * @text Location Name
 * @type string
 * @default
 *
 * @arg openingLine
 * @text Opening Line
 * @type multiline_string
 * @default
 *
 * @arg personaPrompt
 * @text Persona Prompt
 * @type multiline_string
 * @default You are a helpful RPG NPC who stays in character.
 *
 * @arg questContext
 * @text Quest Context
 * @type multiline_string
 * @default
 *
 * @arg stateContext
 * @text State Context
 * @type multiline_string
 * @default
 *
 * @arg trackedSwitchIds
 * @text Tracked Switch IDs
 * @type string
 * @desc Comma-separated switch IDs, for example: 1,3,12
 * @default
 *
 * @arg trackedVariableIds
 * @text Tracked Variable IDs
 * @type string
 * @desc Comma-separated variable IDs, for example: 2,5,8
 * @default
 *
 * @help
 * This plugin opens a custom scene where the player can type natural language
 * to an NPC. The plugin talks to a local proxy service and does not require
 * shipping a vendor API key in the game build.
 *
 * Recommended flow:
 * 1. Start the local proxy from tools/ai-rpg-maker/server.mjs
 * 2. Configure the backend base URL in plugin parameters
 * 3. Add an event and call the plugin command "Open NPC Chat"
 * 4. Provide a persona prompt and current quest context
 *
 * Notes:
 * - The backend should own the real API key.
 * - The plugin stores the last hint in $gameSystem._aiNpcLastHint.
 * - The backend can return JSON like:
 *   { "reply": "...", "hint": "...", "action": null }
 */

(() => {
    "use strict";

    const pluginName = "AiNpcDialogueMZ";
    const parameters = PluginManager.parameters(pluginName);
    const npcProfileDataName = "$dataAiNpcProfiles";
    const npcProfileDataSrc = "AiNpcProfiles.json";

    const param = {
        backendBaseUrl: String(parameters.backendBaseUrl || "http://127.0.0.1:43115"),
        chatEndpoint: String(parameters.chatEndpoint || "/npc-chat"),
        globalWorldContext: String(parameters.globalWorldContext || ""),
        requestTimeoutMs: Number(parameters.requestTimeoutMs || 30000),
        maxHistoryMessages: Math.max(2, Number(parameters.maxHistoryMessages || 12)),
        playerDisplayName: String(parameters.playerDisplayName || "Hero"),
        thinkingText: String(parameters.thinkingText || "..."),
        failureText: String(parameters.failureText || "The NPC seems distracted right now."),
        hintLabel: String(parameters.hintLabel || "Hint"),
        submitLabel: String(parameters.submitLabel || "Enter send / Esc close"),
        debugMode: parameters.debugMode === "true"
    };

    registerNpcProfileData();

    const AiNpcDialogue = {
        session: null,

        setGlobalContext(text) {
            param.globalWorldContext = String(text || "");
        },

        startSession(config) {
            const session = this.buildSession(config);
            const persisted = this.loadPersistedSession(session.npcId);
            session.history = normalizeHistory(persisted?.history);
            this.session = session;

            if (!this.session.history.length && this.session.openingLine) {
                this.pushMessage("assistant", this.session.npcName, this.session.openingLine);
            }

            this.persistSession();
        },

        buildSession(config) {
            const npcId = config.npcId || "npc";
            const profile = getNpcProfileById(npcId);
            const activeStage = getActiveNpcStage(profile);
            const resolved = mergeNpcConfig(profile, activeStage, config);
            return {
                npcId,
                npcName: resolved.npcName || "NPC",
                locationName: resolved.locationName || "",
                openingLine: resolved.openingLine || "",
                personaPrompt: resolved.personaPrompt || "Stay in character.",
                questContext: resolved.questContext || "",
                stateContext: resolved.stateContext || "",
                worldContext: resolved.worldContext || "",
                trackedSwitchIds: Array.isArray(resolved.trackedSwitchIds) ? resolved.trackedSwitchIds : [],
                trackedVariableIds: Array.isArray(resolved.trackedVariableIds) ? resolved.trackedVariableIds : [],
                history: []
            };
        },

        loadPersistedSession(npcId) {
            const store = ensureSessionStore();
            return store[String(npcId || "npc")] || null;
        },

        persistSession() {
            if (!this.session) {
                return;
            }
            const store = ensureSessionStore();
            store[this.session.npcId] = {
                history: this.session.history.map(entry => ({
                    id: entry.id,
                    role: entry.role,
                    speaker: entry.speaker,
                    text: entry.text,
                    timestamp: entry.timestamp
                }))
            };
        },

        async sendPlayerMessage(text) {
            if (!this.session) {
                throw new Error("AI NPC session has not been started.");
            }

            const trimmed = String(text || "").trim();
            if (!trimmed) {
                return null;
            }

            this.pushMessage("user", param.playerDisplayName, trimmed);

            const payload = {
                npcId: this.session.npcId,
                npcName: this.session.npcName,
                locationName: this.session.locationName,
                personaPrompt: this.session.personaPrompt,
                questContext: this.session.questContext,
                stateSummary: this.buildStateSummary(),
                worldContext: joinSections(param.globalWorldContext, this.session.worldContext),
                history: this.session.history
                    .slice(-param.maxHistoryMessages)
                    .map(entry => ({
                        role: entry.role,
                        speaker: entry.speaker,
                        text: entry.text
                    })),
                playerText: trimmed
            };

            const response = await this.postJson(
                joinUrl(param.backendBaseUrl, param.chatEndpoint),
                payload,
                param.requestTimeoutMs
            );

            const replyText = String(response.reply || param.failureText);
            const hintText = String(response.hint || "");
            this.pushMessage("assistant", this.session.npcName, replyText);

            if (hintText) {
                $gameSystem._aiNpcLastHint = hintText;
                this.pushMessage("system", param.hintLabel, hintText);
            }

            if (param.debugMode && response.action) {
                this.pushMessage("system", "Action", JSON.stringify(response.action));
            }

            return response;
        },

        pushMessage(role, speaker, text) {
            if (!this.session) {
                return;
            }
            this.session.history.push({
                id: nextMessageId(this.session.history),
                role,
                speaker,
                text,
                timestamp: new Date().toISOString()
            });
            this.persistSession();
        },

        getTimelineEntries() {
            if (!this.session) {
                return [];
            }
            const entries = [];
            const history = this.session.history;
            for (let index = 0; index < history.length; index += 1) {
                const entry = history[index];
                if (!entry) {
                    continue;
                }
                if (entry.role === "user") {
                    entries.push({
                        id: `anchor-${entry.id}`,
                        index,
                        speaker: entry.speaker || param.playerDisplayName,
                        label: shortenLabel(entry.text || "Player", 18),
                        role: entry.role
                    });
                    continue;
                }
                if (entries.length === 0) {
                    entries.push({
                        id: `anchor-${entry.id}`,
                        index,
                        speaker: entry.speaker || this.session.npcName,
                        label: shortenLabel(entry.text || "Opening", 18),
                        role: "opening"
                    });
                }
            }
            return entries;
        },

        buildExportSnapshot() {
            if (!this.session) {
                return null;
            }
            return {
                npcId: this.session.npcId,
                npcName: this.session.npcName,
                locationName: this.session.locationName,
                exportedAt: new Date().toISOString(),
                hint: $gameSystem._aiNpcLastHint || "",
                history: this.session.history.map(entry => ({
                    id: entry.id,
                    role: entry.role,
                    speaker: entry.speaker,
                    text: entry.text,
                    timestamp: entry.timestamp || ""
                }))
            };
        },

        exportSession(format) {
            const snapshot = this.buildExportSnapshot();
            if (!snapshot) {
                return "";
            }
            const safeNpcId = sanitizeFileName(snapshot.npcId || "npc");
            const timestamp = buildFileTimestamp(new Date());
            const fileBase = `${safeNpcId}-${timestamp}`;
            if (String(format || "txt").toLowerCase() === "json") {
                return saveExportFile(`${fileBase}.json`, JSON.stringify(snapshot, null, 2), "application/json");
            }
            return saveExportFile(
                `${fileBase}.txt`,
                formatExportText(snapshot),
                "text/plain"
            );
        },

        buildStateSummary() {
            if (!this.session) {
                return "";
            }

            const lines = [];
            if (this.session.stateContext) {
                lines.push(this.session.stateContext);
            }

            if (this.session.trackedSwitchIds.length > 0) {
                lines.push("Switch States:");
                for (const id of this.session.trackedSwitchIds) {
                    lines.push(`- S[${id}] = ${$gameSwitches.value(id) ? "ON" : "OFF"}`);
                }
            }

            if (this.session.trackedVariableIds.length > 0) {
                lines.push("Variable States:");
                for (const id of this.session.trackedVariableIds) {
                    lines.push(`- V[${id}] = ${$gameVariables.value(id)}`);
                }
            }

            return lines.join("\n").trim();
        },

        async postJson(url, body, timeoutMs) {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
            try {
                const response = await fetch(url, {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json"
                    },
                    body: JSON.stringify(body),
                    signal: controller.signal
                });
                if (!response.ok) {
                    const text = await response.text();
                    throw new Error(text || `Request failed: ${response.status}`);
                }
                return await response.json();
            } finally {
                clearTimeout(timeoutId);
            }
        }
    };

    function joinUrl(baseUrl, path) {
        return `${String(baseUrl).replace(/\/+$/, "")}/${String(path).replace(/^\/+/, "")}`;
    }

    function joinSections(...sections) {
        return sections
            .map(text => String(text || "").trim())
            .filter(Boolean)
            .join("\n\n");
    }

    function parseIdList(text) {
        return String(text || "")
            .split(",")
            .map(token => Number(token.trim()))
            .filter(id => Number.isInteger(id) && id > 0);
    }

    function resolveControlText(text) {
        return String(text || "")
            .replace(/\\V\[(\d+)\]/gi, (_, id) => String($gameVariables.value(Number(id))))
            .replace(/\\S\[(\d+)\]/gi, (_, id) => ($gameSwitches.value(Number(id)) ? "ON" : "OFF"))
            .replace(/\\N\[(\d+)\]/gi, (_, id) => {
                const actor = $gameActors.actor(Number(id));
                return actor ? actor.name() : "";
            });
    }

    function registerNpcProfileData() {
        if (window[npcProfileDataName] === undefined) {
            window[npcProfileDataName] = null;
        }
        if (!Array.isArray(DataManager._databaseFiles)) {
            return;
        }
        const exists = DataManager._databaseFiles.some(file => file.name === npcProfileDataName);
        if (!exists) {
            DataManager._databaseFiles.push({
                name: npcProfileDataName,
                src: npcProfileDataSrc
            });
        }
    }

    function getNpcProfileStore() {
        const store = window[npcProfileDataName];
        if (!store) {
            return null;
        }
        if (Array.isArray(store)) {
            return { npcs: store };
        }
        return store;
    }

    function getNpcProfileById(npcId) {
        const store = getNpcProfileStore();
        const npcs = Array.isArray(store?.npcs) ? store.npcs : [];
        return npcs.find(entry => entry && String(entry.id || "") === String(npcId || "")) || null;
    }

    function getActiveNpcStage(profile) {
        if (!profile || !Array.isArray(profile.stages)) {
            return null;
        }
        let matched = null;
        for (const stage of profile.stages) {
            if (stageMatches(stage?.when)) {
                matched = stage;
            }
        }
        return matched;
    }

    function stageMatches(conditions) {
        if (!conditions) {
            return true;
        }

        const switchAllOn = Array.isArray(conditions.switchAllOn) ? conditions.switchAllOn : [];
        if (switchAllOn.some(id => !$gameSwitches.value(Number(id)))) {
            return false;
        }

        const switchAnyOn = Array.isArray(conditions.switchAnyOn) ? conditions.switchAnyOn : [];
        if (switchAnyOn.length > 0 && !switchAnyOn.some(id => $gameSwitches.value(Number(id)))) {
            return false;
        }

        const switchAllOff = Array.isArray(conditions.switchAllOff) ? conditions.switchAllOff : [];
        if (switchAllOff.some(id => $gameSwitches.value(Number(id)))) {
            return false;
        }

        const variableMin = conditions.variableMin || {};
        for (const [id, value] of Object.entries(variableMin)) {
            if (Number($gameVariables.value(Number(id))) < Number(value)) {
                return false;
            }
        }

        const variableEq = conditions.variableEq || {};
        for (const [id, value] of Object.entries(variableEq)) {
            if (Number($gameVariables.value(Number(id))) !== Number(value)) {
                return false;
            }
        }

        return true;
    }

    function mergeNpcConfig(profile, activeStage, config) {
        const source = profile || {};
        const stage = activeStage || {};
        const trackedSwitchIds =
            parseProfileIdList(config.trackedSwitchIds).length > 0
                ? parseProfileIdList(config.trackedSwitchIds)
                : parseProfileIdList(stage.trackedSwitchIds).length > 0
                  ? parseProfileIdList(stage.trackedSwitchIds)
                  : parseProfileIdList(source.trackedSwitchIds);
        const trackedVariableIds =
            parseProfileIdList(config.trackedVariableIds).length > 0
                ? parseProfileIdList(config.trackedVariableIds)
                : parseProfileIdList(stage.trackedVariableIds).length > 0
                  ? parseProfileIdList(stage.trackedVariableIds)
                  : parseProfileIdList(source.trackedVariableIds);

        return {
            npcName: firstNonEmpty(config.npcName, stage.name, source.name, "NPC"),
            locationName: firstNonEmpty(config.locationName, stage.locationName, source.locationName, ""),
            openingLine: firstNonEmpty(config.openingLine, stage.openingLine, source.openingLine, ""),
            personaPrompt: firstNonEmpty(config.personaPrompt, stage.personaPrompt, source.personaPrompt, "Stay in character."),
            questContext: joinSections(source.questContext, stage.questContext, config.questContext),
            stateContext: joinSections(source.stateContext, stage.stateContext, config.stateContext),
            worldContext: joinSections(getNpcProfileStore()?.worldContext, source.worldContext, stage.worldContext),
            trackedSwitchIds,
            trackedVariableIds
        };
    }

    function firstNonEmpty(...values) {
        for (const value of values) {
            if (value !== undefined && value !== null && String(value).trim() !== "") {
                return String(value);
            }
        }
        return "";
    }

    function parseProfileIdList(value) {
        if (Array.isArray(value)) {
            return value
                .map(id => Number(id))
                .filter(id => Number.isInteger(id) && id > 0);
        }
        return parseIdList(value);
    }

    function ensureSessionStore() {
        if (!$gameSystem._aiNpcSessionStore) {
            $gameSystem._aiNpcSessionStore = {};
        }
        return $gameSystem._aiNpcSessionStore;
    }

    function normalizeHistory(history) {
        const entries = Array.isArray(history) ? history : [];
        return entries.map((entry, index) => ({
            id: Number.isInteger(Number(entry?.id)) ? Number(entry.id) : index + 1,
            role: String(entry?.role || "assistant"),
            speaker: String(entry?.speaker || ""),
            text: String(entry?.text || ""),
            timestamp: String(entry?.timestamp || "")
        }));
    }

    function nextMessageId(history) {
        const values = (Array.isArray(history) ? history : [])
            .map(entry => Number(entry?.id) || 0);
        return (values.length ? Math.max(...values) : 0) + 1;
    }

    function shortenLabel(text, maxLength) {
        const value = String(text || "").replace(/\s+/g, " ").trim();
        if (!value) {
            return "Dialogue";
        }
        if (value.length <= maxLength) {
            return value;
        }
        return `${value.slice(0, Math.max(1, maxLength - 1))}...`;
    }

    function sanitizeFileName(value) {
        return String(value || "chat")
            .replace(/[<>:"/\\|?*\x00-\x1f]/g, "-")
            .replace(/\s+/g, "-")
            .replace(/-+/g, "-")
            .replace(/^-|-$/g, "") || "chat";
    }

    function buildFileTimestamp(date) {
        const source = date instanceof Date ? date : new Date();
        const parts = [
            source.getFullYear(),
            padNumber(source.getMonth() + 1),
            padNumber(source.getDate()),
            padNumber(source.getHours()),
            padNumber(source.getMinutes()),
            padNumber(source.getSeconds())
        ];
        return `${parts[0]}${parts[1]}${parts[2]}-${parts[3]}${parts[4]}${parts[5]}`;
    }

    function padNumber(value) {
        return String(Number(value) || 0).padStart(2, "0");
    }

    function formatExportText(snapshot) {
        const header = [
            `NPC: ${snapshot.npcName || snapshot.npcId}`,
            snapshot.locationName ? `Location: ${snapshot.locationName}` : "",
            `Exported: ${snapshot.exportedAt}`,
            snapshot.hint ? `${param.hintLabel}: ${snapshot.hint}` : ""
        ].filter(Boolean);

        const body = snapshot.history.map(entry => {
            const stamp = entry.timestamp ? `[${entry.timestamp}] ` : "";
            const speaker = entry.speaker ? `${entry.speaker}: ` : "";
            return `${stamp}${speaker}${entry.text}`;
        });

        return header.concat("", body).join("\n");
    }

    function saveExportFile(fileName, content, mimeType) {
        const localPath = tryWriteExportFile(fileName, content);
        if (localPath) {
            return localPath;
        }

        const blob = new Blob([content], { type: mimeType });
        const link = document.createElement("a");
        link.href = URL.createObjectURL(blob);
        link.download = fileName;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        setTimeout(() => URL.revokeObjectURL(link.href), 1000);
        return fileName;
    }

    function tryWriteExportFile(fileName, content) {
        try {
            if (typeof require !== "function") {
                return "";
            }
            const fs = require("fs");
            const path = require("path");
            const exportDir = path.join(process.cwd(), "ai-chat-exports");
            fs.mkdirSync(exportDir, { recursive: true });
            const fullPath = path.join(exportDir, fileName);
            fs.writeFileSync(fullPath, content, "utf8");
            return fullPath;
        } catch (error) {
            return "";
        }
    }

    function formatHistoryTime(timestamp) {
        if (!timestamp) {
            return "";
        }
        const date = new Date(timestamp);
        if (Number.isNaN(date.getTime())) {
            return "";
        }
        return `${padNumber(date.getHours())}:${padNumber(date.getMinutes())}`;
    }

    function applyStyles(element, styles) {
        Object.assign(element.style, styles);
        return element;
    }

    function elementRectToViewport(rect) {
        const canvas = Graphics.app?.view || Graphics._canvas;
        if (!canvas) {
            return {
                left: rect.x,
                top: rect.y,
                width: rect.width,
                height: rect.height
            };
        }
        const bounds = canvas.getBoundingClientRect();
        const scaleX = bounds.width / Graphics.boxWidth;
        const scaleY = bounds.height / Graphics.boxHeight;
        return {
            left: bounds.left + rect.x * scaleX,
            top: bounds.top + rect.y * scaleY,
            width: rect.width * scaleX,
            height: rect.height * scaleY
        };
    }

    class Window_AiNpcLog extends Window_Base {
        initialize(rect) {
            super.initialize(rect);
        }

        refresh() {
            this.contents.clear();
        }
    }

    class Scene_AiNpcChat extends Scene_MenuBase {
        create() {
            super.create();
            this.createHelpWindow();
            this.createLogWindow();
            this.createStatusWindow();
            this.createDomChatUi();
            this.refreshWindows();
        }

        helpAreaHeight() {
            return this.calcWindowHeight(2, false);
        }

        createHelpWindow() {
            const rect = new Rectangle(0, 0, Graphics.boxWidth, this.helpAreaHeight());
            this._helpWindow = new Window_Base(rect);
            this.addWindow(this._helpWindow);
        }

        createLogWindow() {
            const y = this.helpAreaHeight();
            const h = Graphics.boxHeight - y - this.calcWindowHeight(2, false);
            const rect = new Rectangle(0, y, Graphics.boxWidth, h);
            this._logWindow = new Window_AiNpcLog(rect);
            this.addWindow(this._logWindow);
            this._logWindow.refresh();
        }

        createStatusWindow() {
            const h = this.calcWindowHeight(2, false);
            const y = Graphics.boxHeight - h;
            const rect = new Rectangle(0, y, Graphics.boxWidth, h);
            this._statusWindow = new Window_Base(rect);
            this.addWindow(this._statusWindow);
        }

        createDomChatUi() {
            this._activeAnchorId = null;
            this._autoFollowTimeline = true;
            this._lastViewportSignature = "";
            this._suppressScrollSync = false;

            this._domRoot = applyStyles(document.createElement("div"), {
                position: "fixed",
                zIndex: "1000",
                pointerEvents: "none"
            });

            this._chatShell = applyStyles(document.createElement("div"), {
                width: "100%",
                height: "100%",
                display: "grid",
                gridTemplateColumns: "1fr 72px",
                gap: "14px",
                pointerEvents: "auto"
            });

            this._mainPanel = applyStyles(document.createElement("div"), {
                display: "flex",
                flexDirection: "column",
                minHeight: "0",
                borderRadius: "18px",
                border: "1px solid rgba(255,255,255,0.2)",
                background: "linear-gradient(180deg, rgba(30,34,46,0.92), rgba(18,22,31,0.92))",
                boxShadow: "0 18px 36px rgba(0,0,0,0.25)",
                overflow: "hidden"
            });

            const toolbar = applyStyles(document.createElement("div"), {
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: "12px",
                padding: "14px 16px 10px"
            });

            const toolbarTitle = applyStyles(document.createElement("div"), {
                color: "rgba(255,255,255,0.94)",
                fontSize: "15px",
                fontWeight: "700",
                letterSpacing: "0.03em"
            });
            toolbarTitle.textContent = "Conversation";

            const actionRow = applyStyles(document.createElement("div"), {
                display: "flex",
                alignItems: "center",
                gap: "8px",
                flexWrap: "wrap",
                justifyContent: "flex-end"
            });

            this._latestButton = this.createToolbarButton("Latest");
            this._latestButton.addEventListener("click", () => this.focusLatestAnchor(true));
            actionRow.appendChild(this._latestButton);

            this._exportTxtButton = this.createToolbarButton("Export TXT");
            this._exportTxtButton.addEventListener("click", () => this.exportConversation("txt"));
            actionRow.appendChild(this._exportTxtButton);

            this._exportJsonButton = this.createToolbarButton("Export JSON");
            this._exportJsonButton.addEventListener("click", () => this.exportConversation("json"));
            actionRow.appendChild(this._exportJsonButton);

            toolbar.appendChild(toolbarTitle);
            toolbar.appendChild(actionRow);

            this._transcriptElement = applyStyles(document.createElement("div"), {
                flex: "1",
                minHeight: "0",
                overflowY: "auto",
                padding: "6px 16px 18px",
                display: "grid",
                gap: "14px",
                scrollBehavior: "smooth"
            });
            this._transcriptElement.addEventListener("scroll", this.onTranscriptScroll.bind(this));

            const composer = applyStyles(document.createElement("div"), {
                display: "grid",
                gridTemplateColumns: "1fr auto",
                gap: "10px",
                alignItems: "end",
                padding: "12px 16px 16px",
                borderTop: "1px solid rgba(255,255,255,0.08)",
                background: "rgba(255,255,255,0.03)"
            });

            this._inputElement = applyStyles(document.createElement("textarea"), {
                width: "100%",
                minHeight: "84px",
                resize: "none",
                padding: "14px 16px",
                borderRadius: "16px",
                border: "1px solid rgba(255,255,255,0.16)",
                background: "rgba(245,247,251,0.96)",
                color: "#16202c",
                fontSize: "16px",
                lineHeight: "1.55",
                boxSizing: "border-box",
                outline: "none",
                fontFamily: "\"Trebuchet MS\", \"Segoe UI\", sans-serif"
            });
            this._inputElement.rows = 3;
            this._inputElement.placeholder = "Type your message...";
            this._inputElement.addEventListener("keydown", this.onInputKeyDown.bind(this));

            this._sendButton = applyStyles(document.createElement("button"), {
                border: "0",
                borderRadius: "16px",
                padding: "14px 18px",
                minWidth: "92px",
                background: "linear-gradient(135deg, #dfc47a, #c78b41)",
                color: "#1b1611",
                fontSize: "14px",
                fontWeight: "700",
                cursor: "pointer",
                boxShadow: "0 10px 20px rgba(0,0,0,0.18)"
            });
            this._sendButton.textContent = "Send";
            this._sendButton.addEventListener("click", () => this.submitInput());

            composer.appendChild(this._inputElement);
            composer.appendChild(this._sendButton);

            this._mainPanel.appendChild(toolbar);
            this._mainPanel.appendChild(this._transcriptElement);
            this._mainPanel.appendChild(composer);

            this._timelinePanel = applyStyles(document.createElement("div"), {
                borderRadius: "18px",
                border: "1px solid rgba(255,255,255,0.16)",
                background: "linear-gradient(180deg, rgba(16,18,24,0.95), rgba(8,10,14,0.95))",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: "12px",
                padding: "16px 10px",
                boxShadow: "0 18px 36px rgba(0,0,0,0.22)"
            });

            const timelineTitle = applyStyles(document.createElement("div"), {
                color: "rgba(255,255,255,0.72)",
                fontSize: "11px",
                fontWeight: "700",
                letterSpacing: "0.18em",
                textTransform: "uppercase",
                writingMode: "vertical-rl",
                transform: "rotate(180deg)"
            });
            timelineTitle.textContent = "History";

            this._timelineElement = applyStyles(document.createElement("div"), {
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: "12px",
                flex: "1",
                width: "100%",
                overflowY: "auto",
                padding: "6px 0"
            });

            const timelineHint = applyStyles(document.createElement("div"), {
                color: "rgba(255,255,255,0.56)",
                fontSize: "10px",
                lineHeight: "1.4",
                textAlign: "center"
            });
            timelineHint.textContent = "Jump to earlier turns";

            this._timelinePanel.appendChild(timelineTitle);
            this._timelinePanel.appendChild(this._timelineElement);
            this._timelinePanel.appendChild(timelineHint);

            this._chatShell.appendChild(this._mainPanel);
            this._chatShell.appendChild(this._timelinePanel);
            this._domRoot.appendChild(this._chatShell);
            document.body.appendChild(this._domRoot);
            this.syncDomLayout(true);
            this._inputElement.focus();
        }

        createToolbarButton(label) {
            const button = applyStyles(document.createElement("button"), {
                border: "1px solid rgba(255,255,255,0.14)",
                borderRadius: "999px",
                padding: "8px 12px",
                background: "rgba(255,255,255,0.06)",
                color: "rgba(255,255,255,0.88)",
                fontSize: "12px",
                fontWeight: "700",
                cursor: "pointer"
            });
            button.textContent = label;
            return button;
        }

        onInputKeyDown(event) {
            if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                this.submitInput();
            } else if (event.key === "Escape") {
                event.preventDefault();
                this.popScene();
            }
        }

        async submitInput() {
            if (this._busy) {
                return;
            }
            const text = this._inputElement.value.trim();
            if (!text) {
                return;
            }
            this._busy = true;
            this._autoFollowTimeline = true;
            this._inputElement.value = "";
            this._statusMessage = param.thinkingText;
            this.refreshWindows();
            try {
                await AiNpcDialogue.sendPlayerMessage(text);
            } catch (error) {
                const message = error instanceof Error ? error.message : String(error);
                AiNpcDialogue.pushMessage("system", "Error", message || param.failureText);
            } finally {
                this._busy = false;
                this._statusMessage = "";
                this.refreshWindows();
            }
        }

        refreshWindows() {
            this.refreshHelpWindow();
            this.refreshChatDom();
            this.refreshStatusWindow();
        }

        refreshHelpWindow() {
            this._helpWindow.contents.clear();
            if (!AiNpcDialogue.session) {
                this._helpWindow.drawText("No active NPC chat.", 0, 0, this._helpWindow.contentsWidth(), "left");
                return;
            }
            const line1 = `${AiNpcDialogue.session.npcName}${AiNpcDialogue.session.locationName ? ` @ ${AiNpcDialogue.session.locationName}` : ""}`;
            this._helpWindow.drawText(line1, 0, 0, this._helpWindow.contentsWidth(), "left");
            this._helpWindow.drawText(param.submitLabel, 0, this._helpWindow.lineHeight(), this._helpWindow.contentsWidth(), "left");
        }

        refreshStatusWindow() {
            this._statusWindow.contents.clear();
            const hint = $gameSystem._aiNpcLastHint || "";
            const status = this._statusMessage || (hint ? `${param.hintLabel}: ${hint}` : "");
            this._statusWindow.drawText(status, 0, 0, this._statusWindow.contentsWidth(), "left");
        }

        refreshChatDom() {
            if (!this._transcriptElement || !this._timelineElement) {
                return;
            }
            const session = AiNpcDialogue.session;
            const history = session ? session.history : [];
            const anchors = AiNpcDialogue.getTimelineEntries();
            this._anchorGroups = this.buildAnchorGroups(history, anchors);

            if (!this._activeAnchorId) {
                this._activeAnchorId = this.getLatestAnchorId();
            }

            this.renderTranscript();
            this.renderTimeline();
            this.syncComposerState();
        }

        buildAnchorGroups(history, anchors) {
            if (!Array.isArray(anchors) || anchors.length === 0) {
                return [];
            }
            return anchors.map((anchor, index) => {
                const nextAnchor = anchors[index + 1];
                return {
                    anchor,
                    messages: history.slice(anchor.index, nextAnchor ? nextAnchor.index : history.length)
                };
            });
        }

        renderTranscript() {
            this._transcriptElement.innerHTML = "";
            this._anchorElements = new Map();
            const groups = Array.isArray(this._anchorGroups) ? this._anchorGroups : [];

            if (groups.length === 0) {
                const empty = applyStyles(document.createElement("div"), {
                    padding: "24px",
                    borderRadius: "18px",
                    background: "rgba(255,255,255,0.06)",
                    border: "1px dashed rgba(255,255,255,0.18)",
                    color: "rgba(255,255,255,0.64)",
                    textAlign: "center",
                    lineHeight: "1.6"
                });
                empty.textContent = "Start talking to create the first turn in this conversation.";
                this._transcriptElement.appendChild(empty);
                return;
            }

            for (const group of groups) {
                const section = applyStyles(document.createElement("section"), {
                    display: "grid",
                    gap: "10px",
                    padding: "12px",
                    borderRadius: "18px",
                    background: group.anchor.id === this._activeAnchorId
                        ? "rgba(255,255,255,0.09)"
                        : "rgba(255,255,255,0.04)",
                    border: group.anchor.id === this._activeAnchorId
                        ? "1px solid rgba(255,255,255,0.18)"
                        : "1px solid rgba(255,255,255,0.08)"
                });
                section.dataset.anchorId = group.anchor.id;

                const label = applyStyles(document.createElement("div"), {
                    color: "rgba(255,255,255,0.58)",
                    fontSize: "11px",
                    fontWeight: "700",
                    letterSpacing: "0.08em",
                    textTransform: "uppercase"
                });
                label.textContent = `${group.anchor.speaker || "Dialogue"} · ${group.anchor.label}`;
                section.appendChild(label);

                for (const message of group.messages) {
                    section.appendChild(this.createBubble(message));
                }

                this._transcriptElement.appendChild(section);
                this._anchorElements.set(group.anchor.id, section);
            }

            this.afterTranscriptRender();
        }

        createBubble(message) {
            const role = String(message?.role || "assistant");
            const alignment = role === "user" ? "flex-end" : role === "system" ? "center" : "flex-start";
            const bubble = applyStyles(document.createElement("div"), {
                display: "flex",
                justifyContent: alignment
            });

            const card = applyStyles(document.createElement("article"), {
                maxWidth: role === "system" ? "88%" : "82%",
                padding: role === "system" ? "10px 14px" : "12px 14px",
                borderRadius: role === "system" ? "16px" : "18px",
                background: role === "user"
                    ? "linear-gradient(135deg, rgba(226,198,116,0.96), rgba(196,133,58,0.96))"
                    : role === "system"
                      ? "rgba(147, 196, 255, 0.18)"
                      : "rgba(255,255,255,0.96)",
                color: role === "user" ? "#20140b" : role === "system" ? "#f0f7ff" : "#1b2130",
                boxShadow: "0 10px 24px rgba(0,0,0,0.16)"
            });

            const meta = applyStyles(document.createElement("div"), {
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: "12px",
                marginBottom: "6px",
                fontSize: "11px",
                fontWeight: "700",
                letterSpacing: "0.04em",
                opacity: "0.72"
            });
            meta.textContent = `${message.speaker || "Narrator"}${formatHistoryTime(message.timestamp) ? ` · ${formatHistoryTime(message.timestamp)}` : ""}`;

            const text = applyStyles(document.createElement("div"), {
                whiteSpace: "pre-wrap",
                lineHeight: "1.65",
                wordBreak: "break-word",
                fontSize: "14px"
            });
            text.textContent = String(message?.text || "");

            card.appendChild(meta);
            card.appendChild(text);
            bubble.appendChild(card);
            return bubble;
        }

        afterTranscriptRender() {
            const latestAnchorId = this.getLatestAnchorId();
            if (!this._activeAnchorId) {
                this._activeAnchorId = latestAnchorId;
            }

            if (this._pendingAnchorId) {
                const targetAnchorId = this._pendingAnchorId;
                this._pendingAnchorId = null;
                this.scrollToAnchor(targetAnchorId, false);
                return;
            }

            if (this._autoFollowTimeline && latestAnchorId) {
                this.scrollToAnchor(latestAnchorId, false, true);
            }
        }

        renderTimeline() {
            this._timelineElement.innerHTML = "";
            const groups = Array.isArray(this._anchorGroups) ? this._anchorGroups : [];

            if (groups.length === 0) {
                const empty = applyStyles(document.createElement("div"), {
                    width: "12px",
                    height: "12px",
                    borderRadius: "999px",
                    background: "rgba(255,255,255,0.24)"
                });
                this._timelineElement.appendChild(empty);
                return;
            }

            for (const group of groups) {
                const button = applyStyles(document.createElement("button"), {
                    width: "14px",
                    height: "14px",
                    borderRadius: "999px",
                    border: group.anchor.id === this._activeAnchorId
                        ? "2px solid rgba(255,255,255,0.95)"
                        : "1px solid rgba(255,255,255,0.55)",
                    background: group.anchor.id === this._activeAnchorId
                        ? "rgba(255,255,255,0.94)"
                        : "rgba(255,255,255,0.48)",
                    cursor: "pointer",
                    padding: "0",
                    boxShadow: group.anchor.id === this._activeAnchorId
                        ? "0 0 0 4px rgba(255,255,255,0.12)"
                        : "none",
                    transition: "transform 0.16s ease, background 0.16s ease"
                });
                button.title = `${group.anchor.speaker}: ${group.anchor.label}`;
                button.addEventListener("click", () => this.scrollToAnchor(group.anchor.id, true));
                this._timelineElement.appendChild(button);
            }
        }

        syncComposerState() {
            const disabled = !!this._busy;
            if (this._inputElement) {
                this._inputElement.disabled = disabled;
            }
            if (this._sendButton) {
                this._sendButton.disabled = disabled;
                this._sendButton.style.opacity = disabled ? "0.65" : "1";
                this._sendButton.style.cursor = disabled ? "not-allowed" : "pointer";
            }
            if (this._latestButton) {
                this._latestButton.disabled = disabled;
            }
            if (this._exportTxtButton) {
                this._exportTxtButton.disabled = disabled;
            }
            if (this._exportJsonButton) {
                this._exportJsonButton.disabled = disabled;
            }
        }

        getLatestAnchorId() {
            const groups = Array.isArray(this._anchorGroups) ? this._anchorGroups : [];
            return groups.length > 0 ? groups[groups.length - 1].anchor.id : null;
        }

        focusLatestAnchor(smooth) {
            const anchorId = this.getLatestAnchorId();
            if (anchorId) {
                this.scrollToAnchor(anchorId, !!smooth, true);
            }
        }

        scrollToAnchor(anchorId, smooth, forceFollow) {
            const element = this._anchorElements?.get(anchorId);
            this._activeAnchorId = anchorId;
            this._autoFollowTimeline = !!forceFollow || anchorId === this.getLatestAnchorId();
            this.renderTimeline();

            if (!element) {
                this._pendingAnchorId = anchorId;
                return;
            }

            this._suppressScrollSync = true;
            element.scrollIntoView({
                behavior: smooth ? "smooth" : "auto",
                block: "start"
            });
            setTimeout(() => {
                this._suppressScrollSync = false;
            }, smooth ? 220 : 0);
        }

        onTranscriptScroll() {
            if (this._suppressScrollSync || !this._transcriptElement) {
                return;
            }

            const groups = Array.isArray(this._anchorGroups) ? this._anchorGroups : [];
            if (groups.length === 0) {
                return;
            }

            const scrollTop = this._transcriptElement.scrollTop;
            const threshold = scrollTop + 30;
            let activeAnchorId = groups[0].anchor.id;

            for (const group of groups) {
                const element = this._anchorElements?.get(group.anchor.id);
                if (element && element.offsetTop <= threshold) {
                    activeAnchorId = group.anchor.id;
                }
            }

            const nearBottom = scrollTop + this._transcriptElement.clientHeight >= this._transcriptElement.scrollHeight - 30;
            this._autoFollowTimeline = nearBottom;

            if (activeAnchorId !== this._activeAnchorId) {
                this._activeAnchorId = activeAnchorId;
                this.renderTimeline();
            }
        }

        exportConversation(format) {
            try {
                const path = AiNpcDialogue.exportSession(format);
                this._statusMessage = path
                    ? `Exported ${String(format || "txt").toUpperCase()} to ${path}`
                    : "Nothing to export yet.";
            } catch (error) {
                const message = error instanceof Error ? error.message : String(error);
                this._statusMessage = `Export failed: ${message}`;
            }
            this.refreshStatusWindow();
        }

        syncDomLayout(force) {
            if (!this._domRoot || !this._logWindow) {
                return;
            }
            const viewport = elementRectToViewport(this._logWindow);
            const signature = [
                Math.round(viewport.left),
                Math.round(viewport.top),
                Math.round(viewport.width),
                Math.round(viewport.height)
            ].join(":");

            if (!force && signature === this._lastViewportSignature) {
                return;
            }

            this._lastViewportSignature = signature;
            applyStyles(this._domRoot, {
                left: `${viewport.left + 10}px`,
                top: `${viewport.top + 10}px`,
                width: `${Math.max(0, viewport.width - 20)}px`,
                height: `${Math.max(0, viewport.height - 20)}px`
            });
        }

        update() {
            super.update();
            this.syncDomLayout(false);
            if (
                this._inputElement &&
                !this._busy &&
                document.activeElement !== this._inputElement &&
                !this._domRoot?.contains(document.activeElement)
            ) {
                this._inputElement.focus();
            }
        }

        terminate() {
            super.terminate();
            if (this._domRoot && this._domRoot.parentNode) {
                this._domRoot.parentNode.removeChild(this._domRoot);
            }
        }
    }

    PluginManager.registerCommand(pluginName, "setGlobalContext", args => {
        AiNpcDialogue.setGlobalContext(args.worldContext || "");
    });

    PluginManager.registerCommand(pluginName, "openNpcChat", args => {
        AiNpcDialogue.startSession({
            npcId: String(args.npcId || "npc"),
            npcName: resolveControlText(args.npcName || ""),
            locationName: resolveControlText(args.locationName || ""),
            openingLine: resolveControlText(args.openingLine || ""),
            personaPrompt: resolveControlText(args.personaPrompt || ""),
            questContext: resolveControlText(args.questContext || ""),
            stateContext: resolveControlText(args.stateContext || ""),
            trackedSwitchIds: parseIdList(args.trackedSwitchIds || ""),
            trackedVariableIds: parseIdList(args.trackedVariableIds || "")
        });
        SceneManager.push(Scene_AiNpcChat);
    });
})();
