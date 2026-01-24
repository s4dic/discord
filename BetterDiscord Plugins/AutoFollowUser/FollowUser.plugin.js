/**
 * @name AutoFollowUser
 * @author Sleek (patched)
 * @version 1.1.6
 * @description Ce plugin BetterDiscord vous permet de suivre automatiquement vos amis lorsqu'ils entrent dans un salon vocal, sans logs ni console.
 */

module.exports = class AutoFollowUser {
    constructor() {
        this.currentUser = null;
        this.followInterval = null;
        this.modalObserver = null;
        this.contextObserver = null;

        this.voiceStateStore = null;
        this.channelActions = null;

        this._menuCssInjected = false;
    }

    start() {
        this.injectMenuCSS();
        this.observeContextMenus();
        this.observeModals();
    }

    stop() {
        this.stopFollowInterval();
        this.disconnectModalObserver();
        this.disconnectContextObserver();
        this.removeMenuCSS();
    }

    // =========================
    // CSS (fix thème / invert)
    // =========================
    injectMenuCSS() {
        if (document.getElementById("autofollowuser-menu-css")) return;
        const style = document.createElement("style");
        style.id = "autofollowuser-menu-css";
        style.textContent = `
            /* Neutralise les filtres sur le menu utilisateur (thèmes invert/hue-rotate) */
            #user-context, #user-context * {
                filter: none !important;
                -webkit-filter: none !important;
                mix-blend-mode: normal !important;
            }

            /* Force texte blanc pour notre item */
            #auto-follow-context,
            #auto-follow-context * {
                color: #ffffff !important;
                -webkit-text-fill-color: #ffffff !important;
            }

            #auto-follow-context:hover {
                background: var(--menu-item-default-hover-bg) !important;
            }
            #auto-follow-context:hover,
            #auto-follow-context:hover * {
                color: #ffffff !important;
                -webkit-text-fill-color: #ffffff !important;
            }
        `;
        document.head.appendChild(style);
    }

    removeMenuCSS() {
        const style = document.getElementById("autofollowuser-menu-css");
        if (style) style.remove();
    }

    // =========================
    // Context menu observer
    // =========================
    observeContextMenus() {
        this.contextObserver = new MutationObserver((mutations) => {
            for (const mutation of mutations) {
                for (const node of mutation.addedNodes) {
                    if (node.nodeType !== 1) continue;

                    // On cherche le menu USER uniquement : #user-context
                    const userContext = node.id === "user-context"
                        ? node
                        : node.querySelector?.("#user-context");

                    if (!userContext) continue;

                    // Eviter double patch
                    if (userContext.querySelector("#auto-follow-context")) continue;

                    try {
                        this.injectContextMenuItem(userContext);
                    } catch (e) {
                        console.error("[AutoFollowUser] Error while injecting user context item:", e);
                    }
                }
            }
        });

        this.contextObserver.observe(document.body, { childList: true, subtree: true });
    }

    disconnectContextObserver() {
        if (this.contextObserver) {
            this.contextObserver.disconnect();
            this.contextObserver = null;
        }
    }

    // =========================
    // Injection (USER only)
    // =========================
    injectContextMenuItem(userContextMenuRoot) {
        // IMPORTANT: on n'accepte QUE props.user.id (menu utilisateur)
        const user = this.getUserFromReactFiber(userContextMenuRoot);
        if (!user?.id) return;

        const isFollowing = this.currentUser === user.id;
        const menuItem = this.createMenuItem(user.id, isFollowing);

        // Insertion propre dans un group, sinon fallback
        const groups = userContextMenuRoot.querySelectorAll('[role="group"]');
        const lastGroup = groups?.length ? groups[groups.length - 1] : null;

        if (lastGroup) {
            lastGroup.appendChild(menuItem);
        } else {
            // fallback: insertion après un item
            const firstItem = userContextMenuRoot.querySelector('[role="menuitem"]');
            if (firstItem?.parentNode) firstItem.parentNode.insertBefore(menuItem, firstItem.nextSibling);
            else userContextMenuRoot.appendChild(menuItem);
        }
    }

    createMenuItem(userId, isFollowing) {
        const item = document.createElement("div");
        item.className = "item_c91bad labelContainer_c91bad colorDefault_c91bad";
        item.setAttribute("role", "menuitem");
        item.setAttribute("tabindex", "-1");
        item.id = "auto-follow-context";

        // NOTE: couleur forcée via CSS injecté (pour survivre aux filtres)
        item.style.cssText = `
            background: transparent !important;
            padding: 6px 8px !important;
            min-height: 32px !important;
            display: flex !important;
            align-items: center !important;
            box-sizing: border-box !important;
            cursor: pointer !important;
        `;

        const text = isFollowing ? "📌 Unfollow this user" : "📌 Follow this user";
        item.innerHTML = `
            <div class="label_c91bad" style="color: inherit !important; flex: 1 1 auto;">
                ${text}
            </div>
        `;

        item.addEventListener("click", (e) => {
            // Ne PAS supprimer les layers à la main (ça casse React / menus)
            e.stopPropagation();
            this.toggleUserFollow(userId);
        });

        item.addEventListener("mouseenter", () => {
            item.classList.add("focused_c1e9c4");
            item.style.cssText = `
                background: var(--menu-item-default-hover-bg) !important;
                padding: 6px 8px !important;
                min-height: 32px !important;
                display: flex !important;
                align-items: center !important;
                box-sizing: border-box !important;
                cursor: pointer !important;
            `;
        });

        item.addEventListener("mouseleave", () => {
            item.classList.remove("focused_c1e9c4");
            item.style.cssText = `
                background: transparent !important;
                padding: 6px 8px !important;
                min-height: 32px !important;
                display: flex !important;
                align-items: center !important;
                box-sizing: border-box !important;
                cursor: pointer !important;
            `;
        });

        return item;
    }

    // Récupère {id, username/globalName} depuis Fiber DU MENU USER
    getUserFromReactFiber(element) {
        const fiber = this.getReactInstance(element);
        if (!fiber) return null;

        let f = fiber;
        let depth = 0;
        while (f && depth++ < 30) {
            const props = f.memoizedProps || f.pendingProps;

            // Ici on accepte UNIQUEMENT le user
            if (props?.user?.id) {
                return {
                    id: props.user.id,
                    name: props.user.username || props.user.globalName || "User",
                };
            }
            f = f.return;
        }
        return null;
    }

    getReactInstance(element) {
        for (const key in element) {
            if (key.startsWith("__reactFiber") || key.startsWith("__reactInternalInstance")) {
                return element[key];
            }
        }
        return null;
    }

    // =========================
    // Follow logic (fixed)
    // =========================
    toggleUserFollow(userId) {
        if (this.currentUser === userId) {
            this.currentUser = null;
            this.stopFollowInterval();
            BdApi.UI.showToast("❌ Auto-follow stopped", { type: "info" });
        } else {
            if (this.currentUser) this.stopFollowInterval();
            this.currentUser = userId;
            this.startFollowInterval();
            BdApi.UI.showToast("✅ Auto-follow started", { type: "success" });
        }
    }

    findVoiceSelectorActions() {
        const W = BdApi.Webpack;

        // 1) Tentative directe (anciennes clés)
        let actions =
            W.getByKeys?.("selectVoiceChannel", "selectChannel") ||
            W.getByKeys?.("selectVoiceChannel") ||
            W.getByKeys?.("selectChannel");

        // 2) Fallback: chercher un module exportant une fonction qui ressemble
        if (!actions || (typeof actions.selectVoiceChannel !== "function" && typeof actions.selectChannel !== "function")) {
            actions = W.getModule?.(
                (m) =>
                    m &&
                    (typeof m.selectVoiceChannel === "function" ||
                     typeof m.selectVoiceChannelById === "function" ||
                     typeof m.selectChannel === "function"),
                { searchExports: true }
            );
        }

        // Normaliser le nom de fonction si Discord l’a renommée
        if (actions && typeof actions.selectVoiceChannelById === "function" && typeof actions.selectVoiceChannel !== "function") {
            actions.selectVoiceChannel = actions.selectVoiceChannelById;
        }

        return actions || null;
    }

    startFollowInterval() {
        const W = BdApi.Webpack;

        this.voiceStateStore =
            this.voiceStateStore ||
            W.getStore?.("VoiceStateStore") ||
            W.getByKeys?.("getVoiceStateForUser");

        this.channelActions = this.channelActions || this.findVoiceSelectorActions();

        if (!this.voiceStateStore || !this.channelActions) {
            console.error("[AutoFollowUser] Failed to get VoiceStateStore or ChannelActions", {
                voiceStateStore: this.voiceStateStore,
                channelActions: this.channelActions,
            });
            BdApi.UI.showToast("❌ Auto-follow error: Discord API changed", { type: "error" });
            return;
        }

        if (this.followInterval) clearInterval(this.followInterval);

        this.followInterval = setInterval(() => {
            if (!this.currentUser) return;

            const vs = this.voiceStateStore.getVoiceStateForUser?.(this.currentUser);
            if (vs?.channelId) {
                // Certains builds utilisent selectVoiceChannel, d'autres selectChannel
                if (typeof this.channelActions.selectVoiceChannel === "function") {
                    this.channelActions.selectVoiceChannel(vs.channelId);
                } else if (typeof this.channelActions.selectChannel === "function") {
                    this.channelActions.selectChannel(vs.channelId);
                }
            }
        }, 1000);
    }

    stopFollowInterval() {
        if (this.followInterval) {
            clearInterval(this.followInterval);
            this.followInterval = null;
        }
    }

    // =========================
    // Modal observer (full)
    // =========================
    observeModals() {
        this.modalObserver = new MutationObserver((mutations) => {
            for (const m of mutations) {
                for (const n of m.addedNodes) {
                    if (n.nodeType !== 1) continue;
                    if (!n.querySelector?.('div[role="dialog"]')) continue;

                    const t = n.textContent;
                    if (t && (t.includes("CHANNEL IS FULL") || t.includes("max number of people"))) {
                        this.stopFollowInterval();
                        this.currentUser = null;
                        BdApi.UI.showToast("❌ Channel full - Auto-follow stopped", { type: "error" });
                        return;
                    }
                }
            }
        });

        this.modalObserver.observe(document.body, { childList: true, subtree: true });
    }

    disconnectModalObserver() {
        if (this.modalObserver) {
            this.modalObserver.disconnect();
            this.modalObserver = null;
        }
    }
};
