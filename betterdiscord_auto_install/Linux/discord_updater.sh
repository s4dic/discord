#!/bin/bash

# Vérifie que le script n'est pas exécuté en root (on veut un lancement utilisateur)
if [ "$(id -u)" -eq 0 ]; then
    echo "Erreur : ce script ne doit pas être exécuté en tant que root."
    exit 1
fi

# ============================================================================
# BLOC DE VÉRIFICATION ET INSTALLATION DES DÉPENDANCES
# ============================================================================

echo "Vérification des dépendances..."

REQUIRED_PACKAGES=("curl" "x11-utils" "libnotify-bin" "polkitd" "pkexec")
MISSING_PACKAGES=()

for package in "${REQUIRED_PACKAGES[@]}"; do
    if ! dpkg-query -W -f='${Status}' "$package" 2>/dev/null | grep -q "install ok installed"; then
        MISSING_PACKAGES+=("$package")
    fi
done

if ! command -v betterdiscordctl &>/dev/null; then
    echo "Avertissement : betterdiscordctl n'est pas installé ou non disponible dans le PATH."
    echo "Installation automatique de betterdiscordctl..."
    BETTERDISCORD_TMP="/tmp/betterdiscordctl"
    if curl -fsSL -o "$BETTERDISCORD_TMP" https://raw.githubusercontent.com/bb010g/betterdiscordctl/master/betterdiscordctl; then
        chmod +x "$BETTERDISCORD_TMP"
        if pkexec mv "$BETTERDISCORD_TMP" /usr/local/bin/betterdiscordctl; then
            echo "✓ betterdiscordctl installé avec succès"
        else
            echo "✗ Échec de l'installation de betterdiscordctl (élévation refusée)"
            rm -f "$BETTERDISCORD_TMP"
            exit 1
        fi
    else
        echo "✗ Échec du téléchargement de betterdiscordctl"
        exit 1
    fi
fi

if [ ${#MISSING_PACKAGES[@]} -gt 0 ]; then
    echo "Paquets manquants détectés : ${MISSING_PACKAGES[*]}"
    if pkexec apt update && pkexec apt install -y "${MISSING_PACKAGES[@]}"; then
        echo "✓ Toutes les dépendances ont été installées avec succès"
    else
        echo "✗ Échec de l'installation des dépendances"
        exit 1
    fi
else
    echo "✓ Toutes les dépendances sont déjà installées"
fi

# ============================================================================

if [ -z "$DISPLAY" ]; then
    export DISPLAY=:0
fi

# ============================================================================
# Détection dynamique du dossier modules pour Canary (new updater)
# Renvoie le chemin parent qui contient 'discord_desktop_core/'
# ============================================================================
detect_canary_modules_dir() {
    local base="$HOME/.config/discordcanary"
    # 1) Cherche n'importe quel dossier contenant 'discord_desktop_core' (sous-dossier exact)
    local found
    found=$(find "$base" -maxdepth 5 -type d -name 'discord_desktop_core' 2>/dev/null \
            | sort -V | tail -n1)
    if [ -n "$found" ]; then
        # On veut le PARENT de discord_desktop_core
        dirname "$found"
        return 0
    fi
    return 1
}

# Wrapper d'appel betterdiscordctl pour Canary avec auto-découverte + retry
run_bd_canary() {
    local action="$1"   # install | reinstall | status
    local modules_dir
    modules_dir=$(detect_canary_modules_dir)

    if [ -z "$modules_dir" ]; then
        echo "→ Canary : dossier 'discord_desktop_core' introuvable."
        echo "  Lancement de DiscordCanary pour qu'il télécharge ses modules..."
        "$DISCORD_BINARY" --force-device-scale-factor=1.1 &>/dev/null &
        local launched_pid=$!
        # On attend jusqu'à 60s que le module apparaisse
        local i=0
        while [ $i -lt 60 ]; do
            sleep 2
            modules_dir=$(detect_canary_modules_dir)
            [ -n "$modules_dir" ] && break
            i=$((i+2))
        done
        # Couper Discord pour pouvoir patcher
        local pid
        pid=$(get_discord_pid)
        if [ -n "$pid" ]; then
            kill "$pid" 2>/dev/null || true
            sleep 2
            kill -9 "$pid" 2>/dev/null || true
        fi
    fi

    if [ -z "$modules_dir" ]; then
        echo "✗ Impossible de localiser discord_desktop_core pour Canary."
        notify-send 'BetterDiscord' "Échec : modules Canary introuvables."
        return 1
    fi

    echo "→ Modules Canary détectés : $modules_dir"
    betterdiscordctl -f canary -m "$modules_dir" "$action"
}

# Configuration selon le type
MODE="${1:-stable}"

if [ "$MODE" = "canary" ]; then
    echo "Mode Discord Canary activé"
    IS_CANARY=1
    PROCESS_NAME="DiscordCanary"
    DISCORD_PACKAGE="discord-canary"
    DISCORD_API_URL="https://discord.com/api/download/canary?platform=linux&format=deb"
    DISCORD_DEB_URL="https://discord.com/api/download/canary?platform=linux&format=deb"
    BETTERDISCORD_CMD="betterdiscordctl -f canary"
    ICON_PATH="/usr/share/discord-canary/discord.png"

    # Détection du binaire Canary
    DISCORD_BINARY=""
    for cand in \
        /usr/bin/discord-canary \
        /opt/DiscordCanary/DiscordCanary \
        /usr/share/discord-canary/DiscordCanary; do
        [ -x "$cand" ] && DISCORD_BINARY="$cand" && break
    done
    if [ -z "$DISCORD_BINARY" ]; then
        echo "✗ Binaire DiscordCanary introuvable"
        exit 1
    fi
else
    echo "Mode Discord Stable activé"
    IS_CANARY=0
    PROCESS_NAME="Discord"
    DISCORD_PACKAGE="discord"
    DISCORD_API_URL="https://discord.com/api/download?platform=linux&format=deb"
    DISCORD_DEB_URL="https://discord.com/api/download?platform=linux&format=deb"
    BETTERDISCORD_CMD="betterdiscordctl"
    ICON_PATH="/usr/share/discord/discord.png"
    DISCORD_BINARY="/usr/bin/discord"
fi

echo "→ Binaire utilisé : $DISCORD_BINARY"

# Helper unifié : appelle soit la fonction Canary, soit la commande Stable
bd_run() {
    local action="$1"
    if [ "$IS_CANARY" -eq 1 ]; then
        run_bd_canary "$action"
    else
        $BETTERDISCORD_CMD "$action"
    fi
}

get_discord_pid() {
    pgrep -x "$PROCESS_NAME" | head -n1
}

wait_for_discord_window() {
    local timeout=${1:-60}
    local counter=0
    echo "Attente de l'ouverture d'une fenêtre Discord (timeout: ${timeout}s)..."
    while [ $counter -lt $timeout ]; do
        if xwininfo -name "Friends - Discord" &>/dev/null || xwininfo -name "Amis - Discord" &>/dev/null; then
            echo "Fenêtre Discord détectée après ${counter}s"
            return 0
        fi
        sleep 2
        counter=$((counter + 2))
    done
    echo "Timeout atteint (${timeout}s)"
    return 1
}

install_betterdiscord() {
    echo "Fermeture de Discord pour installation de BetterDiscord..."
    discord_pid=$(get_discord_pid)
    if [ -n "$discord_pid" ]; then
        kill "$discord_pid" 2>/dev/null || true
        sleep 2
        kill -9 "$discord_pid" 2>/dev/null || true
    fi
    sleep 3

    echo "Installation/réinstallation de BetterDiscord..."
    bd_run install
    bd_run reinstall

    notify-send 'BetterDiscord' "Installation de BetterDiscord terminée avec succès."

    echo "Lancement final de Discord avec BetterDiscord..."
    DISPLAY=$DISPLAY "$DISCORD_BINARY" --force-device-scale-factor=1.1 &
}

get_installed_version() {
    dpkg-query -W -f='${Version}\n' "$DISCORD_PACKAGE" 2>/dev/null | tr -d '[:space:]'
}

get_latest_version() {
    if [ "$1" = "canary" ]; then
        curl -s -L -o /dev/null -w '%{url_effective}' "$DISCORD_API_URL" | \
        grep -oP 'discord-canary-\K[0-9]+\.[0-9]+\.[0-9]+' | head -n1 | tr -d '[:space:]'
    else
        curl -s "$DISCORD_API_URL" | \
        grep -oP 'discord-\K[0-9]+\.[0-9]+\.[0-9]+' | head -n1 | tr -d '[:space:]'
    fi
}

installed_version=$(get_installed_version)
latest_version=$(get_latest_version "$1")

if [ -z "$latest_version" ]; then
    echo "Erreur : impossible de récupérer la dernière version de Discord."
    notify-send 'Discord' "Erreur : impossible de récupérer la dernière version."
    exit 1
fi

echo "Version installée : $installed_version"
echo "Dernière version disponible : $latest_version"

if [ "$installed_version" != "$latest_version" ]; then
    echo "Mise à jour requise."
    notify-send -i "$ICON_PATH" 'Discord' "Mise à jour détectée : $installed_version → $latest_version"
else
    echo "Aucune mise à jour nécessaire, version $installed_version déjà installée."
    bd_run install
    bd_run reinstall
    notify-send -i "$ICON_PATH" 'Discord' "Lancement Discord V.$installed_version"
    "$DISCORD_BINARY" --force-device-scale-factor=1.1 &
    echo "→ Canary lancé en arrière-plan, PID=$!"
    sleep 3
    if kill -0 $! 2>/dev/null; then
    	echo "✓ Canary tourne toujours (PID $!)"
    else
    	echo "✗ Canary a quitté immédiatement"
    fi
    exit 0
fi

download_and_install() {
    local latest_version="$1"
    local mode="$2"
    local prefix="discord"
    [ "$mode" = "canary" ] && prefix="discord-canary"
    deb_file="/tmp/${prefix}-$(echo "$latest_version" | tr -d '[:space:]').deb"

    echo "Téléchargement de Discord version $latest_version..."
    curl -L -o "$deb_file" "$DISCORD_DEB_URL"
    notify-send 'Discord' "Mise à jour vers $latest_version en cours..."

    discord_pid=$(get_discord_pid)
    if [ -n "$discord_pid" ]; then
        kill "$discord_pid" 2>/dev/null || true
        sleep 2
        kill -9 "$discord_pid" 2>/dev/null || true
    fi

    if ! pkexec env DISPLAY=$DISPLAY XAUTHORITY=$XAUTHORITY apt install -y --allow-downgrades "$deb_file"; then
        echo "Erreur : impossible d'installer Discord."
        notify-send 'Discord' "Échec de la mise à jour vers $latest_version."
        rm -f "$deb_file"
        exit 1
    fi

    notify-send 'Discord' "Mise à jour vers $latest_version terminée."
    rm -f "$deb_file"
    sleep 3

    echo "Lancement de Discord pour installation de BetterDiscord..."
    DISPLAY=$DISPLAY "$DISCORD_BINARY" --force-device-scale-factor=1.1 &

    if wait_for_discord_window 90; then
        install_betterdiscord
    else
        echo "Discord ne s'est pas ouvert correctement, installation de BetterDiscord directement..."
        bd_run install
        bd_run reinstall
        notify-send 'BetterDiscord' "Installation BetterDiscord terminée (sans vérif. fenêtre)."
        DISPLAY=$DISPLAY "$DISCORD_BINARY" --force-device-scale-factor=1.1 &
    fi
}

download_and_install "$latest_version" "$1"

echo "Processus de mise à jour terminé."
