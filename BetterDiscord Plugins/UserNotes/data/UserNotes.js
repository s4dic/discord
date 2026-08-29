/**
 * @name UserNotes
 * @author Sleek
 * @authorId 108351165988618240
 * @version 2.8.0
 * @description Remote payload for UserNotesLoader. Local file-based notes, native BetterDiscord context menu, autosave and clickable 📝 badges.
 * @invite B5kBdSsED2
 * @website https://github.com/s4dic/discord
 * @source https://github.com/s4dic/discord/tree/main/BetterDiscord%20Plugins/UserNotes/
 */

module.exports = class UserNotes {
    getName() { return "UserNotes"; }
    getVersion() { return "2.8.0"; }

    constructor() {
        this.path = require("path");
        this.fs = require("fs");
        this.notesDir = this.path.join(BdApi.Plugins.folder, "UserNotesData");
        this.notedUsers = new Set();
        this.badgeObserver = null;
        this._badgeDebounce = null;
        this._unpatchUserContext = null;
        this._started = false;
        this._styleId = "usernotes-v280-style";
    }

    start() {
        this._started = true;

        try {
            if (!this.fs.existsSync(this.notesDir)) {
                this.fs.mkdirSync(this.notesDir, {recursive: true});
            }
        } catch (error) {
            console.error("[UserNotes] Failed to create notes directory:", error);
            BdApi.UI.showToast("UserNotes: cannot access notes directory", {type: "error"});
            return;
        }

        this.refreshNotedUsers();
        this.injectCSS();
        this.patchContextMenu();
        this.patchBadges();
    }

    stop() {
        this._started = false;

        if (typeof this._unpatchUserContext === "function") {
            try { this._unpatchUserContext(); }
            catch (error) { console.error("[UserNotes] Failed to unpatch user context menu:", error); }
        }
        this._unpatchUserContext = null;

        if (this.badgeObserver) {
            this.badgeObserver.disconnect();
            this.badgeObserver = null;
        }

        if (this._badgeDebounce) {
            clearTimeout(this._badgeDebounce);
            this._badgeDebounce = null;
        }

        document.querySelectorAll(".usernotes-badge").forEach((badge) => badge.remove());
        document.getElementById(this._styleId)?.remove();
    }

    // ---------------------------------------------------------------------
    // Context menu - native BetterDiscord API (BD 1.14+ compatible)
    // ---------------------------------------------------------------------

    patchContextMenu() {
        if (!BdApi.ContextMenu?.patch || !BdApi.ContextMenu?.buildItem) {
            console.error("[UserNotes] BdApi.ContextMenu API is unavailable.");
            BdApi.UI.showToast("UserNotes: BetterDiscord ContextMenu API unavailable", {type: "error"});
            return;
        }

        try {
            this._unpatchUserContext = BdApi.ContextMenu.patch("user-context", (menu, props) => {
                const user = props?.user;
                if (!user?.id || !menu?.props) return;

                const note = this.loadNote(user.id);
                const hasNote = Boolean(note && note.trim());
                const label = `${hasNote ? "📝✓" : "📝"} ${this.getLabel("user_note")}`;

                const item = BdApi.ContextMenu.buildItem({
                    id: "user-note-context",
                    label,
                    action: () => this.openNotesModal(user)
                });

                if (!item) return;
                this.appendMenuItem(menu, item);
            });
        } catch (error) {
            console.error("[UserNotes] Failed to patch user context menu:", error);
            BdApi.UI.showToast("UserNotes: context-menu patch failed", {type: "error"});
        }
    }

    appendMenuItem(menu, item) {
        const React = BdApi.React;
        const Group = BdApi.ContextMenu?.Group;
        const group = Group
            ? React.createElement(Group, {key: "usernotes-context-group"}, item)
            : item;

        const children = menu.props.children;

        if (Array.isArray(children)) {
            // Avoid duplicate injection if Discord/BD invokes the patch more than once.
            const alreadyPresent = this.reactTreeContainsId(children, "user-note-context");
            if (!alreadyPresent) children.push(group);
            return;
        }

        if (children == null) {
            menu.props.children = [group];
            return;
        }

        if (!this.reactTreeContainsId(children, "user-note-context")) {
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

    // ---------------------------------------------------------------------
    // Badge system
    // ---------------------------------------------------------------------

    injectCSS() {
        if (document.getElementById(this._styleId)) return;

        const style = document.createElement("style");
        style.id = this._styleId;
        style.textContent = `
            .usernotes-badge {
                display: inline-flex !important;
                align-items: center !important;
                justify-content: center !important;
                flex: 0 0 auto !important;
                margin: 0 4px !important;
                padding: 0 !important;
                font-size: 14px !important;
                line-height: 1 !important;
                cursor: pointer !important;
                vertical-align: middle !important;
                position: relative !important;
                z-index: 10 !important;
                pointer-events: auto !important;
                user-select: none !important;
            }

            .usernotes-badge:hover {
                transform: scale(1.18);
                filter: brightness(1.2);
            }

            .usernotes-note-textarea {
                width: 100% !important;
                min-height: min(62vh, 650px) !important;
                max-height: 70vh !important;
                padding: 10px !important;
                box-sizing: border-box !important;
                resize: vertical !important;
                border-radius: 6px !important;
                border: 1px solid var(--input-border, var(--background-modifier-accent)) !important;
                background: var(--input-background, var(--background-tertiary)) !important;
                color: var(--text-normal) !important;
                font: 14px/1.5 Consolas, Monaco, "Courier New", monospace !important;
                outline: none !important;
            }

            .usernotes-note-textarea:focus {
                border-color: var(--brand-500, var(--brand-experiment)) !important;
            }
        `;
        document.head.appendChild(style);
    }

    patchBadges() {
        this.scanAndInjectBadges();

        this.badgeObserver = new MutationObserver((mutations) => {
            if (!this._started || !this.notedUsers.size) return;

            const relevant = mutations.some((mutation) =>
                Array.from(mutation.addedNodes || []).some((node) =>
                    node?.nodeType === 1 && !node.classList?.contains("usernotes-badge")
                )
            );

            if (!relevant) return;

            clearTimeout(this._badgeDebounce);
            this._badgeDebounce = setTimeout(() => {
                if (this._started) this.scanAndInjectBadges();
            }, 180);
        });

        this.badgeObserver.observe(document.body, {childList: true, subtree: true});
    }

    scanAndInjectBadges() {
        if (!this._started || !this.notedUsers.size) return;

        const selectors = [
            '[data-list-item-id^="members-"]',
            '[data-list-item-id^="private-channels-"]',
            '[data-list-item-id^="voice-user-"]',
            '[class*="voiceUser_"]',
            '[class*="member_"]:not([class*="memberInner_"])',
            '[class*="privateChannel_"]',
            '[class*="privateChannel"]',
            '[class*="peopleListItem_"]',
            '[class*="peopleListItem"]',
            'li[id^="chat-messages-"]',
            '[class*="messageListItem_"]'
        ].join(",");

        const seen = new Set();

        document.querySelectorAll(selectors).forEach((container) => {
            if (!(container instanceof HTMLElement)) return;
            if (seen.has(container)) return;
            seen.add(container);

            if (container.querySelector(":scope > .usernotes-badge, .usernotes-badge[data-user-id]")) return;

            const userId = this.getUserIdFromElement(container);
            if (!userId || !this.notedUsers.has(userId)) return;

            const badge = this.createBadge(userId);
            if (!badge) return;

            const isMessage = container.matches('li[id^="chat-messages-"], [class*="messageListItem_"]');

            if (isMessage) {
                const username = container.querySelector('[id^="message-username-"], [class*="username_"]');
                if (!username) return; // grouped message with no visible author header
                username.insertAdjacentElement("afterend", badge);
                return;
            }

            const avatar = container.querySelector(
                '[class*="avatarWrapper_"], [class*="avatar_"] img, img[class*="avatar"], [class*="userAvatar_"]'
            );

            if (avatar) {
                const anchor = avatar.closest('[class*="avatar_"]') || avatar;
                const parent = anchor.parentElement;
                if (parent) parent.insertBefore(badge, anchor);
                else container.insertBefore(badge, container.firstChild);
            } else {
                container.insertBefore(badge, container.firstChild);
            }
        });
    }

    createBadge(userId) {
        const badge = document.createElement("span");
        badge.className = "usernotes-badge";
        badge.textContent = "📝";
        badge.title = this.getLabel("user_note");
        badge.dataset.userId = userId;

        badge.addEventListener("click", (event) => {
            event.preventDefault();
            event.stopPropagation();
            event.stopImmediatePropagation();

            let user = null;
            try {
                user = BdApi.Webpack.getStore?.("UserStore")?.getUser?.(userId) || null;
            } catch (_) {}

            this.openNotesModal(user || {id: userId, username: "User"});
        }, true);

        badge.addEventListener("mousedown", (event) => event.stopPropagation(), true);
        return badge;
    }

    getUserIdFromElement(element) {
        // Stable DOM identifiers first. Discord often embeds the snowflake in these.
        for (let current = element, i = 0; current && i < 5; current = current.parentElement, i++) {
            const candidates = [
                current.getAttribute?.("data-list-item-id"),
                current.id,
                current.getAttribute?.("href"),
                current.getAttribute?.("data-user-id")
            ];

            for (const value of candidates) {
                const id = this.extractSnowflake(value);
                if (id) return id;
            }
        }

        // React Fiber fallback. Reflect.ownKeys also sees non-enumerable expando keys.
        for (let current = element, level = 0; current && level < 8; current = current.parentElement, level++) {
            let keys = [];
            try { keys = Reflect.ownKeys(current); }
            catch (_) { keys = Object.keys(current); }

            const reactKey = keys.find((key) =>
                typeof key === "string" && (
                    key.startsWith("__reactFiber") ||
                    key.startsWith("__reactProps") ||
                    key.startsWith("__reactInternalInstance")
                )
            );

            if (!reactKey) continue;

            let fiber = current[reactKey];
            if (reactKey.startsWith("__reactProps")) {
                const id = this.findUserIdInProps(fiber, 0, new WeakSet());
                if (id) return id;
                continue;
            }

            let depth = 0;
            while (fiber && depth++ < 45) {
                const props = fiber.memoizedProps || fiber.pendingProps;
                const id = this.findUserIdInProps(props, 0, new WeakSet());
                if (id) return id;
                fiber = fiber.return;
            }
        }

        return null;
    }

    findUserIdInProps(value, depth = 0, seen = new WeakSet()) {
        if (!value || depth > 4) return null;
        if (typeof value !== "object") return null;
        if (seen.has(value)) return null;
        seen.add(value);

        const direct = [
            value?.user?.id,
            value?.userId,
            value?.message?.author?.id,
            value?.author?.id,
            value?.participant?.user?.id,
            value?.member?.user?.id,
            value?.profile?.user?.id
        ];

        for (const candidate of direct) {
            const id = this.extractSnowflake(candidate);
            if (id) return id;
        }

        // Only inspect a small set of likely nested prop containers to avoid walking
        // a complete React tree and accidentally selecting a neighbouring user.
        const nestedKeys = ["children", "props", "item", "data", "record", "value"];
        for (const key of nestedKeys) {
            const nested = value[key];
            if (Array.isArray(nested)) {
                for (const child of nested.slice(0, 12)) {
                    const id = this.findUserIdInProps(child, depth + 1, seen);
                    if (id) return id;
                }
            } else {
                const id = this.findUserIdInProps(nested, depth + 1, seen);
                if (id) return id;
            }
        }

        return null;
    }

    extractSnowflake(value) {
        if (typeof value === "number" && Number.isSafeInteger(value)) value = String(value);
        if (typeof value !== "string") return null;
        const match = value.match(/(?:^|\D)(\d{16,22})(?:\D|$)/);
        return match?.[1] || null;
    }

    // ---------------------------------------------------------------------
    // Modal / editor
    // ---------------------------------------------------------------------

    openNotesModal(user) {
        if (!user?.id) return;

        let note = this.loadNote(user.id);
        const initialNote = note;
        let preventAutoSave = false;
        const username = user.globalName || user.username || "User";

        const textarea = BdApi.React.createElement("textarea", {
            className: "usernotes-note-textarea",
            defaultValue: note,
            placeholder: this.getLabel("placeholder"),
            autoFocus: true,
            maxLength: 50000,
            onChange: (event) => { note = event.target.value; }
        });

        BdApi.UI.showConfirmationModal(
            `${this.getLabel("user_note")} — ${username}`,
            textarea,
            {
                size: "bd-modal-large",
                confirmText: this.getLabel("save"),
                cancelText: this.getLabel("cancel"),
                onConfirm: () => {
                    preventAutoSave = true;
                    this.saveNote(user.id, note);
                    this.refreshBadgeUI();
                },
                onCancel: () => {
                    preventAutoSave = true;
                },
                onClose: () => {
                    if (!preventAutoSave) {
                        const before = (initialNote ?? "").trimEnd();
                        const after = (note ?? "").trimEnd();
                        if (before !== after) this.saveNote(user.id, note);
                    }
                    this.refreshBadgeUI();
                }
            }
        );
    }

    // ---------------------------------------------------------------------
    // File I/O - keeps the exact historical UserNotesData/*.txt format
    // ---------------------------------------------------------------------

    refreshNotedUsers() {
        this.notedUsers.clear();
        if (!this.fs.existsSync(this.notesDir)) return;

        try {
            for (const file of this.fs.readdirSync(this.notesDir)) {
                if (!file.endsWith(".txt")) continue;
                const userId = file.slice(0, -4);
                const content = this.fs.readFileSync(this.path.join(this.notesDir, file), "utf8");
                if (content?.trim()) this.notedUsers.add(userId);
            }
        } catch (error) {
            console.error("[UserNotes] Failed to refresh notes:", error);
        }
    }

    loadNote(userId) {
        const notePath = this.path.join(this.notesDir, `${userId}.txt`);
        try {
            return this.fs.existsSync(notePath) ? this.fs.readFileSync(notePath, "utf8") : "";
        } catch (error) {
            console.error(`[UserNotes] Failed to load note for ${userId}:`, error);
            return "";
        }
    }

    saveNote(userId, content) {
        const notePath = this.path.join(this.notesDir, `${userId}.txt`);

        try {
            if (!content || !content.trim()) {
                if (this.fs.existsSync(notePath)) {
                    this.fs.unlinkSync(notePath);
                    BdApi.UI.showToast(this.getLabel("removed"), {type: "success"});
                }
            } else {
                this.fs.writeFileSync(notePath, content, "utf8");
                BdApi.UI.showToast(this.getLabel("saved"), {type: "success"});
            }
        } catch (error) {
            console.error(`[UserNotes] Failed to save note for ${userId}:`, error);
            BdApi.UI.showToast("UserNotes: save failed", {type: "error"});
        }
    }

    deleteAllNotes() {
        if (!this.fs.existsSync(this.notesDir)) return;

        try {
            for (const file of this.fs.readdirSync(this.notesDir)) {
                if (file.endsWith(".txt")) this.fs.unlinkSync(this.path.join(this.notesDir, file));
            }
            this.refreshBadgeUI();
            BdApi.UI.showToast(this.getLabel("all_removed"), {type: "success"});
        } catch (error) {
            console.error("[UserNotes] Failed to delete all notes:", error);
            BdApi.UI.showToast("UserNotes: delete failed", {type: "error"});
        }
    }

    refreshBadgeUI() {
        this.refreshNotedUsers();
        document.querySelectorAll(".usernotes-badge").forEach((badge) => badge.remove());
        if (this._started) this.scanAndInjectBadges();
    }

    // ---------------------------------------------------------------------
    // Settings
    // ---------------------------------------------------------------------

    getSettingsPanel() {
        const wrapper = document.createElement("div");
        wrapper.style.cssText = "padding:16px;color:var(--text-normal);";

        const title = document.createElement("div");
        title.textContent = "UserNotes";
        title.style.cssText = "font-size:20px;font-weight:600;margin-bottom:8px;";

        const info = document.createElement("div");
        info.textContent = `${this.notedUsers.size} note(s) stored in UserNotesData.`;
        info.style.cssText = "margin-bottom:16px;color:var(--text-muted);";

        const button = document.createElement("button");
        button.textContent = this.getLabel("remove_all");
        button.style.cssText = [
            "border:0",
            "border-radius:4px",
            "padding:10px 14px",
            "font-weight:600",
            "cursor:pointer",
            "color:white",
            "background:var(--status-danger, #da373c)"
        ].join(";");

        button.addEventListener("click", () => {
            BdApi.UI.showConfirmationModal(
                this.getLabel("remove_all"),
                this.getLabel("remove_all_confirm"),
                {
                    danger: true,
                    confirmText: this.getLabel("remove"),
                    cancelText: this.getLabel("cancel"),
                    onConfirm: () => {
                        this.deleteAllNotes();
                        info.textContent = `${this.notedUsers.size} note(s) stored in UserNotesData.`;
                    }
                }
            );
        });

        wrapper.append(title, info, button);
        return wrapper;
    }

    // ---------------------------------------------------------------------
    // Labels
    // ---------------------------------------------------------------------

    getLabel(key) {
        const lang = String(document.documentElement.lang || navigator.language || "en").toLowerCase();
        const fr = lang.startsWith("fr");

        const strings = fr ? {
            user_note: "Note utilisateur",
            save: "Enregistrer",
            cancel: "Annuler",
            remove: "Supprimer",
            placeholder: "Écrivez votre note ici…",
            saved: "Note enregistrée",
            removed: "Note supprimée",
            all_removed: "Toutes les notes ont été supprimées",
            remove_all: "Supprimer toutes les notes",
            remove_all_confirm: "Voulez-vous vraiment supprimer toutes les notes utilisateur ?"
        } : {
            user_note: "User Note",
            save: "Save",
            cancel: "Cancel",
            remove: "Remove",
            placeholder: "Write your note here…",
            saved: "Note saved",
            removed: "Note removed",
            all_removed: "All notes removed",
            remove_all: "Remove all Notes",
            remove_all_confirm: "Are you sure you want to remove all user notes?"
        };

        return strings[key] || key;
    }
};
