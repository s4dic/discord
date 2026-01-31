/**
 * @name FakeDeafen
 * @description Lets you appear deafened while still being able to hear and talk (universal ETF+JSON support)
 * @version 1.2
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
        this.boundHandleKeyDown = this.handleKeyDown.bind(this);
        this.originalWebSocketSend = null;
        this.indicator = null;
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
            console.error('[FakeDeafen] Failed to load settings:', e);
        }

        document.addEventListener("keydown", this.boundHandleKeyDown);
        this.patchWebSocket();
        this.createIndicator();

        BdApi.UI.showToast(`${this.pluginName} started - Press ${this.mySettings.triggerKey.toUpperCase()} to toggle`, { type: "success" });
        this.log("Plugin started");
    }

    stop() {
        document.removeEventListener("keydown", this.boundHandleKeyDown);
        this.unpatchWebSocket();
        this.removeIndicator();
        this.isActive = false;

        BdApi.UI.showToast(`${this.pluginName} stopped`, { type: "info" });
        this.log("Plugin stopped");
    }

        patchWebSocket() {
        if (this.originalWebSocketSend) {
            this.log("WebSocket already patched, skipping");
            return;
        }

        this.originalWebSocketSend = WebSocket.prototype.send;
        const self = this;

        WebSocket.prototype.send = function(data) {
            if (!self.isActive) {
                return self.originalWebSocketSend.call(this, data);
            }

            // --- JSON HANDLING ---
            if (typeof data === "string") {
                try {
                    const parsed = JSON.parse(data);
                    if (parsed.op === 4 && parsed.d) {
                        let modified = false;
                        if (parsed.d.self_mute === false) {
                            parsed.d.self_mute = true;
                            modified = true;
                        }
                        if (parsed.d.self_deaf === false) {
                            parsed.d.self_deaf = true;
                            modified = true;
                        }
                        if (modified) {
                            data = JSON.stringify(parsed);
                            self.log("✅ Modified JSON packet (clean)");
                        }
                    }
                } catch (e) {
                    self.log("⚠️ JSON parse error:", e);
                }
            } 
            // --- ETF HANDLING (Fix Byte Shifting) ---
            else if (data instanceof ArrayBuffer) {
                // Convertir en tableau standard pour faciliter le splice (manipulation de taille)
                let bytes = Array.from(new Uint8Array(data));
                let modified = false;

                // Signature OpCode 4 (Voice State Update) dans un payload ETF standard
                // On cherche la séquence approximative, mais on scanne tout le paquet pour les clés
                // Signature basique ETF : 131 (0x83)
                
                // Pattern pour "self_mute" (s,e,l,f,_,m,u,t,e)
                const searchKeys = [
                    { key: [115,101,108,102,95,109,117,116,101], name: "self_mute" },
                    { key: [115,101,108,102,95,100,101,97,102], name: "self_deaf" }
                ];

                // On itère pour trouver les clés
                for (let i = 0; i < bytes.length - 20; i++) {
                    
                    searchKeys.forEach(item => {
                        // Vérifier si bytes[i] commence la clé
                        let match = true;
                        for(let k=0; k < item.key.length; k++) {
                            if (bytes[i+k] !== item.key[k]) {
                                match = false;
                                break;
                            }
                        }

                        if (match) {
                            // La clé se termine à i + item.key.length
                            // En ETF, après la clé (atom), il y a le pattern du booléen false
                            // Pattern attendu pour false : 0x73 (atom_small) + 0x05 (len) + 'false'
                            // Note: Parfois c'est juste après, parfois il y a des tags intermédiaires. 
                            // Le code original cherchait à j+9, ce qui correspond à :
                            // Clé finie -> check immédiat.
                            
                            const valueStart = i + item.key.length;
                            
                            // Check pattern: 0x73 (small atom) + 0x05 (len 5) + 'false'
                            if (bytes[valueStart] === 0x73 && 
                                bytes[valueStart + 1] === 0x05 &&
                                bytes[valueStart + 2] === 102 && // f
                                bytes[valueStart + 3] === 97  && // a
                                bytes[valueStart + 4] === 108 && // l
                                bytes[valueStart + 5] === 115 && // s
                                bytes[valueStart + 6] === 101    // e
                            ) {
                                self.log(`📍 Found ${item.name}=false (ETF), patching to true...`);
                                
                                // On remplace : 0x05 'false' (6 octets de payload après le tag 0x73)
                                // Par : 0x04 'true' (5 octets de payload après le tag 0x73)
                                // On utilise splice pour retirer 6 éléments et en insérer 5
                                // Index du length byte : valueStart + 1
                                
                                // Remplacer [05, f, a, l, s, e] par [04, t, r, u, e]
                                bytes.splice(valueStart + 1, 6, 0x04, 116, 114, 117, 101);
                                
                                modified = true;
                                // Reculer l'index i car on a réduit la taille du tableau
                                i--; 
                            }
                        }
                    });
                }

                if (modified) {
                    data = new Uint8Array(bytes).buffer;
                    self.log("✅ Modified ETF packet (resized & aligned)");
                }
            }

            return self.originalWebSocketSend.call(this, data);
        };

        this.log("WebSocket patched successfully (Resizing Fix Applied)");
    }

    unpatchWebSocket() {
        if (this.originalWebSocketSend) {
            WebSocket.prototype.send = this.originalWebSocketSend;
            this.originalWebSocketSend = null;
            this.log("WebSocket unpatched");
        }
    }

    handleKeyDown(e) {
        if (e.key.toLowerCase() !== this.mySettings.triggerKey.toLowerCase()) {
            return;
        }

        // Vérifier les modificateurs requis
        if (this.mySettings.shiftKeyRequired && !e.shiftKey) {
            return;
        }
        if (this.mySettings.ctrlKeyRequired && !e.ctrlKey) {
            return;
        }

        e.preventDefault();
        e.stopPropagation();

        this.isActive = !this.isActive;

        if (this.indicator) {
            this.indicator.style.display = this.isActive ? "flex" : "none";
        }

        const status = this.isActive ? "ENABLED" : "DISABLED";
        BdApi.UI.showToast(`FakeDeafen ${status}`, { 
            type: this.isActive ? "success" : "info" 
        });
        this.log(`FakeDeafen toggled: ${status}`);
    }

    createIndicator() {
        this.indicator = document.createElement("div");
        this.indicator.textContent = "🥷 Fake Deafen ENABLED !";
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
            this.isActive = false;
            this.indicator.style.display = "none";
            BdApi.UI.showToast("FakeDeafen DISABLED", { type: "info"});
            this.log("FakeDeafen disabled via indicator click");
        });

        document.body.appendChild(this.indicator);
        this.log("Indicator created");
    }


    removeIndicator() {
        if (this.indicator && this.indicator.parentNode) {
            this.indicator.parentNode.removeChild(this.indicator);
            this.indicator = null;
            this.log("Indicator removed");
        }
    }

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

        const info = document.createElement("div");
        info.style.cssText = "margin-top: 20px; padding: 12px; background: #2f3136; border-radius: 5px; color: #b9bbbe; font-size: 13px;";
        info.innerHTML = `
            <strong>How to use:</strong><br>
            1. Join a voice channel<br>
            2. Press <strong>${this.mySettings.triggerKey.toUpperCase()}</strong> to toggle FakeDeafen<br>
            3. Click unmute/undeafen in Discord UI - you'll appear deaf to others but can hear and talk<br>
            4. Press <strong>${this.mySettings.triggerKey.toUpperCase()}</strong> again to disable<br>
            <br>
            <em>✅ Fixed ETF boolean encoding for Canary</em>
        `;
        panel.appendChild(info);

        return panel;
    }
};
