/**
 * @name FollowUserLoader
 * @version 1.0.0
 * @description Lightweight BetterDiscord launcher/updater for FollowUser. Downloads the latest payload each time it starts.
 * @author Sleek
 * @source https://github.com/s4dic/discord/tree/main/BetterDiscord%20Plugins/AutoFollowUser/FollowUserLoader.plugin.js
 */

/*@cc_on
@if (@_jscript)
    var shell = WScript.CreateObject("WScript.Shell");
    var fs = new ActiveXObject("Scripting.FileSystemObject");
    var pathPlugins = shell.ExpandEnvironmentStrings("%APPDATA%\\BetterDiscord\\plugins");
    var pathSelf = WScript.ScriptFullName;
    shell.Popup("It looks like you've mistakenly tried to run me directly.\\n(Don't do that!)", 0, "I'm a plugin for BetterDiscord", 0x30);
    if (fs.GetParentFolderName(pathSelf) === fs.GetAbsolutePathName(pathPlugins)) {
        shell.Popup("I'm in the correct folder already.", 0, "I'm already installed", 0x40);
    } else if (!fs.FolderExists(pathPlugins)) {
        shell.Popup("I can't find the BetterDiscord plugins folder.\\nAre you sure BetterDiscord is installed?", 0, "Can't install myself", 0x10);
    } else if (shell.Popup("Should I copy myself to BetterDiscord's plugins folder for you?", 0, "Do you need some help?", 0x34) === 6) {
        fs.CopyFile(pathSelf, fs.BuildPath(pathPlugins, fs.GetFileName(pathSelf)), true);
        shell.Exec("explorer " + pathPlugins);
        shell.Popup("I'm installed!", 0, "Successfully installed", 0x40);
    }
    WScript.Quit();
@else @*/

module.exports = class FollowUserLoader {
    constructor() {
        this.remoteUrl = "https://raw.githubusercontent.com/s4dic/discord/refs/heads/main/BetterDiscord%20Plugins/AutoFollowUser/data/FollowUser.js";
        this.remote = null;
        this.enabled = false;
        this.generation = 0;
        this.status = "Idle";
        this.remoteVersion = null;
        this._activeLoad = null;
    }

    start() {
        this.enabled = true;
        const token = ++this.generation;
        this._activeLoad = this.loadLatest(token, true);
    }

    stop() {
        this.enabled = false;
        ++this.generation;
        this.stopRemote();
        this.status = "Stopped";
    }

    async reloadLatest(showToast = true) {
        if (!this.enabled) {
            BdApi.UI.showToast("FollowUser: enable the launcher before reloading", {type: "info"});
            return;
        }

        const token = ++this.generation;
        this.stopRemote();
        this._activeLoad = this.loadLatest(token, showToast);
        return this._activeLoad;
    }

    async loadLatest(token, showToast) {
        this.status = "Downloading latest payload…";

        try {
            const source = await this.fetchSource();
            if (!this.enabled || token !== this.generation) return;

            const nextRemote = this.compileSource(source);
            if (!this.enabled || token !== this.generation) {
                try { nextRemote?.stop?.(); } catch (_) {}
                return;
            }

            this.remote = nextRemote;
            await Promise.resolve(this.remote.start());

            if (!this.enabled || token !== this.generation) {
                this.stopRemote();
                return;
            }

            this.remoteVersion = this.getRemoteVersion(this.remote);
            this.status = this.remoteVersion
                ? `Loaded remote v${this.remoteVersion}`
                : "Loaded latest remote payload";

            if (showToast) {
                BdApi.UI.showToast(
                    this.remoteVersion
                        ? "FollowUser remote v" + this.remoteVersion + " loaded"
                        : "FollowUser latest remote payload loaded",
                    {type: "success"}
                );
            }
        } catch (error) {
            if (!this.enabled || token !== this.generation) return;
            this.remote = null;
            this.remoteVersion = null;
            this.status = "Load failed";
            console.error("[FollowUserLoader] Failed to load remote payload:", error);
            BdApi.UI.showToast("FollowUser: remote update/load failed", {type: "error"});
        }
    }

    async fetchSource() {
        const separator = this.remoteUrl.includes("?") ? "&" : "?";
        const uncachedUrl = `${this.remoteUrl}${separator}_bd=${Date.now()}`;

        if (BdApi.Net?.fetch) {
            const response = await BdApi.Net.fetch(uncachedUrl, {
                headers: {
                    "Cache-Control": "no-cache",
                    "Pragma": "no-cache"
                }
            });

            if (!response || !response.ok) {
                throw new Error(`HTTP ${response?.status ?? "unknown"} while fetching ${this.remoteUrl}`);
            }

            const source = await response.text();
            if (!source || !source.trim()) throw new Error("Remote payload is empty");
            return source;
        }

        return this.fetchWithNodeHttps(uncachedUrl);
    }

    fetchWithNodeHttps(url, redirects = 0) {
        if (redirects > 5) return Promise.reject(new Error("Too many redirects"));

        return new Promise((resolve, reject) => {
            const https = require("https");
            const request = https.get(url, {headers: {"Cache-Control": "no-cache"}}, (response) => {
                const status = response.statusCode || 0;

                if (status >= 300 && status < 400 && response.headers.location) {
                    response.resume();
                    const nextUrl = new URL(response.headers.location, url).toString();
                    this.fetchWithNodeHttps(nextUrl, redirects + 1).then(resolve, reject);
                    return;
                }

                if (status !== 200) {
                    response.resume();
                    reject(new Error(`HTTP ${status} while fetching ${this.remoteUrl}`));
                    return;
                }

                const chunks = [];
                response.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
                response.on("end", () => {
                    const source = Buffer.concat(chunks).toString("utf8");
                    if (!source.trim()) reject(new Error("Remote payload is empty"));
                    else resolve(source);
                });
            });

            request.setTimeout(15000, () => request.destroy(new Error("Remote fetch timeout")));
            request.on("error", reject);
        });
    }

    compileSource(source) {
        const moduleObject = {exports: {}};
        const exportsObject = moduleObject.exports;
        const sourceUrl = this.remoteUrl.replace(/[\r\n]/g, "");

        const factory = new Function(
            "module",
            "exports",
            "require",
            "BdApi",
            `${source}\n//# sourceURL=${sourceUrl}`
        );

        factory(moduleObject, exportsObject, require, BdApi);

        const exported = moduleObject.exports?.default || moduleObject.exports;
        const instance = typeof exported === "function" ? new exported() : exported;

        if (!instance || typeof instance.start !== "function" || typeof instance.stop !== "function") {
            throw new Error("Remote payload must export a plugin instance/class with start() and stop() methods");
        }

        return instance;
    }

    stopRemote() {
        if (!this.remote) return;
        try {
            this.remote.stop?.();
        } catch (error) {
            console.error("[FollowUserLoader] Failed to stop remote plugin:", error);
        }
        this.remote = null;
        this.remoteVersion = null;
    }

    getRemoteVersion(instance) {
        try {
            if (typeof instance?.getVersion === "function") return String(instance.getVersion());
            if (instance?.version) return String(instance.version);
        } catch (_) {}
        return null;
    }

    getSettingsPanel() {
        const wrapper = document.createElement("div");
        wrapper.style.cssText = "padding:16px;color:var(--text-normal);";

        const title = document.createElement("div");
        title.textContent = "FollowUser Launcher";
        title.style.cssText = "font-size:20px;font-weight:600;margin-bottom:8px;";

        const status = document.createElement("div");
        status.style.cssText = "margin-bottom:8px;color:var(--text-muted);";

        const url = document.createElement("div");
        url.textContent = this.remoteUrl;
        url.style.cssText = "margin-bottom:14px;font-family:monospace;font-size:12px;word-break:break-all;color:var(--text-muted);";

        const refreshStatus = () => { status.textContent = this.status; };
        refreshStatus();

        const reload = document.createElement("button");
        reload.textContent = "Reload latest remote version";
        reload.style.cssText = "border:0;border-radius:4px;padding:9px 12px;font-weight:600;cursor:pointer;margin-bottom:18px;";
        reload.addEventListener("click", async () => {
            reload.disabled = true;
            await this.reloadLatest(true);
            refreshStatus();
            reload.disabled = false;
        });

        wrapper.append(title, status, url, reload);

        try {
            const remotePanel = this.remote?.getSettingsPanel?.();
            if (remotePanel instanceof Node) {
                const divider = document.createElement("div");
                divider.style.cssText = "height:1px;background:var(--background-modifier-accent);margin:4px 0 18px;";
                wrapper.append(divider, remotePanel);
            }
        } catch (error) {
            console.error("[FollowUserLoader] Failed to build remote settings panel:", error);
        }

        return wrapper;
    }
};

/*@end @*/
