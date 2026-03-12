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
            this.session = this.buildSession(config);

            if (this.session.openingLine) {
                this.session.history.push({
                    role: "assistant",
                    speaker: this.session.npcName,
                    text: this.session.openingLine
                });
            }
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
                role,
                speaker,
                text
            });
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

    class Window_AiNpcLog extends Window_Base {
        initialize(rect) {
            super.initialize(rect);
            this._lines = [];
        }

        setLines(lines) {
            this._lines = lines;
            this.refresh();
        }

        refresh() {
            this.contents.clear();
            const textPadding = this.itemPadding();
            let y = 0;
            const recentLines = this._lines.slice(-18);
            for (const line of recentLines) {
                const prefix = line.speaker ? `${line.speaker}: ` : "";
                const wrapped = wrapText(`${prefix}${line.text}`, 48);
                for (const piece of wrapped) {
                    this.drawTextEx(piece, textPadding, y, this.contentsWidth() - textPadding * 2);
                    y += this.lineHeight();
                }
            }
        }
    }

    class Scene_AiNpcChat extends Scene_MenuBase {
        create() {
            super.create();
            this.createHelpWindow();
            this.createLogWindow();
            this.createStatusWindow();
            this.createInputElement();
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
        }

        createStatusWindow() {
            const h = this.calcWindowHeight(2, false);
            const y = Graphics.boxHeight - h;
            const rect = new Rectangle(0, y, Graphics.boxWidth, h);
            this._statusWindow = new Window_Base(rect);
            this.addWindow(this._statusWindow);
        }

        createInputElement() {
            this._inputWrapper = document.createElement("div");
            this._inputWrapper.style.position = "absolute";
            this._inputWrapper.style.zIndex = "1000";
            this._inputWrapper.style.left = "12px";
            this._inputWrapper.style.right = "12px";
            this._inputWrapper.style.bottom = "20px";

            this._inputElement = document.createElement("textarea");
            this._inputElement.rows = 2;
            this._inputElement.placeholder = "Type your message...";
            this._inputElement.style.width = "100%";
            this._inputElement.style.resize = "none";
            this._inputElement.style.padding = "10px 12px";
            this._inputElement.style.fontSize = "18px";
            this._inputElement.style.border = "2px solid #303040";
            this._inputElement.style.borderRadius = "6px";
            this._inputElement.style.background = "rgba(255,255,255,0.95)";
            this._inputElement.style.boxSizing = "border-box";
            this._inputElement.addEventListener("keydown", this.onInputKeyDown.bind(this));

            this._inputWrapper.appendChild(this._inputElement);
            document.body.appendChild(this._inputWrapper);
            this._inputElement.focus();
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
            this._logWindow.setLines(AiNpcDialogue.session ? AiNpcDialogue.session.history : []);
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

        update() {
            super.update();
            if (this._inputElement && document.activeElement !== this._inputElement && !this._busy) {
                this._inputElement.focus();
            }
        }

        terminate() {
            super.terminate();
            if (this._inputWrapper && this._inputWrapper.parentNode) {
                this._inputWrapper.parentNode.removeChild(this._inputWrapper);
            }
        }
    }

    function wrapText(text, maxLength) {
        const source = String(text || "");
        const result = [];
        let line = "";
        for (const char of source) {
            if (char === "\n") {
                result.push(line);
                line = "";
            } else if (line.length >= maxLength) {
                result.push(line);
                line = char;
            } else {
                line += char;
            }
        }
        if (line) {
            result.push(line);
        }
        return result.length ? result : [""];
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
