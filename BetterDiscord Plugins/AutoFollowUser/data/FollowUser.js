/**
 * @name FollowUser
 * @author Sleek
 * @version 2.0.1
 * @description Remote payload for FollowUserLoader. Follow users between voice channels or pin/follow a specific voice channel.
 */

module.exports = class FollowUser {
    getName() { return "FollowUser"; }
    getVersion() { return "2.1.0"; }

    constructor() {
        this.currentUser = null;
        this.currentChannel = null;
        this.followInterval = null;
        this.modalObserver = null;

        this.voiceStateStore = null;
        this.channelStore = null;
        this.permissionStore = null;
        this.permissionBits = null;
        this.channelActions = null;
        this.userStore = null;
        this.selectedChannelStore = null;

        this._unpatchUserContext = null;
        this._unpatchChannelContext = null;
        this._started = false;
        this._waiting = null;
        this._lastTargetChannelId = null;
        this._lastJoinAttempt = {channelId: null, at: 0};
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
        this.clearWaitingState();

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

        if (Array.isArray(children)) children.push(group);
        else if (children == null) menu.props.children = [group];
        else menu.props.children = [children, group];
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
        try { return Boolean(channel.isGuildVocal?.() || channel.isVocal?.()); }
        catch (_) { return false; }
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
        this.clearWaitingState();
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
        this.clearWaitingState();
        if (!this.startFollowInterval()) {
            this.currentChannel = null;
            return;
        }
        BdApi.UI.showToast("✅ Voice-channel follow started", {type: "success"});
    }

    stopFollowing(message = null) {
        this.currentUser = null;
        this.currentChannel = null;
        this.clearWaitingState();
        this.stopFollowInterval();
        if (message) BdApi.UI.showToast(message, {type: "info"});
    }

    clearWaitingState() {
        this._waiting = null;
        this._lastTargetChannelId = null;
    }

    // ------------------------------------------------------------------
    // Discord modules / permissions
    // ------------------------------------------------------------------

    resolveVoiceModules() {
        const W = BdApi.Webpack;

        this.voiceStateStore = this.voiceStateStore || W.getStore?.("VoiceStateStore") || W.getByKeys?.("getVoiceStateForUser");
        this.channelStore = this.channelStore || W.getStore?.("ChannelStore") || W.getByKeys?.("getChannel", "getDMFromUserId");
        this.permissionStore = this.permissionStore || W.getStore?.("PermissionStore") || W.getByKeys?.("can", "canManageUser");
        this.userStore = this.userStore || W.getStore?.("UserStore") || W.getByKeys?.("getCurrentUser", "getUser");
        this.selectedChannelStore = this.selectedChannelStore || W.getStore?.("SelectedChannelStore") || W.getByKeys?.("getVoiceChannelId");
        this.permissionBits = this.permissionBits || this.findPermissionBits();
        this.channelActions = this.channelActions || this.findVoiceSelectorActions();

        return Boolean(this.channelActions);
    }

    findPermissionBits() {
        const W = BdApi.Webpack;
        let bits = null;

        try {
            bits = W.getByKeys?.("VIEW_CHANNEL", "CONNECT", "MOVE_MEMBERS") || null;
        } catch (_) {}

        // Discord permission bit values are stable. Runtime exports are preferred,
        // these BigInt fallbacks keep the plugin functional if the constants export moves.
        return {
            VIEW_CHANNEL: bits?.VIEW_CHANNEL ?? 1024n,
            CONNECT: bits?.CONNECT ?? 1048576n,
            MOVE_MEMBERS: bits?.MOVE_MEMBERS ?? 16777216n
        };
    }

    canPermission(permission, channel) {
        if (!this.permissionStore?.can || permission == null || !channel) return null;
        try { return Boolean(this.permissionStore.can(permission, channel)); }
        catch (_) { return null; }
    }

    findVoiceSelectorActions() {
        const W = BdApi.Webpack;

        let actions =
            W.getByKeys?.("selectVoiceChannel", "selectChannel") ||
            W.getByKeys?.("selectVoiceChannel") ||
            W.getByKeys?.("selectVoiceChannelById") ||
            W.getByKeys?.("selectChannel");

        if (!actions || !this.hasVoiceSelector(actions)) {
            actions = W.getModule?.((module) => module && this.hasVoiceSelector(module), {searchExports: true});
        }

        return actions || null;
    }

    hasVoiceSelector(module) {
        return Boolean(module && (
            typeof module.selectVoiceChannel === "function" ||
            typeof module.selectVoiceChannelById === "function" ||
            typeof module.selectChannel === "function"
        ));
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

    getChannel(channelId) {
        try { return this.channelStore?.getChannel?.(channelId) || null; }
        catch (_) { return null; }
    }

    getVoiceOccupancy(channelId) {
        try {
            const states = this.voiceStateStore?.getVoiceStatesForChannel?.(channelId);
            if (!states) return null;
            if (states instanceof Map || states instanceof Set) return states.size;
            if (Array.isArray(states)) return states.length;
            if (typeof states === "object") return Object.keys(states).length;
        } catch (_) {}
        return null;
    }

    getChannelJoinStatus(channelId) {
        const channel = this.getChannel(channelId);
        if (!channel) {
            // If Discord does not expose the object we cannot safely pre-check it.
            // Preserve old behavior and let the join attempt/fallback decide.
            return {ok: true, channel: null, name: `channel ${channelId}`, reason: "unknown"};
        }

        const name = channel.name || `channel ${channelId}`;

        const canView = this.canPermission(this.permissionBits?.VIEW_CHANNEL, channel);
        if (canView === false) {
            return {ok: false, channel, name, reason: "permission", permission: "VIEW_CHANNEL"};
        }

        const canConnect = this.canPermission(this.permissionBits?.CONNECT, channel);
        if (canConnect === false) {
            return {ok: false, channel, name, reason: "permission", permission: "CONNECT"};
        }

        const limitRaw = channel.userLimit ?? channel.user_limit ?? 0;
        const limit = Number(limitRaw) || 0;
        if (limit <= 0) return {ok: true, channel, name, reason: "unlimited"};

        // Discord explicitly allows MOVE_MEMBERS to bypass a voice channel's user limit.
        const canBypassLimit = this.canPermission(this.permissionBits?.MOVE_MEMBERS, channel);
        if (canBypassLimit === true) {
            return {ok: true, channel, name, reason: "limit-bypass", limit, bypass: true};
        }

        const count = this.getVoiceOccupancy(channelId);
        if (count != null && count >= limit) {
            return {ok: false, channel, name, reason: "full", count, limit};
        }

        return {ok: true, channel, name, reason: "available", count, limit};
    }

    setWaitingState(status, channelId) {
        const signature = `${status.reason}:${channelId}:${status.permission || ""}:${status.limit ?? ""}`;
        if (this._waiting?.signature === signature) return;

        this._waiting = {
            signature,
            reason: status.reason,
            channelId,
            name: status.name,
            permission: status.permission || null,
            count: status.count ?? null,
            limit: status.limit ?? null
        };

        if (status.reason === "full") {
            BdApi.UI.showToast(`⏳ ${status.name} is full (${status.count}/${status.limit}) — waiting for a slot`, {type: "info"});
        } else if (status.reason === "permission") {
            BdApi.UI.showToast(`⛔ Cannot join ${status.name}: missing ${status.permission} — follow remains active`, {type: "error"});
        }
    }

    clearWaitingAndNotify(status, channelId) {
        const previous = this._waiting;
        if (!previous || previous.channelId !== channelId) {
            this._waiting = null;
            return;
        }

        this._waiting = null;
        if (previous.reason === "full") {
            BdApi.UI.showToast(`✅ Slot available — joining ${status.name}`, {type: "success"});
        } else if (previous.reason === "permission") {
            BdApi.UI.showToast(`✅ ${status.name} is accessible — joining`, {type: "success"});
        }
    }

    selectVoiceChannel(channelId) {
        if (!channelId || !this.channelActions) return false;

        // Avoid hammering Discord while a previous channel switch is still propagating.
        const now = Date.now();
        if (this._lastJoinAttempt.channelId === channelId && now - this._lastJoinAttempt.at < 2000) return false;
        this._lastJoinAttempt = {channelId, at: now};

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

                // Target user is not in voice: keep following silently.
                if (!targetChannelId) {
                    this._lastTargetChannelId = null;
                    this._waiting = null;
                    return;
                }
            } else if (this.currentChannel) {
                targetChannelId = this.currentChannel;
            } else {
                return;
            }

            // User-follow may change target channel at any moment. A wait state belongs
            // only to the old target and must not block the new one.
            if (this._lastTargetChannelId && this._lastTargetChannelId !== targetChannelId) {
                this._waiting = null;
            }
            this._lastTargetChannelId = targetChannelId;

            const currentChannelId = this.getCurrentVoiceChannelId();
            if (currentChannelId === targetChannelId) {
                this._waiting = null;
                return;
            }

            const status = this.getChannelJoinStatus(targetChannelId);
            if (!status.ok) {
                this.setWaitingState(status, targetChannelId);
                return;
            }

            this.clearWaitingAndNotify(status, targetChannelId);
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
    // Full-channel race-condition fallback
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
                        const channelId = this._lastTargetChannelId || this.currentChannel || null;
                        const status = channelId ? this.getChannelJoinStatus(channelId) : null;
                        this.setWaitingState(
                            status?.reason === "full"
                                ? status
                                : {reason: "full", name: status?.name || "Target channel", count: "?", limit: "?"},
                            channelId || "unknown"
                        );
                        // IMPORTANT: do not stop following. This modal is only a race fallback.
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
            let text = this.currentUser
                ? `Following user: ${this.currentUser}`
                : this.currentChannel
                    ? `Following voice channel: ${this.currentChannel}`
                    : "No active follow.";

            if (this._waiting?.reason === "full") {
                text += ` Waiting: ${this._waiting.name} is full (${this._waiting.count}/${this._waiting.limit}).`;
            } else if (this._waiting?.reason === "permission") {
                text += ` Waiting: missing ${this._waiting.permission} on ${this._waiting.name}.`;
            }
            state.textContent = text;
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
