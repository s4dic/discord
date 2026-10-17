/**
 * @name MentionLogger
 * @description Records all hidden mentions / Pings
 * @author Sleek
 * @authorId 153253064231354368
 * @version 1.1.3
 * @invite B5kBdSsED2
 * @license Unlicensed
 * @website https://sleek.blackbox.sh/
 * @source https://github.com/s4dic/BetterDiscord/tree/main/mentionlogger
 * @updateUrl https://raw.githubusercontent.com/s4dic/BetterDiscord/main/mentionlogger/mentionlogger.plugin.js
 */

module.exports = class MentionLogger {
    constructor() {
        this.pluginName = "MentionLogger";
        this.defaultSettings = { mentions: [] };
        this.settings = this.loadSettings();

        this.processedIds = new Set();
        
        // Modules
        this.dispatcher = null;
        this.userStore = null;
        this.guildStore = null;
        this.channelStore = null;
        this.router = null;
        this.profileMod = null;
        this.unsubscribe = null;
        this.messageHandler = this.handleEvent.bind(this);
    }

    load() {}

    start() {
        this.stop();
        this.addStyles();
        console.log(`[${this.pluginName}] v1.7.4 Started`);
        this.settings.mentions.forEach(m => this.processedIds.add(m.messageId));
        this.initializePlugin();
    }

    stop() {
        if (this.unsubscribe) {
            this.unsubscribe();
            this.unsubscribe = null;
        }
        BdApi.DOM.removeStyle(this.pluginName);
    }

    initializePlugin() {
        // Chargement des modules internes Discord
        this.dispatcher = BdApi.Webpack.getByKeys("dispatch", "subscribe", "unsubscribe");
        this.userStore = BdApi.Webpack.getStore("UserStore") || BdApi.Webpack.getByKeys("getCurrentUser", "getUser");
        this.guildStore = BdApi.Webpack.getStore("GuildStore") || BdApi.Webpack.getByKeys("getGuild", "getGuilds");
        this.channelStore = BdApi.Webpack.getStore("ChannelStore") || BdApi.Webpack.getByKeys("getChannel", "getDMFromUserId");
        this.router = BdApi.Webpack.getByKeys("transitionTo"); 
        this.profileMod = BdApi.Webpack.getByKeys("openUserProfileModal");

        if (!this.dispatcher || !this.userStore) {
            BdApi.UI.showToast("MentionLogger : modules Discord indisponibles. Rechargez le plugin.", { type: "error" });
            return;
        }
        // Flux subscribe() does not return an unsubscribe function.
        const dispatcher = this.dispatcher;
        dispatcher.subscribe("MESSAGE_CREATE", this.messageHandler);
        this.unsubscribe = () => dispatcher.unsubscribe("MESSAGE_CREATE", this.messageHandler);
    }

    handleEvent(e) {
        if (!e) return;
        const messageData = e.message || (e.type === "MESSAGE_CREATE" ? e : null);

        if (messageData && messageData.content !== undefined) {
            if (this.processedIds.has(messageData.id)) return;
            this.processMessage(messageData);
        }
    }

    processMessage(message) {
        const currentUser = this.userStore?.getCurrentUser();
        if (!currentUser) return;

        // Anti-boucle (Ignore vos propres messages)
        if (!message.author || message.author.id === currentUser.id) return;

        // Vérification des mentions
        if (!message.mentions || !Array.isArray(message.mentions)) return;
        const isMentioningCurrentUser = message.mentions.some(user => (typeof user === "string" ? user : user?.id) === currentUser.id);

        if (isMentioningCurrentUser) {
            this.logMention(message);
        }
    }

    logMention(message) {
        if (this.processedIds.has(message.id)) return;
        this.processedIds.add(message.id);

        const author = message.author || { username: "Unknown", id: "0" };

        const newLog = {
            messageId: message.id,
            authorId: author.id,
            authorUsername: author.username,
            content: message.content || "",
            channelId: message.channel_id,
            guildId: message.guild_id || this.channelStore?.getChannel(message.channel_id)?.guild_id,
            timestamp: new Date(),
            read: false
        };

        this.settings.mentions.push(newLog);
        if (this.settings.mentions.length > 50) this.settings.mentions.shift();
        this.saveSettings();

        BdApi.UI.showToast(`Mention logged from ${author.username}`, { type: "info", icon: true, timeout: 3000 });
    }

    // --- Helpers UI ---
    
    // Keep message text and names as text nodes: Discord content is not HTML.
    parseContent(content) {
        const fragment = document.createDocumentFragment();
        const text = String(content ?? "");
        let offset = 0;
        for (const match of text.matchAll(/<(@!?|#)(\d+)>/g)) {
            fragment.appendChild(document.createTextNode(text.slice(offset, match.index)));
            const isChannel = match[1] === "#";
            const entry = isChannel ? this.channelStore?.getChannel(match[2]) : this.userStore?.getUser(match[2]);
            const mention = document.createElement("span");
            mention.className = "ml-mention";
            mention.textContent = `${isChannel ? "#" : "@"}${(isChannel ? entry?.name : entry?.username) || match[2]}`;
            fragment.appendChild(mention);
            offset = match.index + match[0].length;
        }
        fragment.appendChild(document.createTextNode(text.slice(offset)));
        return fragment;
    }

    getRealAvatar(userId) {
        const user = this.userStore?.getUser(userId);
        if (typeof user?.getAvatarURL === "function") return user.getAvatarURL(null, 80, true);
        return "https://cdn.discordapp.com/embed/avatars/0.png";
    }

    openUserProfile(userId) {
        if (this.profileMod) this.profileMod.openUserProfileModal({ userId: userId });
    }

    openChannel(guildId, channelId, messageId) {
        if (this.router) {
            this.router.transitionTo(`/channels/${guildId || '@me'}/${channelId}/${messageId}`);
            BdApi.UI.closeSettings?.();
        }
    }

    /* Settings & UI Construction */
    loadSettings() {
        const saved = BdApi.Data.load(this.pluginName, "settings");
        return { ...this.defaultSettings, ...saved, mentions: Array.isArray(saved?.mentions) ? saved.mentions : [] };
    }

    saveSettings() {
        BdApi.Data.save(this.pluginName, "settings", this.settings);
    }

    addStyles() {
        BdApi.DOM.addStyle(this.pluginName, `
            .ml-panel {
                width: 100%;
                min-width: 0;
                color: var(--text-default, var(--text-normal, #dbdee1));
                font-size: 14px;
                line-height: 1.5;
            }
            /* Keep selection explicit on text nodes despite Discord/theme resets. */
            .ml-panel, .ml-panel * {
                box-sizing: border-box;
                -webkit-user-select: text !important;
                user-select: text !important;
                -webkit-app-region: no-drag;
            }
            .ml-panel .ml-id, .ml-panel .ml-content, .ml-panel .ml-mention {
                -webkit-user-select: text !important;
                user-select: text !important;
                cursor: text;
            }
            .ml-panel .ml-header {
                display: flex;
                flex-wrap: wrap;
                align-items: center;
                justify-content: space-between;
                gap: 8px;
                padding-bottom: 16px;
                margin-bottom: 16px;
                border-bottom: 1px solid var(--border-normal, var(--background-modifier-accent, rgba(128,128,128,.4)));
            }
            .ml-panel .ml-title {
                margin: 0;
                color: var(--text-strong, var(--header-primary, inherit));
                font-size: 18px;
                font-weight: 700;
            }
            .ml-panel .ml-badge {
                background: var(--status-danger, #da373c);
                color: white;
                border-radius: 4px;
                padding: 2px 8px;
                font-size: 12px;
                font-weight: 600;
            }
            .ml-panel .ml-list {
                display: grid;
                grid-template-columns: minmax(0, 1fr);
                gap: 16px;
            }
            .ml-panel .ml-card {
                display: flex;
                align-items: flex-start;
                gap: 12px;
                min-width: 0;
                padding: 14px;
                border: 1px solid var(--border-normal, var(--background-modifier-accent, rgba(128,128,128,.4)));
                border-left: 4px solid var(--text-link, #7289da);
                border-radius: 8px;
                background: var(--background-base-lower, var(--background-secondary, #2b2d31));
            }
            .ml-panel .ml-card.ml-unread {
                border-left-color: var(--status-positive, #43b581);
                background: var(--background-mentioned, rgba(88,101,242,.15));
            }
            .ml-panel .ml-avatar {
                flex: 0 0 36px;
                width: 36px;
                height: 36px;
                padding: 0;
                border: 0;
                border-radius: 50%;
                background: transparent;
                cursor: pointer;
            }
            .ml-panel .ml-avatar img {
                display: block;
                width: 100%;
                height: 100%;
                border-radius: inherit;
            }
            .ml-panel .ml-data { flex: 1 1 0; min-width: 0; }
            .ml-panel .ml-row {
                display: flex;
                flex-wrap: wrap;
                align-items: baseline;
                gap: 4px 8px;
                margin-bottom: 6px;
                min-width: 0;
                font-family: Consolas, monospace;
                font-size: 12px;
            }
            .ml-panel .ml-label {
                flex: 0 0 44px;
                color: var(--text-muted, #949ba4);
                font-weight: 700;
            }
            .ml-panel .ml-id, .ml-panel .ml-name {
                min-width: 0;
                overflow-wrap: anywhere;
            }
            .ml-panel .ml-name { color: var(--text-muted, #949ba4); }
            .ml-panel .ml-message {
                margin-top: 12px;
                padding: 10px;
                min-width: 0;
                border-radius: 4px;
                border-left: 2px solid var(--text-link, #7289da);
                background: var(--background-base-lowest, var(--background-tertiary, rgba(0,0,0,.2)));
            }
            .ml-panel .ml-message-label {
                display: block;
                margin-bottom: 6px;
                color: var(--text-muted, #949ba4);
                font-size: 11px;
                font-weight: 700;
                text-transform: uppercase;
            }
            .ml-panel .ml-content {
                white-space: pre-wrap;
                overflow-wrap: anywhere;
                font-size: 13px;
            }
            .ml-panel .ml-mention {
                padding: 0 2px;
                border-radius: 3px;
                color: var(--text-link, #7289da);
                background: var(--mention-background, rgba(88,101,242,.2));
            }
            .ml-panel .ml-actions { margin-top: 10px; text-align: right; }
            .ml-panel .ml-button {
                max-width: 100%;
                padding: 4px 8px;
                border: 1px solid var(--border-normal, rgba(128,128,128,.4));
                border-radius: 4px;
                background: var(--button-secondary-background, rgba(128,128,128,.15));
                color: inherit;
                font: inherit;
                font-size: 12px;
                line-height: 1.4;
                cursor: pointer;
            }
            .ml-panel .ml-button:hover {
                background: var(--button-secondary-background-hover, rgba(128,128,128,.3));
            }
            .ml-panel .ml-button:focus-visible, .ml-panel .ml-avatar:focus-visible {
                outline: 2px solid var(--text-link, #7289da);
                outline-offset: 2px;
            }
            .ml-panel .ml-copy-btn { padding: 1px 6px; font-size: 11px; }
            .ml-panel .ml-button, .ml-panel .ml-button *,
            .ml-panel .ml-avatar, .ml-panel .ml-avatar * {
                -webkit-user-select: none !important;
                user-select: none !important;
            }
            .ml-panel .ml-footer {
                margin-top: 20px;
                padding-top: 12px;
                border-top: 1px solid var(--border-normal, var(--background-modifier-accent, rgba(128,128,128,.4)));
                text-align: right;
            }
            .ml-panel .ml-clear-btn { color: var(--text-danger, #f23f43); }
            .ml-panel .ml-empty {
                padding: 32px 12px;
                text-align: center;
                color: var(--text-muted, #949ba4);
            }
        `);
    }

    async copyId(id) {
        try {
            if (typeof globalThis.DiscordNative?.clipboard?.copy === "function") {
                await globalThis.DiscordNative.clipboard.copy(String(id));
            } else {
                await navigator.clipboard.writeText(String(id));
            }
            BdApi.UI.showToast("ID copié.", { type: "success" });
        } catch (error) {
            console.error(`[${this.pluginName}] Could not copy ID`, error);
            BdApi.UI.showToast("Copie impossible. Sélectionnez l’ID puis utilisez Ctrl+C.", { type: "error" });
        }
    }

    getSettingsPanel() {
        this.addStyles();
        const element = (tag, className, text) => {
            const node = document.createElement(tag);
            node.className = className;
            if (text !== undefined) node.textContent = text;
            return node;
        };
        const button = (className, text, onClick) => {
            const node = element("button", `ml-button ${className}`, text);
            node.type = "button";
            node.onclick = onClick;
            return node;
        };
        const panel = element("div", "ml-panel");
        const header = element("div", "ml-header");
        header.appendChild(element("h3", "ml-title", "Historique des mentions"));
        const unreadCount = this.settings.mentions.filter(m => !m.read).length;
        if (unreadCount) header.appendChild(element("span", "ml-badge", `${unreadCount} nouvelle${unreadCount > 1 ? "s" : ""}`));
        panel.appendChild(header);

        const list = element("div", "ml-list");
        list.setAttribute("role", "list");
        list.setAttribute("aria-label", "Mentions enregistrées");
        let hasMarkedRead = false;
        const createRow = (label, id, name) => {
            const row = element("div", "ml-row");
            row.appendChild(element("span", "ml-label", `${label} :`));
            if (id) {
                row.appendChild(element("span", "ml-id", String(id)));
                const copy = button("ml-copy-btn", "Copier", () => this.copyId(id));
                copy.setAttribute("aria-label", `Copier l’ID ${label}`);
                copy.title = `Copier l’ID ${label}`;
                row.appendChild(copy);
            }
            if (name) row.appendChild(element("span", "ml-name", name));
            return row;
        };

        if (!this.settings.mentions.length) {
            list.appendChild(element("div", "ml-empty", "Aucune mention enregistrée pour le moment."));
        }
        for (const log of [...this.settings.mentions].reverse()) {
            const liveUser = this.userStore?.getUser(log.authorId);
            const liveChannel = this.channelStore?.getChannel(log.channelId);
            const liveGuild = log.guildId ? this.guildStore?.getGuild(log.guildId) : null;
            const username = liveUser?.username || log.authorUsername || "Unknown";
            const channelName = liveChannel?.name || "unknown-channel";
            const guildName = log.guildId ? (liveGuild?.name || "Server Unavailable") : "Direct Message";
            const isUnread = !log.read;
            const item = element("article", `ml-card${isUnread ? " ml-unread" : ""}`);
            item.setAttribute("role", "listitem");

            const avatar = element("button", "ml-avatar");
            avatar.type = "button";
            avatar.setAttribute("aria-label", `Voir le profil de ${username}`);
            avatar.onclick = () => this.openUserProfile(log.authorId);
            const image = document.createElement("img");
            image.src = this.getRealAvatar(log.authorId);
            image.alt = "";
            image.draggable = false;
            avatar.appendChild(image);
            item.appendChild(avatar);

            const data = element("div", "ml-data");
            data.appendChild(createRow("DATE", null, new Date(log.timestamp).toLocaleString("fr-FR")));
            data.appendChild(createRow("USER", log.authorId, `(${username})`));
            data.appendChild(createRow("CHAN", log.channelId, `(#${channelName})`));
            data.appendChild(createRow("SERV", log.guildId, `(${guildName})`));
            data.appendChild(createRow("MSG", log.messageId));

            const message = element("div", "ml-message");
            message.appendChild(element("strong", "ml-message-label", "Contenu"));
            const content = element("div", "ml-content");
            content.appendChild(this.parseContent(log.content));
            message.appendChild(content);
            data.appendChild(message);
            const actions = element("div", "ml-actions");
            actions.appendChild(button("ml-jump-btn", "Voir le message ➜", () => this.openChannel(log.guildId, log.channelId, log.messageId)));
            data.appendChild(actions);
            item.appendChild(data);
            list.appendChild(item);

            if (isUnread) {
                log.read = true;
                hasMarkedRead = true;
            }
        }
        panel.appendChild(list);

        const footer = element("div", "ml-footer");
        footer.appendChild(button("ml-clear-btn", "Effacer l’historique", () => {
            BdApi.UI.showConfirmationModal("Effacer l’historique des mentions ?", "Cette action supprimera toutes les mentions enregistrées.", {
                danger: true,
                confirmText: "Effacer",
                cancelText: "Annuler",
                onConfirm: () => {
                    this.settings.mentions = [];
                    this.processedIds.clear();
                    this.saveSettings();
                    panel.replaceWith(this.getSettingsPanel());
                }
            });
        }));
        panel.appendChild(footer);
        if (hasMarkedRead) this.saveSettings();
        return panel;
    }
};
