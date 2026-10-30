# Discord Camera & Streaming Repair

[Français](#français) · [English](#english)

Correctif idempotent du cache OpenH264 de Discord pour Debian/Ubuntu x86_64.  
Idempotent Discord OpenH264 cache repair for Debian/Ubuntu x86_64.

**Version documentée / Documented version:** `1.0.0`  
**Script:** [discord-openh264-fix.sh](https://github.com/s4dic/discord/blob/main/camerastreamingrepair/discord-openh264-fix.sh)

---

## Français

### À quoi sert ce script ?

Ce script corrige un défaut précis de Discord sous Linux : le client demande le fichier `libopenh264-2.5.1-linux64.7.so`, alors que son cache ne contient plus que `libopenh264-2.7.0-linux64.8.so`. Le décodeur ne peut alors pas s'initialiser, ce qui peut empêcher l'affichage des caméras et des partages d'écran.

Le script restaure le **binaire officiel Cisco OpenH264 2.5.1 / ABI 7**, vérifie son empreinte SHA-256 et retire les droits d'écriture du dossier de cache pour empêcher la suppression du fichier par Discord. Le défaut et ce contournement sont documentés dans le [signalement #707](https://github.com/flathub/com.discordapp.Discord/issues/707).

> Ce correctif cible ce problème de codec. Si un Discord actif demande une autre version, le script s'arrête au lieu de lui imposer la 2.5.1. La protection du dossier bloque aussi les futurs téléchargements de codecs : utilisez `--undo` lorsque Discord aura corrigé le problème.

### Démarrage rapide

1. Ouvrez Discord avec votre compte habituel. La détection du codec s'appuie sur les processus actifs.
2. Vérifiez que l'option **Codec vidéo OpenH264 fourni par Cisco Systems** est activée dans les paramètres **Voix et vidéo** de Discord.
3. Exécutez cette commande **sans ajouter `sudo`** :

```bash
bash -o pipefail -c '
  curl -fsSL "https://raw.githubusercontent.com/s4dic/discord/refs/heads/main/camerastreamingrepair/discord-openh264-fix.sh" |
    bash -s --
'
```

Si une réparation est nécessaire, le script ferme le Discord concerné après avoir validé le codec. **Relancez ensuite Discord depuis le menu d'applications et testez une caméra ou un partage d'écran. Aucun redémarrage de Linux n'est nécessaire.**

Si le correctif est déjà présent et valide, le script le signale et laisse Discord ouvert. L'appel `curl` récupère toujours le script ; le **codec**, lui, n'est pas téléchargé de nouveau lorsqu'il est déjà correct.

### Télécharger le script avant de l'exécuter

Cette méthode permet de conserver une copie locale. Exécutez-la dans le dossier où vous souhaitez enregistrer le script :

```bash
curl --fail --show-error --location \
  "https://raw.githubusercontent.com/s4dic/discord/refs/heads/main/camerastreamingrepair/discord-openh264-fix.sh" \
  --output discord-openh264-fix.sh &&
bash ./discord-openh264-fix.sh
```

### Compatibilité et dépendances

| Élément | Condition |
| --- | --- |
| Système | Linux, conçu pour Debian/Ubuntu avec APT |
| Architecture | `x86_64` / `amd64` |
| Interpréteurs | Bash et Python système 3.8 ou ultérieur, via `/usr/bin/python3` |
| Téléchargement du codec | `curl` et certificats TLS (`ca-certificates`) |
| Utilisateur | Le compte qui utilise Discord |
| Profil | Installation native, `XDG_CONFIG_HOME`, emplacements Flatpak usuels ; chemin explicite si nécessaire |

Lorsqu'une dépendance manque, le script utilise `sudo` pour lancer APT. Si `sudo` est absent, il peut utiliser `su` depuis un terminal. Le mot de passe demandé est celui de l'utilisateur avec `sudo`, ou celui de root avec `su`.

**Seule l'installation des dépendances est élevée.** La réparation du cache reste exécutée avec le compte utilisateur. Le lancement global du script en root est refusé.

Le mode `--status` n'installe rien. Sans terminal interactif, une installation de dépendances n'est possible que si les commandes APT prévues sont déjà autorisées par `sudo` sans saisie de mot de passe.

Si `curl` n'est pas encore installé, téléchargez le fichier depuis un navigateur puis lancez-le avec `bash`. Le script pourra alors installer ses dépendances. Aucune compilation d'OpenH264 n'est nécessaire.

### Options

| Option | Fonction |
| --- | --- |
| Aucune | Détecter le profil et le codec demandé, puis appliquer la réparation si nécessaire. |
| `--status` | Vérifier l'état du correctif sans modification ni installation de dépendance. |
| `--undo` | Retirer la protection et restaurer les permissions enregistrées ; conserver les codecs. |
| `--config-dir CHEMIN` | Sélectionner le répertoire du profil Discord. |
| `--assume-2.5.1` | Choisir explicitement la 2.5.1 lorsque le codec attendu n'est pas détectable, notamment si Discord est fermé. |
| `--help` ou `-h` | Afficher l'aide. |

`--status` et `--undo` sont mutuellement exclusifs. `--config-dir` désigne **le profil Discord**, par exemple `~/.config/discord`, et non le sous-dossier `openh264`.

#### Vérifier l'état depuis l'URL

```bash
bash -o pipefail -c '
  curl -fsSL "https://raw.githubusercontent.com/s4dic/discord/refs/heads/main/camerastreamingrepair/discord-openh264-fix.sh" |
    bash -s -- --status
'
```

Un état correct confirme le fichier et les permissions ; il ne remplace pas un test de lecture vidéo dans Discord.

#### Retirer le contournement depuis l'URL

```bash
bash -o pipefail -c '
  curl -fsSL "https://raw.githubusercontent.com/s4dic/discord/refs/heads/main/camerastreamingrepair/discord-openh264-fix.sh" |
    bash -s -- --undo
'
```

#### Choisir un profil natif

Depuis une copie locale du script :

```bash
bash ./discord-openh264-fix.sh \
  --config-dir "$HOME/.config/discord"
```

#### Choisir le profil Flatpak habituel

```bash
bash ./discord-openh264-fix.sh \
  --config-dir "$HOME/.var/app/com.discordapp.Discord/config/discord"
```

Pour une installation Snap ou personnalisée, indiquez le répertoire de configuration réel si l'autodétection ne suffit pas.

#### Réparer lorsque Discord est fermé

Utilisez cette option uniquement si le besoin de la 2.5.1 a été confirmé :

```bash
bash ./discord-openh264-fix.sh \
  --config-dir "$HOME/.config/discord" \
  --assume-2.5.1
```

Cette option ne passe pas outre une autre version explicitement demandée par un Discord actif. Si des processus Discord sont actifs mais ne peuvent pas être rattachés au profil choisi, le script demande de les fermer plutôt que de modifier le cache pendant leur fonctionnement.

### Idempotence et retour arrière

- Le contenu du codec est vérifié par SHA-256 ; la présence du nom de fichier ne suffit pas.
- Si le fichier est correct et le dossier déjà protégé, la réparation ne remplace rien, ne télécharge pas le codec et ne ferme pas Discord.
- Le téléchargement et sa vérification précèdent la fermeture de Discord. Un échec HTTP ou une archive incorrecte ne remplace pas le codec existant.
- L'installation utilise un fichier temporaire puis un remplacement atomique. Un verrou par profil évite deux réparations simultanées.
- Le script retire les bits d'écriture du dossier : par exemple `775` devient `555`, tandis que `700` devient `500`.
- Les permissions initiales sont enregistrées dans `<profil>/.discord-openh264-fix/state.json`. `--undo` les restaure lorsqu'elles sont connues.
- Si le dossier avait déjà été protégé manuellement sans état enregistré, `--undo` rétablit uniquement l'écriture pour le propriétaire. Il ne devine pas les anciens droits de groupe.
- L'annulation conserve les fichiers de codecs. Elle ne restaure pas le contenu d'un ancien codec défectueux qui aurait été remplacé.

### Dépannage

| Message ou situation | Action |
| --- | --- |
| Version attendue indéterminée | Ouvrir Discord avec OpenH264 activé, ou utiliser `--assume-2.5.1` si le besoin est confirmé. |
| Plusieurs profils détectés | Choisir le profil avec `--config-dir`. |
| Une autre version de codec est demandée | Retirer l'ancien contournement avec `--undo` et vérifier la version de Discord. |
| Erreur HTTP, réseau ou empreinte SHA-256 inattendue | Conserver la sortie complète. Le fichier téléchargé n'est pas installé ; vérifier la connexion et l'accès au CDN Cisco. |
| Authentification ou installation APT impossible | Relancer depuis un terminal avec un compte autorisé à utiliser APT via `sudo`, ou avec `su` disponible si `sudo` est absent. |
| Le script a été lancé en root | Le relancer depuis le compte qui utilise Discord, sans `sudo` autour du script. |
| Discord ne se ferme pas | Quitter complètement Discord depuis son icône de notification, puis relancer le script. |
| Le correctif est valide mais la vidéo reste bloquée | Relancer Discord, vérifier OpenH264, puis examiner les erreurs récentes dans `<profil>/logs/discord-webrtc_0`. |

### Codes de sortie

| Code | Signification |
| --- | --- |
| `0` | Succès, correctif déjà présent, aide ou annulation terminée. |
| `1` | Erreur d'exécution, de dépendance, de téléchargement, de permission ou d'argument. |
| `2` | `--status` : correctif incomplet ou cache absent. |
| `3` | Version différente, profil ambigu ou détection insuffisante. |
| `4` | Une autre exécution travaille sur le même profil. |
| `130` | Interruption clavier pendant le traitement Python. |

Ces codes décrivent le script. L'appel avec `pipefail` peut également renvoyer le code d'erreur de `curl` si le téléchargement du script échoue.

---

## English

### What does this script fix?

This script addresses a specific Discord issue on Linux: the client requests `libopenh264-2.5.1-linux64.7.so`, while its cache only contains `libopenh264-2.7.0-linux64.8.so`. The decoder then fails to initialize, which can prevent webcams and screen shares from displaying.

The script restores the **official Cisco OpenH264 2.5.1 / ABI 7 binary**, verifies its SHA-256 digest, and removes write permissions from the codec cache directory to prevent Discord from deleting the restored file. The issue and workaround are documented in [issue #707](https://github.com/flathub/com.discordapp.Discord/issues/707).

> This workaround targets this particular codec issue. If a running Discord client requests another version, the script stops instead of forcing 2.5.1. Protecting the directory also blocks future codec downloads: run `--undo` once Discord has fixed the issue.

### Quick start

1. Open Discord using your regular desktop account. Codec detection uses the running processes.
2. Make sure **OpenH264 Video Codec provided by Cisco Systems** is enabled in Discord's **Voice & Video** settings.
3. Run this command **without adding `sudo`**:

```bash
bash -o pipefail -c '
  curl -fsSL "https://raw.githubusercontent.com/s4dic/discord/refs/heads/main/camerastreamingrepair/discord-openh264-fix.sh" |
    bash -s --
'
```

If a repair is needed, the script closes the affected Discord instance after validating the codec. **Reopen Discord from your applications menu, then test a webcam or screen share. A Linux reboot is not required.**

If the workaround is already valid, the script reports it and leaves Discord running. The `curl` invocation always fetches the script; the **codec** is not downloaded again when its existing contents are correct.

Version `1.0.0` currently prints its console messages and built-in help in French.

### Download before running

This method keeps a local copy. Run it from the directory where you want to save the script:

```bash
curl --fail --show-error --location \
  "https://raw.githubusercontent.com/s4dic/discord/refs/heads/main/camerastreamingrepair/discord-openh264-fix.sh" \
  --output discord-openh264-fix.sh &&
bash ./discord-openh264-fix.sh
```

### Compatibility and dependencies

| Component | Requirement |
| --- | --- |
| Operating system | Linux, designed for Debian/Ubuntu with APT |
| Architecture | `x86_64` / `amd64` |
| Interpreters | Bash and system Python 3.8 or later at `/usr/bin/python3` |
| Codec download | `curl` and TLS certificates (`ca-certificates`) |
| Account | The user account that runs Discord |
| Profile | Native installation, `XDG_CONFIG_HOME`, common Flatpak paths; explicit path when needed |

When a required dependency is missing, the script uses `sudo` to run APT. If the `sudo` command is absent, it can use `su` from an interactive terminal. `sudo` may ask for your user password; `su` asks for the root password.

**Only dependency installation is elevated.** Cache repair runs as your regular user. Running the entire script as root is rejected.

The `--status` mode installs nothing. Without an interactive terminal, dependency installation is only possible when the required APT commands are already allowed through `sudo` without a password prompt.

If `curl` is not installed yet, download the file using a browser and run it with `bash`. The script can then install its dependencies. Building OpenH264 from source is unnecessary.

### Options

| Option | Purpose |
| --- | --- |
| None | Detect the profile and requested codec, then repair if needed. |
| `--status` | Check the workaround without changing files or installing dependencies. |
| `--undo` | Remove directory protection and restore recorded permissions; keep codec files. |
| `--config-dir PATH` | Select a Discord profile directory. |
| `--assume-2.5.1` | Explicitly select 2.5.1 when the requested version cannot be detected, such as when Discord is closed. |
| `--help` or `-h` | Display help. |

`--status` and `--undo` are mutually exclusive. `--config-dir` points to the **Discord profile**, such as `~/.config/discord`, not to the `openh264` subdirectory.

#### Check status using the URL

```bash
bash -o pipefail -c '
  curl -fsSL "https://raw.githubusercontent.com/s4dic/discord/refs/heads/main/camerastreamingrepair/discord-openh264-fix.sh" |
    bash -s -- --status
'
```

A healthy status confirms the file and directory permissions; it is not a video playback test.

#### Remove the workaround using the URL

```bash
bash -o pipefail -c '
  curl -fsSL "https://raw.githubusercontent.com/s4dic/discord/refs/heads/main/camerastreamingrepair/discord-openh264-fix.sh" |
    bash -s -- --undo
'
```

#### Select a native profile

Using a local copy of the script:

```bash
bash ./discord-openh264-fix.sh \
  --config-dir "$HOME/.config/discord"
```

#### Select the usual Flatpak profile

```bash
bash ./discord-openh264-fix.sh \
  --config-dir "$HOME/.var/app/com.discordapp.Discord/config/discord"
```

For Snap or custom installations, provide the actual configuration directory if automatic detection is insufficient.

#### Repair while Discord is closed

Use this option only after confirming that the installation needs 2.5.1:

```bash
bash ./discord-openh264-fix.sh \
  --config-dir "$HOME/.config/discord" \
  --assume-2.5.1
```

This option never overrides a different codec version explicitly requested by a running Discord process. If Discord is running but its processes cannot be associated with the selected profile, the script asks you to close it instead of modifying the cache while it is active.

### Idempotence and rollback

- The codec contents are checked against a SHA-256 digest; an existing filename alone is insufficient.
- If the file is correct and the directory is already protected, repair does not replace the file, download the codec, or close Discord.
- Download and validation happen before Discord is closed. An HTTP failure or invalid archive does not replace the existing codec.
- Installation stages a temporary file and uses an atomic replacement. A per-profile lock prevents concurrent repairs.
- The script removes the directory's write permission bits: for example, `775` becomes `555`, while `700` becomes `500`.
- Original permissions are recorded in `<profile>/.discord-openh264-fix/state.json`. `--undo` restores them when known.
- If the directory was already protected manually and no recorded state exists, `--undo` only restores owner write permission. It does not guess the original group permissions.
- Undo keeps the codec files. It does not restore the contents of a previously invalid codec that was replaced.

### Troubleshooting

| Message or situation | Action |
| --- | --- |
| Requested version cannot be determined | Open Discord with OpenH264 enabled, or use `--assume-2.5.1` after confirming the requirement. |
| Multiple profiles detected | Select the profile with `--config-dir`. |
| A different codec version is requested | Remove the old workaround using `--undo` and check your Discord version. |
| HTTP/network failure or unexpected SHA-256 | Keep the complete output. The downloaded file is not installed; check connectivity and access to Cisco's CDN. |
| Authentication or APT installation fails | Use a terminal and an account allowed to run APT through `sudo`, or use a system with `su` available when `sudo` is absent. |
| Script was started as root | Run it from your Discord user account without wrapping the script in `sudo`. |
| Discord does not close | Fully quit Discord from its tray icon, then run the script again. |
| Workaround is valid but video is still unavailable | Reopen Discord, check OpenH264, then inspect recent errors in `<profile>/logs/discord-webrtc_0`. |

### Exit codes

| Code | Meaning |
| --- | --- |
| `0` | Success, already repaired, help displayed, or undo completed. |
| `1` | Execution, dependency, download, permission, or argument error. |
| `2` | `--status`: incomplete workaround or missing cache. |
| `3` | Different codec version, ambiguous profile, or insufficient detection. |
| `4` | Another execution is working on the same profile. |
| `130` | Keyboard interruption during Python processing. |

These codes describe the script itself. The command using `pipefail` may also return a `curl` error code if downloading the script fails.

---

## Sources / References

- [Discord Linux codec mismatch and workaround — issue #707](https://github.com/flathub/com.discordapp.Discord/issues/707)
- [Cisco OpenH264 2.5.1 release and official binaries](https://github.com/cisco/openh264/releases/tag/2.5.1)
- [Script source](https://github.com/s4dic/discord/blob/main/camerastreamingrepair/discord-openh264-fix.sh)
