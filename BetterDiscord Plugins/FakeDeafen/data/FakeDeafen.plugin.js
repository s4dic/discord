/**
 * @name FakeDeafen
 * @description Freezes your current mute / deafen state for others while you keep hearing and talking.
 * @version 1.3
 * @author Sleek
 * @authorId 153253064231354368
 * @invite B5kBdSsED2
 * @license Unlicensed
 * @website https://sleek.blackbox.sh/
 * @source https://github.com/s4dic/BetterDiscord/tree/main/FakeDeafen
 * @updateUrl https://raw.githubusercontent.com/s4dic/BetterDiscord/main/FakeDeafen/FakeDeafen.plugin.js
 */

module.exports = class FakeDeafen {
    constructor() {
        this.pluginName = "FakeDeafen";
        this.mySettings = {
            shiftKeyRequired: false,
            ctrlKeyRequired: false,
            triggerKey: "w",
            debugMode: false
        };
        this.isActive = false;
        // State frozen when the shortcut is pressed: what others keep seeing.
        this.frozen = { mute: false, deaf: false };
        // Last voiceStateUpdate arguments Discord sent (used to resync on disable).
        this.lastVoiceArgs = null;
        this.resyncing = false;
        this.boundHandleKeyDown = this.handleKeyDown.bind(this);
        this.originalWebSocketSend = null;
        this.indicator = null;
        this.stores = {};
    }

    log(...args) {
        if (this.mySettings.debugMode) {
            console.log(`[${this.pluginName}]`, ...args);
        }
    }

    start() {
        try {
            const settings = BdApi.Data.load(this.pluginName, "settings");
            if (settings) {
                this.mySettings = { ...this.mySettings, ...settings };
            }
        } catch (e) {
            console.error("[FakeDeafen] Failed to load settings:", e);
        }

        this.stores = {
            media: BdApi.Webpack.getStore("MediaEngineStore"),
            gateway: BdApi.Webpack.getStore("GatewayConnectionStore"),
            selectedChannel: BdApi.Webpack.getStore("SelectedChannelStore"),
            channel: BdApi.Webpack.getStore("ChannelStore")
        };
        this.log("Stores:", this.stores);

        document.addEventListener("keydown", this.boundHandleKeyDown, true);
        this.patchVoiceRows();
        this.patchGatewaySocket();
        this.patchWebSocket();
        this.createIndicator();

        BdApi.UI.showToast(`${this.pluginName} started - Press ${this.mySettings.triggerKey.toUpperCase()} to toggle`, { type: "success" });
        this.log("Plugin started");
    }

    stop() {
        document.removeEventListener("keydown", this.boundHandleKeyDown, true);
        const wasActive = this.isActive;
        this.isActive = false;
        try { this.voiceRowsAbort?.abort(); } catch (e) { /* ignore */ }
        this.voiceRowsAbort = null;
        this.voiceRowsPatched = false;
        BdApi.Patcher.unpatchAll(this.pluginName);
        this.unpatchWebSocket();
        this.removeIndicator();
        if (wasActive) {
            this.refreshUI();
            this.resyncRealState();
        }

        BdApi.UI.showToast(`${this.pluginName} stopped`, { type: "info" });
        this.log("Plugin stopped");
    }

    // ---------------------------------------------------------------------
    // Real local state (what you actually do: mic/headset), bypassing our patch
    // ---------------------------------------------------------------------
    getRealState() {
        const media = this.stores.media;
        if (!media) return { mute: false, deaf: false };
        const wasActive = this.isActive;
        this.isActive = false;
        try {
            return { mute: !!media.isSelfMute(), deaf: !!media.isSelfDeaf() };
        } finally {
            this.isActive = wasActive;
        }
    }

    isDefaultContext(ctx) {
        return ctx === undefined || ctx === null || ctx === "default";
    }

    // ---------------------------------------------------------------------
    // Display. Discord draws your own row in the voice channel list (and your
    // video tile) from the server voice state MERGED with your local settings:
    //   mergeSelf(voiceState, local) => voiceState.merge({selfMute, selfDeaf})
    // We patch only that merge so your row shows the frozen state, like others
    // see it. The mic/headset buttons of the user panel are left untouched so
    // they stay clickable and show your REAL state.
    // ---------------------------------------------------------------------
    patchVoiceRows() {
        const isMergeFn = (f) => {
            try {
                if (typeof f !== "function") return false;
                const src = Function.prototype.toString.call(f);
                return src.includes(".merge({selfMute:") && src.includes("selfDeaf") && src.includes("sessionId");
            } catch (e) {
                return false;
            }
        };
        const findKey = (mod) => {
            if (!mod || (typeof mod !== "object" && typeof mod !== "function")) return null;
            for (const key of Object.keys(mod)) {
                try {
                    if (isMergeFn(mod[key])) return key;
                } catch (e) { /* getter threw */ }
            }
            return null;
        };

        const apply = (mod) => {
            const key = findKey(mod);
            if (!key || this.voiceRowsPatched) return;
            try {
                BdApi.Patcher.instead(this.pluginName, mod, key, (that, args, original) => {
                    if (this.isActive && args[1] && typeof args[1] === "object") {
                        const local = { ...args[1] };
                        if (this.frozen.mute || this.frozen.deaf) local.selfMute = true;
                        if (this.frozen.deaf) local.selfDeaf = true;
                        args = [args[0], local, ...args.slice(2)];
                    }
                    return original(...args);
                });
                this.voiceRowsPatched = true;
                this.log("Voice rows merge patched (key:", key, ")");
                this.refreshUI();
            } catch (e) {
                console.error("[FakeDeafen] Failed to patch voice rows:", e);
            }
        };

        const filter = (m) => findKey(m) !== null;
        this.voiceRowsPatched = false;
        const now = BdApi.Webpack.getModule(filter);
        if (now) {
            apply(now);
            return;
        }
        // The module lives in a lazily loaded chunk: wait until Discord loads it.
        this.log("Voice rows module not loaded yet, waiting...");
        this.voiceRowsAbort = new AbortController();
        BdApi.Webpack.waitForModule(filter, { signal: this.voiceRowsAbort.signal })
            .then((m) => { if (m) apply(m); })
            .catch(() => {});
    }

    refreshUI() {
        try {
            this.stores.media?.emitChange?.();
        } catch (e) {
            this.log("emitChange failed:", e);
        }
    }

    // ---------------------------------------------------------------------
    // Gateway: rewrite the voice state Discord sends (op 4), before encoding.
    // ---------------------------------------------------------------------
    getGatewaySocket() {
        try {
            return this.stores.gateway?.getSocket?.() ?? null;
        } catch (e) {
            return null;
        }
    }

    patchGatewaySocket() {
        const socket = this.getGatewaySocket();
        if (!socket || typeof socket.voiceStateUpdate !== "function") {
            console.warn("[FakeDeafen] Gateway socket not found, using WebSocket fallback only");
            return;
        }

        BdApi.Patcher.before(this.pluginName, socket, "voiceStateUpdate", (that, args) => {
            if (!args[0] || typeof args[0] !== "object") return;
            if (!this.resyncing) this.lastVoiceArgs = { ...args[0] };
            if (!this.isActive) return;

            const forced = { ...args[0] };
            if (this.frozen.mute || this.frozen.deaf) forced.selfMute = true;
            if (this.frozen.deaf) forced.selfDeaf = true;
            args[0] = forced;
            this.log("voiceStateUpdate forced:", forced);
        });

        this.log("Gateway socket patched");
    }

    // Send the real state again so others see you as you really are.
    resyncRealState() {
        const socket = this.getGatewaySocket();
        const channelId = this.stores.selectedChannel?.getVoiceChannelId?.();
        if (!socket || !channelId || typeof socket.voiceStateUpdate !== "function") return;

        const real = this.getRealState();
        const channel = this.stores.channel?.getChannel?.(channelId);
        const base = this.lastVoiceArgs && this.lastVoiceArgs.channelId === channelId
            ? this.lastVoiceArgs
            : {
                guildId: channel?.guild_id ?? channel?.getGuildId?.() ?? null,
                channelId,
                selfVideo: !!this.stores.media?.isVideoEnabled?.()
            };

        this.resyncing = true;
        try {
            socket.voiceStateUpdate({ ...base, channelId, selfMute: real.mute, selfDeaf: real.deaf });
            this.log("Resynced real state:", real);
        } catch (e) {
            console.error("[FakeDeafen] Resync failed:", e);
        } finally {
            this.resyncing = false;
        }
    }

    // ---------------------------------------------------------------------
    // Fallback: raw WebSocket rewrite (JSON and ETF), only forcing to true the
    // fields that are frozen.
    // ---------------------------------------------------------------------
    patchWebSocket() {
        if (this.originalWebSocketSend) {
            this.log("WebSocket already patched, skipping");
            return;
        }

        this.originalWebSocketSend = WebSocket.prototype.send;
        const self = this;

        WebSocket.prototype.send = function(data) {
            if (!self.isActive || self.resyncing) {
                return self.originalWebSocketSend.call(this, data);
            }

            const forceMute = self.frozen.mute || self.frozen.deaf;
            const forceDeaf = self.frozen.deaf;

            if (typeof data === "string") {
                if (data.indexOf('"op":4') !== -1) {
                    try {
                        const parsed = JSON.parse(data);
                        if (parsed.op === 4 && parsed.d) {
                            let modified = false;
                            if (forceMute && parsed.d.self_mute === false) { parsed.d.self_mute = true; modified = true; }
                            if (forceDeaf && parsed.d.self_deaf === false) { parsed.d.self_deaf = true; modified = true; }
                            if (modified) {
                                data = JSON.stringify(parsed);
                                self.log("Modified JSON packet");
                            }
                        }
                    } catch (e) {
                        self.log("JSON parse error:", e);
                    }
                }
            } else if (data instanceof ArrayBuffer || ArrayBuffer.isView(data)) {
                const view = data instanceof ArrayBuffer
                    ? new Uint8Array(data)
                    : new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
                const patched = self.patchEtf(view, forceMute, forceDeaf);
                if (patched) data = patched;
            }

            return self.originalWebSocketSend.call(this, data);
        };

        this.log("WebSocket patched");
    }

    // Replaces `<key> false` by `<key> true` in an ETF payload.
    // false/true are atoms: 0x73 (SMALL_ATOM_EXT) or 0x77 (SMALL_ATOM_UTF8_EXT).
    patchEtf(view, forceMute, forceDeaf) {
        const keys = [];
        if (forceMute) keys.push([115, 101, 108, 102, 95, 109, 117, 116, 101]); // self_mute
        if (forceDeaf) keys.push([115, 101, 108, 102, 95, 100, 101, 97, 102]);  // self_deaf
        if (!keys.length) return null;

        const bytes = Array.from(view);
        let modified = false;

        for (const key of keys) {
            for (let i = 0; i + key.length + 7 <= bytes.length; i++) {
                let match = true;
                for (let k = 0; k < key.length; k++) {
                    if (bytes[i + k] !== key[k]) { match = false; break; }
                }
                if (!match) continue;

                const v = i + key.length;
                if ((bytes[v] === 0x73 || bytes[v] === 0x77) &&
                    bytes[v + 1] === 5 &&
                    bytes[v + 2] === 102 && bytes[v + 3] === 97 && bytes[v + 4] === 108 &&
                    bytes[v + 5] === 115 && bytes[v + 6] === 101) {
                    bytes.splice(v + 1, 6, 4, 116, 114, 117, 101);
                    modified = true;
                }
            }
        }

        if (!modified) return null;
        this.log("Modified ETF packet");
        return new Uint8Array(bytes).buffer;
    }

    unpatchWebSocket() {
        if (this.originalWebSocketSend) {
            WebSocket.prototype.send = this.originalWebSocketSend;
            this.originalWebSocketSend = null;
            this.log("WebSocket unpatched");
        }
    }

    // ---------------------------------------------------------------------
    // Toggle
    // ---------------------------------------------------------------------
    isEditable(target) {
        if (!target) return false;
        const tag = target.tagName;
        return tag === "INPUT" || tag === "TEXTAREA" || target.isContentEditable;
    }

    handleKeyDown(e) {
        if (!e.key || e.key.toLowerCase() !== this.mySettings.triggerKey.toLowerCase()) return;
        if (this.mySettings.shiftKeyRequired && !e.shiftKey) return;
        if (this.mySettings.ctrlKeyRequired && !e.ctrlKey) return;
        // Without a modifier, don't steal the key while typing a message.
        if (!this.mySettings.shiftKeyRequired && !this.mySettings.ctrlKeyRequired && this.isEditable(e.target)) return;
        if (e.repeat) return;

        e.preventDefault();
        e.stopPropagation();

        if (this.isActive) this.disable();
        else this.enable();
    }

    enable() {
        const real = this.getRealState();
        if (!real.mute && !real.deaf) {
            BdApi.UI.showToast("FakeDeafen: mute or deafen yourself first, then press the shortcut", { type: "warning" });
            return;
        }

        this.frozen = { mute: real.mute, deaf: real.deaf };
        this.isActive = true;
        this.refreshUI();
        this.updateIndicator();

        const label = this.frozen.deaf ? "Fake DEAFEN" : "Fake MUTE";
        BdApi.UI.showToast(`${label} ENABLED - you can now unmute/undeafen`, { type: "success" });
        this.log("Enabled with frozen state:", this.frozen);
    }

    disable() {
        this.isActive = false;
        this.refreshUI();
        this.updateIndicator();
        this.resyncRealState();

        BdApi.UI.showToast("FakeDeafen DISABLED", { type: "info" });
        this.log("Disabled");
    }

    // ---------------------------------------------------------------------
    // Indicator
    // ---------------------------------------------------------------------
    createIndicator() {
        this.indicator = document.createElement("div");
        this.indicator.style.cssText = `
            position: fixed;
            top: 80px;
            right: 10px;
            padding: 12px 24px;
            background: rgba(237, 66, 69, 0.95);
            color: white;
            border-radius: 5px;
            display: none;
            z-index: 9999;
            box-shadow: 0 2px 10px rgba(237, 66, 69, 0.5);
            cursor: pointer;
            user-select: none;
            white-space: nowrap;
            font-weight: bold;
            font-size: 16px;
            pointer-events: auto;
        `;

        this.indicator.addEventListener("click", () => {
            if (this.isActive) this.disable();
        });

        document.body.appendChild(this.indicator);
        this.updateIndicator();
        this.log("Indicator created");
    }

    updateIndicator() {
        if (!this.indicator) return;
        this.indicator.textContent = this.frozen.deaf
            ? "🥷 Fake Deafen ON - others see you 🎧 deafened"
            : "🥷 Fake Mute ON - others see you 🎙️ muted";
        this.indicator.title = "Your row in the voice channel shows what others see; the mic/headset buttons show your real state. Click to disable.";
        this.indicator.style.display = this.isActive ? "flex" : "none";
    }

    removeIndicator() {
        if (this.indicator && this.indicator.parentNode) {
            this.indicator.parentNode.removeChild(this.indicator);
        }
        this.indicator = null;
        this.log("Indicator removed");
    }

    // ---------------------------------------------------------------------
    // Settings
    // ---------------------------------------------------------------------
    getSettingsPanel() {
        const panel = document.createElement("div");
        panel.style.cssText = "padding: 16px; background: #2f3136; border-radius: 8px;";

        const title = document.createElement("h2");
        title.textContent = "FakeDeafen Settings";
        title.style.cssText = "color: #fff; margin-bottom: 16px; font-size: 20px;";
        panel.appendChild(title);

        const settingsDiv = document.createElement("div");
        settingsDiv.style.cssText = "display: flex; flex-direction: column; gap: 16px;";

        const settings = [
            { key: "shiftKeyRequired", label: "Require Shift key", type: "checkbox" },
            { key: "ctrlKeyRequired", label: "Require Ctrl key", type: "checkbox" },
            { key: "triggerKey", label: "Trigger key", type: "text" },
            { key: "debugMode", label: "Debug mode", type: "checkbox" }
        ];

        settings.forEach(({ key, label, type }) => {
            const div = document.createElement("div");
            div.style.cssText = "display: flex; flex-direction: column;";

            if (type === "checkbox") {
                const checkbox = document.createElement("input");
                checkbox.type = "checkbox";
                checkbox.checked = this.mySettings[key];
                checkbox.style.cssText = "margin-right: 8px; cursor: pointer;";
                checkbox.onchange = (e) => {
                    this.mySettings[key] = e.target.checked;
                    BdApi.Data.save(this.pluginName, "settings", this.mySettings);
                    this.log(`Setting ${key} = ${e.target.checked}`);
                };

                const labelEl = document.createElement("label");
                labelEl.style.cssText = "display: flex; align-items: center; cursor: pointer; color: #dcddde;";
                labelEl.appendChild(checkbox);
                labelEl.appendChild(document.createTextNode(" " + label));
                div.appendChild(labelEl);
            } else {
                const labelEl = document.createElement("label");
                labelEl.textContent = label + ":";
                labelEl.style.cssText = "display: block; margin-bottom: 5px; color: #dcddde;";
                div.appendChild(labelEl);

                const input = document.createElement("input");
                input.type = "text";
                input.value = this.mySettings[key];
                input.style.cssText = `
                    width: 100%;
                    padding: 8px;
                    background: #202225;
                    border: 1px solid #202225;
                    border-radius: 3px;
                    color: #fff;
                    font-size: 14px;
                `;
                input.onchange = (e) => {
                    this.mySettings[key] = e.target.value;
                    BdApi.Data.save(this.pluginName, "settings", this.mySettings);
                    this.log(`Setting ${key} = ${e.target.value}`);
                };
                div.appendChild(input);
            }

            settingsDiv.appendChild(div);
        });

        panel.appendChild(settingsDiv);

        const key = this.mySettings.triggerKey.toUpperCase();
        const info = document.createElement("div");
        info.style.cssText = "margin-top: 20px; padding: 12px; background: #2f3136; border-radius: 5px; color: #b9bbbe; font-size: 13px;";
        info.innerHTML = `
            <strong>How to use:</strong><br>
            1. Join a voice channel<br>
            2. Mute yourself (mic only) <em>or</em> deafen yourself (headset)<br>
            3. Press <strong>${key}</strong>: that state is frozen for others<br>
            4. Unmute / undeafen in Discord: you hear and talk, others still see you muted or deafened. Your row in the voice channel shows it too; the mic/headset buttons show your real state<br>
            5. Press <strong>${key}</strong> again (or click the red banner) to disable: your real state is sent again<br>
        `;
        panel.appendChild(info);

        return panel;
    }
};
