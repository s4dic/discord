#!/usr/bin/env bash
# Discord OpenH264 fix, version 1.0.0 — 2026-10-30
# Cible : Discord officiel sur Debian/Ubuntu x86_64, codec 2.5.1 / ABI 7.
# Exécution : bash discord-openh264-fix.sh [--status|--undo] [options]
# Le téléchargement complet avant exécution est recommandé ; curl | bash fonctionne aussi.
# Sources :
# https://github.com/flathub/com.discordapp.Discord/issues/707
# https://github.com/cisco/openh264/releases/tag/2.5.1
# SPDX-License-Identifier: MIT

discord_openh264_main() {
    local action=repair arg tty_input=/dev/null expect_value=0 selected_action=0
    local -a missing=() sudo_args=()

    for arg in "$@"; do
        if (( expect_value )); then
            [[ -n "$arg" && "$arg" != --* ]] || {
                printf '%s\n' 'ERREUR : --config-dir attend un chemin.' >&2
                return 1
            }
            expect_value=0
            continue
        fi
        case "$arg" in
            --help|-h)
                cat <<'HELP'
Réparation idempotente du cache OpenH264 de Discord — 1.0.0

Usage : bash discord-openh264-fix.sh [options]
        curl -fsSL URL_DU_SCRIPT | bash -s -- [options]

  --status                 Afficher l'état, sans installer ni modifier quoi que ce soit.
  --undo                   Retirer la protection du cache ; conserver les codecs.
  --config-dir CHEMIN       Profil Discord, par exemple ~/.config/discord.
  --assume-2.5.1            Cibler explicitement 2.5.1 si Discord est fermé.
  --help                   Afficher cette aide.

Sans option : détecter le codec demandé par les processus Discord du compte courant.
Si nécessaire : télécharger et vérifier le codec Cisco, quitter le Discord concerné,
installer atomiquement le fichier, puis protéger uniquement son répertoire de cache.
Un correctif déjà présent et valide ne provoque ni HTTP ni arrêt de Discord.
Relancer ensuite Discord depuis le menu d'applications ; aucun reboot n'est nécessaire.

Prérequis : Linux x86_64, Bash, Python 3 système, curl et certificats TLS.
Les dépendances manquantes sont installées par APT avec sudo, ou su à défaut.
Lancer ce script avec le compte qui utilise Discord, SANS sudo autour du script.
Seule l'installation des paquets nécessite des droits administrateur.

Détection : profil natif, XDG_CONFIG_HOME, profils Flatpak usuels, chemins de processus.
En présence de plusieurs profils, utiliser --config-dir. Snap/custom : chemin explicite
si l'autodétection est insuffisante. Aucune modification des réglages audio/vidéo.

Ce correctif concerne précisément 2.5.1 / ABI 7. Si un Discord actif demande une autre
version, le script refuse de la remplacer. Utiliser --undo après correction de Discord.
Le dossier protégé empêche aussi les futurs téléchargements de codecs dans ce dossier.
L'option OpenH264 doit rester activée dans les paramètres de Discord.

Codes de sortie : 0 = succès / déjà corrigé ; 1 = erreur ; 2 = état non corrigé ;
3 = version différente / détection ambiguë ; 4 = autre exécution en cours.
HELP
                return 0
                ;;
            --status|--undo)
                if (( selected_action )); then
                    printf '%s\n' 'ERREUR : choisir une seule option parmi --status et --undo.' >&2
                    return 1
                fi
                action="${arg#--}"
                selected_action=1
                ;;
            --config-dir) expect_value=1 ;;
            --config-dir=*)
                [[ -n "${arg#*=}" ]] || {
                    printf '%s\n' 'ERREUR : --config-dir attend un chemin.' >&2
                    return 1
                }
                ;;
            --assume-2.5.1) ;;
            *)
                printf 'ERREUR : option inconnue : %s. Utiliser --help.\n' "$arg" >&2
                return 1
                ;;
        esac
    done
    if (( expect_value )); then
        printf '%s\n' 'ERREUR : --config-dir attend un chemin.' >&2
        return 1
    fi

    if (( EUID == 0 )); then
        printf '%s\n' 'ERREUR : lance ce script avec ton compte Discord, sans sudo.' \
            'Il demandera les droits administrateur uniquement pour les dépendances manquantes.' >&2
        return 1
    fi

    # Utiliser Python système, pas un environnement Conda/pyenv ou PYTHONPATH personnel.
    if ! /usr/bin/python3 -I -c 'import argparse,bz2,fcntl,hashlib,json,pathlib,subprocess' >/dev/null 2>&1; then
        missing+=(python3)
    fi
    if [[ "$action" == repair ]]; then
        command -v curl >/dev/null 2>&1 || missing+=(curl)
        [[ -s /etc/ssl/certs/ca-certificates.crt ]] || missing+=(ca-certificates)
    fi

    if (( ${#missing[@]} )); then
        printf 'Dépendances manquantes : %s\n' "${missing[*]}" >&2
        if [[ "$action" == status ]]; then
            printf '%s\n' 'Le mode --status ne les installe pas. Relance sans --status pour les installer.' >&2
            return 1
        fi
        if [[ ! -x /usr/bin/apt-get ]]; then
            printf '%s\n' 'ERREUR : APT est introuvable. Installer les dépendances avec le gestionnaire du système.' >&2
            return 1
        fi

        if { : </dev/tty; } 2>/dev/null; then
            tty_input=/dev/tty
        fi
        printf '%s\n' 'Installation des dépendances système ; une authentification administrateur peut être demandée.' >&2
        if command -v sudo >/dev/null 2>&1; then
            [[ "$tty_input" == /dev/null ]] && sudo_args=(-n)
            sudo "${sudo_args[@]}" -- /usr/bin/apt-get update <"$tty_input" || {
                [[ "$tty_input" != /dev/null ]] || printf '%s\n' 'Sans terminal : si une authentification est nécessaire, relancer depuis un terminal.' >&2
                return 1
            }
            sudo "${sudo_args[@]}" -- /usr/bin/apt-get install -y --no-install-recommends \
                "${missing[@]}" <"$tty_input" || return 1
        elif command -v su >/dev/null 2>&1 && [[ "$tty_input" == /dev/tty ]]; then
            # Les noms de paquets viennent exclusivement de la liste fixe ci-dessus.
            local apt_install_command
            printf -v apt_install_command '%q ' /usr/bin/apt-get install -y --no-install-recommends "${missing[@]}"
            su -c "/usr/bin/apt-get update && $apt_install_command" </dev/tty || return 1
        else
            printf '%s\n' 'ERREUR : élévation indisponible. Relance depuis un terminal disposant de sudo ou su.' >&2
            return 1
        fi
        /usr/bin/python3 -I -c 'import argparse,bz2,fcntl,hashlib,json,pathlib,subprocess' >/dev/null 2>&1 || {
            printf '%s\n' 'ERREUR : Python 3 système reste incomplet après installation.' >&2
            return 1
        }
        if [[ "$action" == repair ]] && { ! command -v curl >/dev/null 2>&1 || [[ ! -s /etc/ssl/certs/ca-certificates.crt ]]; }; then
            printf '%s\n' 'ERREUR : curl ou les certificats TLS restent indisponibles.' >&2
            return 1
        fi
    fi

    # Le corps complet est parsé avant son exécution, même avec curl | bash.
    # Le programme Python reçoit ce heredoc ; sudo/su ne lisent jamais le flux du script.
    /usr/bin/python3 -I - "$@" <<'PYTHON'
from __future__ import annotations

import argparse
import bz2
import fcntl
import hashlib
import json
import os
from pathlib import Path
import re
import signal
import stat
import subprocess
import sys
import tempfile
import time

SCRIPT_VERSION = "1.0.0"
CODEC_NAME = "libopenh264-2.5.1-linux64.7.so"
# SHA-256 du binaire décompressé, publié dans le signalement #707 référencé en tête.
# Il ne s'agit pas d'une signature Cisco : HTTPS Cisco + cette empreinte fixée sont vérifiés.
CODEC_SHA256 = "d828a944d4d2bb64195ada89cf2cde9bc41733b1547d0788ef49fb8cb231b76f"
CODEC_URL = "https://ciscobinary.openh264.org/" + CODEC_NAME + ".bz2"
MAX_ARCHIVE = 10 * 1024 * 1024
MAX_CODEC = 32 * 1024 * 1024
STATE_DIRECTORY = ".discord-openh264-fix"
UID = os.geteuid()


class FixError(Exception):
    def __init__(self, message, code=1):
        super().__init__(message)
        self.code = code


def log(message):
    print(message, flush=True)


def mode_of(path):
    return stat.S_IMODE(path.stat().st_mode)


def owned_path(path, directory=False, optional=False):
    try:
        info = path.lstat()
    except FileNotFoundError:
        if optional:
            return False
        raise FixError("Chemin absent : " + str(path))
    if stat.S_ISLNK(info.st_mode):
        raise FixError("Lien symbolique refusé pour cet élément du cache : " + str(path))
    if info.st_uid != UID:
        raise FixError("Ce chemin n'appartient pas au compte courant : " + str(path))
    kind_ok = stat.S_ISDIR(info.st_mode) if directory else stat.S_ISREG(info.st_mode)
    if not kind_ok:
        raise FixError("Type de fichier inattendu : " + str(path))
    return True


def valid_codec(path):
    if not path.exists():
        return False
    owned_path(path)
    if path.stat().st_size > MAX_CODEC:
        return False
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(65536), b""):
            digest.update(chunk)
    return digest.hexdigest() == CODEC_SHA256


def process_identity(pid):
    try:
        value = Path("/proc", str(pid), "stat").read_text()
        fields = value.rsplit(")", 1)[1].split()
        return int(fields[1]), fields[19], fields[0]  # ppid, starttime, state
    except (OSError, ValueError, IndexError):
        return None


def discord_processes():
    result = []
    for entry in Path("/proc").iterdir():
        if not entry.name.isdigit():
            continue
        try:
            if entry.stat().st_uid != UID:
                continue
            comm = (entry / "comm").read_text().strip().lower()
            if not re.fullmatch(r"discord(?:ptb|canary)?", comm):
                continue
            identity = process_identity(int(entry.name))
            if not identity or identity[2] == "Z":
                continue
            args = [os.fsdecode(part) for part in (entry / "cmdline").read_bytes().split(b"\0") if part]
            library = None
            for index, arg in enumerate(args):
                if arg.startswith("--openh264-library-path="):
                    library = arg.split("=", 1)[1]
                elif arg == "--openh264-library-path" and index + 1 < len(args):
                    library = args[index + 1]
            profile = None
            name = None
            if library:
                path = Path(library)
                if path.is_absolute() and path.parent.name == "openh264" and path.parent.parent.name == "discord_asset_cache":
                    profile = path.parent.parent.parent.resolve()
                    name = path.name
            result.append({"pid": int(entry.name), "ppid": identity[0], "start": identity[1],
                           "profile": profile, "name": name})
        except (OSError, ValueError):
            continue
    return result


def discover_profile(explicit, processes):
    if explicit:
        target = Path(explicit).expanduser().resolve()
        owned_path(target, directory=True)
        return target
    active = sorted({p["profile"] for p in processes if p["profile"] and p["profile"].is_dir()}, key=str)
    if len(active) == 1:
        owned_path(active[0], directory=True)
        return active[0]
    if len(active) > 1:
        raise FixError("Plusieurs profils Discord actifs. Utiliser --config-dir :\n  " + "\n  ".join(map(str, active)), 3)
    user_home = Path.home()
    xdg = os.environ.get("XDG_CONFIG_HOME")
    config_root = Path(xdg) if xdg and Path(xdg).is_absolute() else user_home / ".config"
    candidates = []
    for channel in ("discord", "discordptb", "discordcanary"):
        candidates.append(config_root / channel)
    candidates.append(user_home / ".var/app/com.discordapp.Discord/config/discord")
    for candidate in (user_home / "snap/discord/current/.config/discord",
                      user_home / "snap/discord/current/config/discord"):
        candidates.append(candidate)
    found = sorted({p.resolve() for p in candidates if p.is_dir()}, key=str)
    if len(found) != 1:
        detail = "\n  " + "\n  ".join(map(str, found)) if found else ""
        raise FixError("Profil Discord absent ou ambigu. Lancer Discord ou préciser --config-dir." + detail, 3)
    owned_path(found[0], directory=True)
    return found[0]


def requested_names(profile, processes):
    return {p["name"] for p in processes if p["profile"] == profile and p["name"]}


def read_state(profile):
    state_dir = profile / STATE_DIRECTORY
    if not state_dir.exists():
        return None
    owned_path(state_dir, directory=True)
    path = state_dir / "state.json"
    if not owned_path(path, optional=True):
        return None
    try:
        if path.stat().st_size > 8192:
            raise ValueError("taille excessive")
        data = json.loads(path.read_text())
        if data.get("schema") != 1 or data.get("profile") != str(profile) or data.get("codec") != CODEC_NAME:
            raise ValueError("identité incohérente")
        for key in ("directory_restore_mode", "file_restore_mode"):
            if type(data.get(key)) is not int or not 0 <= data[key] <= 0o7777:
                raise ValueError("mode invalide")
        if type(data.get("active", True)) is not bool:
            raise ValueError("indicateur actif invalide")
        return data
    except (ValueError, AttributeError, OSError) as error:
        raise FixError("État de restauration invalide : " + str(path) + " (" + str(error) + ")")


def write_atomic(path, contents, file_mode):
    fd, temporary = tempfile.mkstemp(prefix=".openh264-fix-", dir=str(path.parent))
    try:
        with os.fdopen(fd, "wb") as stream:
            stream.write(contents)
            stream.flush()
            os.fsync(stream.fileno())
            os.fchmod(stream.fileno(), file_mode)
        os.replace(temporary, path)
    finally:
        try:
            os.unlink(temporary)
        except FileNotFoundError:
            pass


def download_codec():
    log("Téléchargement du codec 2.5.1 depuis Cisco, puis contrôle SHA-256…")
    with tempfile.TemporaryDirectory(prefix="discord-openh264-") as temporary:
        archive = Path(temporary) / "codec.bz2"
        command = ["curl", "--disable", "--fail", "--location", "--silent", "--show-error",
                   "--proto", "=https", "--proto-redir", "=https", "--tlsv1.2",
                   "--connect-timeout", "15", "--max-time", "90", "--retry", "2",
                   "--retry-delay", "1", "--max-filesize", str(MAX_ARCHIVE),
                   "--output", str(archive), CODEC_URL]
        result = subprocess.run(command, stdin=subprocess.DEVNULL, check=False)
        if result.returncode:
            raise FixError("Téléchargement Cisco échoué (curl " + str(result.returncode) + "). Aucun fichier du cache n'a été modifié.")
        if not archive.is_file() or archive.stat().st_size > MAX_ARCHIVE:
            raise FixError("Archive Cisco absente ou trop volumineuse.")
        try:
            decoder = bz2.BZ2Decompressor()
            contents = decoder.decompress(archive.read_bytes(), max_length=MAX_CODEC + 1)
            if not decoder.eof or decoder.unused_data or len(contents) > MAX_CODEC:
                raise ValueError("archive tronquée, excessive ou contenant des données supplémentaires")
        except (OSError, EOFError, ValueError) as error:
            raise FixError("Archive OpenH264 invalide : " + str(error))
        if hashlib.sha256(contents).hexdigest() != CODEC_SHA256:
            raise FixError("Empreinte SHA-256 inattendue : le fichier est refusé, le cache reste inchangé.")
        log("Archive décompressée et empreinte SHA-256 validée.")
        return contents


def stop_discord(profile):
    processes = discord_processes()
    names = requested_names(profile, processes)
    if names and names != {CODEC_NAME}:
        raise FixError("Discord demande maintenant un autre codec. Abandon avant modification : " + ", ".join(sorted(names)), 3)
    by_pid = {p["pid"]: p for p in processes}
    selected = {p["pid"] for p in processes if p["profile"] == profile}
    # Inclure le processus principal, même si seuls ses enfants exposent l'option codec.
    for pid in list(selected):
        seen = set()
        while pid in by_pid and pid not in seen:
            seen.add(pid)
            selected.add(pid)
            pid = by_pid[pid]["ppid"]
    changed = True
    while changed:
        before = len(selected)
        selected.update(p["pid"] for p in processes if p["ppid"] in selected)
        changed = len(selected) != before
    affected = [by_pid[pid] for pid in selected]
    if not affected:
        if processes:
            raise FixError("Discord est actif mais son rattachement à ce profil est indéterminé. Quitter complètement Discord, puis relancer avec --assume-2.5.1 si ce codec est bien requis.", 3)
        return False
    log("Fermeture du Discord concerné pour appliquer le correctif…")
    for process in affected:
        identity = process_identity(process["pid"])
        if identity and identity[1] == process["start"]:
            try:
                os.kill(process["pid"], signal.SIGTERM)
            except ProcessLookupError:
                pass
    deadline = time.monotonic() + 10
    while time.monotonic() < deadline:
        remaining = []
        for process in affected:
            identity = process_identity(process["pid"])
            if identity and identity[1] == process["start"] and identity[2] != "Z":
                remaining.append(process["pid"])
        if not remaining:
            return True
        time.sleep(0.2)
    raise FixError("Discord ne s'est pas fermé après 10 secondes. Quitter l'application puis relancer ; aucun SIGKILL n'a été envoyé.")


def acquire_lock(profile):
    directory = profile / STATE_DIRECTORY
    directory.mkdir(mode=0o700, exist_ok=True)
    owned_path(directory, directory=True)
    lock_path = directory / "lock"
    owned_path(lock_path, optional=True)
    fd = os.open(str(lock_path), os.O_CREAT | os.O_RDWR | os.O_NOFOLLOW, 0o600)
    try:
        fcntl.flock(fd, fcntl.LOCK_EX | fcntl.LOCK_NB)
    except BlockingIOError:
        os.close(fd)
        raise FixError("Une autre exécution travaille déjà sur ce profil.", 4)
    return fd


def report(profile, codec_dir, codec, names):
    log("Profil : " + str(profile))
    log("Codec demandé par le processus : " + (", ".join(sorted(names)) if names else "indéterminé (Discord fermé ou option OpenH264 absente)"))
    if names and names != {CODEC_NAME}:
        log("Ce correctif 2.5.1 n'est pas adapté au codec actuellement demandé. Utiliser --undo pour retirer une ancienne protection.")
        return 3
    if not codec_dir.exists():
        log("Cache OpenH264 absent.")
        return 2
    owned_path(codec_dir, directory=True)
    good = valid_codec(codec)
    directory_mode = mode_of(codec_dir)
    log("Fichier 2.5.1 : " + ("présent, SHA-256 valide" if good else "absent ou SHA-256 incorrect"))
    log("Permissions du dossier : " + format(directory_mode, "04o"))
    if good and directory_mode & 0o222 == 0:
        log("Correctif présent. Cela ne constitue pas un test de lecture d'une caméra.")
        return 0
    log("Correctif incomplet.")
    return 2


def undo(profile, codec_dir, codec):
    if not codec_dir.exists():
        log("Cache absent : aucune protection à retirer.")
        return
    owned_path(codec_dir, directory=True)
    lock_fd = acquire_lock(profile)
    try:
        state_data = read_state(profile)
        if state_data and not state_data.get("active", True):
            log("Protection déjà retirée. Aucune modification supplémentaire.")
            return
        if state_data:
            directory_mode = state_data["directory_restore_mode"]
            file_mode = state_data["file_restore_mode"]
        else:
            directory_mode = mode_of(codec_dir) | 0o200
            file_mode = (mode_of(codec) | 0o200) if codec.exists() else 0o644
            log("Pas d'état enregistré : ajout de l'écriture propriétaire uniquement, sans inventer les droits d'origine.")
        if mode_of(codec_dir) != directory_mode:
            codec_dir.chmod(directory_mode)
        if owned_path(codec, optional=True) and mode_of(codec) != file_mode:
            codec.chmod(file_mode)
        state_path = profile / STATE_DIRECTORY / "state.json"
        if state_data:
            state_data["active"] = False
            write_atomic(state_path, (json.dumps(state_data, indent=2) + "\n").encode(), 0o600)
        log("Protection retirée. Les codecs et les réglages Discord sont conservés.")
    finally:
        os.close(lock_fd)


def repair(profile, codec_dir, codec, names, assume):
    if names and names != {CODEC_NAME}:
        raise FixError("Discord demande " + ", ".join(sorted(names)) + ". Ce script ne force pas 2.5.1 dans ce cas. Utiliser --undo si nécessaire.", 3)
    for directory in (profile / "discord_asset_cache", codec_dir):
        owned_path(directory, directory=True, optional=True)
    good = valid_codec(codec)
    if good and codec_dir.exists() and mode_of(codec_dir) & 0o222 == 0:
        log("Déjà corrigé : codec 2.5.1 valide, dossier protégé. Aucun téléchargement ni arrêt de Discord.")
        if not names:
            log("Discord est fermé ou ne fournit pas son chemin de codec ; compatibilité avec une éventuelle nouvelle version non évaluée.")
        return
    if not names and not assume:
        raise FixError("Version attendue indéterminée. Lancer Discord avec OpenH264 activé, ou utiliser --assume-2.5.1 si ce besoin est confirmé.", 3)
    if assume and not names:
        log("Cible 2.5.1 choisie explicitement avec --assume-2.5.1.")

    lock_fd = acquire_lock(profile)
    try:
        state_data = read_state(profile)
        state_path = profile / STATE_DIRECTORY / "state.json"
        previous_state_bytes = state_path.read_bytes() if state_data is not None else None
        if state_data and not state_data.get("active", True):
            state_data = None
        good = valid_codec(codec)
        if good and codec_dir.exists() and mode_of(codec_dir) & 0o222 == 0:
            log("Déjà corrigé par une autre exécution.")
            return
        # Garder une copie validée avant l'arrêt : le nettoyage de Discord peut
        # encore supprimer un fichier existant pendant la fermeture.
        candidate_contents = codec.read_bytes() if good else download_codec()
        if hashlib.sha256(candidate_contents).hexdigest() != CODEC_SHA256:
            raise FixError("Le codec a changé pendant sa vérification. Relancer le script.")
        stop_discord(profile)

        # Plus aucun téléchargement après la fermeture de Discord.
        contents = None if valid_codec(codec) else candidate_contents
        codec_dir.mkdir(mode=0o700, parents=True, exist_ok=True)
        owned_path(codec_dir, directory=True)
        original_mode = mode_of(codec_dir)
        old_exists = owned_path(codec, optional=True)
        old_mode = mode_of(codec) if old_exists else None
        if old_exists and codec.stat().st_size > MAX_CODEC:
            raise FixError("Fichier existant trop volumineux pour être remplacé automatiquement.")
        old_contents = codec.read_bytes() if old_exists and contents is not None else None
        if state_data is None:
            state_data = {
                "schema": 1, "active": True, "script_version": SCRIPT_VERSION, "profile": str(profile), "codec": CODEC_NAME,
                "directory_restore_mode": original_mode if original_mode & 0o222 else original_mode | 0o200,
                "directory_mode_inferred": not bool(original_mode & 0o222),
                "file_restore_mode": old_mode if old_mode is not None else 0o644,
            }
        installed = False
        try:
            write_atomic(state_path, (json.dumps(state_data, indent=2) + "\n").encode(), 0o600)
            codec_dir.chmod(original_mode | 0o200)
            if contents is not None:
                write_atomic(codec, contents, 0o444)
                installed = True
            codec_dir.chmod(original_mode & ~0o222)
            if not valid_codec(codec) or mode_of(codec_dir) & 0o222:
                raise FixError("La vérification finale de l'installation a échoué.")
        except BaseException:
            codec_dir.chmod(original_mode | 0o200)
            if installed:
                if old_exists:
                    write_atomic(codec, old_contents, old_mode)
                else:
                    codec.unlink(missing_ok=True)
            codec_dir.chmod(original_mode)
            if previous_state_bytes is None:
                state_path.unlink(missing_ok=True)
            else:
                write_atomic(state_path, previous_state_bytes, 0o600)
            raise
        log("Correctif appliqué : " + str(codec))
        log("Dossier protégé (" + format(mode_of(codec_dir), "04o") + "). Relancer Discord depuis le menu d'applications.")
        log("Après correction de Discord, utiliser --undo : cette protection empêche aussi les nouvelles écritures de codecs.")
    finally:
        os.close(lock_fd)


def main():
    parser = argparse.ArgumentParser(description="Correctif Discord OpenH264 2.5.1")
    group = parser.add_mutually_exclusive_group()
    group.add_argument("--status", action="store_true")
    group.add_argument("--undo", action="store_true")
    parser.add_argument("--config-dir")
    parser.add_argument("--assume-2.5.1", dest="assume", action="store_true")
    args = parser.parse_args()
    if sys.platform != "linux" or os.uname().machine.lower() not in ("x86_64", "amd64"):
        raise FixError("Cette version du script cible uniquement Linux x86_64, comme le binaire Discord concerné.")
    processes = discord_processes()
    profile = discover_profile(args.config_dir, processes)
    codec_dir = profile / "discord_asset_cache/openh264"
    codec = codec_dir / CODEC_NAME
    for directory in (profile / "discord_asset_cache", codec_dir):
        owned_path(directory, directory=True, optional=True)
    names = requested_names(profile, processes)
    if args.status:
        return report(profile, codec_dir, codec, names)
    log("Profil sélectionné : " + str(profile))
    if args.undo:
        undo(profile, codec_dir, codec)
    else:
        repair(profile, codec_dir, codec, names, args.assume)
    return 0


try:
    sys.exit(main())
except FixError as error:
    print("ERREUR : " + str(error), file=sys.stderr)
    sys.exit(error.code)
except KeyboardInterrupt:
    print("Interruption demandée.", file=sys.stderr)
    sys.exit(130)
except (OSError, subprocess.SubprocessError) as error:
    print("ERREUR système : " + str(error), file=sys.stderr)
    sys.exit(1)
PYTHON
}

discord_openh264_main "$@"
