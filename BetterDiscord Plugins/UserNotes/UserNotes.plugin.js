/**
 * @name UserNotes
 * @author DevilBro & Sleek
 * @authorId 108351165988618240
 * @version 2.3
 * @description Allows you to write User Notes locally (File-based storage with dynamic modal) + autosave on outside click + forces context label color
 * @invite B5kBdSsED2
 * @website https://github.com/s4dic/discord
 * @source https://github.com/s4dic/discord/tree/main/BetterDiscord%20Plugins/UserNotes/
 * @updateUrl https://github.com/s4dic/discord/tree/main/BetterDiscord%20Plugins/UserNotes/UserNotes.plugin.js
 */

module.exports = (_ => {
    const changeLog = {};

    return !window.BDFDB_Global || (!window.BDFDB_Global.loaded && !window.BDFDB_Global.started) ? class {
        constructor (meta) {for (let key in meta) this[key] = meta[key];}
        getName () {return this.name;}
        getAuthor () {return this.author;}
        getVersion () {return this.version;}
        getDescription () {return `The Library Plugin needed for ${this.name} is missing. Open the Plugin Settings to download it. \n\n${this.description}`;}

        downloadLibrary () {
            BdApi.Net.fetch("https://mwittrien.github.io/BetterDiscordAddons/Library/0BDFDB.plugin.js").then(r => {
                if (!r || r.status != 200) throw new Error();
                else return r.text();
            }).then(b => {
                if (!b) throw new Error();
                else return require("fs").writeFile(
                    require("path").join(BdApi.Plugins.folder, "0BDFDB.plugin.js"),
                    b,
                    _ => BdApi.UI.showToast("Finished downloading BDFDB Library", {type: "success"})
                );
            }).catch(_error => {
                BdApi.UI.alert("Error", "Could not download BDFDB Library Plugin. Try again later or download it manually from GitHub: https://mwittrien.github.io/downloader/?library");
            });
        }

        load () {
            if (!window.BDFDB_Global || !Array.isArray(window.BDFDB_Global.pluginQueue))
                window.BDFDB_Global = Object.assign({}, window.BDFDB_Global, {pluginQueue: []});
            if (!window.BDFDB_Global.downloadModal) {
                window.BDFDB_Global.downloadModal = true;
                BdApi.UI.showConfirmationModal("Library Missing", `The Library Plugin needed for ${this.name} is missing. Please click "Download Now" to install it.`, {
                    confirmText: "Download Now",
                    cancelText: "Cancel",
                    onCancel: _ => {delete window.BDFDB_Global.downloadModal;},
                    onConfirm: _ => {
                        delete window.BDFDB_Global.downloadModal;
                        this.downloadLibrary();
                    }
                });
            }
            if (!window.BDFDB_Global.pluginQueue.includes(this.name))
                window.BDFDB_Global.pluginQueue.push(this.name);
        }
        start () {this.load();}
        stop () {}
        getSettingsPanel () {
            let template = document.createElement("template");
            template.innerHTML = `<div style="color: var(--header-primary); font-size: 16px; font-weight: 300; white-space: pre; line-height: 22px;">The Library Plugin needed for ${this.name} is missing.\nPlease click <a style="font-weight: 500;">Download Now</a> to install it.</div>`;
            template.content.firstElementChild.querySelector("a").addEventListener("click", this.downloadLibrary);
            return template.content.firstElementChild;
        }
    } : (([Plugin, BDFDB]) => {
        const path = require("path");
        const fs = require("fs");

        return class UserNotes extends Plugin {
            onLoad () {
                this.notesDir = path.join(BdApi.Plugins.folder, "UserNotesData");
                this.labels = this.setLabelsByLanguage();
            }

            onStart () {
                if (!fs.existsSync(this.notesDir)) {
                    fs.mkdirSync(this.notesDir, { recursive: true });
                }
                this.injectMenuCSS();   // ✅ NEW: force context menu item color
                this.patchContextMenu();
            }

            onStop () {
                const customStyle = document.getElementById("usernotes-custom-css");
                if (customStyle) customStyle.remove();

                const menuStyle = document.getElementById("usernotes-menu-css");
                if (menuStyle) menuStyle.remove();

                if (this.observer) {
                    this.observer.disconnect();
                    this.observer = null;
                }
            }

            // safer than BDFDB.LanguageUtils.LanguageStrings.* when Discord changes placeholders
            getLangStringSafe(key, fallback) {
                try {
                    const v = BDFDB?.LanguageUtils?.LanguageStrings?.[key];
                    if (typeof v === "string" && v.trim()) return v;
                } catch (_) {}
                return fallback;
            }

            // ✅ Hard-force colors for the injected context menu item (theme-proof)
            injectMenuCSS () {
                if (document.getElementById("usernotes-menu-css")) return;
                const style = document.createElement("style");
                style.id = "usernotes-menu-css";
                style.textContent = `
                    /* 1) Neutralise tout filtre appliqué AU MENU (souvent la cause du "blanc -> noir") */
                    #user-context, #user-context * {
                        filter: none !important;
                        -webkit-filter: none !important;
                        mix-blend-mode: normal !important;
                    }

                    /* 2) Force la couleur en BLANC pour l'item (et ses enfants) */
                    #user-note-context,
                    #user-note-context * {
                        color: #ffffff !important;
                        -webkit-text-fill-color: #ffffff !important;
                    }

                    /* Hover */
                    #user-note-context:hover {
                        background: var(--menu-item-default-hover-bg) !important;
                    }
                    #user-note-context:hover,
                    #user-note-context:hover * {
                        color: #ffffff !important;
                        -webkit-text-fill-color: #ffffff !important;
                    }
                `;
                document.head.appendChild(style);
            }

            patchContextMenu() {
                this.observer = new MutationObserver((mutations) => {
                    for (const mutation of mutations) {
                        for (const node of mutation.addedNodes) {
                            if (node.nodeType !== 1) continue;

                            const menu = node.id === "user-context"
                                ? node
                                : node.querySelector && node.querySelector("#user-context");

                            if (menu && !menu.dataset.userNotesPatched) {
                                menu.dataset.userNotesPatched = "true";
                                try { this.injectMenuItem(menu); }
                                catch (e) { console.error("[UserNotes] Error while injecting menu item:", e); }
                            }
                        }
                    }
                });

                this.observer.observe(document.body, { childList: true, subtree: true });
            }

            injectMenuItem(menu) {
                const reactFiberKey = Object.keys(menu).find(k => k.startsWith("__reactFiber") || k.startsWith("__reactContainer"));
                if (!reactFiberKey) return;

                let userId = null;
                let userName = "User";

                let fiber = menu[reactFiberKey];
                let maxDepth = 40;
                while (fiber && maxDepth-- > 0) {
                    const props = fiber.memoizedProps || fiber.pendingProps;
                    if (props?.user?.id) {
                        userId = props.user.id;
                        userName = props.user.username || props.user.globalName || "User";
                        break;
                    }
                    fiber = fiber.return;
                }
                if (!userId) return;

                const note = this.loadNote(userId);
                const hasNote = note && note.trim() !== "";

                const groups = menu.querySelectorAll('[role="group"]');
                if (!groups || !groups.length) return;

                const lastGroup = groups[groups.length - 1];
                if (!lastGroup || !lastGroup.parentNode) return;

                // avoid duplicates if Discord reuses DOM nodes
                if (menu.querySelector("#user-note-context")) return;

                const noteItem = this.createMenuItem(userId, userName, hasNote);
                if (!noteItem) return;

                const newGroup = document.createElement("div");
                newGroup.setAttribute("role", "group");
                newGroup.appendChild(noteItem);

                const separator = document.createElement("div");
                separator.className = "separator_c9dda3";
                separator.setAttribute("role", "separator");

                if (!lastGroup.parentNode) return;
                lastGroup.parentNode.insertBefore(separator, lastGroup.nextSibling);
                if (!separator.parentNode) return;
                separator.parentNode.insertBefore(newGroup, separator.nextSibling);
            }

            createMenuItem(userId, userName, hasNote) {
                const item = document.createElement("div");
                item.className = "item_c91bad labelContainer_c91bad colorDefault_c91bad";
                item.setAttribute("role", "menuitem");
                item.setAttribute("tabindex", "-1");
                item.id = "user-note-context";

                const labelText = (this.labels && this.labels.user_note) || "User Note";

                item.style.cssText = `
                    background: transparent !important;
                    padding: 6px 8px !important;
                    min-height: 32px !important;
                    display: flex !important;
                    align-items: center !important;
                    box-sizing: border-box !important;
                `;

                item.innerHTML = `
                    <div style="flex: 1 1 auto;">🕵️ ${labelText}</div>
                    ${hasNote ? '<div>✓</div>' : ""}
                `;

                item.addEventListener("click", (e) => {
                    e.stopPropagation();
                    this.openNotesModal({ id: userId, username: userName });
                });

                // optional: keep Discord "focused" behavior
                item.addEventListener("mouseenter", () => item.classList.add("focused_c1e9c4"));
                item.addEventListener("mouseleave", () => item.classList.remove("focused_c1e9c4"));

                return item;
            }

            getSettingsPanel (collapseStates = {}) {
                return BDFDB.PluginUtils.createSettingsPanel(this, {
                    collapseStates,
                    children: _ => {
                        const settingsItems = [];
                        settingsItems.push(BDFDB.ReactUtils.createElement(BDFDB.LibraryComponents.SettingsItem, {
                            type: "Button",
                            color: BDFDB.LibraryComponents.Button.Colors.RED,
                            label: "Remove all Notes",
                            onClick: _ => {
                                BDFDB.ModalUtils.confirm(this, "Are you sure you want to remove all usernotes?", _ => {
                                    this.deleteAllNotes();
                                });
                            },
                            children: BDFDB.LanguageUtils.LanguageStrings.REMOVE
                        }));
                        return settingsItems;
                    }
                });
            }

            openNotesModal (user) {
                if (!user || !user.id) return;

                let note = this.loadNote(user.id);
                const initialNote = note;
                let preventAutoSave = false;

                const screenHeight = window.innerHeight;
                const modalHeight = Math.floor(screenHeight * 0.7);
                const textareaRows = Math.max(6, Math.floor((modalHeight - 150) / 20));

                this.injectCustomCSS();

                const SAVE_TEXT = this.getLangStringSafe("SAVE", "Save");
                const CANCEL_TEXT = this.getLangStringSafe("CANCEL", "Cancel");

                const tryAutoSave = () => {
                    if (preventAutoSave) return;
                    const a = (initialNote ?? "").trimEnd();
                    const b = (note ?? "").trimEnd();
                    if (a === b) return;
                    try { this.saveNote(user.id, note); }
                    catch (e) { console.error("[UserNotes] autosave failed:", e); }
                };

                BDFDB.ModalUtils.open(this, {
                    size: "LARGE",
                    header: "User Note",
                    subHeader: user.username,
                    className: "usernotes-modal-custom",
                    onClose: () => tryAutoSave(),
                    children: [
                        BDFDB.ReactUtils.createElement(BDFDB.LibraryComponents.TextArea, {
                            value: note,
                            placeholder: "Write your note here...",
                            autoFocus: true,
                            rows: textareaRows,
                            maxLength: 50000,
                            onChange: value => note = value,
                            style: {
                                minHeight: `${modalHeight - 200}px`,
                                fontSize: "14px",
                                lineHeight: "1.5"
                            }
                        })
                    ],
                    buttons: [{
                        contents: SAVE_TEXT,
                        color: "BRAND",
                        close: true,
                        onClick: _ => {
                            preventAutoSave = true;
                            this.saveNote(user.id, note);
                        }
                    }, {
                        contents: CANCEL_TEXT,
                        color: "TRANSPARENT",
                        close: true,
                        onClick: _ => {
                            preventAutoSave = true; // discard changes
                        }
                    }]
                });
            }

            injectCustomCSS () {
                if (document.getElementById("usernotes-custom-css")) return;
                const style = document.createElement("style");
                style.id = "usernotes-custom-css";
                style.textContent = `
                    .usernotes-modal-custom textarea {
                        font-family: 'Consolas', 'Monaco', 'Courier New', monospace !important;
                        resize: vertical;
                    }
                `;
                document.head.appendChild(style);
            }

            loadNote (userId) {
                const notePath = path.join(this.notesDir, `${userId}.txt`);
                if (fs.existsSync(notePath)) return fs.readFileSync(notePath, "utf8");
                return "";
            }

            saveNote (userId, content) {
                const notePath = path.join(this.notesDir, `${userId}.txt`);
                if (!content || content.trim() === "") {
                    if (fs.existsSync(notePath)) {
                        fs.unlinkSync(notePath);
                        BDFDB.NotificationUtils.toast("Note removed", {type: "success"});
                    }
                } else {
                    fs.writeFileSync(notePath, content, "utf8");
                    BDFDB.NotificationUtils.toast("Note saved", {type: "success"});
                }
            }

            deleteAllNotes () {
                if (!fs.existsSync(this.notesDir)) return;
                const files = fs.readdirSync(this.notesDir);
                files.forEach(file => {
                    if (file.endsWith(".txt")) fs.unlinkSync(path.join(this.notesDir, file));
                });
                BDFDB.NotificationUtils.toast("All notes removed", {type: "success"});
            }

            setLabelsByLanguage () {
                switch (BDFDB.LanguageUtils.getLanguage().id) {
                    case "bg": return { user_note: "Потребителска бележка" };
                    case "cs": return { user_note: "Uživatelská poznámka" };
                    case "da": return { user_note: "Brugernote" };
                    case "de": return { user_note: "Benutzernotiz" };
                    case "el": return { user_note: "Σημείωση χρήστη" };
                    case "es": return { user_note: "Nota de usuario" };
                    case "fi": return { user_note: "Käyttäjän muistiinpano" };
                    case "fr": return { user_note: "Note utilisateur" };
                    case "hi": return { user_note: "उपयोगकर्ता नोट" };
                    case "hr": return { user_note: "Korisnička bilješka" };
                    case "hu": return { user_note: "Felhasználói jegyzet" };
                    case "it": return { user_note: "Nota utente" };
                    case "ja": return { user_note: "ユーザーノート" };
                    case "ko": return { user_note: "사용자 메모" };
                    case "lt": return { user_note: "Vartotojo pastaba" };
                    case "nl": return { user_note: "Gebruikersnotitie" };
                    case "no": return { user_note: "Brukermerknad" };
                    case "pl": return { user_note: "Uwaga użytkownika" };
                    case "pt-BR": return { user_note: "Nota do usuário" };
                    case "ro": return { user_note: "Notă utilizator" };
                    case "ru": return { user_note: "Примечание пользователя" };
                    case "sv": return { user_note: "Användaranteckning" };
                    case "th": return { user_note: "หมายเหตุผู้ใช้" };
                    case "tr": return { user_note: "Kullanıcı notu" };
                    case "uk": return { user_note: "Примітка користувача" };
                    case "vi": return { user_note: "Ghi chú của người dùng" };
                    case "zh-CN": return { user_note: "用户须知" };
                    case "zh-TW": return { user_note: "用戶須知" };
                    default: return { user_note: "User Note" };
                }
            }
        };
    })(window.BDFDB_Global.PluginUtils.buildPlugin(changeLog));
})();
