/**
 * @name AutoFollowUser
 * @author Sleek
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
    }

    start() {
        this.observeContextMenus();
        this.observeModals();
    }

    stop() {
        this.stopFollowInterval();
        this.disconnectModalObserver();
        this.disconnectContextObserver();
    }

    observeContextMenus() {
        this.contextObserver = new MutationObserver(mutations => {
            for (const mutation of mutations) {
                for (const node of mutation.addedNodes) {
                    if (node.nodeType === 1) {
                        // Détection de TOUS les types de menus contextuels
                        const menu = node.querySelector?.('[role="menu"]') ||
                                   (node.getAttribute?.('role') === 'menu' ? node : null);
                        
                        if (menu && !menu.querySelector('#auto-follow-context')) {
                            this.injectContextMenuItem(menu);
                        }
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

    injectContextMenuItem(contextMenu) {
        if (contextMenu.dataset?.autoFollowInjected) return; // Évite les doubles injections

        // 1. Trouver userId très tôt (ta fonction existante)
        let userId = null;
        let fiber = this.getReactInstance(contextMenu);
        let attempts = 0;

        let isUserMenu = false;
        let isMessageMenu = false;
        let isGuildMenu = false;

        while (fiber && attempts < 70) {  // Augmente un peu si besoin
            const props = fiber.memoizedProps || fiber.pendingProps || {};
            const typeName = fiber.type?.displayName || fiber.type?.name || "";

            // Détection du type de menu (les noms changent parfois, mais ces patterns tiennent longtemps)
            if (typeName.includes("User") && !typeName.includes("Message") && (props.user || props.userId)) {
                isUserMenu = true;
            }
            if (typeName.includes("Message") || props.message || props.targetMessage || props.messageId) {
                isMessageMenu = true;
            }
            if (typeName.includes("Guild") || typeName.includes("Server") || props.guild || props.guildId) {
                isGuildMenu = true;
            }

            // Récup userId en même temps
            if (!userId) {
                if (props?.user?.id) userId = props.user.id;
                else if (props?.userId) userId = props.userId;
                else if (props?.channel?.recipients?.[0]) userId = props.channel.recipients[0];
            }

            fiber = fiber.return;
            attempts++;
        }

        // Règle stricte : ON N'INJECTE QUE si c'est clairement un menu USER et PAS les autres
        if (!userId || !isUserMenu || isMessageMenu || isGuildMenu) {
            return;
        }

        // Sécurité supplémentaire : pas soi-même, pas bot
        const currentUserId = BdApi.Webpack.getModule(m => m.getCurrentUser)?.().id;
        if (userId === currentUserId) return;

        const userModule = BdApi.Webpack.getModule(m => m.getUser);
        const user = userModule?.getUser?.(userId);
        if (!user || user.bot) return;

        // Ok, c'est bon → on injecte !
        if (contextMenu.querySelector('#auto-follow-context')) return;

        const isFollowing = this.currentUser === userId;
        const menuItem = this.createMenuItem(userId, isFollowing);

        // Insertion (ta logique existante ou améliorée)
        const firstGroup = contextMenu.querySelector('[role="group"]');
        if (firstGroup) {
            firstGroup.appendChild(menuItem);
        } else {
            contextMenu.appendChild(menuItem); // ou insertBefore comme avant
        }

        // Marquer pour éviter ré-essais inutiles
        contextMenu.dataset.autoFollowInjected = "true";
    }

    createMenuItem(userId, isFollowing) {
        const item = document.createElement('div');
        item.className = 'item_c91bad labelContainer_c91bad colorDefault_c91bad';
        item.setAttribute('role', 'menuitem');
        item.setAttribute('tabindex', '-1');
        item.id = 'auto-follow-context';
        
        item.style.cssText = `
            background: transparent !important; 
            color: white !important;
            padding: 6px 8px !important;
            min-height: 32px !important;
            display: flex !important;
            align-items: center !important;
            box-sizing: border-box !important;
            cursor: pointer !important;
        `;
        
        item.innerHTML = `
            <div class="label_c91bad" style="color: inherit !important; flex: 1 1 auto;">
                ${isFollowing ? '📌 UnFollow this user' : '📌 Follow this user'}
            </div>
        `;
        
        item.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            
            // Ferme TOUS les menus contextuels ouverts
            document.querySelectorAll('[role="menu"]').forEach(m => {
                const layer = m.closest('[class*="layer"]');
                if (layer) layer.remove();
                else m.remove();
            });
            
            this.toggleUserFollow(userId);
        });
        
        item.addEventListener('mouseenter', () => {
            item.classList.add('focused_c1e9c4');
            item.style.cssText = `
                background: var(--menu-item-default-hover-bg) !important; 
                color: white !important;
                padding: 6px 8px !important;
                min-height: 32px !important;
                display: flex !important;
                align-items: center !important;
                box-sizing: border-box !important;
                cursor: pointer !important;
            `;
        });
        
        item.addEventListener('mouseleave', () => {
            item.classList.remove('focused_c1e9c4');
            item.style.cssText = `
                background: transparent !important; 
                color: white !important;
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

    getReactInstance(element) {
        for (const key in element) {
            if (key.startsWith('__reactInternalInstance') || key.startsWith('__reactFiber')) {
                return element[key];
            }
        }
        return null;
    }

    toggleUserFollow(userId) {
        if (this.currentUser === userId) {
            this.currentUser = null;
            this.stopFollowInterval();
            BdApi.UI.showToast('❌ Auto-follow stopped', { type: 'info' });
        } else {
            if (this.currentUser) this.stopFollowInterval();
            this.currentUser = userId;
            this.startFollowInterval();
            BdApi.UI.showToast('✅ Auto-follow started', { type: 'success' });
        }
    }

    startFollowInterval() {
        // On utilise la nouvelle API Webpack de BetterDiscord
        this.voiceStateStore =
            this.voiceStateStore ||
            BdApi.Webpack.getStore("VoiceStateStore") ||
            BdApi.Webpack.getByKeys("getVoiceStateForUser");

        this.channelActions =
            this.channelActions ||
            BdApi.Webpack.getByKeys("selectVoiceChannel", "selectChannel");

        if (!this.voiceStateStore || !this.channelActions) {
            console.error("[AutoFollowUser] Failed to get VoiceStateStore or ChannelActions", {
                voiceStateStore: this.voiceStateStore,
                channelActions: this.channelActions
            });
            BdApi.UI.showToast('❌ Auto-follow error: Discord API changed', { type: 'error' });
            return;
        }

        // On évite les doublons d’intervalle
        if (this.followInterval) {
            clearInterval(this.followInterval);
        }

        this.followInterval = setInterval(() => {
            if (!this.currentUser) return;

            const vs = this.voiceStateStore.getVoiceStateForUser?.(this.currentUser);
            if (vs && vs.channelId) {
                this.channelActions.selectVoiceChannel?.(vs.channelId);
            }
        }, 1000);
    }

    stopFollowInterval() {
        if (this.followInterval) {
            clearInterval(this.followInterval);
            this.followInterval = null;
        }
    }

    observeModals() {
        this.modalObserver = new MutationObserver(m => {
            for (let a of m) {
                for (let n of a.addedNodes) {
                    if (n.nodeType === 1 && n.querySelector?.('div[role="dialog"]')) {
                        const t = n.textContent;
                        if (t && (t.includes('CHANNEL IS FULL') || t.includes('max number of people'))) {
                            this.stopFollowInterval();
                            this.currentUser = null;
                            BdApi.UI.showToast('❌ Channel full - Auto-follow stopped', { type: 'error' });
                            return;
                        }
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
