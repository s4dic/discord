/**
 * @name FollowUser
 * @author Sleek
 * @version 2.0.0
 * @description Remote payload for FollowUserLoader. Follow users between voice channels or pin/follow a specific voice channel.
 */

module.exports = class FollowUser {
    getName() { return "FollowUser"; }
    getVersion() { return "2.0.0"; }

    constructor() {
        this.currentUser = null;
        this.currentChannel = null;
        this.followInterval = null;
        this.modalObserver = null;

        this.voiceStateStore = null;
        this.channelActions = null;
        this.userStore = null;
        this.selectedChannelStore = null;

        this._unpatchUserContext = null;
        this._unpatchChannelContext = null;
        this._started = false;
    }

    start() {
        this._started = true;
        this.patchUserContextMenu();
        this.patchChannelContextMenu();
        this.observeModals();
    }

    stop() {
        this._started = false;
        this.stopFollowInterval();
        this.currentUser = null;
        this.currentChannel = null;

        for (const unpatch of [this._unpatchUserContext, this._unpatchChannelContext]) {
            if (typeof unpatch === "function") {
                try { unpatch(); }
                catch (error) { console.error("[FollowUser] Context-menu unpatch failed:", error); }
            }
        }
        this._unpatchUserContext = null;
        this._unpatchChannelContext = null;

        if (this.modalObserver) {
            this.modalObserver.disconnect();
            this.modalObserver = null;
        }
    }

    // ------------------------------------------------------------------
    // Native BetterDiscord context menus
    // ------------------------------------------------------------------

    patchUserContextMenu() {
        if (!BdApi.ContextMenu?.patch || !BdApi.ContextMenu?.buildItem) {
            BdApi.UI.showToast("FollowUser: BetterDiscord ContextMenu API unavailable", {type: "error"});
            return;
        }

        try {
            this._unpatchUserContext = BdApi.ContextMenu.patch("user-context", (menu, props) => {
                const user = props?.user;
                if (!user?.id || !menu?.props) return;

                const active = this.currentUser === user.id && !this.currentChannel;
                const item = BdApi.ContextMenu.buildItem({
                    id: "followuser-user-context",
                    label: active ? "📌 Unfollow this user" : "📌 Follow this user",
                    action: () => this.toggleUserFollow(user.id)
                });

                if (item) this.appendMenuItem(menu, item, "followuser-user-context");
            });
        } catch (error) {
            console.error("[FollowUser] Failed to patch user context menu:", error);
            BdApi.UI.showToast("FollowUser: user context-menu patch failed", {type: "error"});
        }
    }

    patchChannelContextMenu() {
        if (!BdApi.ContextMenu?.patch || !BdApi.ContextMenu?.buildItem) return;

        try {
            this._unpatchChannelContext = BdApi.ContextMenu.patch("channel-context", (menu, props) => {
                const channel = props?.channel;
                if (!channel?.id || !menu?.props || !this.isVoiceChannel(channel)) return;

                const active = this.currentChannel === channel.id && !this.currentUser;
                const item = BdApi.ContextMenu.buildItem({
                    id: "followuser-channel-context",
                    label: active ? "📌 Unfollow this voice channel" : "📌 Follow this voice channel",
                    action: () => this.toggleChannelFollow(channel.id)
                });

                if (item) this.appendMenuItem(menu, item, "followuser-channel-context");
            });
        } catch (error) {
            console.error("[FollowUser] Failed to patch channel context menu:", error);
            BdApi.UI.showToast("FollowUser: channel context-menu patch failed", {type: "error"});
        }
    }

    appendMenuItem(menu, item, id) {
        const React = BdApi.React;
        const Group = BdApi.ContextMenu?.Group;
        const group = Group
            ? React.createElement(Group, {key: `${id}-group`}, item)
            : item;

        const children = menu.props.children;
        if (this.reactTreeContainsId(children, id)) return;

        if (Array.isArray(children)) {
            children.push(group);
        } else if (children == null) {
            menu.props.children = [group];
        } else {
            menu.props.children = [children, group];
        }
    }

    reactTreeContainsId(node, id, depth = 0) {
        if (node == null || depth > 12) return false;
        if (Array.isArray(node)) return node.some((child) => this.reactTreeContainsId(child, id, depth + 1));
        if (typeof node !== "object") return false;
        if (node?.props?.id === id || node?.key === id) return true;
        return this.reactTreeContainsId(node?.props?.children, id, depth + 1);
    }

    isVoiceChannel(channel) {
        if (!channel) return false;
        if (channel.type === 2 || channel.type === 13) return true; // GUILD_VOICE / GUILD_STAGE_VOICE
        try {
            return Boolean(channel.isGuildVocal?.() || channel.isVocal?.());
        } catch (_) {
            return false;
        }
    }

    // ------------------------------------------------------------------
    // Follow state
    // ------------------------------------------------------------------

    toggleUserFollow(userId) {
        if (this.currentUser === userId && !this.currentChannel) {
            this.stopFollowing("❌ User follow stopped");
            return;
        }

        this.currentChannel = null;
        this.currentUser = userId;
        if (!this.startFollowInterval()) {
            this.currentUser = null;
            return;
        }
        BdApi.UI.showToast("✅ User follow started", {type: "success"});
    }

    toggleChannelFollow(channelId) {
        if (this.currentChannel === channelId && !this.currentUser) {
            this.stopFollowing("❌ Voice-channel follow stopped");
            return;
        }

        this.currentUser = null;
        this.currentChannel = channelId;
        if (!this.startFollowInterval()) {
            this.currentChannel = null;
            return;
        }
        BdApi.UI.showToast("✅ Voice-channel follow started", {type: "success"});
    }

    stopFollowing(message = null) {
        this.currentUser = null;
        this.currentChannel = null;
        this.stopFollowInterval();
        if (message) BdApi.UI.showToast(message, {type: "info"});
    }

    // ------------------------------------------------------------------
    // Discord voice modules
    // ------------------------------------------------------------------

    resolveVoiceModules() {
        const W = BdApi.Webpack;

        this.voiceStateStore =
            this.voiceStateStore ||
            W.getStore?.("VoiceStateStore") ||
            W.getByKeys?.("getVoiceStateForUser");

        this.userStore =
            this.userStore ||
            W.getStore?.("UserStore") ||
            W.getByKeys?.("getCurrentUser", "getUser");

        this.selectedChannelStore =
            this.selectedChannelStore ||
            W.getStore?.("SelectedChannelStore") ||
            W.getByKeys?.("getVoiceChannelId");

        this.channelActions = this.channelActions || this.findVoiceSelectorActions();

        return Boolean(this.channelActions);
    }

    findVoiceSelectorActions() {
        const W = BdApi.Webpack;

        let actions =
            W.getByKeys?.("selectVoiceChannel", "selectChannel") ||
            W.getByKeys?.("selectVoiceChannel") ||
            W.getByKeys?.("selectVoiceChannelById") ||
            W.getByKeys?.("selectChannel");

        if (!actions || !this.hasVoiceSelector(actions)) {
            actions = W.getModule?.(
                (module) => module && this.hasVoiceSelector(module),
                {searchExports: true}
            );
        }

        return actions || null;
    }

    hasVoiceSelector(module) {
        return Boolean(
            module && (
                typeof module.selectVoiceChannel === "function" ||
                typeof module.selectVoiceChannelById === "function" ||
                typeof module.selectChannel === "function"
            )
        );
    }

    getCurrentVoiceChannelId() {
        try {
            const me = this.userStore?.getCurrentUser?.();
            if (me?.id && this.voiceStateStore?.getVoiceStateForUser) {
                const state = this.voiceStateStore.getVoiceStateForUser(me.id);
                if (state?.channelId) return state.channelId;
            }
        } catch (_) {}

        try {
            const selected = this.selectedChannelStore?.getVoiceChannelId?.();
            if (selected) return selected;
        } catch (_) {}

        return null;
    }

    selectVoiceChannel(channelId) {
        if (!channelId || !this.channelActions) return false;

        try {
            if (typeof this.channelActions.selectVoiceChannel === "function") {
                this.channelActions.selectVoiceChannel(channelId);
                return true;
            }
            if (typeof this.channelActions.selectVoiceChannelById === "function") {
                this.channelActions.selectVoiceChannelById(channelId);
                return true;
            }
            if (typeof this.channelActions.selectChannel === "function") {
                this.channelActions.selectChannel(channelId);
                return true;
            }
        } catch (error) {
            console.error("[FollowUser] Failed to select voice channel:", error);
        }
        return false;
    }

    startFollowInterval() {
        if (!this.resolveVoiceModules()) {
            console.error("[FollowUser] Failed to resolve Discord voice selector actions.");
            BdApi.UI.showToast("❌ FollowUser error: Discord voice API changed", {type: "error"});
            return false;
        }

        if (this.currentUser && !this.voiceStateStore?.getVoiceStateForUser) {
            console.error("[FollowUser] VoiceStateStore is unavailable.");
            BdApi.UI.showToast("❌ FollowUser error: VoiceStateStore unavailable", {type: "error"});
            return false;
        }

        this.stopFollowInterval();

        const tick = () => {
            if (!this._started) return;

            let targetChannelId = null;

            if (this.currentUser) {
                try {
                    const voiceState = this.voiceStateStore?.getVoiceStateForUser?.(this.currentUser);
                    targetChannelId = voiceState?.channelId || null;
                } catch (error) {
                    console.error("[FollowUser] Failed to read target user's voice state:", error);
                    return;
                }

                // User is not currently in voice: keep watching, but do not move us.
                if (!targetChannelId) return;
            } else if (this.currentChannel) {
                targetChannelId = this.currentChannel;
            } else {
                return;
            }

            const currentChannelId = this.getCurrentVoiceChannelId();
            if (currentChannelId === targetChannelId) return;

            this.selectVoiceChannel(targetChannelId);
        };

        tick();
        this.followInterval = setInterval(tick, 1000);
        return true;
    }

    stopFollowInterval() {
        if (this.followInterval) {
            clearInterval(this.followInterval);
            this.followInterval = null;
        }
    }

    // ------------------------------------------------------------------
    // Full-channel detection
    // ------------------------------------------------------------------

    observeModals() {
        this.modalObserver = new MutationObserver((mutations) => {
            for (const mutation of mutations) {
                for (const node of mutation.addedNodes) {
                    if (node?.nodeType !== 1) continue;

                    const dialog = node.matches?.('div[role="dialog"]')
                        ? node
                        : node.querySelector?.('div[role="dialog"]');
                    if (!dialog) continue;

                    const text = String(dialog.textContent || "").toLowerCase();
                    const full =
                        text.includes("channel is full") ||
                        text.includes("max number of people") ||
                        text.includes("salon est plein") ||
                        text.includes("nombre maximal de personnes");

                    if (full && (this.currentUser || this.currentChannel)) {
                        this.stopFollowing();
                        BdApi.UI.showToast("❌ Channel full - follow stopped", {type: "error"});
                        return;
                    }
                }
            }
        });

        this.modalObserver.observe(document.body, {childList: true, subtree: true});
    }

    getSettingsPanel() {
        const wrapper = document.createElement("div");
        wrapper.style.cssText = "padding:16px;color:var(--text-normal);";

        const title = document.createElement("div");
        title.textContent = "FollowUser";
        title.style.cssText = "font-size:20px;font-weight:600;margin-bottom:8px;";

        const state = document.createElement("div");
        const refresh = () => {
            state.textContent = this.currentUser
                ? `Following user: ${this.currentUser}`
                : this.currentChannel
                    ? `Following voice channel: ${this.currentChannel}`
                    : "No active follow.";
        };
        state.style.cssText = "margin-bottom:14px;color:var(--text-muted);";
        refresh();

        const stop = document.createElement("button");
        stop.textContent = "Stop current follow";
        stop.style.cssText = "border:0;border-radius:4px;padding:9px 12px;font-weight:600;cursor:pointer;";
        stop.addEventListener("click", () => {
            this.stopFollowing("❌ Follow stopped");
            refresh();
        });

        wrapper.append(title, state, stop);
        return wrapper;
    }
};
