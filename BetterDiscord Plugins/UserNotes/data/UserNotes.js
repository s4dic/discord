/**
 * @name UserNotes
 * @author Sleek
 * @authorId 108351165988618240
 * @version 2.8.1
 * @description Remote payload for UserNotesLoader. Local file-based notes, native BetterDiscord context menu, autosave, clickable 📝 badges and Obsidian-like notes: drop/paste screenshots or files into the text (stored as base64) and drag them around.
 * @invite B5kBdSsED2
 * @website https://github.com/s4dic/discord
 * @source https://github.com/s4dic/discord/tree/main/BetterDiscord%20Plugins/UserNotes/
 */

module.exports = class UserNotes {
    getName() { return "UserNotes"; }
    getVersion() { return "2.10.0"; }

    constructor() {
        this.path = require("path");
        this.fs = require("fs");
        this.notesDir = this.path.join(BdApi.Plugins.folder, "UserNotesData");
        this.notedUsers = new Set();
        this.badgeObserver = null;
        this._badgeDebounce = null;
        this._unpatchUserContext = null;
        this._started = false;
        this._styleId = "usernotes-v2100-style";
        this.maxFileBytes = 25 * 1024 * 1024; // per dropped file, before base64 encoding
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
                const hasNote = Boolean(note && note.trim()) || this.hasAttachments(user.id);
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

            .usernotes-modal-body {
                display: flex;
                flex-direction: column;
                gap: 8px;
            }

            .un-editor-toolbar {
                display: flex;
                align-items: center;
                gap: 10px;
                flex-wrap: wrap;
            }
            .un-editor-toolbar button {
                border: 0;
                border-radius: 4px;
                padding: 6px 10px;
                cursor: pointer;
                color: var(--text-normal);
                background: var(--background-tertiary, #1e1f22);
                font-size: 13px;
            }
            .un-editor-toolbar button:hover { background: var(--background-modifier-hover, #3f4147); }
            .un-editor-help { color: var(--text-muted); font-size: 12px; }

            .usernotes-editor {
                height: 62vh;
                min-height: 260px;
                overflow-y: auto;
                padding: 10px 12px;
                box-sizing: border-box;
                border-radius: 6px;
                border: 1px solid var(--input-border, var(--background-modifier-accent));
                background: var(--input-background, var(--background-tertiary));
                color: var(--text-normal);
                font: 14px/1.5 Consolas, Monaco, "Courier New", monospace;
                white-space: pre-wrap;
                overflow-wrap: anywhere;
                outline: none;
                cursor: text;
                user-select: text;
            }
            .usernotes-editor:focus { border-color: var(--brand-500, var(--brand-experiment)); }
            .usernotes-editor:empty::before { content: attr(data-placeholder); color: var(--text-muted); pointer-events: none; }
            .usernotes-editor.un-drop { border-color: var(--brand-500, #5865f2); box-shadow: inset 0 0 0 2px var(--brand-500, #5865f2); }
            .usernotes-editor.un-moving, .usernotes-editor.un-moving * { cursor: grabbing !important; }

            .un-embed {
                position: relative;
                display: inline-block;
                max-width: 100%;
                margin: 4px 0;
                vertical-align: bottom;
                border-radius: 6px;
                outline: 2px solid transparent;
                cursor: grab;
                user-select: none;
                white-space: normal;
            }
            .un-embed:hover { outline-color: var(--background-modifier-accent, #4e5058); }
            .un-embed.un-selected { outline-color: var(--brand-500, #5865f2); }
            .un-embed.un-dragging { opacity: .35; }
            .un-embed img, .un-embed video { display: block; width: 100%; height: auto; border-radius: 6px; -webkit-user-drag: none; }
            .un-embed-image:not([data-w]) img { width: auto; max-width: 100%; }
            .un-embed audio { display: block; width: 300px; max-width: 100%; }
            .un-embed-tools {
                position: absolute;
                top: 4px;
                right: 4px;
                display: none;
                gap: 3px;
            }
            .un-embed:hover .un-embed-tools, .un-embed.un-selected .un-embed-tools { display: flex; }
            .un-embed-tools button {
                width: 22px;
                height: 22px;
                padding: 0;
                border: 0;
                border-radius: 4px;
                cursor: pointer;
                color: #fff;
                background: rgba(0,0,0,.65);
                font-size: 12px;
                line-height: 1;
            }
            .un-embed-tools button:hover { background: rgba(0,0,0,.85); }
            .un-embed-resize {
                position: absolute;
                right: 0;
                bottom: 0;
                width: 16px;
                height: 16px;
                cursor: nwse-resize;
                display: none;
                background: linear-gradient(135deg, transparent 50%, rgba(255,255,255,.8) 50%, rgba(255,255,255,.8) 60%, transparent 60%, transparent 72%, rgba(255,255,255,.8) 72%, rgba(255,255,255,.8) 82%, transparent 82%);
            }
            .un-embed:hover .un-embed-resize, .un-embed.un-selected .un-embed-resize { display: block; }
            .un-file {
                display: inline-flex;
                align-items: center;
                gap: 10px;
                padding: 8px 40px 8px 10px;
                border-radius: 6px;
                background: var(--background-secondary, #2b2d31);
                border: 1px solid var(--background-modifier-accent, #3f4147);
                font-family: var(--font-primary, sans-serif);
            }
            .un-file-icon { font-size: 24px; }
            .un-file-meta { display: flex; flex-direction: column; font-size: 12px; color: var(--text-muted); }
            .un-file-name { color: var(--text-normal); font-size: 13px; }

            .un-drop-caret {
                position: fixed;
                width: 2px;
                z-index: 100001;
                background: var(--brand-500, #5865f2);
                pointer-events: none;
            }
            .un-drag-ghost {
                position: fixed;
                z-index: 100001;
                pointer-events: none;
                opacity: .8;
                padding: 4px 8px;
                border-radius: 6px;
                background: var(--background-floating, #111214);
                color: var(--text-normal);
                font-size: 12px;
            }
            .un-drag-ghost img { display: block; max-width: 140px; max-height: 100px; border-radius: 4px; }

            .un-lightbox {
                position: fixed;
                inset: 0;
                z-index: 100000;
                display: flex;
                align-items: center;
                justify-content: center;
                background: rgba(0,0,0,.85);
                cursor: zoom-out;
            }
            .un-lightbox img { max-width: 94vw; max-height: 94vh; object-fit: contain; }
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

        const React = BdApi.React;
        const rawNote = this.loadNote(user.id);
        const store = this.loadAttachments(user.id);
        const username = user.globalName || user.username || "User";
        let preventAutoSave = false;

        // 2.9.0 stored files on a free canvas: append them under the text once, in visual order.
        let text = rawNote;
        if (store.legacy.length) {
            text = `${text.replace(/\s+$/, "")}${text.trim() ? "\n\n" : ""}${store.legacy.map((id) => `![[${id}]]`).join("\n")}`;
        }

        const doc = {text, attachments: store.attachments};
        let editor = null;
        const getText = () => (editor ? editor.serialize() : doc.text);

        const plugin = this;
        const NoteEditor = () => {
            const bodyRef = React.useRef(null);
            const editorRef = React.useRef(null);

            React.useEffect(() => {
                editor = plugin.createEditor(editorRef.current, bodyRef.current, doc);
                return () => {
                    doc.text = editor.serialize();
                    editor.destroy();
                    editor = null;
                };
            }, []);

            return React.createElement("div", {className: "usernotes-modal-body", ref: bodyRef},
                React.createElement("div", {className: "usernotes-editor", ref: editorRef})
            );
        };

        const persist = (force) => {
            const finalText = getText();
            const changed = force || store.legacy.length > 0 || finalText.trimEnd() !== rawNote.trimEnd();
            if (!changed) return;
            this.saveAttachments(user.id, finalText, doc.attachments);
            this.saveNote(user.id, finalText);
        };

        BdApi.UI.showConfirmationModal(
            `${this.getLabel("user_note")} — ${username}`,
            React.createElement(NoteEditor),
            {
                size: "bd-modal-large",
                confirmText: this.getLabel("save"),
                cancelText: this.getLabel("cancel"),
                onConfirm: () => {
                    preventAutoSave = true;
                    persist(true);
                    this.refreshBadgeUI();
                },
                onCancel: () => {
                    preventAutoSave = true;
                },
                onClose: () => {
                    if (!preventAutoSave) persist(false);
                    this.refreshBadgeUI();
                }
            }
        );
    }

    // ---------------------------------------------------------------------
    // Rich note editor: plain text + embedded images/files that can be moved
    // anywhere in the text. Serialized as text with Obsidian-style embeds
    // ![[attachmentId|width]] ; the base64 data lives in the JSON file.
    // ---------------------------------------------------------------------

    createEditor(root, body, doc) {
        const EMBED_RE = /!\[\[([A-Za-z0-9_-]+)(?:\|(\d{1,4}))?\]\]/g;
        const el = (tag, cls, txt) => {
            const node = document.createElement(tag);
            if (cls) node.className = cls;
            if (txt != null) node.textContent = txt;
            return node;
        };
        const cleanups = [];
        const on = (target, type, fn, opts) => {
            target.addEventListener(type, fn, opts);
            cleanups.push(() => target.removeEventListener(type, fn, opts));
        };

        root.contentEditable = "true";
        root.spellcheck = true;
        root.dataset.placeholder = this.getLabel("placeholder");

        // Toolbar above the editor
        const toolbar = el("div", "un-editor-toolbar");
        const addBtn = el("button", null, `📎 ${this.getLabel("add_file")}`);
        addBtn.type = "button";
        const help = el("span", "un-editor-help", this.getLabel("editor_hint"));
        const fileInput = el("input");
        fileInput.type = "file";
        fileInput.multiple = true;
        fileInput.style.display = "none";
        toolbar.append(addBtn, help, fileInput);
        body.insertBefore(toolbar, root);

        const marker = el("div", "un-drop-caret");
        const ghostHost = el("div", "un-drag-ghost");
        document.body.append(marker, ghostHost);
        marker.style.display = "none";
        ghostHost.style.display = "none";

        let lightbox = null;
        let selectedEmbed = null;
        let savedRange = null;

        // ---- serialize / render ------------------------------------------
        const walk = (node) => {
            let out = "";
            node.childNodes.forEach((child) => {
                if (child.nodeType === 3) {
                    out += child.data.replace(/​/g, "");
                } else if (child.nodeType === 1) {
                    if (child.dataset?.att) {
                        out += `![[${child.dataset.att}${child.dataset.w ? `|${child.dataset.w}` : ""}]]`;
                    } else if (child.nodeName === "BR") {
                        out += "\n";
                    } else if (/^(DIV|P)$/.test(child.nodeName)) {
                        if (out && !out.endsWith("\n")) out += "\n";
                        out += walk(child);
                    } else {
                        out += walk(child);
                    }
                }
            });
            return out;
        };
        const serialize = () => walk(root).replace(/\n+$/, "");

        const appendText = (parent, str) => {
            const parts = str.split("\n");
            parts.forEach((part, i) => {
                if (part) parent.appendChild(document.createTextNode(part));
                if (i < parts.length - 1) parent.appendChild(el("br"));
            });
        };

        const render = (text) => {
            root.textContent = "";
            let last = 0;
            for (const match of text.matchAll(EMBED_RE)) {
                appendText(root, text.slice(last, match.index));
                const att = doc.attachments[match[1]];
                if (att) root.appendChild(makeEmbed(match[1], att, match[2] ? Number(match[2]) : null));
                else appendText(root, match[0]); // unknown id: keep the raw marker as text
                last = match.index + match[0].length;
            }
            appendText(root, text.slice(last));
            if (root.lastChild?.nodeName === "BR") root.appendChild(el("br")); // make a trailing empty line visible
        };

        // ---- embeds --------------------------------------------------------
        const fileIcon = (type = "", name = "") => {
            if (type.startsWith("video/")) return "🎞️";
            if (type.startsWith("audio/")) return "🎵";
            if (type === "application/pdf" || /\.pdf$/i.test(name)) return "📕";
            if (/zip|rar|7z|tar|gzip/.test(type) || /\.(zip|rar|7z|tar|gz)$/i.test(name)) return "🗜️";
            if (type.startsWith("text/") || /\.(txt|md|log|json|csv)$/i.test(name)) return "📄";
            return "📦";
        };

        const downloadAtt = async (att) => {
            try {
                const blob = await (await fetch(att.data)).blob();
                const url = URL.createObjectURL(blob);
                const a = el("a");
                a.href = url;
                a.download = att.name || "file";
                document.body.appendChild(a);
                a.click();
                a.remove();
                setTimeout(() => URL.revokeObjectURL(url), 30000);
            } catch (error) {
                console.error("[UserNotes] Download failed:", error);
                BdApi.UI.showToast("UserNotes: download failed", {type: "error"});
            }
        };

        const openLightbox = (att) => {
            closeLightbox();
            lightbox = el("div", "un-lightbox");
            const img = el("img");
            img.src = att.data;
            img.alt = att.name || "";
            lightbox.appendChild(img);
            lightbox.addEventListener("click", closeLightbox);
            document.body.appendChild(lightbox);
        };
        const closeLightbox = () => { lightbox?.remove(); lightbox = null; };

        const makeEmbed = (id, att, width) => {
            const type = att.type || "";
            const isImage = type.startsWith("image/");
            const isVideo = type.startsWith("video/");
            const wrap = el("span", `un-embed${isImage ? " un-embed-image" : ""}`);
            wrap.contentEditable = "false";
            wrap.dataset.att = id;
            wrap.title = `${att.name} — ${this.formatBytes(att.size)}\n${this.getLabel("embed_tip")}`;
            if (width) {
                wrap.dataset.w = String(width);
                wrap.style.width = `${width}px`;
            }

            if (isImage) {
                const img = el("img");
                img.src = att.data;
                img.alt = att.name || "";
                img.draggable = false;
                wrap.appendChild(img);
            } else if (isVideo) {
                const video = el("video");
                video.src = att.data;
                video.controls = true;
                video.preload = "metadata";
                wrap.appendChild(video);
            } else if (type.startsWith("audio/")) {
                const audio = el("audio");
                audio.src = att.data;
                audio.controls = true;
                wrap.appendChild(audio);
            } else {
                const chip = el("span", "un-file");
                const meta = el("span", "un-file-meta");
                meta.append(el("span", "un-file-name", att.name || "file"), el("span", null, `${this.formatBytes(att.size)} · ${type || "?"}`));
                chip.append(el("span", "un-file-icon", fileIcon(type, att.name)), meta);
                wrap.appendChild(chip);
            }

            const tools = el("span", "un-embed-tools");
            const dl = el("button", null, "⬇");
            dl.type = "button";
            dl.title = this.getLabel("download");
            dl.addEventListener("click", (e) => { e.preventDefault(); e.stopPropagation(); downloadAtt(att); });
            const del = el("button", null, "✕");
            del.type = "button";
            del.title = this.getLabel("remove");
            del.addEventListener("click", (e) => { e.preventDefault(); e.stopPropagation(); removeEmbed(wrap); });
            tools.append(dl, del);
            wrap.appendChild(tools);

            if (isImage || isVideo) wrap.appendChild(el("span", "un-embed-resize"));
            return wrap;
        };

        // When an embed sits alone on its line, take that line break with it.
        const detachEmbed = (embed) => {
            const prev = embed.previousSibling;
            const next = embed.nextSibling;
            const startOfLine = !prev || prev.nodeName === "BR";
            if (startOfLine && next?.nodeName === "BR") next.remove();
            embed.remove();
        };

        const removeEmbed = (embed) => {
            if (selectedEmbed === embed) selectedEmbed = null;
            detachEmbed(embed);
        };

        const selectEmbed = (embed) => {
            if (selectedEmbed && selectedEmbed !== embed) selectedEmbed.classList.remove("un-selected");
            selectedEmbed = embed;
            embed?.classList.add("un-selected");
        };

        // ---- ranges -----------------------------------------------------------
        const insideEmbed = (node) => {
            const element = node?.nodeType === 1 ? node : node?.parentElement;
            return Boolean(element?.closest?.(".un-embed"));
        };
        const isValidRange = (range) => range && root.contains(range.startContainer) && !insideEmbed(range.startContainer);

        const endRange = () => {
            const range = document.createRange();
            range.selectNodeContents(root);
            range.collapse(false);
            return range;
        };

        const rangeFromPoint = (x, y) => {
            const range = document.caretRangeFromPoint?.(x, y);
            if (isValidRange(range)) return range;
            if (range) {
                // Pointer over an embed: drop right before/after it depending on the side.
                const element = range.startContainer.nodeType === 1 ? range.startContainer : range.startContainer.parentElement;
                const embed = element?.closest?.(".un-embed");
                if (embed && root.contains(embed)) {
                    const rect = embed.getBoundingClientRect();
                    const r = document.createRange();
                    if (x < rect.left + rect.width / 2) r.setStartBefore(embed);
                    else r.setStartAfter(embed);
                    r.collapse(true);
                    return r;
                }
            }
            return null;
        };

        const currentRange = () => {
            const sel = window.getSelection();
            if (sel?.rangeCount && isValidRange(sel.getRangeAt(0))) return sel.getRangeAt(0).cloneRange();
            if (isValidRange(savedRange)) return savedRange.cloneRange();
            return endRange();
        };

        const textBefore = (range) => {
            const r = document.createRange();
            r.setStart(root, 0);
            r.setEnd(range.startContainer, range.startOffset);
            return walk(r.cloneContents());
        };
        const textAfter = (range) => {
            const r = document.createRange();
            r.setStart(range.startContainer, range.startOffset);
            r.setEnd(root, root.childNodes.length);
            return walk(r.cloneContents());
        };

        // Insert embeds on their own lines at `range` and put the caret after them.
        const insertEmbeds = (range, embeds) => {
            const frag = document.createDocumentFragment();
            const before = textBefore(range);
            const after = textAfter(range);
            if (before && !before.endsWith("\n")) frag.appendChild(el("br"));
            embeds.forEach((embed, i) => {
                frag.appendChild(embed);
                if (i < embeds.length - 1) frag.appendChild(el("br"));
            });
            if (!after.startsWith("\n")) frag.appendChild(el("br"));
            const last = frag.lastChild;
            range.collapse(true);
            range.insertNode(frag);
            if (root.lastChild === last && last.nodeName === "BR") root.appendChild(el("br"));

            const sel = window.getSelection();
            const caret = document.createRange();
            caret.setStartAfter(last);
            caret.collapse(true);
            sel.removeAllRanges();
            sel.addRange(caret);
        };

        // ---- adding files -------------------------------------------------------
        const readAsDataURL = (file) => new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result);
            reader.onerror = () => reject(reader.error);
            reader.readAsDataURL(file);
        });
        const imageWidth = (src) => new Promise((resolve) => {
            const img = new Image();
            img.onload = () => resolve(img.naturalWidth || null);
            img.onerror = () => resolve(null);
            img.src = src;
        });

        const addFiles = async (fileList, range) => {
            const files = Array.from(fileList || []);
            if (!files.length) return;
            const target = isValidRange(range) ? range.cloneRange() : currentRange();
            const embeds = [];

            for (const file of files) {
                if (file.size > this.maxFileBytes) {
                    BdApi.UI.showToast(`${this.getLabel("too_big")} (${file.name}, ${this.formatBytes(file.size)} > ${this.formatBytes(this.maxFileBytes)})`, {type: "error"});
                    continue;
                }
                let data;
                try { data = await readAsDataURL(file); }
                catch (error) {
                    console.error("[UserNotes] Failed to read file:", error);
                    BdApi.UI.showToast(`UserNotes: cannot read ${file.name}`, {type: "error"});
                    continue;
                }

                const type = file.type || "application/octet-stream";
                const id = `att-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
                const att = {
                    name: file.name || (type.startsWith("image/") ? `capture-${new Date().toISOString().replace(/[:.]/g, "-")}.png` : "file"),
                    type,
                    size: file.size,
                    data,
                    added: Date.now()
                };
                doc.attachments[id] = att;

                let width = null;
                if (type.startsWith("image/")) {
                    const natural = await imageWidth(data);
                    if (natural) width = Math.min(natural, 480);
                }
                embeds.push(makeEmbed(id, att, width));
            }

            if (!embeds.length || !root.isConnected) return;
            insertEmbeds(isValidRange(target) ? target : endRange(), embeds);
        };

        on(addBtn, "click", () => fileInput.click());
        on(addBtn, "mousedown", (e) => e.preventDefault()); // keep the caret where it is
        on(fileInput, "change", () => { addFiles(fileInput.files, savedRange); fileInput.value = ""; });

        on(document, "selectionchange", () => {
            const sel = window.getSelection();
            if (sel?.rangeCount && isValidRange(sel.getRangeAt(0))) savedRange = sel.getRangeAt(0).cloneRange();
        });

        // ---- typing / pasting --------------------------------------------------
        on(root, "keydown", (e) => {
            if (selectedEmbed && (e.key === "Delete" || e.key === "Backspace")) {
                e.preventDefault();
                e.stopPropagation();
                removeEmbed(selectedEmbed);
                return;
            }
            if (selectedEmbed && !["Shift", "Control", "Alt", "Meta"].includes(e.key)) selectEmbed(null);

            if (e.key === "Enter") {
                // Plain line breaks (<br>) instead of Chromium's <div> blocks.
                e.preventDefault();
                e.stopPropagation();
                document.execCommand("insertLineBreak");
            }
        });

        on(body, "paste", (e) => {
            const files = Array.from(e.clipboardData?.files || []);
            e.preventDefault();
            e.stopPropagation();
            if (files.length) {
                addFiles(files, currentRange());
                return;
            }
            const plain = e.clipboardData?.getData("text/plain") || "";
            if (plain) {
                if (!isValidRange(window.getSelection()?.rangeCount ? window.getSelection().getRangeAt(0) : null)) root.focus();
                document.execCommand("insertText", false, plain);
            }
        });

        // Native drags of selected text could carry embeds as HTML: block them.
        on(root, "dragstart", (e) => { if (e.target?.closest?.(".un-embed")) e.preventDefault(); });

        // ---- moving / resizing embeds ----------------------------------------------
        let gesture = null;

        const showCaretAt = (range) => {
            let rect = range.getClientRects()[0] || range.getBoundingClientRect();
            if (!rect || (!rect.height && !rect.top)) {
                const probe = el("span", null, "​");
                range.insertNode(probe);
                rect = probe.getBoundingClientRect();
                const parent = probe.parentNode;
                probe.remove();
                parent?.normalize?.();
            }
            marker.style.display = "block";
            marker.style.left = `${rect.left - 1}px`;
            marker.style.top = `${rect.top}px`;
            marker.style.height = `${Math.max(16, rect.height)}px`;
        };

        on(root, "pointerdown", (e) => {
            const embed = e.target.closest?.(".un-embed");
            if (!embed) {
                selectEmbed(null);
                return;
            }
            if (e.target.closest("button, video, audio") || e.button !== 0) return;

            e.preventDefault();
            selectEmbed(embed);

            if (e.target.classList.contains("un-embed-resize")) {
                gesture = {kind: "resize", embed, sx: e.clientX, w: embed.getBoundingClientRect().width};
            } else {
                gesture = {kind: "move", embed, sx: e.clientX, sy: e.clientY, moved: false, range: null};
            }
            try { root.setPointerCapture(e.pointerId); } catch (_) {}
        });

        on(root, "pointermove", (e) => {
            if (!gesture) return;

            if (gesture.kind === "resize") {
                const max = Math.max(60, root.clientWidth - 24);
                const w = Math.round(Math.min(max, Math.max(60, gesture.w + e.clientX - gesture.sx)));
                gesture.embed.style.width = `${w}px`;
                gesture.embed.dataset.w = String(w);
                return;
            }

            if (!gesture.moved) {
                if (Math.hypot(e.clientX - gesture.sx, e.clientY - gesture.sy) < 5) return;
                gesture.moved = true;
                gesture.embed.classList.add("un-dragging");
                ghostHost.textContent = "";
                const img = gesture.embed.querySelector("img");
                if (img) {
                    const clone = el("img");
                    clone.src = img.src;
                    ghostHost.appendChild(clone);
                } else {
                    ghostHost.textContent = gesture.embed.querySelector(".un-file-name")?.textContent || "📎";
                }
                ghostHost.style.display = "block";
                root.classList.add("un-moving");
            }

            ghostHost.style.left = `${e.clientX + 12}px`;
            ghostHost.style.top = `${e.clientY + 12}px`;

            const range = rangeFromPoint(e.clientX, e.clientY);
            const insideSelf = range && (gesture.embed.contains(range.startContainer));
            if (range && !insideSelf) {
                gesture.range = range;
                showCaretAt(range);
            } else {
                gesture.range = null;
                marker.style.display = "none";
            }
        });

        const endGesture = (e) => {
            if (!gesture) return;
            const g = gesture;
            gesture = null;
            try { root.releasePointerCapture(e.pointerId); } catch (_) {}
            marker.style.display = "none";
            ghostHost.style.display = "none";
            root.classList.remove("un-moving");
            g.embed.classList.remove("un-dragging");

            if (g.kind === "move" && g.moved && g.range && e.type === "pointerup") {
                const range = g.range; // live range: stays valid while we detach the embed
                const marker0 = document.createComment("un");
                range.insertNode(marker0);
                detachEmbed(g.embed);
                const r = document.createRange();
                r.setStartBefore(marker0);
                r.collapse(true);
                marker0.remove();
                insertEmbeds(r, [g.embed]);
                selectEmbed(g.embed);
            }
        };
        on(root, "pointerup", endGesture);
        on(root, "pointercancel", endGesture);

        on(root, "dblclick", (e) => {
            const embed = e.target.closest?.(".un-embed");
            if (!embed) return;
            e.preventDefault();
            const att = doc.attachments[embed.dataset.att];
            if (!att) return;
            if ((att.type || "").startsWith("image/")) openLightbox(att);
            else if (!/^(video|audio)\//.test(att.type || "")) downloadAtt(att);
        });

        on(window, "keydown", (e) => {
            if (lightbox && e.key === "Escape") {
                e.preventDefault();
                e.stopPropagation();
                e.stopImmediatePropagation();
                closeLightbox();
            }
        }, true);

        // ---- drag & drop from the OS (anywhere in the window while the note is open) ----
        const isFileDrag = (e) => Array.from(e.dataTransfer?.types || []).includes("Files");
        const swallow = (e) => { e.preventDefault(); e.stopPropagation(); e.stopImmediatePropagation(); };
        const overEditor = (e) => {
            const rect = root.getBoundingClientRect();
            return e.clientX >= rect.left && e.clientX <= rect.right && e.clientY >= rect.top && e.clientY <= rect.bottom;
        };

        const onDragOver = (e) => {
            if (!isFileDrag(e)) return;
            swallow(e);
            e.dataTransfer.dropEffect = "copy";
            root.classList.add("un-drop");
            const range = overEditor(e) ? rangeFromPoint(e.clientX, e.clientY) : null;
            if (range) showCaretAt(range);
            else marker.style.display = "none";
        };
        on(window, "dragenter", onDragOver, true);
        on(window, "dragover", onDragOver, true);
        on(window, "dragleave", (e) => {
            if (!isFileDrag(e)) return;
            swallow(e);
            if (!e.relatedTarget) {
                root.classList.remove("un-drop");
                marker.style.display = "none";
            }
        }, true);
        on(window, "drop", (e) => {
            if (!isFileDrag(e)) return;
            swallow(e);
            root.classList.remove("un-drop");
            marker.style.display = "none";
            addFiles(e.dataTransfer.files, overEditor(e) ? rangeFromPoint(e.clientX, e.clientY) : null);
        }, true);

        // ---- init ----------------------------------------------------------------
        render(doc.text || "");
        requestAnimationFrame(() => {
            root.focus({preventScroll: true});
            const sel = window.getSelection();
            sel.removeAllRanges();
            sel.addRange(endRange());
        });

        return {
            serialize,
            destroy: () => {
                cleanups.forEach((fn) => fn());
                closeLightbox();
                marker.remove();
                ghostHost.remove();
            }
        };
    }

    formatBytes(bytes) {
        const n = Number(bytes) || 0;
        if (n < 1024) return `${n} B`;
        if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
        return `${(n / 1024 / 1024).toFixed(1)} MB`;
    }

    // ---------------------------------------------------------------------
    // File I/O - keeps the exact historical UserNotesData/*.txt format
    // ---------------------------------------------------------------------

    refreshNotedUsers() {
        this.notedUsers.clear();
        if (!this.fs.existsSync(this.notesDir)) return;

        try {
            for (const file of this.fs.readdirSync(this.notesDir)) {
                if (file.endsWith(".attachments.json")) {
                    // The attachment file only exists when it holds at least one item.
                    this.notedUsers.add(file.slice(0, -".attachments.json".length));
                    continue;
                }
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

    // Attachments live next to the note in UserNotesData/<userId>.attachments.json:
    // {version: 2, attachments: {<id>: {name, type, size, data: "data:<mime>;base64,...", added}}}
    // The note text references them with ![[<id>|<width>]].
    attachmentsPath(userId) {
        return this.path.join(this.notesDir, `${userId}.attachments.json`);
    }

    hasAttachments(userId) {
        try { return this.fs.existsSync(this.attachmentsPath(userId)); }
        catch (_) { return false; }
    }

    loadAttachments(userId) {
        const result = {attachments: {}, legacy: []};
        const filePath = this.attachmentsPath(userId);

        try {
            if (!this.fs.existsSync(filePath)) return result;
            const parsed = JSON.parse(this.fs.readFileSync(filePath, "utf8"));
            const clean = (att) => ({
                name: String(att.name || "file"),
                type: String(att.type || ""),
                size: Number(att.size) || 0,
                data: att.data,
                added: Number(att.added) || 0
            });
            const valid = (id, att) => /^[A-Za-z0-9_-]+$/.test(id) && att && typeof att.data === "string" && att.data.startsWith("data:");

            if (parsed?.attachments && typeof parsed.attachments === "object") {
                for (const [id, att] of Object.entries(parsed.attachments)) {
                    if (valid(id, att)) result.attachments[id] = clean(att);
                }
            } else if (Array.isArray(parsed?.items)) {
                // 2.9.0 canvas format: migrate, ordered top-to-bottom then left-to-right.
                const items = parsed.items
                    .filter((item) => item && valid(String(item.id), item))
                    .sort((a, b) => (Number(a.y) || 0) - (Number(b.y) || 0) || (Number(a.x) || 0) - (Number(b.x) || 0));
                for (const item of items) {
                    result.attachments[String(item.id)] = clean(item);
                    result.legacy.push(String(item.id));
                }
            }
        } catch (error) {
            console.error(`[UserNotes] Failed to load attachments for ${userId}:`, error);
            BdApi.UI.showToast("UserNotes: attachments file is unreadable", {type: "error"});
        }
        return result;
    }

    saveAttachments(userId, text, attachments) {
        const filePath = this.attachmentsPath(userId);
        const used = {};
        for (const match of String(text || "").matchAll(/!\[\[([A-Za-z0-9_-]+)(?:\|\d{1,4})?\]\]/g)) {
            if (attachments[match[1]]) used[match[1]] = attachments[match[1]];
        }

        try {
            if (!Object.keys(used).length) {
                if (this.fs.existsSync(filePath)) this.fs.unlinkSync(filePath);
                return true;
            }
            // Write to a temp file first so a crash never leaves a half-written JSON.
            const tmp = `${filePath}.tmp`;
            this.fs.writeFileSync(tmp, JSON.stringify({version: 2, attachments: used}), "utf8");
            this.fs.renameSync(tmp, filePath);
            return true;
        } catch (error) {
            console.error(`[UserNotes] Failed to save attachments for ${userId}:`, error);
            BdApi.UI.showToast("UserNotes: attachments save failed", {type: "error"});
            return false;
        }
    }

    deleteAllNotes() {
        if (!this.fs.existsSync(this.notesDir)) return;

        try {
            for (const file of this.fs.readdirSync(this.notesDir)) {
                if (file.endsWith(".txt") || file.endsWith(".attachments.json")) this.fs.unlinkSync(this.path.join(this.notesDir, file));
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
            remove_all_confirm: "Voulez-vous vraiment supprimer toutes les notes utilisateur (et leurs pièces jointes) ?",
            editor_hint: "Glissez un fichier ou collez une capture (Ctrl+V) là où vous voulez dans le texte · attrapez une image pour la déplacer",
            embed_tip: "Glisser pour déplacer · coin = redimensionner · double-clic = plein écran · Suppr = retirer",
            add_file: "Ajouter un fichier",
            download: "Télécharger",
            too_big: "Fichier trop volumineux"
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
            remove_all_confirm: "Are you sure you want to remove all user notes (and their attachments)?",
            editor_hint: "Drop a file or paste a screenshot (Ctrl+V) anywhere in the text · grab an image to move it",
            embed_tip: "Drag to move · corner = resize · double-click = full screen · Del = remove",
            add_file: "Add a file",
            download: "Download",
            too_big: "File too large"
        };

        return strings[key] || key;
    }
};
