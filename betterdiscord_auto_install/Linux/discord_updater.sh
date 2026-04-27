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

# Vérifier chaque paquet requis
for package in "${REQUIRED_PACKAGES[@]}"; do
    if ! dpkg-query -W -f='${Status}' "$package" 2>/dev/null | grep -q "install ok installed"; then
        MISSING_PACKAGES+=("$package")
    fi
done

# Vérifier betterdiscordctl
if ! command -v betterdiscordctl &>/dev/null; then
    echo "Avertissement : betterdiscordctl n'est pas installé ou non disponible dans le PATH."
    echo "Installation automatique de betterdiscordctl..."
    
    # Télécharger et installer betterdiscordctl
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

# Installer les paquets manquants si nécessaire
if [ ${#MISSING_PACKAGES[@]} -gt 0 ]; then
    echo "Paquets manquants détectés : ${MISSING_PACKAGES[*]}"
    echo "Installation des dépendances manquantes..."
    
    if pkexec apt update && pkexec apt install -y "${MISSING_PACKAGES[@]}"; then
        echo "✓ Toutes les dépendances ont été installées avec succès"
    else
        echo "✗ Échec de l'installation des dépendances"
        echo "Paquets manquants : ${MISSING_PACKAGES[*]}"
        exit 1
    fi
else
    echo "✓ Toutes les dépendances sont déjà installées"
fi

# ============================================================================
# FIN DU BLOC DE VÉRIFICATION
# ============================================================================


# Vérifie et configure la variable DISPLAY si nécessaire (cas cron, systemd, etc.)
if [ -z "$DISPLAY" ]; then
    export DISPLAY=:0
fi

# Configuration selon le type (stable ou canary)
if [ "$1" = "canary" ]; then
    DISCORD_PACKAGE="discord-canary"
    DISCORD_BINARY="/usr/share/discord-canary/DiscordCanary"
    DISCORD_API_URL="https://discord.com/api/download/canary?platform=linux"
    DISCORD_DEB_URL="https://discord.com/api/download/canary?platform=linux&format=deb"
    BETTERDISCORD_CMD="betterdiscordctl --d-flavors canary"
    ICON_PATH="$HOME/.config/discordcanary/tray.png"
    PROCESS_NAME="DiscordCanary"
    echo "Mode Discord Canary activé"
else
    DISCORD_PACKAGE="discord"
    DISCORD_BINARY="/usr/share/discord/Discord"
    DISCORD_API_URL="https://discord.com/api/download/stable?platform=linux"
    DISCORD_DEB_URL="https://discord.com/api/download?platform=linux&format=deb"
    BETTERDISCORD_CMD="betterdiscordctl"
    ICON_PATH="$HOME/.config/discord/tray.png"
    PROCESS_NAME="Discord"
    echo "Mode Discord Stable activé"
fi

# Fonction pour obtenir le PID du processus Discord spécifique
get_discord_pid() {
    pgrep -x "$PROCESS_NAME" | head -n1
}

# Fonction pour attendre et vérifier qu'une fenêtre Discord s'ouvre
wait_for_discord_window() {
    local timeout=${1:-60}  # timeout par défaut de 60 secondes
    local counter=0
    
    echo "Attente de l'ouverture d'une fenêtre Discord (timeout: ${timeout}s)..."
    
    while [ $counter -lt $timeout ]; do
        # Vérifier si une fenêtre "Friends" ou "Amis" existe
        if xwininfo -name "Friends - Discord" &>/dev/null || xwininfo -name "Amis - Discord" &>/dev/null; then
            echo "Fenêtre Discord détectée après ${counter}s"
            return 0
        fi
        sleep 2
        counter=$((counter + 2))
    done
    
    echo "Timeout atteint (${timeout}s) - aucune fenêtre Discord détectée"
    return 1
}

# Fonction pour installer BetterDiscord proprement
install_betterdiscord() {
    echo "Fermeture de Discord pour installation de BetterDiscord..."
    
    # Tuer le processus Discord spécifique
    discord_pid=$(get_discord_pid)
    if [ -n "$discord_pid" ]; then
        kill "$discord_pid" 2>/dev/null || true
        sleep 2
        kill -9 "$discord_pid" 2>/dev/null || true
    fi
    
    sleep 3
    
    echo "Installation/réinstallation de BetterDiscord..."
    $BETTERDISCORD_CMD install
    $BETTERDISCORD_CMD reinstall
    
    notify-send 'BetterDiscord' "Installation de BetterDiscord terminée avec succès."
    
    # Relancer Discord final avec BetterDiscord
    echo "Lancement final de Discord avec BetterDiscord..."
    DISPLAY=$DISPLAY "$DISCORD_BINARY" --force-device-scale-factor=1.1 &
}

# Récupère la version installée et supprime les espaces
get_installed_version() {
    dpkg-query -W -f='${Version}\n' "$DISCORD_PACKAGE" 2>/dev/null | tr -d '[:space:]'
}

# Récupère la dernière version disponible selon le type
get_latest_version() {
    if [ "$1" = "canary" ]; then
        curl -s -L -o /dev/null -w '%{url_effective}' "$DISCORD_API_URL" | \
        grep -oP 'discord-canary-\K[0-9]+\.[0-9]+\.[0-9]+' | head -n1 | tr -d '[:space:]'
    else
        curl -s "$DISCORD_API_URL" | \
        grep -oP 'discord-\K[0-9]+\.[0-9]+\.[0-9]+' | head -n1 | tr -d '[:space:]'
    fi
}

# Obtenir les versions actuelle et distante
installed_version=$(get_installed_version)
latest_version=$(get_latest_version "$1")

# Vérification si on a bien récupéré la dernière version
if [ -z "$latest_version" ]; then
    echo "Erreur : impossible de récupérer la dernière version de Discord."
    notify-send 'Discord' "Erreur : impossible de récupérer la dernière version."
    exit 1
fi

echo "Version installée : $installed_version"
echo "Dernière version disponible : $latest_version"

# Comparaison : mise à jour si les versions sont différentes
if [ "$installed_version" != "$latest_version" ]; then
    echo "Mise à jour requise : version différente détectée."
    notify-send -i "$ICON_PATH" 'Discord' "Mise à jour détectée : $installed_version → $latest_version"
else
    echo "Aucune mise à jour nécessaire, vous avez déjà la version $installed_version."
    
    # Même sans mise à jour, on vérifie/installe BetterDiscord
    $BETTERDISCORD_CMD install
    $BETTERDISCORD_CMD reinstall
    
    notify-send -i "$ICON_PATH" 'Discord' "Lancement Discord V.$installed_version"
    "$DISCORD_BINARY" --force-device-scale-factor=1.1 2>/dev/null &
    exit 0
fi

# Fonction de téléchargement et installation
download_and_install() {
    local latest_version="$1"
    local mode="$2"
    local prefix="discord"
    [ "$mode" = "canary" ] && prefix="discord-canary"
    
    deb_file="/tmp/${prefix}-$(echo "$latest_version" | tr -d '[:space:]').deb"

    echo "Téléchargement de Discord version $latest_version..."
    curl -L -o "$deb_file" "$DISCORD_DEB_URL"

    notify-send 'Discord' "Mise à jour vers la version $latest_version en cours..."

    # Fermer le processus Discord existant avant installation
    discord_pid=$(get_discord_pid)
    if [ -n "$discord_pid" ]; then
        echo "Fermeture du processus $PROCESS_NAME (PID: $discord_pid) avant mise à jour"
        kill "$discord_pid" 2>/dev/null || true
        sleep 2
        kill -9 "$discord_pid" 2>/dev/null || true
    fi

    # Installation du package
    if ! pkexec env DISPLAY=$DISPLAY XAUTHORITY=$XAUTHORITY apt install -y --allow-downgrades "$deb_file"; then
        echo "Erreur : impossible d'installer Discord."
        notify-send 'Discord' "Échec de la mise à jour vers $latest_version."
        rm -f "$deb_file"
        exit 1
    fi

    notify-send 'Discord' "Mise à jour vers la version $latest_version terminée."

    # Nettoyage du fichier temporaire
    rm -f "$deb_file"

    # Attendre un peu que l'installation se finalise
    sleep 3

    # Lancer Discord pour le test/installation de BetterDiscord
    echo "Lancement de Discord pour installation de BetterDiscord..."
    DISPLAY=$DISPLAY "$DISCORD_BINARY" --force-device-scale-factor=1.1 &
    
    # Attendre que Discord s'ouvre complètement
    if wait_for_discord_window 90; then
        # Installation de BetterDiscord maintenant que Discord est ouvert
        install_betterdiscord
    else
        echo "Discord ne s'est pas ouvert correctement, installation de BetterDiscord directement..."
        $BETTERDISCORD_CMD install
        $BETTERDISCORD_CMD reinstall
        notify-send 'BetterDiscord' "Installation de BetterDiscord terminée (sans vérification de fenêtre)."
        DISPLAY=$DISPLAY "$DISCORD_BINARY" --force-device-scale-factor=1.1 &
    fi
}

# Lancer la mise à jour
download_and_install "$latest_version" "$1"

echo "Processus de mise à jour terminé."
