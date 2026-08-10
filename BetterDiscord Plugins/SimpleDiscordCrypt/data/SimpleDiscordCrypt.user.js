// ==UserScript==
// @name         SimpleDiscordCryptV2
// @namespace    https://github.com/s4dic/discord/tree/main/BetterDiscord%20Plugins/SimpleDiscordCrypt
// @version      1.7.5.4
// @description  SimpleDiscordCrypt 2026 – Now with all features working as intended
// @author       Sleek, original by An0
// @license      LGPLv3 - https://www.gnu.org/licenses/lgpl-3.0.txt
// @downloadURL  https://raw.githubusercontent.com/s4dic/discord/refs/heads/main/BetterDiscord%20Plugins/SimpleDiscordCrypt/SimpleDiscordCryptLoader.plugin.js
// @updateURL    https://raw.githubusercontent.com/s4dic/discord/refs/heads/main/BetterDiscord%20Plugins/SimpleDiscordCrypt/SimpleDiscordCryptLoader.plugin.js
// ==/UserScript==

// Credits for inspiration to the original DiscordCrypt

(function () {
  'use strict';

  // ============================================================================
  // SECTION 1: CONSTANTS & CONFIGURATION
  // ============================================================================

  // v23: remote guild blacklist disabled; attachment download menu generalized.
  const CONFIG = {
    // URLs & Resources
    urls: {
      blacklist: null, // v23: upstream remote guild blacklist disabled
      gitlab: 'http://gitlab.com/An0/SimpleDiscordCrypt',
      iconLarge: 'https://i.imgur.com/pFuRfDE.png',
      iconSmall: 'https://i.imgur.com/zWXtTpX.png'
    },

    // Timing Configuration
    timing: {
      inactiveChannelMs: 7 * 24 * 60 * 60 * 1000,  // 1 week
      ignoreDiffKeyAgeMs: 7 * 24 * 60 * 60 * 1000, // 1 week
      diffKeyTriggerCount: 10,
      dbSaveIntervalMs: 10000,
      retryBaseDelayMs: 200,
      maxRetries: 5,
      keyExchangeTimeoutMs: 30000
    },

    // Visual Constants
    visual: {
      baseColor: '#0fc',
      baseColorInt: 0x00ffcc
    },

    // CSS Selectors (Discord UI - updated for 2026)
    selectors: {
      headerBar: [
        'section[class*=headerBar]',
        'div[class*=chat] section[class*=title]',
        'section[class*=title][class*=container]',
        'header[class*=container][class*=title]',
        'div[class^=chat] section[class^=title]'
      ],
      headerBarChannelName: [
        'h1[class*=title]',
        'h3[class*=title]',
        'div[class*=title][class*=text]',
        'div[class*=titleWrapper] div[class*=title]',
        'div[class*=channelName]',
        'span[class*=title]'
      ],
      // Legacy selectors (for backwards compatibility)
      headerBarLegacy: 'div[class^=chat] section[class^=title]',
      backdrop: 'div[class*=backdrop]',
      modalClass: 'layer_ad604d',
      imageWrapperImg: '.imageWrapper_fd6587 img',
      messageScroller: '.scroller__1f96e',
      chatInput: 'div[class^=channelTextArea] > div[class^=scrollableContainer]',
      messageImg: '.message__80c10 img',
      chatImage: '.scroller__1f96e .imageZoom_ceab9d img'
    },

    // Limits
    limits: {
      maxFilenameLength: 47,
      keyCacheSize: 200,
      maxModuleSearchIterations: 5000
    },

    // Crypto Configuration
    crypto: {
      payloadOffset: 0x2800, // Braille Unicode block offset
      dhKeyBytes: 2048 / 8,
      aesKeyBytes: 256 / 8
    },

    // Message Constants
    messages: {
      unknownKey: '```fix\n-----ENCRYPTED MESSAGE WITH UNKNOWN KEY-----\n```',
      invalid: '```diff\n-⁣----ENCRYPTED MESSAGE WITH UNKNOWN FORMAT-----\n```',
      unknownKeySystem: '```fix\n-----SYSTEM MESSAGE WITH UNKNOWN KEY-----\n```',
      invalidSystem: '```diff\n-⁣----SYSTEM MESSAGE WITH UNKNOWN FORMAT-----\n```',
      blocked: '```fix\n-----SYSTEM MESSAGE BLOCKED-----\n```'
    },

    // Regex Patterns
    patterns: {
      message: /^([⠀-⣿]{16,}) `(?:SimpleDiscordCrypt|🔒)`(?:\r?\nhttps:\/\/(?:www\.)?klipy\.com\/gifs\/[^\s<>'"]+)*$/i,
      systemMessage: /^```(?:\w*\n)?-----SYSTEM MESSAGE-----\n?```\s*(.*?)\s*```(?:\w*\n)?(?:🔒|SimpleDiscordCrypt)\n?```$/s,
      description: /^[⠀-⣿]{16,}$/,
      prefix: /^(?::?ENC(?:(?:_\w*)?:|\b)|<:ENC:\d{1,20}>)\s*/,
      noencPrefix: /^(?::?NOENC:?|<:NOENC:\d{1,20}>)\s*/,
      extension: /\.([^.]+)$/,
      filename: /^(.*?)((?:\.[^.]*)?)$/,
      youtube: /[?&]v=([\w-]+).*?(&(?:t|start)=[\dhms]+)?/,
      youtu: /^([\w-]+).*?(\?(?:t|start)=[\dhms]+)?/,
      starttime: /(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?/,
      image: /^[^?]*\.(?:png|jpe?g|gif|webp)(?:$|\?)/i,
      validSoundcloud: /^[^\/]+\/[^\/?]+(\?|$)/,
      everyone: /(?<!https?:\/\/[^\s]*)@(?:everyone|here)/,
      roleMention: /<@&(\d{16,20})>/g,
      blacklist: /^\s*(\d{1,20})(E?)/gm,
      imgsrcId: /#([^?]+)/,
      fullRegex: /^\/(.*)\/([imsu]{0,4})$/
    },

    // Media Type Mapping
    mediaTypes: {
      png: 'img',
      jpg: 'img',
      jpeg: 'img',
      gif: 'img',
      webp: 'img',
      webm: 'video',
      mp4: 'video',
      jpe: 'img',
      jfif: 'img',
      mov: 'video'
    }
  };

  // Computed selectors for backwards compatibility
  const HeaderBarSelector = CONFIG.selectors.headerBarLegacy;
  const HeaderBarChildrenSelector = `${HeaderBarSelector} > div[class^=upperContainer] > div[class^=children]`;
  const HeaderBarChannelNameSelector = `${HeaderBarChildrenSelector} div[class*=titleWrapper], ${HeaderBarChildrenSelector} div[class*=channelName]`;
  const BackdropSelector = CONFIG.selectors.backdrop;
  const ModalClass = CONFIG.selectors.modalClass;
  const ImageWrapperImgSelector = CONFIG.selectors.imageWrapperImg;
  const ModalImgSelector = `.${ModalClass} ${ImageWrapperImgSelector}`;
  const MessageScrollerSelector = CONFIG.selectors.messageScroller;
  const ChatInputSelector = CONFIG.selectors.chatInput;
  const MessageImgSelector = CONFIG.selectors.messageImg;
  const ChatImageSelector = CONFIG.selectors.chatImage;
  const HeaderBarSelectors = CONFIG.selectors.headerBar;
  const HeaderBarChannelNameSelectors = CONFIG.selectors.headerBarChannelName;

  // Legacy constants for backwards compatibility
  const BlacklistUrl = CONFIG.urls.blacklist;
  const BaseColor = CONFIG.visual.baseColor;
  const BaseColorInt = CONFIG.visual.baseColorInt;
  const InactiveChannelTime = CONFIG.timing.inactiveChannelMs;
  const IgnoreDiffKeyAge = CONFIG.timing.ignoreDiffKeyAgeMs;
  const DiffKeyTrigger = CONFIG.timing.diffKeyTriggerCount;

  // Storage & CSP
  const SavedLocalStorage = typeof localStorage !== 'undefined' ? localStorage : null;
  // @ts-ignore
  const FixedCsp = typeof CspDisarmed !== 'undefined' ? CspDisarmed : false;

  // HTML Escaping utility
  const htmlEscapeDiv = document.createElement('div');
  function HtmlEscape(string) {
    htmlEscapeDiv.textContent = string;
    return htmlEscapeDiv.innerHTML;
  }

  // ============================================================================
  // SECTION 1B: STYLES & UI CONSTANTS
  // ============================================================================

  const Style = {
    css: `
/*fixes*/
${HeaderBarSelector}, ${HeaderBarChildrenSelector}, ${HeaderBarSelectors.join(', ')} { overflow: visible !important }
/*style*/
.sdc * {
    font-family: var(--font-primary);
    font-size: 16px;
    font-weight: normal;
    line-height: 1;
    text-rendering: optimizeLegibility;
    color: #f6f6f7;
    user-select: none;
    display: flex;
    padding: 0;
    margin: 0;
}
.sdc-overlay,.sdc-cover {
    position: fixed;
    left: 0;
    bottom: 0;
    right: 0;
    top: 0;
    z-index: 1000;
    align-items: center;
    justify-content: center;
    pointer-events: none;
}
.sdc-cover {
    background: rgba(0,0,0,.85);
    pointer-events: auto;
}
.sdc-window {
    background-color: #070709;
    flex-direction: column;
    border-radius: 5px;
    pointer-events: auto;
    position: relative;
    z-index: 1000;
}
.sdc-window > * { margin: 0 20px }
.sdc-footer {
    margin: 0;
    padding: 20px;
    background-color: #070709;
    box-shadow: inset 0 1px 0 rgba(7,7,9,.6);
    border-radius: 0 0 5px 5px;
    justify-content: flex-end;
}
.sdc h4,.sdc h4 * {
    text-transform: uppercase;
    letter-spacing: .3px;
    font-weight: 600;
    line-height: 20px;
}
.sdc h5,.sdc h5 * {
    color: #b9bbbe;
    text-transform: uppercase;
    letter-spacing: .5px;
    font-weight: 600;
    font-size: 12px;
    line-height: 16px;
}
.sdc input {
    background: rgba(0,0,0,.1);
    border: solid 1px rgba(0,0,0,.3);
    border-radius: 3px;
    height: 38px;
    padding: 0 10px;
    outline: 0;
    transition: border .15s ease;
}
.sdc input:focus { border-color: #72dac7 }
.sdc button {
    min-height: 38px;
    border-radius: 3px;
    justify-content: center;
    align-items: center;
    padding: 2px 16px;
    cursor: pointer;
}
.sdc button,.sdc button * {
    font-size: 14px;
    font-weight: 500;
    line-height: 16px;
}
.sdc-btn {
    border: 0;
    color: #fff;
    background-color: #72dac7;
    transition: background-color .17s ease;
}
.sdc-btn:hover { background-color: #67c4b3 }
.sdc-lnkbtn {
    border: 0;
    color: #fff;
    background-color: transparent;
}
.sdc-lnkbtn:hover > * { background-image: linear-gradient(0,transparent,transparent 1px,#fff 0,#fff 2px,transparent 0); }
.sdc-rbtn {
    color: #f04747;
    border: solid 1px rgba(240,71,71,.3);
    transition: border-color .17s ease;
    background-color: transparent;
}
.sdc-rbtn:hover { border-color: rgba(240,71,71,.6) }
.sdc-rbtn:disabled {
    color: #8b8181;
    border-color: rgba(130,126,126,.6);
    cursor: default;
}
.sdc-wbtn {
    color: #f6f6f7;
    border: solid 1px rgba(240,240,242,.3);
    transition: border-color .17s ease;
    background-color: transparent;
}
.sdc-wbtn:hover { border-color: rgba(240,240,242,.6) }
.sdc-wbtn:disabled {
    color: #a6a6a7;
    border-color: rgba(126,126,126,.6);
    cursor: default;
}
.sdc-select {
    background: rgba(0,0,0,.1);
    border-radius: 4px;
    position: relative;
    transition: border-color .15s ease;
}
.sdc-select:hover { border-color: #040405; }
.sdc-select input + * {
    margin-right: 17px;
    width: 100%;
    align-items: center;
}
.sdc-select input + *::after {
    content: '';
    border-color: #999 transparent transparent;
    border-style: solid;
    border-width: 5px 5px 2.5px;
    position: absolute;
    right: 10px;
    margin-top: 2px;
}
.sdc-select:hover input + *::after { border-color: #f6f6f7 transparent transparent }
.sdc-select input:checked + *::after {
    border-color: transparent transparent #f6f6f7;
    border-width: 0 5px 5px;
}
.sdc-select, .sdc-select > div {
    border: solid 1px rgba(0,0,0,.3);
    flex-direction: column;
    box-sizing: content-box;
}
.sdc-select > div {
    background: #070709;
    position: absolute;
    top: 100%;
    width: 100%;
    margin: -.8px;
    margin-top: -2px;
    border-radius: 0 0 4px 4px;
    box-shadow: 0 1px 5px rgba(0,0,0,.3);
    z-index: 1;
}
.sdc-select > label,.sdc-select > div > * {
    height: 38px;
    padding: 0 10px;
    align-items: center;
    overflow: hidden;
}
.sdc-select > div > a:hover { background: rgba(0,0,0,.1) }

.sdc-tooltip {
    visibility: hidden;
    width: 124px;
    background-color: black;
    font-size: 15px;
    justify-content: center;
    border-radius: 6px;
    padding: 6px 0;
    position: absolute;
    z-index: 1;
    top: 150%;
    left: 50%;
    margin-left: -62px;
}
.sdc-tooltip::after {
    content: '';
    position: absolute;
    bottom: 100%;
    left: 50%;
    margin-left: -5px;
    border-width: 5px;
    border-style: solid;
    border-color: transparent transparent black transparent;
}
:hover > .sdc-tooltip { visibility: visible }

.sdc-menu {
    position: fixed;
    min-width: 170px;
    z-index: 1005;
    border-radius: 5px;
    background: #070709;
    box-shadow: 0 0 1px rgba(0,0,0,.82), 0 1px 4px rgba(0,0,0,.1);
}
.sdc-menu a {
    font-size: 13px;
    font-weight: 500;
    line-height: 16px;
    margin: 2px 0;
    padding: 6px 10px;
    overflow: hidden;
    color: #fff;
    opacity: .6;
    border-radius: 5px;

    transition: none;
    cursor: default;
}
.sdc-menu a:hover {
    background: #0f0f11;
    opacity: 1;
}
.sdc-menu > div {
    border-bottom: solid 1px hsla(0,0%,96%,.08);
    flex-direction: column;
}
.sdc-menu > div:last-child { border: 0 }
.sdc-hidden {
    width: 0;
    height: 0;
    padding: 0;
    border: 0;
    overflow: hidden;
    outline: 0;
    margin: 0;
    opacity: 0;
}
.sdc-scroll {
    display: block;
    overflow-x: hidden;
    overflow-y: auto;
    margin: 0;
    padding: 0 12px 0 20px;
}
.sdc-scroll::-webkit-scrollbar {
    width: 8px;
}
.sdc-scroll::-webkit-scrollbar-thumb {
    background-color: rgba(32,34,37,.6);
    border: 2px solid transparent;
    border-radius: 4px;
    background-clip: padding-box;
}
.sdc-list {
    flex-direction: column;
    min-height: 100px;
}
.sdc-list > div {
    border: solid 1px rgba(32,34,37,.6);
    border-radius: 5px;
    margin: 4px 0;
}
.sdc-list > div:hover {
    background-color: rgba(32,34,37,.1);
}
.sdc-list > div > div:first-child {
    margin-right: auto;
    padding: 12px 0 8px 20px;
    flex-direction: column;
}
.sdc-list h6 {
    font-weight: 600;
    line-height: 20px;
    word-break: break-all; /*FF*/
    word-break: break-word;
    max-width: 400px;
}
.sdc-list p {
    line-height: 16px;
    font-size: 12px;
    font-weight: 400;
    color: #b9bbbe;
}
.sdc-edit {
    background: url('data:image/svg+xml;utf8,%3Csvg xmlns="http://www.w3.org/2000/svg" fill="%23F6F6F7" viewBox="0 0 36 36"%3E%3Cpath d="M1,35.9L8.2,35l7-9l-5-5l-9,7l-0.9,7.1L3.4,32c-0.2-0.3-0.3-0.6-0.3-1c0-1.1,0.9-2,2-2s2,0.9,2,2s-0.9,2-2,2c-0.4,0-0.7-0.1-1-0.3L1,35.9z"/%3E%3Cpath d="M9.5,18.3l13-13c0,0,0,0,0,0c0,0,0.6-0.6,0.8-0.8l3.4-3.4l0,0c1.2-1.1,3-1.1,4.1,0L35,5.3c1.1,1.1,1.1,3,0,4.1l0,0l0,0c0,0,0,0,0,0l-4.2,4.2c0,0,0,0,0,0l-13,13c-1.1,1.2-3,1.2-4.2,0l-4.2-4.2C8.4,21.3,8.4,19.5,9.5,18.3z"/%3E%3C/svg>');
    background-size: cover;
    width: 20px;
    height: 20px;
    cursor: pointer;
    margin: -2px 0 0 6px;
    opacity: .6;
}
.sdc-edit:hover { opacity: 1 }
.sdc-listbox {
    width: 76px;
    align-items: center;
    justify-content: center;
}
.sdc-listbox::before {
    content: '';
    width: 1px;
    height: 30px;
    background: rgba(32,34,37,.5);
}
.sdc-listbox > * { margin: auto }
.sdc-listcheckbox > label { height: 24px }
.sdc-listcheckbox input + *::after {
    content: '';
    border: solid 1px #62666d;
    border-radius: 3px;
    width: 24px;
    box-sizing: border-box;
    transition: background .17s ease,border-color .17s ease;
}
.sdc-listcheckbox input:enabled + * { cursor: pointer }
.sdc-listcheckbox input:enabled:hover + *::after { border-color: #72767d }
.sdc-listcheckbox input:checked + *::after {
    content: url('data:image/svg+xml,%3Csvg stroke="%23FFF" viewBox="0 0 18 18" xmlns="http://www.w3.org/2000/svg"%3E%3Cpolyline stroke-width="2" fill="none" points="3.5 9.5 7 13 15 5"%3E%3C/polyline%3E%3C/svg%3E');
    border: 0;
    padding: 3px;
    background: #72dac7;
}
.sdc-listcheckbox input:enabled:checked:hover + *::after { background-color: #67c4b3 }
.sdc-listcheckbox input:disabled + *::after {
    background: #72767d;
    border: 0;
    opacity: .5;
}
.sdc-listbox:last-child {
    background: rgba(0,0,0,.1);
    padding: 9px;
}
.sdc-listbox:last-child::before { display: none }
.sdc-list > h5 > p {
    font-size: 10px;
    font-weight: 700;
    color: #dcddde;;
    padding: 0 8px 1px 8px;
    box-sizing: border-box;
    justify-content: center;
}
.sdc-close {
    content: url('data:image/svg+xml;utf8,%3Csvg fill="%23DCDDDE" viewBox="0 0 12 12" xmlns="http://www.w3.org/2000/svg"%3E%3Cpath d="M9.5 3.205L8.795 2.5 6 5.295 3.205 2.5l-.705.705L5.295 6 2.5 8.795l.705.705L6 6.705 8.795 9.5l.705-.705L6.705 6"%3E%3C/path%3E%3C/svg%3E');
    width: 18px;
    height: 18px;
    cursor: pointer;
    border-radius: 3px;
    margin: 0;
    padding: 4px;
    position: absolute;
    right: 16px;
    top: 16px;
    opacity: .5;
}
.sdc-close:hover {
    opacity: 1;
    background-color: hsla(210,3%,87%,.05);
}
.sdc-zoom::-webkit-scrollbar {
    width: 8px;
    height: 8px;
}
.sdc-zoom::-webkit-scrollbar, .sdc-zoom::-webkit-scrollbar-corner {
    background: #36393f;
}
.sdc-zoom::-webkit-scrollbar-thumb {
    background: #72dac7;
}


/* encrypted attachment download button */
.sdc-attachment-download-card {
    position: relative !important;
}
.sdc-attachment-download-btn {
    all: unset;
    box-sizing: border-box;
    position: absolute;
    right: 10px;
    top: 50%;
    transform: translateY(-50%);
    width: 32px;
    height: 32px;
    border-radius: 8px;
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    z-index: 4;
    color: var(--interactive-normal, #b5bac1);
    background: transparent;
    transition:
        background-color .12s ease,
        color .12s ease,
        opacity .12s ease;
}
.sdc-attachment-download-btn:hover {
    color: var(--interactive-hover, #dbdee1);
    background: var(--background-modifier-hover, rgba(79,84,92,.24));
}
.sdc-attachment-download-btn:active {
    background: var(--background-modifier-active, rgba(79,84,92,.32));
}
.sdc-attachment-download-btn:disabled {
    cursor: default;
    opacity: .75;
}
.sdc-attachment-download-btn svg {
    width: 19px;
    height: 19px;
    fill: none;
    stroke: currentColor;
    stroke-width: 2;
    stroke-linecap: round;
    stroke-linejoin: round;
}
.sdc-attachment-download-spinner {
    width: 16px;
    height: 16px;
    box-sizing: border-box;
    border: 2px solid currentColor;
    border-right-color: transparent;
    border-radius: 50%;
    animation: sdc-attachment-download-spin .7s linear infinite;
}
.sdc-attachment-download-success {
    color: var(--status-positive, #23a55a);
    font-size: 18px;
    font-weight: 700;
}
.sdc-attachment-download-error {
    color: var(--status-danger, #f23f43);
    font-size: 18px;
    font-weight: 700;
}
@keyframes sdc-attachment-download-spin {
    to { transform: rotate(360deg); }
}

/*for light theme*/
.theme-light .SDC_TOGGLE { fill: #4f5660 }
.theme-light .SDC_SELECTED { color: #4f5660 }
`,
    Inject: function () {
      let style = document.createElement('style');
      style.innerHTML = this.css;
      document.head.appendChild(style);
      this.domElement = style;
    },
    Remove: function () {
      if (this.domElement) this.domElement.remove();
    },
  };

  // ============================================================================
  // SECTION 1C: UI WINDOW OBJECTS
  // ============================================================================

  // Base UIWindow class for all modal windows
  class UIWindow {
    constructor(html, className) {
      this.html = html;
      this.className = className;
      this.domElement = null;
    }

    show() {
      let wrapper = document.createElement('div');
      wrapper.innerHTML = this.html;
      this.attachEventListeners(wrapper);
      document.body.appendChild(wrapper);
      this.domElement = wrapper;
    }

    remove() {
      if (this.domElement) this.domElement.remove();
    }

    attachEventListeners(wrapper) {
      // Override in subclasses
    }

    attachEvent(wrapper, className, eventName, callback) {
      Utils.AttachEventToClass(wrapper, className, eventName, callback);
    }

    getElement(wrapper, className) {
      return wrapper.getElementsByClassName(className)[0];
    }
  }

  // Factory for creating simple window objects with common pattern
  function createWindow(html) {
    return {
      html,
      domElement: null,
      Show: function (...callbacks) {
        let wrapper = document.createElement('div');
        wrapper.innerHTML = this.html;
        this.setupCallbacks(wrapper, callbacks);
        document.body.appendChild(wrapper);
        this.domElement = wrapper;
      },
      Remove: function () {
        if (this.domElement) this.domElement.remove();
      },
      setupCallbacks: function () {
        // Override in specific windows
      }
    };
  }

  const UnlockWindow = {
    html: `<div class="sdc">
<div class="SDC_CANCEL sdc-cover"></div>
<div class="sdc-overlay">
    <form class="SDC_UNBLOCK sdc-window" style="min-width: 480px">
        <div style="margin-top:20px">
            <h4>Unlock Database</h4>
        </div>
        <h5 style="margin-top:20px">Password</h5>
        <input class="SDC_PASSWORD" style="margin-top:8px;margin-bottom:20px" type="password" name="sdc-password">
        <div class="sdc-footer"><button type="button" class="SDC_CANCEL sdc-lnkbtn"><p>Cancel</p></button><button type="button" class="SDC_NEWDB sdc-rbtn" style="margin:0 4px">New DB</button><button type="submit" class="sdc-btn" style="min-width:96px">Unlock</button></div>
    </form>
</div>
</div>`,
    domElement: null,
    Show: function (passwordCallback, newdbCallback, cancelCallback) {
      let wrapper = document.createElement('div');
      wrapper.innerHTML = this.html;

      Utils.AttachEventToClass(wrapper, 'SDC_UNBLOCK', 'submit', (e) => {
        e.preventDefault();
        this.Remove();
        passwordCallback(wrapper.getElementsByClassName('SDC_PASSWORD')[0].value);
      });
      Utils.AttachEventToClass(wrapper, 'SDC_NEWDB', 'click', () => {
        this.Remove();
        newdbCallback();
      });
      Utils.AttachEventToClass(wrapper, 'SDC_CANCEL', 'click', () => {
        this.Remove();
        if (cancelCallback) cancelCallback();
      });

      document.body.appendChild(wrapper);
      this.domElement = wrapper;
    },
    Remove: function () {
      if (this.domElement) this.domElement.remove();
    },
  };
  const NewdbWindow = {
    html: `<div class="sdc">
<div class="SDC_CANCEL sdc-cover"></div>
<div class="sdc-overlay">
    <form class="SDC_CREATEDB sdc-window" style="min-width: 480px">
        <div style="margin-top:20px">
            <h4>Create Database</h4>
        </div>
        <h5 style="margin-top:20px">Password <p style="margin-left:5px;opacity:.6">(optional)</p></h5>
        <input class="SDC_PASSWORD" style="margin-top:8px;margin-bottom:20px" type="password" name="sdc-password">
        <div class="sdc-footer"><button type="button" class="SDC_CANCEL sdc-lnkbtn"><p>Cancel</p></button><button type="button" class="SDC_IMPORT sdc-lnkbtn"><p>Import</p></button><button type="button" class="SDC_SECONDARY sdc-lnkbtn" style="padding-right:22px"><p>Secondary</p></button><button type="submit" class="sdc-btn" style="min-width:96px">Create</button></div>
    </form>
</div>
</div>`,
    Show: function (
      newdbCallback,
      importCallback,
      secondaryCallback,
      cancelCallback
    ) {
      let wrapper = document.createElement('div');
      wrapper.innerHTML = this.html;

      Utils.AttachEventToClass(wrapper, 'SDC_CREATEDB', 'submit', (e) => {
        e.preventDefault();
        this.Remove();
        newdbCallback(wrapper.getElementsByClassName('SDC_PASSWORD')[0].value);
      });
      Utils.AttachEventToClass(wrapper, 'SDC_IMPORT', 'click', () => {
        importCallback();
      });
      Utils.AttachEventToClass(wrapper, 'SDC_SECONDARY', 'click', () => {
        secondaryCallback();
      });
      Utils.AttachEventToClass(wrapper, 'SDC_CANCEL', 'click', () => {
        this.Remove();
        if (cancelCallback) cancelCallback();
      });

      document.body.appendChild(wrapper);
      this.domElement = wrapper;
    },
    Remove: function () {
      if (this.domElement) this.domElement.remove();
    },
  };
  const NewPasswordWindow = {
    html: `<div class="sdc">
<div class="SDC_CANCEL sdc-cover"></div>
<div class="sdc-overlay">
    <form class="SDC_CHANGEPASSWORD sdc-window" style="min-width: 480px">
        <div style="margin-top:20px">
            <h4>Change Database Password</h4>
        </div>
        <h5 style="margin-top:20px">Password <p style="margin-left:5px;opacity:.6">(optional)</p></h5>
        <input class="SDC_PASSWORD" style="margin-top:8px;margin-bottom:20px" type="password" name="sdc-password">
        <div class="sdc-footer"><button type="button" class="SDC_CANCEL sdc-lnkbtn" style="min-width:96px"><p>Cancel</p><button type="submit" class="sdc-btn" style="min-width:96px">Change</button></div>
    </form>
</div>
</div>`,
    Show: function (newPasswordCallback, cancelCallback) {
      let wrapper = document.createElement('div');
      wrapper.innerHTML = this.html;

      Utils.AttachEventToClass(wrapper, 'SDC_CHANGEPASSWORD', 'submit', (e) => {
        e.preventDefault();
        this.Remove();
        newPasswordCallback(
          wrapper.getElementsByClassName('SDC_PASSWORD')[0].value
        );
      });
      Utils.AttachEventToClass(wrapper, 'SDC_CANCEL', 'click', () => {
        this.Remove();
        if (cancelCallback) cancelCallback();
      });

      document.body.appendChild(wrapper);
      this.domElement = wrapper;
    },
    Remove: function () {
      if (this.domElement) this.domElement.remove();
    },
  };
  const KeyManagerWindow = {
    html: `<div class="sdc">
<div class="SDC_CLOSE sdc-cover"></div>
<div class="sdc-overlay">
    <div class="sdc-window" style="min-width: 580px">
        <div style="margin:20px">
            <h4>Key Manager</h4>
        </div>
        <a class="SDC_CLOSE sdc-close"></a>
        <div class="sdc-scroll" onscroll="this.style.boxShadow=this.scrollTop?'inset 0 1px 0 0 rgba(24,25,28,.3),inset 0 1px 2px 0 rgba(24,25,28,.3)':null" style="max-height:60vh">
        <div class="SDC_LIST sdc-list">
            <h5><p>Key</p><p style="margin-left:auto;width:76px">Hidden</p><p style="width:94px">Delete</p></h5>

        </div>
        </div>
        <div class="sdc-footer">
            <button type="button" class="SDC_CLOSE sdc-btn" style="min-width:96px">Done</button>
        </div>
    </div>
</div>
</div>`,
    Show: function (keys, setKeyDescriptor, setKeyHidden, deleteKey) {
      let wrapper = document.createElement('div');
      wrapper.innerHTML = this.html;

      Utils.AttachEventToClass(wrapper, 'SDC_CLOSE', 'click', () => {
        this.Remove();
      });

      let list = wrapper.getElementsByClassName('SDC_LIST')[0];
      for (let key of keys) {
        let listItem = document.createElement('div');
        listItem.innerHTML = `<div>
                    <h6 class="SDC_DESCRIPTOR">${HtmlEscape(
          key.descriptor
        )} <a class="SDC_EDITDESCRIPTOR sdc-edit"></a></h6>
                    <p>${Utils.FormatTime(key.lastseen)}</p>
                </div>
                <div class="sdc-listbox sdc-listcheckbox"><label><input type="checkbox" class="SDC_SETHIDDEN" style="display:none"${key.hidden ? ' checked' : ''
          }${key.type !== 'GROUP' ? ' disabled' : ''
          }><p></p></label></div>
                <div class="sdc-listbox"><button type="button" class="SDC_DELETE sdc-rbtn" style="margin:0 4px"${key.protected ? ' disabled' : ''
          }>Delete</button></div>`;
        if (key.trusted)
          listItem.getElementsByClassName('SDC_DESCRIPTOR')[0].style.color =
            BaseColor;
        const editDescriptor = (e) => {
          let descriptorElement =
            listItem.getElementsByClassName('SDC_DESCRIPTOR')[0];
          descriptorElement.innerHTML = `<input type="text" class="SDC_DESCRIPTORINPUT" style="width:320px"></input>`;
          const changeBack = () => {
            descriptorElement.innerHTML = `${HtmlEscape(
              key.descriptor
            )} <a class="SDC_EDITDESCRIPTOR sdc-edit"></a>`;
            Utils.AttachEventToClass(
              descriptorElement,
              'SDC_EDITDESCRIPTOR',
              'click',
              editDescriptor
            );
          };
          let descriptorInput = descriptorElement.getElementsByClassName(
            'SDC_DESCRIPTORINPUT'
          )[0];
          descriptorInput.value = key.rawDescriptor;
          descriptorInput.onkeydown = function (e) {
            if (e.key === 'Enter') {
              e.preventDefault();
              setKeyDescriptor(key, this.value);
              changeBack();
            } else if (e.key === 'Escape') changeBack();
          };
          descriptorInput.focus();
        };
        Utils.AttachEventToClass(
          listItem,
          'SDC_EDITDESCRIPTOR',
          'click',
          editDescriptor
        );
        Utils.AttachEventToClass(
          listItem,
          'SDC_SETHIDDEN',
          'change',
          function () {
            setKeyHidden(key, this.checked);
          }
        );
        Utils.AttachEventToClass(listItem, 'SDC_DELETE', 'click', () => {
          deleteKey(key);
          list.removeChild(listItem);
        });

        list.appendChild(listItem);
      }

      document.body.appendChild(wrapper);
      this.domElement = wrapper;
    },
    Remove: function () {
      if (this.domElement) this.domElement.remove();
    },
  };
  const ChannelManagerWindow = {
    html: `<div class="sdc">
<div class="SDC_CLOSE sdc-cover"></div>
<div class="sdc-overlay">
    <div class="sdc-window" style="min-width: 580px">
        <div style="margin:20px">
            <h4>Channel Manager</h4>
        </div>
        <a class="SDC_CLOSE sdc-close"></a>
        <div class="sdc-scroll" onscroll="this.style.boxShadow=this.scrollTop?'inset 0 1px 0 0 rgba(24,25,28,.3),inset 0 1px 2px 0 rgba(24,25,28,.3)':null" style="max-height:60vh">
        <div class="SDC_LIST sdc-list">
            <h5><p>Config</p><p style="margin-left:auto;width:94px">Delete</p></h5>

        </div>
        </div>
        <div class="sdc-footer">
            <button type="button" class="SDC_CLOSE sdc-btn" style="min-width:96px">Done</button>
        </div>
    </div>
</div>
</div>`,
    Show: function (channels, deleteChannel) {
      let wrapper = document.createElement('div');
      wrapper.innerHTML = this.html;

      Utils.AttachEventToClass(wrapper, 'SDC_CLOSE', 'click', () => {
        this.Remove();
      });

      let list = wrapper.getElementsByClassName('SDC_LIST')[0];
      for (let channel of channels) {
        let listItem = document.createElement('div');
        listItem.innerHTML = `<div>
                    <h6 class="SDC_DESCRIPTOR">${HtmlEscape(
          channel.descriptor
        )}</h6>
                    <p>${Utils.FormatTime(channel.lastseen)}</p>
                </div>
                <div class="sdc-listbox"><button type="button" class="SDC_DELETE sdc-rbtn" style="margin:0 4px">Delete</button></div>`;
        Utils.AttachEventToClass(listItem, 'SDC_DELETE', 'click', () => {
          deleteChannel(channel);
          list.removeChild(listItem);
        });

        list.appendChild(listItem);
      }

      document.body.appendChild(wrapper);
      this.domElement = wrapper;
    },
    Remove: function () {
      if (this.domElement) this.domElement.remove();
    },
  };
  const ShareKeyWindow = {
    html: `<div class="sdc">
<div class="SDC_CLOSE sdc-cover"></div>
<div class="sdc-overlay">
    <div class="sdc-window" style="min-width: 580px">
        <div style="margin:20px">
            <h4>Share Keys</h4>
        </div>
        <a class="SDC_CLOSE sdc-close"></a>
        <div class="sdc-scroll" onscroll="this.style.boxShadow=this.scrollTop?'inset 0 1px 0 0 rgba(24,25,28,.3),inset 0 1px 2px 0 rgba(24,25,28,.3)':null" style="max-height:60vh">
        <div class="SDC_LIST sdc-list">
            <h5><p>Key</p><p style="margin-left:auto;width:94px">Share</p></h5>

        </div>
        </div>
        <div class="sdc-footer">
            <button type="button" class="SDC_CLOSE sdc-btn" style="min-width:96px">Done</button>
        </div>
    </div>
</div>
</div>`,
    Show: function (keys, shareKey) {
      let wrapper = document.createElement('div');
      wrapper.innerHTML = this.html;

      Utils.AttachEventToClass(wrapper, 'SDC_CLOSE', 'click', () => {
        this.Remove();
      });

      let list = wrapper.getElementsByClassName('SDC_LIST')[0];
      for (let key of keys) {
        let listItem = document.createElement('div');
        listItem.innerHTML = `<div>
                    <h6 class="SDC_DESCRIPTOR">${HtmlEscape(
          key.descriptor
        )}</h6>
                    <p>${Utils.FormatTime(key.lastseen)}</p>
                </div>
                <div class="sdc-listbox"><button type="button" class="SDC_SHARE sdc-wbtn" style="margin:0 4px">Share</button></div>`;
        Utils.AttachEventToClass(listItem, 'SDC_SHARE', 'click', function () {
          shareKey(key);
          this.disabled = true;
        });

        list.appendChild(listItem);
      }

      document.body.appendChild(wrapper);
      this.domElement = wrapper;
    },
    Remove: function () {
      if (this.domElement) this.domElement.remove();
    },
  };
  const KeySelectWindow = {
    html: `<div class="sdc">
<div class="SDC_CLOSE sdc-cover"></div>
<div class="sdc-overlay">
    <div class="sdc-window" style="min-width: 480px">
        <div style="margin:20px">
            <h4>Select Key</h4>
        </div>
        <a class="SDC_CLOSE sdc-close"></a>
        <div class="sdc-scroll" onscroll="this.style.boxShadow=this.scrollTop?'inset 0 1px 0 0 rgba(24,25,28,.3),inset 0 1px 2px 0 rgba(24,25,28,.3)':null" style="max-height:60vh">
        <div class="SDC_LIST sdc-list">
            <h5><p>Key</p></h5>

        </div>
        </div>
        <div class="sdc-footer">
            <button type="button" class="SDC_CLOSE sdc-btn" style="min-width:96px">Cancel</button>
        </div>
    </div>
</div>
</div>`,
    Show: function (keys, selectKey) {
      let wrapper = document.createElement('div');
      wrapper.innerHTML = this.html;

      Utils.AttachEventToClass(wrapper, 'SDC_CLOSE', 'click', () => {
        this.Remove();
      });

      let list = wrapper.getElementsByClassName('SDC_LIST')[0];
      for (let key of keys) {
        let listItem = document.createElement('div');
        let formattedTime = key.lastseen ? Utils.FormatTime(key.lastseen) : 'Never';
        listItem.innerHTML = `<div style="margin-right:auto;padding:12px 0 8px 20px;flex-direction:column;width:100%">
                    <h6 style="${key.trusted ? `color:${BaseColor}` : ''}">${HtmlEscape(key.descriptor)}</h6>
                    <p>${formattedTime}</p>
                </div>`;

        if (key.selected) {
          listItem.style.backgroundColor = 'rgba(114,218,199,.15)';
          listItem.style.borderColor = BaseColor;
        } else {
          listItem.style.cursor = 'pointer';
          listItem.onclick = () => {
            selectKey(key);
            this.Remove();
          };
        }

        list.appendChild(listItem);
      }

      document.body.appendChild(wrapper);
      this.domElement = wrapper;
    },
    Remove: function () {
      if (this.domElement) this.domElement.remove();
    },
  };
  const MenuBar = {
    // Keep the React lock's layout intentionally identical to InvisibleTyping's
    // chat-input button. In particular, do not style the Tooltip wrapper: doing
    // so can contribute visual overflow to Discord's scrollable composer.
    menuBarCss: `.SDC_TOGGLE{opacity:.6;fill:#fff;height:22.5px;width:22.5px;cursor:pointer;margin:0}.SDC_TOGGLE:hover{opacity:.8}.sdc-menu{z-index:10000}.sdcReactLockButton svg{color:var(--interactive-normal);overflow:visible}.sdcReactLockButton{box-sizing:border-box;padding:0;margin-inline:0;min-height:var(--space-32);min-width:var(--space-32)}.sdcReactLockButton:hover svg{color:var(--interactive-hover)}.SDC_KEYSELECT_BTN{flex:0 1 auto}.SDC_KEYSELECT_BTN>p{min-width:0}`,
    toggleOnButtonHtml: `<div class="sdc" style="position:relative;display:inline-block"><svg class="SDC_TOGGLE" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 36 36"><path d="M18 0c-4.612 0-8.483 3.126-9.639 7.371l3.855 1.052C12.91 5.876 15.233 4 18 4c3.313 0 6 2.687 6 6v10h4V10c0-5.522-4.477-10-10-10z"/><path d="M31 32c0 2.209-1.791 4-4 4H9c-2.209 0-4-1.791-4-4V20c0-2.209 1.791-4 4-4h18c2.209 0 4 1.791 4 4v12z"/></svg></div>`,
    toggleOffButtonHtml: `<div class="sdc" style="position:relative;display:inline-block"><svg class="SDC_TOGGLE" style="opacity:1;fill:#00ff00" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 36 36"><path d="M18 3C12.477 3 8 7.477 8 13v10h4V13c0-3.313 2.686-6 6-6s6 2.687 6 6v10h4V13c0-5.523-4.477-10-10-10z"/><path d="M31 32c0 2.209-1.791 4-4 4H9c-2.209 0-4-1.791-4-4V20c0-2.209 1.791-4 4-4h18c2.209 0 4 1.791 4 4v12z"/></svg></div>`,
    keySelectButtonHtml: `<div class="sdc" style="margin:-3px 0 -2px 5px"><button type="button" class="SDC_KEYSELECT_BTN" style="min-width:200px;max-width:300px;height:30px;background:rgba(0,0,0,.1);border:solid 1px rgba(0,0,0,.3);border-radius:3px;padding:0 10px;cursor:pointer;justify-content:center;align-items:center;transition:border-color .15s ease"><p class="SDC_SELECTED" style="text-align:center;overflow:hidden;text-overflow:ellipsis;white-space:nowrap"></p></button></div>`,
    toggledOnCss: `${ChatInputSelector}{box-shadow:0 0 0 1px ${BaseColor} !important}`,
    menuHtml: `<button type="button" class="SDC_FOCUS sdc-hidden"></button>
<div class="sdc sdc-menu SDC_MENU" style="visibility:hidden">
    <div class="SDC_DMMENU">
        <a class="SDC_KEYART">Visualize Key</a>
        <a class="SDC_KEYEXCHANGE">Start Key Exchange</a>
        <a class="SDC_KEYSHARE">Share Keys</a>
    </div>
    <div class="SDC_GROUPMENU">
        <a class="SDC_NEWKEY">Create Group Key</a>
    </div>
    <div>
        <a class="SDC_KEYMANAGER">Key Manager</a>
        <a class="SDC_CHMANAGER">Channel Manager</a>
    </div>
    <div>
        <a class="SDC_EXPORTDB">Export Database</a>
        <a class="SDC_NEWDBKEY">Change Database Key</a>
        <a class="SDC_NEWDB" style="color:#ff4031">New Database</a>
    </div>
</div>`,
    Show: function (
      getToggleStatus,
      toggle,
      getCurrentKeyInfo,
      getKeys,
      selectKey,
      getIsDmChannel,
      exportDb,
      exportDbRaw,
      newDb,
      newDbKey,
      keyExchange,
      groupKey,
      keyManager,
      channelManager,
      keyVisualizer,
      keyShare
    ) {
      this.toggledOnStyle = document.createElement('style');
      this.toggledOnStyle.innerHTML = this.toggledOnCss;

      this.menuBarStyle = document.createElement('style');
      this.menuBarStyle.innerHTML = this.menuBarCss;
      document.head.appendChild(this.menuBarStyle);

      this.keySelectButton = document.createElement('div');
      this.keySelectButton.innerHTML = this.keySelectButtonHtml;
      let keySelectSelected =
        this.keySelectButton.getElementsByClassName('SDC_SELECTED')[0];
      let keySelectBtn =
        this.keySelectButton.getElementsByClassName('SDC_KEYSELECT_BTN')[0];

      this.menuWrapper = document.createElement('div');
      this.menuWrapper.innerHTML = this.menuHtml;
      document.body.appendChild(this.menuWrapper);
      let menu = this.menuWrapper.getElementsByClassName('SDC_MENU')[0];
      let menuFocus = this.menuWrapper.getElementsByClassName('SDC_FOCUS')[0];
      let menuDmGroup =
        this.menuWrapper.getElementsByClassName('SDC_DMMENU')[0];
      let menuNondmGroup =
        this.menuWrapper.getElementsByClassName('SDC_GROUPMENU')[0];

      this.toggleOnButton = document.createElement('div');
      this.toggleOnButton.className = 'sdc-chat-button-host';
      this.toggleOnButton.title = 'Encrypt Channel';
      this.toggleOnButton.innerHTML = this.toggleOnButtonHtml;
      this.toggleOnButton.onclick = toggle;

      this.toggleOffButton = document.createElement('div');
      this.toggleOffButton.className = 'sdc-chat-button-host';
      this.toggleOffButton.title = 'Disable Encryption';
      this.toggleOffButton.innerHTML = this.toggleOffButtonHtml;
      this.toggleOffButton.onclick = toggle;

      Utils.AttachEventToClass(menu, 'SDC_EXPORTDB', 'mousedown', (e) =>
        e.ctrlKey ? exportDbRaw() : exportDb()
      );
      Utils.AttachEventToClass(menu, 'SDC_NEWDB', 'mousedown', () => newDb());
      Utils.AttachEventToClass(menu, 'SDC_NEWDBKEY', 'mousedown', () =>
        newDbKey()
      );
      Utils.AttachEventToClass(menu, 'SDC_KEYEXCHANGE', 'mousedown', () =>
        keyExchange()
      );
      Utils.AttachEventToClass(menu, 'SDC_NEWKEY', 'mousedown', () =>
        groupKey()
      );
      Utils.AttachEventToClass(menu, 'SDC_KEYMANAGER', 'mousedown', () =>
        keyManager()
      );
      Utils.AttachEventToClass(menu, 'SDC_CHMANAGER', 'mousedown', () =>
        channelManager()
      );
      Utils.AttachEventToClass(menu, 'SDC_KEYART', 'mousedown', () =>
        keyVisualizer()
      );
      Utils.AttachEventToClass(menu, 'SDC_KEYSHARE', 'mousedown', () =>
        keyShare()
      );

      // Gestionnaire du clic sur le bouton de sélection de clé
      keySelectBtn.onclick = () => {
        KeySelectWindow.Show(getKeys(), selectKey);
      };

      this.UpdateContextMenuGroups = () => {
        let isDm = false;
        try {
          isDm = !!getIsDmChannel();
        } catch (error) {
          console.warn('[SDC] Unable to determine channel type for context menu', error);
        }

        menuDmGroup.style.display = isDm ? null : 'none';
        menuNondmGroup.style.display = isDm ? 'none' : null;
      };

      this.OpenContextMenu = (e) => {
        const event = e?.nativeEvent || e;
        e?.preventDefault?.();
        e?.stopPropagation?.();
        event?.preventDefault?.();
        event?.stopPropagation?.();
        const clientX = Number.isFinite(event?.clientX) ? event.clientX : 0;
        const clientY = Number.isFinite(event?.clientY) ? event.clientY : 0;

        // Re-evaluate the current channel at the exact moment the menu opens.
        // This avoids stale DM/group state after Discord reuses the chat UI.
        this.UpdateContextMenuGroups();

        // The lock now lives near the bottom of the window. The legacy code
        // always opened the menu downward, which pushed most entries outside
        // the viewport. Render it invisibly first, measure it, then clamp it.
        menu.style.display = 'block';
        menu.style.visibility = 'hidden';
        menu.style.left = '0px';
        menu.style.top = '0px';

        const rect = menu.getBoundingClientRect();
        const margin = 8;
        const maxLeft = Math.max(margin, window.innerWidth - rect.width - margin);
        const left = Math.max(margin, Math.min(clientX, maxLeft));

        let top = clientY;
        if (top + rect.height > window.innerHeight - margin)
          top = clientY - rect.height;
        top = Math.max(margin, Math.min(top, window.innerHeight - rect.height - margin));

        menu.style.left = `${left}px`;
        menu.style.top = `${top}px`;
        menu.style.visibility = 'visible';
        menuFocus.focus({ preventScroll: true });
      };
      this.toggleOnButton.oncontextmenu = this.OpenContextMenu;
      this.toggleOffButton.oncontextmenu = this.OpenContextMenu;
      menuFocus.onblur = () => {
        menu.style.visibility = 'hidden';
      };

      // Inject the lock through the exact same React chat-button group used by
      // InvisibleTyping. This is substantially more stable than attaching a DOM
      // node after Discord has rendered the composer, especially in voice-channel
      // text chats where Discord frequently replaces the composer subtree.
      this.reactUpdateListeners = new Set();
      this.RequestReactUpdate = () => {
        for (const listener of Array.from(this.reactUpdateListeners)) {
          try {
            listener();
          } catch (error) {
            this.reactUpdateListeners.delete(listener);
          }
        }
      };

      this.InstallReactChatButton = () => {
        try {
          if (typeof BdApi !== 'function' || !BdApi.React) return false;

          const api = new BdApi('SimpleDiscordCryptV2');
          const React = BdApi.React;
          const ChatButton = api.Webpack.getBySource(
            'CHAT_INPUT_BUTTON_NOTIFICATION',
            'animated.div'
          )?.A;
          const ChatButtonsGroup = api.Webpack.getBySource(
            'isSubmitButtonEnabled',
            '.A.getActiveOption('
          )?.A;

          if (!ChatButton || !ChatButtonsGroup || typeof ChatButtonsGroup.type !== 'function') {
            console.warn('[SDC] React chat-button modules not found; using DOM fallback');
            return false;
          }

          const owner = this;
          const LockIcon = ({ enabled }) =>
            React.createElement(
              'svg',
              {
                width: '22.5',
                height: '22.5',
                viewBox: '0 0 36 36',
                style: enabled ? { color: '#00ff00' } : null,
                fill: 'currentColor',
                'aria-hidden': true,
              },
              enabled
                ? React.createElement(
                    React.Fragment,
                    null,
                    React.createElement('path', {
                      d: 'M18 3C12.477 3 8 7.477 8 13v10h4V13c0-3.313 2.686-6 6-6s6 2.687 6 6v10h4V13c0-5.523-4.477-10-10-10z',
                    }),
                    React.createElement('path', {
                      d: 'M31 32c0 2.209-1.791 4-4 4H9c-2.209 0-4-1.791-4-4V20c0-2.209 1.791-4 4-4h18c2.209 0 4 1.791 4 4v12z',
                    })
                  )
                : React.createElement(
                    React.Fragment,
                    null,
                    React.createElement('path', {
                      d: 'M18 0c-4.612 0-8.483 3.126-9.639 7.371l3.855 1.052C12.91 5.876 15.233 4 18 4c3.313 0 6 2.687 6 6v10h4V10c0-5.522-4.477-10-10-10z',
                    }),
                    React.createElement('path', {
                      d: 'M31 32c0 2.209-1.791 4-4 4H9c-2.209 0-4-1.791-4-4V20c0-2.209 1.791-4 4-4h18c2.209 0 4 1.791 4 4v12z',
                    })
                  )
            );

          function SdcCryptButton() {
            const [, forceUpdate] = React.useReducer((value) => value + 1, 0);
            React.useEffect(() => {
              owner.reactUpdateListeners.add(forceUpdate);
              return () => owner.reactUpdateListeners.delete(forceUpdate);
            }, []);

            let enabled = false;
            try {
              enabled = !!getToggleStatus();
            } catch (error) {
              console.warn('[SDC] Unable to read encryption toggle state', error);
            }

            const handleClick = React.useCallback(() => {
              // Match InvisibleTyping's event structure: let Discord's chat button
              // receive its normal pointer lifecycle instead of cancelling it.
              toggle();
              queueMicrotask(() => owner.RequestReactUpdate());
            }, []);

            const handleContextMenu = React.useCallback((event) => {
              owner.OpenContextMenu(event);
            }, []);

            const renderButton = (tooltipProps = {}) =>
              React.createElement(
                'div',
                {
                  ...tooltipProps,
                  onClick: handleClick,
                  onContextMenu: handleContextMenu,
                },
                React.createElement(
                  ChatButton,
                  { className: 'sdcReactLockButton' },
                  React.createElement(LockIcon, { enabled })
                )
              );

            return api.Components?.Tooltip
              ? React.createElement(
                  api.Components.Tooltip,
                  { text: enabled ? 'Disable Encryption' : 'Encrypt Channel' },
                  (props) => renderButton(props)
                )
              : renderButton({ title: enabled ? 'Disable Encryption' : 'Encrypt Channel' });
          }

          api.Patcher.after(ChatButtonsGroup, 'type', (_, methodArgs, res) => {
            const [args] = methodArgs;
            if (
              !args?.disabled &&
              ['normal', 'sidebar'].includes(args?.type?.analyticsName) &&
              Array.isArray(res?.props?.children)
            ) {
              res.props.children.unshift(
                React.createElement(SdcCryptButton, { key: 'sdc-crypt-lock' })
              );
            }
          });

          this.bdApi = api;
          this.reactChatButtonInstalled = true;
          console.log('[SDC] React chat lock installed');
          return true;
        } catch (error) {
          console.error('[SDC] Failed to install React chat lock; using DOM fallback', error);
          return false;
        }
      };

      // Do NOT fall back to manually inserting the lock into Discord's DOM.
      // SDC is loaded after the database password prompt, while some Discord
      // composer modules can still be lazy. A one-shot lookup therefore caused
      // the voice-channel text composer to use the old unstable DOM path.
      // Retry until the exact React module used by InvisibleTyping is available.
      this.reactChatButtonInstalled = false;
      this.reactInstallStopped = false;
      this.reactInstallDelay = 50;
      this.EnsureReactChatButton = () => {
        if (this.reactInstallStopped || this.reactChatButtonInstalled) return;
        clearTimeout(this.reactInstallTimeout);

        if (this.InstallReactChatButton()) {
          this.reactChatButtonInstalled = true;
          this.reactInstallDelay = 50;
          // The patch now owns all future renders. A resize event is a harmless
          // nudge for an already-mounted composer so the new child is rendered
          // immediately instead of waiting for an unrelated Discord update.
          requestAnimationFrame(() => {
            try {
              window.dispatchEvent(new Event('resize'));
            } catch (_) {}
          });
          return;
        }

        const delay = this.reactInstallDelay;
        this.reactInstallDelay = Math.min(1000, Math.round(delay * 1.7));
        this.reactInstallTimeout = setTimeout(
          () => this.EnsureReactChatButton(),
          delay
        );
      };
      this.EnsureReactChatButton();

      // Find the header that belongs to the SAME active chat as the composer.
      // Do not query generic title/span selectors globally: Discord reuses them
      // in the guild/sidebar/voice UI and that made the key selector wander.
      this.GetHeaderKeyAnchor = () => {
        const textArea = document.querySelector(
          'div[class^=channelTextArea], div[class*=channelTextArea]'
        );
        if (!textArea) return null;

        let scope = textArea;
        let header = null;
        const textAreaRect = textArea.getBoundingClientRect();

        // Walk upward until we reach the chat shell which contains both the
        // composer and its own top header. This deliberately excludes headers
        // from the server/channel sidebar and unrelated popouts.
        for (let i = 0; scope && i < 14; i++, scope = scope.parentElement) {
          for (const headerSelector of HeaderBarSelectors) {
            const candidate = scope.querySelector?.(headerSelector);
            if (!candidate || candidate.contains(textArea)) continue;

            const rect = candidate.getBoundingClientRect();
            if (rect.width <= 0 || rect.height <= 0) continue;

            // The active chat header must sit above and horizontally overlap
            // the active composer. This rejects sidebar/voice/popout headers
            // even if Discord gives them the same minified class fragments.
            const overlap = Math.max(
              0,
              Math.min(rect.right, textAreaRect.right) -
                Math.max(rect.left, textAreaRect.left)
            );
            const requiredOverlap = Math.min(200, textAreaRect.width * 0.3);
            if (overlap < requiredOverlap || rect.top >= textAreaRect.top) continue;

            header = candidate;
            break;
          }
          if (header) break;
        }

        if (!header) return null;

        // Discord normally keeps the channel title in a `children` container.
        // Appending the selector to that exact header container is more stable
        // than inserting it after whichever generic `title` element happens to
        // match first.
        const children =
          header.querySelector(':scope > div[class*=children]') ||
          header.querySelector('div[class*=children]');

        return {
          header,
          container: children || header,
        };
      };

      this.Update = function (isRetry) {
        this.EnsureReactChatButton();
        const headerKeyAnchor = this.GetHeaderKeyAnchor();

        if (headerKeyAnchor == null && !this.reactChatButtonInstalled) {
          if (!isRetry) this.retries = 0;
          if (this.retries < 10) {
            this.retries++;
            clearTimeout(this.retryTimeout);
            this.retryTimeout = setTimeout(() => {
              this.Update(true);
            }, this.retries * 400);
          }
          return;
        }
        clearTimeout(this.retryTimeout);

        if (this.mutationObserver != null) this.mutationObserver.disconnect();
        else
          this.mutationObserver = new MutationObserver((changes) => {
            const watched = [this.keySelectButton];
            for (const change of changes) {
              for (const removed of change.removedNodes) {
                if (
                  watched.some(
                    (element) =>
                      removed === element ||
                      (typeof removed.contains === 'function' && removed.contains(element))
                  )
                ) {
                  clearTimeout(this.mutationUpdateTimeout);
                  this.mutationUpdateTimeout = setTimeout(() => this.Update(), 0);
                  return;
                }
              }
            }
          });

        let styleEnabled = document.head.contains(this.toggledOnStyle);
        let keySelectEnabled = document.body.contains(this.keySelectButton);
        let toggleOnEnabled = document.body.contains(this.toggleOnButton);
        let toggleOffEnabled = document.body.contains(this.toggleOffButton);
        let toggledOn = getToggleStatus();

        let keyInfo = getCurrentKeyInfo();
        keySelectSelected.innerText = keyInfo[0 /*descriptor*/];
        keySelectSelected.style.color = keyInfo[1 /*trusted*/]
          ? BaseColor
          : null;

        if (headerKeyAnchor) {
          const keyContainer = headerKeyAnchor.container;
          if (this.keySelectButton.parentElement !== keyContainer) {
            keyContainer.appendChild(this.keySelectButton);
          }
        } else if (keySelectEnabled) {
          // If Discord is between layouts during a rerender, never leave the key
          // selector attached to an old/sidebar node. It will be restored on the
          // next mutation/update when the active chat header exists again.
          this.keySelectButton.remove();
        }

        // React is the only owner of the composer lock in v5. Remove any old
        // v3/v4 fallback nodes that may still be present after a hot reload.
        if (toggleOnEnabled) this.toggleOnButton.remove();
        if (toggleOffEnabled) this.toggleOffButton.remove();

        if (toggledOn) {
          if (!styleEnabled) document.head.appendChild(this.toggledOnStyle);
        } else if (styleEnabled) {
          document.head.removeChild(this.toggledOnStyle);
        }

        if (this.reactChatButtonInstalled) {
          this.RequestReactUpdate();
        }

        this.UpdateContextMenuGroups();

        // Observe Discord UI replacement globally. The callback only reacts when
        // one of our own nodes is removed, so ordinary message mutations are cheap.
        this.mutationObserver.observe(document.body, {
          childList: true,
          subtree: true,
        });
      };
      this.Update();
    },
    Remove: function () {
      if (this.mutationObserver) this.mutationObserver.disconnect();
      clearTimeout(this.retryTimeout);
      clearTimeout(this.mutationUpdateTimeout);
      clearTimeout(this.reactInstallTimeout);
      this.reactInstallStopped = true;
      try {
        this.bdApi?.Patcher?.unpatchAll();
      } catch (error) {
        console.warn('[SDC] Unable to unpatch React chat lock cleanly', error);
      }
      this.reactUpdateListeners?.clear?.();
      this.reactChatButtonInstalled = false;
      if (this.toggledOnStyle) this.toggledOnStyle.remove();
      if (this.menuBarStyle) this.menuBarStyle.remove();
      if (this.keySelectButton) this.keySelectButton.remove();
      if (this.toggleOnButton) this.toggleOnButton.remove();
      if (this.toggleOffButton) this.toggleOffButton.remove();
      if (this.menuWrapper) this.menuWrapper.remove();
    },
  };
  const PopupManager = {
    Inject: function () {
      let wrapper = document.createElement('div');

      document.body.appendChild(wrapper);
      this.domElement = wrapper;
    },
    Update: function () {
      if (this.domElement && !document.body.contains(this.domElement))
        document.body.appendChild(this.domElement);
    },
    New: function (message, okCallback, cancelCallback, ontop) {
      // Discord can replace large parts of its DOM while changing channels.
      // Make sure the popup host still exists before adding a confirmation.
      if (!this.domElement) this.Inject();
      else this.Update();

      let popup = document.createElement('div');
      popup.className = 'SDC_POPUP_HOST';
      popup.style.cssText = 'position:fixed;inset:0;z-index:2147483647;pointer-events:none;';
      popup.innerHTML = `<div class="sdc sdc-window" role="dialog" aria-modal="true" style="width:320px;max-width:calc(100vw - 32px);position:fixed;right:24px;bottom:80px;z-index:2147483647;pointer-events:auto;box-shadow:0 12px 36px rgba(0,0,0,.55)">
    <div style="margin:20px;word-break:break-word;line-height:1.35">
        ${HtmlEscape(message)}
    </div>
    <div class="sdc-footer" style="padding:10px">
        <button type="button" class="SDC_CANCEL sdc-lnkbtn" style="min-width:96px"><p>Cancel</p></button>
        <button type="button" class="SDC_OK sdc-btn" style="min-width:96px">OK</button>
    </div>
</div>
<button type="button" class="SDC_FOCUS sdc-hidden"></button>`;
      Utils.AttachEventToClass(popup, 'SDC_OK', 'click', () => {
        popup.remove();
        okCallback();
      });
      Utils.AttachEventToClass(popup, 'SDC_CANCEL', 'click', () => {
        popup.remove();
        if (cancelCallback) cancelCallback();
      });
      if (ontop) this.domElement.appendChild(popup);
      else this.domElement.prepend(popup);
      return popup;
    },
    NewPromise: function (message, ontop, timeout) {
      return new Promise((resolve) => {
        if (timeout > 0) {
          let cancelTimeout;
          let popup = this.New(
            message,
            () => {
              clearTimeout(cancelTimeout);
              resolve(true);
            },
            () => {
              clearTimeout(cancelTimeout);
              resolve(false);
            },
            ontop
          );

          cancelTimeout = setTimeout(() => {
            popup.remove();
            resolve(false);
          }, timeout);
        } else {
          let popup = this.New(
            message,
            () => resolve(true),
            () => resolve(false),
            ontop
          );
          if (typeof timeout === 'object') {
            timeout.cancel = () => {
              popup.remove();
              resolve(false);
            };
          }
        }
      });
    },
    Remove: function () {
      if (this.domElement) this.domElement.remove();
    },
  };
  const KeyVisualizerWindow = {
    EmojiHash: function (canvas, hashBuffer) {
      var ctx;

      function drawEmoji(emoji, x, y, size, rotation) {
        ctx.save();
        ctx.translate(x, y);
        if (rotation) ctx.rotate((rotation * Math.PI) / 180);
        ctx.scale(size, size);
        ctx.fillText(emoji, 0, 0);
        ctx.restore();
      }
      function drawRectangle(color, x, y, width, height, rotation) {
        ctx.save();
        ctx.translate(x, y);
        if (rotation) ctx.rotate((rotation * Math.PI) / 180);
        ctx.fillStyle = color;
        ctx.fillRect(-width / 2, -height / 2, width, height);
        ctx.restore();
      }
      var uintOffset = 0;
      var inUintOffset = 0;
      var uints = new DataView(hashBuffer);
      function popBits(count) {
        //max 32
        let bits;
        let newInUintOffset = inUintOffset + count;
        if (newInUintOffset > 31) {
          bits = uints.getUint32(uintOffset) & ~(~0 << (32 - inUintOffset));
          inUintOffset = newInUintOffset - 32;
          uintOffset += 4;
          if (uintOffset === hashBuffer.byteLength) uintOffset = 0;
          if (inUintOffset !== 0) {
            bits =
              (bits << inUintOffset) |
              (uints.getUint32(uintOffset) >>> (32 - inUintOffset));
          }
        } else {
          bits =
            (uints.getUint32(uintOffset) >>> (32 - newInUintOffset)) &
            ~(~0 << count);
          inUintOffset = newInUintOffset;
        }

        return bits;
      }

      ctx = canvas.getContext('2d');
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.font = '1px sans-serif';
      ctx.translate(canvas.width / 2, canvas.height / 2);
      let scale = (Math.min(canvas.width / 4, canvas.height / 3) / 100) * 4;
      ctx.scale(scale, scale);

      function drawSky() {
        let color;
        switch (popBits(3)) {
          case 0: //purple
            color = '#a254d3';
            break;
          case 1: //rose
            color = '#f6c4df';
            break;
          case 2: //blue
            color = '#2b7cb3';
            break;
          case 3: //darkblue
            color = '#154167';
            break;
          default: //lightblue
            color = '#9bcfea';
        }

        drawRectangle(color, 0, 0, 1000, 1000);
      }

      const airObjects =
        '☀️|🌑|☁️|🌩️|🌨️|🐉|🦇|🦅|🕊️|🐝|🦋|🍃|🚁|✈️|🛩️|🚀|🛸|🛰️|🌜|☄️|🌟|❄️|⚡|✨|🎈|👾|👻'.split(
          '|'
        );
      function drawAirObject(x, y, size, rotation) {
        if (popBits(1)) return;

        drawEmoji(airObjects[popBits(5) % 27], x, y, size, rotation); //32-27 first 5 have double probability
      }
      const handEmojis =
        '👌|🖕|✌|👊|👍|👎|👋|👈|👉|☝|👆|👇|🤞|🖖|🤟|🤙|🖐|✋|✍|💰|💀|💩|💣|🥊|🎨|🎺|📷|🎥|🔦|💼|🔎|📕|✉️|✏️|📏|🔫|🔨|🔧|💉|🚬|🗝️|📞|🎮|🎓|🍆'.split(
          '|'
        );
      function drawHandEmoji(x, y, size, rotation) {
        drawEmoji(handEmojis[popBits(6) % 45], x, y, size, rotation);
      }
      const bodyEmojis = '👔|👕|🥋|🎽|🧥|👗|👘|👙|👚'.split('|');
      const headEmojis =
        '🤔|😂|😤|😭|😋|🤗|😏|😳|😆|🤨|😎|🙄|😑|😍|😘|🙂|🤩|😶|😣|😮|🤐|😫|😴|😜|🤤|😒|🙃|🤑|☹️|😁|😖|😱|🤯|😬|🤪|😵|😡|🤒|🤢|🤮|🤧|😇|🤠|🤡|🤥|🤣|🤫|🧐|🤓|😈|💩|🤖|👽|💀|👺|👶|👩|👨|👴|👵|🤴|👳|👲|🧔|👱|🎅|🐵|🐶|🐺|🦊|🐱|🦁|🐯|🐴|🦄|🦓|🐮|🐷|🐗|🐭|🐹|🐰|🐻|🐸|🐲|🐔|🎃'.split(
          '|'
        );
      function drawPerson(x, y, size) {
        ctx.save();
        ctx.translate(x, y);
        let scale = size / 100;
        ctx.scale(scale, scale);

        drawRectangle('#000', 0, -10, 4, 50); //body
        drawRectangle('#000', -9, 26, 4, 30, 35); //legs
        drawRectangle('#000', 9, 26, 4, 30, -35);

        switch (
        popBits(2) //left arm
        ) {
          case 0: //up
            drawRectangle('#000', -12, -23, 4, 30, -55);
            drawHandEmoji(-26, -34, 15);
            break;
          case 1: //middle
            drawRectangle('#000', -15, -15, 30, 4);
            drawHandEmoji(-30, -18, 15);
            break;
          default: //down
            drawRectangle('#000', -12, -8, 4, 30, 55);
            drawHandEmoji(-26, -4, 15);
        }
        switch (
        popBits(2) //right arm
        ) {
          case 0: //up
            drawRectangle('#000', 12, -23, 4, 30, 55);
            drawHandEmoji(26, -34, 15);
            break;
          case 1: //middle
            drawRectangle('#000', 15, -15, 30, 4);
            drawHandEmoji(30, -18, 15);
            break;
          default: //down
            drawRectangle('#000', 12, -8, 4, 30, -55);
            drawHandEmoji(26, -4, 15);
        }

        drawEmoji(bodyEmojis[popBits(4) % 9], 0, -5, 28); //chest
        drawEmoji(headEmojis[popBits(12) % 87], 0, -35, 25); //face 4096 % 87 = first 7 have increased chance

        if (popBits(1)) drawEmoji('👟', -13, 35, 15); //left foot
        if (popBits(1)) drawEmoji('👟', 19, 35, 15); //right foot

        ctx.restore();
      }
      const tableObjects =
        '🍞|👓|🛍️|💎|🍎|🍇|🍉|🍊|🍋|🍌|🍏|🍐|🍑|🍒|🍓|🥝|🍅|🥥|🥔|🥕|🌽|🌶️|🥒|🥦|🍄|🥜|🥐|🥨|🥞|🧀|🍖|🍗|🥩|🥓|🍔|🍟|🍕|🌭|🥪|🌮|🥚|🍲|🥣|🥗|🍿|🥫|🍱|🍙|🍣|🥡|🍦|🍩|🎂|🥧|🍫|🍮|🍯|🍼|☕|🍷|🍸|🍺|🔪|🏺|🛎️|⏰|⌛|🌂|🎁|🏆|⚽|🎳|🔮|🕹️|🎲|📢|📻|🎧|🎤|☎️|💻|🖨️|📺|🕯️|📦|🔭|⚗️|🔬|⚖️|🥤|📚'.split(
          '|'
        );
      function drawTableObject(x, y, size, rotation) {
        if (popBits(1)) return;

        drawEmoji(tableObjects[popBits(12) % 91], x, y, size, rotation);
      }
      function drawTable(x, y, size, rotation) {
        ctx.save();
        ctx.translate(x, y);
        let scale = size / 100;
        ctx.scale(scale, scale);

        drawRectangle('#999', 0, 33, 4, 34);
        drawRectangle('#f00', 0, 14, 70, 4);

        drawTableObject(-25, 2, 20);
        drawTableObject(-3, 2, 20);
        drawTableObject(25, 2, 20);

        ctx.restore();
      }
      const groundObjects =
        '🐉|💩|👯|👫|🚶🏻|🏃🏻|💃🏻|🕺🏻|🧘🏻|🕴🏻|🤺|🏇🏻|🏌🏻|⛹🏻|🏋🏻|🚴🏻|🤸🏻|🤼|🤾🏻|🐒|🦍|🐕|🐩|🐈|🐅|🐆|🐎|🦌|🐂|🐄|🐖|🐑|🐐|🐪|🐘|🦏|🐁|🐀|🐇|🐿️|🦔|🦃|🐓|🐧|🐤|🐦|🦆|🦉|🐊|🐢|🦎|🐍|🦕|🦖|🐌|🐛|🐜|🌹|🥀|🌻|🌼|🌷|🌱|🌲|🌳|🌴|🌵|🌾|🍀|⛩️|⛲|🎪|🛢️|🛵|🚲|🛴|🎏|🥅|🗑️|🗿|🏳️‍🌈|🚩|🏁|🏴|🏳️'.split(
          '|'
        );
      function drawGroundObject(x, y, size, rotation) {
        switch (popBits(2)) {
          case 0:
            drawPerson(x, y, size, rotation);
            break;
          case 1:
            drawTable(x, y, size, rotation);
            break;
          case 2:
            drawEmoji(groundObjects[popBits(8) % 85], x, y, size / 2, rotation);
            break;
        }
      }

      switch (popBits(2)) {
        case 0:
          {
            //park
            drawSky();
            drawRectangle('#5ce64e', 0, 50, 200, 100, 1);
            drawAirObject(-40, -27, 8);
            drawAirObject(-16, -30, 10);
            drawAirObject(17, -28, 9);
            drawAirObject(41, -20, 10);
            drawGroundObject(-37, 20, 30);
            drawGroundObject(-10, 10, 23);
            drawGroundObject(10, 0, 20);
            drawGroundObject(15, 25, 20);
            drawGroundObject(35, 20, 26);
          }
          break;
        case 1:
          {
            //beach
            drawSky();
            drawRectangle('#e5e886', 0, 50, 200, 100);
            drawRectangle('#3cc', 0, 0, 200, 10, -0.5);
            drawAirObject(-40, -27, 8);
            drawAirObject(-16, -30, 10);
            drawAirObject(17, -28, 9);
            drawAirObject(41, -20, 10);
            drawGroundObject(-37, 20, 30);
            drawGroundObject(-10, 10, 23);
            drawGroundObject(10, 0, 20);
            drawGroundObject(15, 25, 20);
            drawGroundObject(35, 20, 26);
          }
          break;
        case 2:
          {
            //campfire
            drawSky();
            drawRectangle('#49be3d', 0, 50, 200, 100);
            drawEmoji('🔥', 0, 10, 20);
            drawRectangle('#333', 0, 20, 15, 5);
            drawAirObject(-42, -20, 8);
            drawAirObject(-25, -25, 10);
            drawAirObject(22, -28, 9);
            drawAirObject(41, -20, 10);
            drawGroundObject(-37, 20, 30);
            drawGroundObject(-13, 20, 23);
            drawGroundObject(-35, -5, 20);
            drawGroundObject(15, 25, 20);
            drawGroundObject(35, 20, 26);
          }
          break;
        case 3:
          {
            //mountainslide
            drawSky();
            drawRectangle('#eff', 0, 50, 200, 100, -30);
            drawAirObject(-42, -10, 8);
            drawAirObject(-40, -25, 10);
            drawAirObject(-15, -30, 9);
            drawAirObject(15, -30, 10);
            drawGroundObject(-37, 20, 30);
            drawGroundObject(-10, 10, 23);
            drawGroundObject(20, 0, 20);
            drawGroundObject(15, 25, 20);
            drawGroundObject(35, 20, 26);
          }
          break;
      }
    },
    html: `<div class="sdc">
<div class="SDC_CLOSE sdc-cover"></div>
<div class="sdc-overlay">
    <div class="sdc-window">
        <div style="margin:20px">
            <h4>Key Visualizer v1.1</h4>
        </div>
        <a class="SDC_CLOSE sdc-close"></a>
        <canvas class="SDC_ART" width="600" height="450"></canvas>
        <div class="sdc-footer">
            <button type="button" class="SDC_KEYTRUST sdc-wbtn" style="margin-right:10px">Toggle Key Trusted</button>
            <button type="button" class="SDC_CLOSE sdc-btn" style="min-width:96px">Close</button>
        </div>
    </div>
</div>
</div>`,
    Show: function (buffer, toggleTrustedCallback) {
      let wrapper = document.createElement('div');
      wrapper.innerHTML = this.html;

      Utils.AttachEventToClass(wrapper, 'SDC_CLOSE', 'click', () => {
        this.Remove();
      });

      Utils.AttachEventToClass(wrapper, 'SDC_KEYTRUST', 'click', () => {
        this.Remove();
        toggleTrustedCallback();
      });

      let canvas = wrapper.getElementsByClassName('SDC_ART')[0];
      this.EmojiHash(canvas, buffer);

      document.body.appendChild(wrapper);
      this.domElement = wrapper;
    },
    Remove: function () {
      if (this.domElement) this.domElement.remove();
    },
  };

  // ============================================================================
  // SECTION 2: CORE OBJECTS & UTILITIES
  // ============================================================================

  // CryptoService - Centralized cryptographic operations
  class CryptoService {
    constructor() {
      this.utf8encoder = new TextEncoder();
      this.utf8decoder = new TextDecoder();
      this.v2Enabled = true;
      this.selfTestResult = null;
    }

    // Hashing
    async sha256(buffer) {
      return await crypto.subtle.digest('SHA-256', buffer);
    }

    async sha512(buffer) {
      return await crypto.subtle.digest('SHA-512', buffer);
    }

    async sha512_128(buffer) {
      return (await crypto.subtle.digest('SHA-512', buffer)).slice(0, 16);
    }

    async sha512_128str(string) {
      return await this.sha512_128(this.stringToUtf8Bytes(string));
    }

    async sha512_256(buffer) {
      return (await crypto.subtle.digest('SHA-512', buffer)).slice(0, 32);
    }

    async sha512_256str(string) {
      return await this.sha512_256(this.stringToUtf8Bytes(string));
    }

    // AES Encryption/Decryption
    // v22 writes authenticated AES-256-GCM envelopes while retaining transparent
    // AES-CBC decryption for all pre-v22 content.
    getAesPurposeId(purpose) {
      const purposes = {
        generic: 0,
        message: 1,
        file: 2,
        filename: 3,
        'db-key': 4,
        'db-dh': 5,
        'db-identity': 6,
        'db-check': 7,
        'key-share': 8,
        'personal-key': 9,
      };
      return purposes[purpose] == null ? purposes.generic : purposes[purpose];
    }

    getAesPurposeName(id) {
      const names = [
        'generic',
        'message',
        'file',
        'filename',
        'db-key',
        'db-dh',
        'db-identity',
        'db-check',
        'key-share',
        'personal-key',
      ];
      return names[id] || 'generic';
    }

    getGcmMagic() {
      // 64-bit marker: an accidental collision with a legacy CBC IV is
      // effectively negligible, while keeping v1 auto-detection simple.
      return Uint8Array.from([0x53, 0x44, 0x43, 0x32, 0x47, 0x43, 0x4d, 0x21]); // SDC2GCM!
    }

    isAesV2Envelope(buffer) {
      const bytes = new Uint8Array(buffer);
      const magic = this.getGcmMagic();
      if (bytes.byteLength < magic.length + 2 + 12 + 16) return false;
      for (let i = 0; i < magic.length; i++) {
        if (bytes[i] !== magic[i]) return false;
      }
      return bytes[9] === 1;
    }

    async aesImportKey(buffer) {
      const raw = new Uint8Array(buffer).slice();
      if (raw.byteLength !== 32)
        throw new Error(`SDC AES key must be 32 bytes, got ${raw.byteLength}`);

      const [cbc, gcm] = await Promise.all([
        crypto.subtle.importKey('raw', raw, 'AES-CBC', false, [
          'encrypt',
          'decrypt',
        ]),
        crypto.subtle.importKey('raw', raw, 'AES-GCM', false, [
          'encrypt',
          'decrypt',
        ]),
      ]);

      return Object.freeze({ __sdcAesKey: 2, cbc, gcm });
    }

    getAesSubkey(key, mode) {
      if (key?.__sdcAesKey === 2) return key[mode];
      if (key?.algorithm?.name === (mode === 'gcm' ? 'AES-GCM' : 'AES-CBC'))
        return key;
      throw new Error(`SDC AES ${mode.toUpperCase()} subkey unavailable`);
    }

    async aesEncryptLegacy(key, buffer) {
      const initializationVector = this.getRandomBytes(16);
      const encryptedBuffer = await crypto.subtle.encrypt(
        { name: 'AES-CBC', iv: initializationVector },
        this.getAesSubkey(key, 'cbc'),
        buffer
      );
      return this.concatBuffers([initializationVector, encryptedBuffer]);
    }

    async aesDecryptLegacy(key, buffer) {
      if (buffer.byteLength < 32)
        throw new Error('Invalid legacy AES-CBC envelope');
      const initializationVector = buffer.slice(0, 16);
      const encryptedBuffer = buffer.slice(16);
      return await crypto.subtle.decrypt(
        { name: 'AES-CBC', iv: initializationVector },
        this.getAesSubkey(key, 'cbc'),
        encryptedBuffer
      );
    }

    async aesEncrypt(key, buffer, purpose = 'generic') {
      if (this.v2Enabled === false)
        return await this.aesEncryptLegacy(key, buffer);

      const magic = this.getGcmMagic();
      const header = new Uint8Array(magic.length + 2);
      header.set(magic, 0);
      header[8] = this.getAesPurposeId(purpose);
      header[9] = 1; // envelope version

      const nonce = this.getRandomBytes(12);
      const ciphertext = await crypto.subtle.encrypt(
        {
          name: 'AES-GCM',
          iv: nonce,
          additionalData: header,
          tagLength: 128,
        },
        this.getAesSubkey(key, 'gcm'),
        buffer
      );
      return this.concatBuffers([header, nonce, ciphertext]);
    }

    async aesDecrypt(key, buffer, expectedPurpose = null) {
      if (!this.isAesV2Envelope(buffer))
        return await this.aesDecryptLegacy(key, buffer);

      const bytes = new Uint8Array(buffer);
      const headerLength = this.getGcmMagic().length + 2;
      const header = bytes.slice(0, headerLength);
      const purpose = this.getAesPurposeName(header[8]);
      if (
        expectedPurpose != null &&
        expectedPurpose !== 'generic' &&
        purpose !== expectedPurpose
      ) {
        throw new Error(
          `SDC AES-GCM purpose mismatch: expected ${expectedPurpose}, got ${purpose}`
        );
      }

      const nonce = bytes.slice(headerLength, headerLength + 12);
      const ciphertext = bytes.slice(headerLength + 12);
      return await crypto.subtle.decrypt(
        {
          name: 'AES-GCM',
          iv: nonce,
          additionalData: header,
          tagLength: 128,
        },
        this.getAesSubkey(key, 'gcm'),
        ciphertext
      );
    }

    async aesEncryptString(key, string, purpose = 'generic') {
      const bytes = this.stringToUtf8Bytes(string);
      return await this.aesEncrypt(key, bytes, purpose);
    }

    async aesDecryptString(key, buffer, expectedPurpose = null) {
      const bytes = await this.aesDecrypt(key, buffer, expectedPurpose);
      return this.utf8BytesToString(bytes);
    }

    async aesEncryptCompressString(key, string) {
      const buffer = await this.tryCompress(
        this.stringToUtf8Bytes(string).buffer
      );
      return await this.aesEncrypt(key, buffer, 'message');
    }

    async aesEncryptCompressStringLegacy(key, string) {
      const buffer = await this.tryCompress(
        this.stringToUtf8Bytes(string).buffer
      );
      return await this.aesEncryptLegacy(key, buffer);
    }

    async aesDecryptDecompressString(key, string) {
      const buffer = await this.tryDecompress(
        await this.aesDecrypt(key, string, 'message')
      );
      return this.utf8BytesToString(buffer);
    }

    async pbkdf2Sha256(password, salt, iterations, length = 32) {
      const material = await crypto.subtle.importKey(
        'raw',
        this.stringToUtf8Bytes(password),
        'PBKDF2',
        false,
        ['deriveBits']
      );
      return await crypto.subtle.deriveBits(
        {
          name: 'PBKDF2',
          hash: 'SHA-256',
          salt,
          iterations,
        },
        material,
        length * 8
      );
    }

    async hkdfSha256(ikm, salt, info, length = 32) {
      const material = await crypto.subtle.importKey(
        'raw',
        ikm,
        'HKDF',
        false,
        ['deriveBits']
      );
      return await crypto.subtle.deriveBits(
        {
          name: 'HKDF',
          hash: 'SHA-256',
          salt,
          info,
        },
        material,
        length * 8
      );
    }

    // Diffie-Hellman Key Exchange
    async dhGenerateKeys() {
      return await crypto.subtle.generateKey(
        { name: 'ECDH', namedCurve: 'P-521' },
        true,
        ['deriveBits']
      );
    }

    async dhImportPublicKey(buffer) {
      return await crypto.subtle.importKey(
        'raw',
        buffer,
        { name: 'ECDH', namedCurve: 'P-521' },
        false,
        []
      );
    }

    async dhImportPrivateKey(buffer) {
      return await crypto.subtle.importKey(
        'pkcs8',
        buffer,
        { name: 'ECDH', namedCurve: 'P-521' },
        false,
        ['deriveBits']
      );
    }

    async dhImportPrivateKeyFallback(buffer) {
      return await crypto.subtle.importKey(
        'jwk',
        JSON.parse(this.utf8BytesToString(buffer)),
        { name: 'ECDH', namedCurve: 'P-521' },
        false,
        ['deriveBits']
      );
    }

    async dhExportPublicKey(key) {
      return await crypto.subtle.exportKey('raw', key);
    }

    async dhExportPrivateKey(key) {
      return await crypto.subtle.exportKey('pkcs8', key);
    }

    async dhExportPrivateKeyFallback(key) {
      return this.stringToUtf8Bytes(
        JSON.stringify(await crypto.subtle.exportKey('jwk', key))
      );
    }

    async dhGetSecret(privateKey, publicKey) {
      // Legacy v1 compatibility: pre-v22 derived only the first 256 bits.
      return await crypto.subtle.deriveBits(
        { name: 'ECDH', namedCurve: 'P-521', public: publicKey },
        privateKey,
        256
      );
    }

    async dhGetSecretFull(privateKey, publicKey) {
      // P-521 field elements occupy 66 bytes (528 bits in WebCrypto output).
      return await crypto.subtle.deriveBits(
        { name: 'ECDH', namedCurve: 'P-521', public: publicKey },
        privateKey,
        528
      );
    }

    async identityGenerateKeys() {
      return await crypto.subtle.generateKey(
        { name: 'ECDSA', namedCurve: 'P-521' },
        true,
        ['sign', 'verify']
      );
    }

    async identityImportPublicKey(buffer) {
      return await crypto.subtle.importKey(
        'spki',
        buffer,
        { name: 'ECDSA', namedCurve: 'P-521' },
        false,
        ['verify']
      );
    }

    async identityImportPrivateKey(buffer) {
      return await crypto.subtle.importKey(
        'pkcs8',
        buffer,
        { name: 'ECDSA', namedCurve: 'P-521' },
        false,
        ['sign']
      );
    }

    async identityExportPublicKey(key) {
      return await crypto.subtle.exportKey('spki', key);
    }

    async identityExportPrivateKey(key) {
      return await crypto.subtle.exportKey('pkcs8', key);
    }

    async identitySign(privateKey, data) {
      return await crypto.subtle.sign(
        { name: 'ECDSA', hash: 'SHA-512' },
        privateKey,
        data
      );
    }

    async identityVerify(publicKey, signature, data) {
      return await crypto.subtle.verify(
        { name: 'ECDSA', hash: 'SHA-512' },
        publicKey,
        signature,
        data
      );
    }

    // Compression
    tryCompress(buffer) {
      return new Promise((resolve) => {
        let length = buffer.byteLength;
        if (length < 1600) return resolve(buffer);
        let bufferView = new DataView(buffer);
        let pixelCount = Math.ceil(length / 3);
        const maxSafePngWidth = 32767;
        let lines = Math.ceil(pixelCount / maxSafePngWidth);
        let width = Math.ceil(pixelCount / lines);
        let fullPixelCount = lines * width;
        let pixelBytes = new Uint8ClampedArray(fullPixelCount * 4);
        let pixels = new DataView(pixelBytes.buffer);
        let pixelMaxIndex = pixelCount - 1;
        let remainingBytes = length - pixelMaxIndex * 3;
        let i = pixelMaxIndex;
        while (i--) {
          let pixel = bufferView.getUint32(i * 3, true) | 0xff000000;
          pixels.setUint32(i * 4, pixel, true);
        }
        if (remainingBytes === 3) {
          let pixel =
            bufferView.getUint16(length - 3, true) |
            (bufferView.getUint8(length - 1) << 16) |
            0xff000000;
          pixels.setUint32(pixelMaxIndex * 4, pixel, true);
        } else if (remainingBytes === 2) {
          let pixel = bufferView.getUint16(length - 2, true) | 0xff000000;
          pixels.setUint32(pixelMaxIndex * 4, pixel, true);
        } else if (remainingBytes === 1) {
          let pixel = bufferView.getUint8(length - 1) | 0xff000000;
          pixels.setUint32(pixelMaxIndex * 4, pixel, true);
        }
        let canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = lines;
        let ctx = canvas.getContext('2d');
        ctx.putImageData(new ImageData(pixelBytes, width, lines), 0, 0);
        let fileReader = new FileReader();
        fileReader.onload = () => {
          let buffer = fileReader.result;
          let view = new DataView(buffer);
          view.setUint16(0, 0x5dc, false);
          view.setUint32(2, length, true);
          resolve(buffer);
        };
        canvas.toBlob(
          (blob) => fileReader.readAsArrayBuffer(blob),
          'image/png'
        );
      });
    }

    async tryDecompress(buffer) {
      let bufferView = new DataView(buffer);
      if (buffer.byteLength < 2 || bufferView.getUint16(0, false) !== 0x5dc)
        return buffer;
      let length = bufferView.getUint32(2, true);
      bufferView.setUint16(0, 0x8950, false);
      bufferView.setUint32(2, 0x4e470d0a, false);

      let bitmap = await createImageBitmap(
        new Blob([buffer], { type: 'image/png' })
      );
      let canvas = document.createElement('canvas');
      let ctx = canvas.getContext('2d');
      let width = (canvas.width = bitmap.width);
      let height = (canvas.height = bitmap.height);
      ctx.drawImage(bitmap, 0, 0);
      let pxbuffer = ctx.getImageData(0, 0, width, height).data.buffer;
      let pxbufferView = new DataView(pxbuffer);
      let pixelCount = Math.ceil(length / 3);
      for (let i = 0; i < pixelCount; i++) {
        pxbufferView.setUint32(
          i * 3,
          pxbufferView.getUint32(i * 4, true),
          true
        );
      }
      return pxbuffer.slice(0, length);
    }

    // String/Byte Conversions
    stringToUtf8Bytes(string) {
      return this.utf8encoder.encode(string);
    }

    stringToAsciiBytes(string) {
      return Uint8Array.from(string, (c) => c.charCodeAt(0));
    }

    stringToUtf16Shorts(string) {
      return Uint16Array.from(string, (c) => c.charCodeAt(0));
    }

    stringToUtf16Bytes(string) {
      return new Uint8Array(this.stringToUtf16Shorts(string).buffer);
    }

    asciiBytesToString(buffer) {
      return String.fromCharCode.apply(null, new Uint8Array(buffer));
    }

    utf16ShortsToString(buffer) {
      return String.fromCharCode.apply(null, new Uint16Array(buffer));
    }

    utf8BytesToString(buffer) {
      return this.utf8decoder.decode(buffer);
    }

    // Base64 Encoding
    bytesToBase64(buffer) {
      return btoa(String.fromCharCode.apply(null, new Uint8Array(buffer)));
    }

    base64ToBytes(string) {
      return Uint8Array.from(atob(string), (c) => c.charCodeAt(0));
    }

    bytesToBase64url(buffer) {
      return this.bytesToBase64(buffer)
        .replace(/=/g, '')
        .replace(/\+/g, '-')
        .replace(/\//g, '_');
    }

    base64urlToBytes(string) {
      return this.base64ToBytes(
        string.replace(/\-/g, '+').replace(/_/g, '/')
      );
    }

    // Payload Encoding (Braille Unicode)
    payloadEncode(buffer) {
      return String.fromCharCode.apply(
        null,
        Uint16Array.from(new Uint8Array(buffer), (b) => b + CONFIG.crypto.payloadOffset)
      );
    }

    payloadDecode(string) {
      return Uint8Array.from(string, (c) => c.charCodeAt(0) - CONFIG.crypto.payloadOffset);
    }

    // Utility
    getRandomBytes(n) {
      return crypto.getRandomValues(new Uint8Array(n));
    }

    getRandomUints(n) {
      return crypto.getRandomValues(new Uint32Array(n));
    }

    concatBuffers(buffers) {
      let newLength = buffers.reduce((len, x) => len + x.byteLength, 0);
      let newBuffer = new Uint8Array(newLength);
      let currentOffset = 0;
      for (let buffer of buffers) {
        newBuffer.set(new Uint8Array(buffer), currentOffset);
        currentOffset += buffer.byteLength;
      }
      return newBuffer;
    }
  }

  // Create singleton instance
  const cryptoService = new CryptoService();

  const SDC_DB_CRYPTO_VERSION = 2;
  const SDC_DB_KDF_ITERATIONS = 600000;
  const SDC_DB_CHECK_TEXT = 'SimpleDiscordCrypt DB v2 authenticated check';

  async function deriveDbKeyV2(password, saltBase64, iterations) {
    const salt = cryptoService.base64ToBytes(saltBase64);
    const keyBytes = await cryptoService.pbkdf2Sha256(
      password,
      salt,
      iterations || SDC_DB_KDF_ITERATIONS,
      32
    );
    return await cryptoService.aesImportKey(keyBytes);
  }

  async function makeDbCheckV2(dbKey) {
    return cryptoService.bytesToBase64(
      await cryptoService.aesEncrypt(
        dbKey,
        cryptoService.stringToUtf8Bytes(SDC_DB_CHECK_TEXT),
        'db-check'
      )
    );
  }

  async function verifyDbKeyV2(dbKey, encodedCheck) {
    try {
      const clear = await cryptoService.aesDecrypt(
        dbKey,
        cryptoService.base64ToBytes(encodedCheck),
        'db-check'
      );
      return cryptoService.utf8BytesToString(clear) === SDC_DB_CHECK_TEXT;
    } catch (_) {
      return false;
    }
  }

  async function migrateLegacyDatabaseCryptoV2(password, legacyDbKey) {
    // Keep one untouched encrypted v21 snapshot before changing the on-disk
    // format. It contains only the already-encrypted legacy database and is
    // available for an explicit rollback if the user is testing v22.
    try {
      const existingBackup = await Utils.StorageLoad(
        'SimpleDiscordCrypt-pre-v22'
      );
      if (existingBackup == null) {
        await Utils.StorageSave(
          'SimpleDiscordCrypt-pre-v22',
          JSON.parse(JSON.stringify(DataBase))
        );
        console.log('[SDC][CRYPTO] database:pre-v22-backup-created');
      }
    } catch (error) {
      console.warn('[SDC][CRYPTO] unable to create pre-v22 backup', error);
    }

    const plaintextKeys = {};
    for (const [hash, keyObj] of Object.entries(DataBase.keys || {})) {
      const encrypted = cryptoService.base64ToBytes(keyObj.k);
      plaintextKeys[hash] = await cryptoService.aesDecrypt(
        legacyDbKey,
        encrypted
      );
    }

    const dhPlain = await cryptoService.aesDecrypt(
      legacyDbKey,
      cryptoService.base64ToBytes(DataBase.dhPrivateKey)
    );

    let identityPlain = null;
    if (DataBase.identityPrivateKey) {
      identityPlain = await cryptoService.aesDecrypt(
        legacyDbKey,
        cryptoService.base64ToBytes(DataBase.identityPrivateKey)
      );
    }

    const salt = cryptoService.getRandomBytes(16);
    const saltBase64 = cryptoService.bytesToBase64(salt);
    const newDbKey = await deriveDbKeyV2(
      password,
      saltBase64,
      SDC_DB_KDF_ITERATIONS
    );

    const newKeyValues = {};
    for (const [hash, clear] of Object.entries(plaintextKeys)) {
      newKeyValues[hash] = cryptoService.bytesToBase64(
        await cryptoService.aesEncrypt(newDbKey, clear, 'db-key')
      );
    }
    const newDhPrivate = cryptoService.bytesToBase64(
      await cryptoService.aesEncrypt(newDbKey, dhPlain, 'db-dh')
    );
    const newIdentityPrivate = identityPlain
      ? cryptoService.bytesToBase64(
          await cryptoService.aesEncrypt(
            newDbKey,
            identityPlain,
            'db-identity'
          )
        )
      : null;
    const dbCheck = await makeDbCheckV2(newDbKey);

    // Commit only after every decrypt/encrypt operation has succeeded.
    for (const [hash, value] of Object.entries(newKeyValues))
      DataBase.keys[hash].k = value;
    DataBase.dhPrivateKey = newDhPrivate;
    if (newIdentityPrivate)
      DataBase.identityPrivateKey = newIdentityPrivate;

    DataBase.dbCryptoVersion = SDC_DB_CRYPTO_VERSION;
    DataBase.dbKdf = 'PBKDF2-HMAC-SHA-256';
    DataBase.dbKdfSalt = saltBase64;
    DataBase.dbKdfIterations = SDC_DB_KDF_ITERATIONS;
    DataBase.dbCheck = dbCheck;
    delete DataBase.dbPasswordSalt;
    delete DataBase.dbKeySalt;
    delete DataBase.dbPasswordHash;

    Cache.dbKey = newDbKey;
    await Utils.StorageSave('SimpleDiscordCrypt', DataBase);
    console.log('[SDC][CRYPTO] database:migrated-v2', {
      kdf: DataBase.dbKdf,
      iterations: DataBase.dbKdfIterations,
      keys: Object.keys(DataBase.keys || {}).length,
    });
  }

  async function ensureIdentityKeys() {
    if (DataBase.identityPublicKey && DataBase.identityPrivateKey) return;

    const pair = await cryptoService.identityGenerateKeys();
    const publicBytes = await cryptoService.identityExportPublicKey(
      pair.publicKey
    );
    let privateBytes = await cryptoService.identityExportPrivateKey(
      pair.privateKey
    );

    if (DataBase.isEncrypted) {
      privateBytes = await cryptoService.aesEncrypt(
        Cache.dbKey,
        privateBytes,
        'db-identity'
      );
    }

    DataBase.identityPublicKey = cryptoService.bytesToBase64(publicBytes);
    DataBase.identityPrivateKey = cryptoService.bytesToBase64(privateBytes);
    DataBase.identityKeyCreated = Date.now();
    Utils.dbChanged = true;
    try { Utils.FastSaveDb(); } catch (_) {}

    const fp = cryptoService.bytesToBase64url(
      (await cryptoService.sha256(publicBytes)).slice(0, 16)
    );
    console.log('[SDC][CRYPTO] identity:created', { fingerprint: fp });
  }

  async function readIdentityPrivateKey() {
    await ensureIdentityKeys();
    let bytes = cryptoService.base64ToBytes(DataBase.identityPrivateKey);
    if (DataBase.isEncrypted) {
      bytes = await cryptoService.aesDecrypt(
        Cache.dbKey,
        bytes,
        'db-identity'
      );
    }
    return await cryptoService.identityImportPrivateKey(bytes);
  }

  async function runCryptoV2SelfTest() {
    if (cryptoService.selfTestResult != null)
      return cryptoService.selfTestResult;

    const started = performance.now();
    try {
      const raw = cryptoService.getRandomBytes(32);
      const key = await cryptoService.aesImportKey(raw);
      const sample = cryptoService.stringToUtf8Bytes('SDC crypto v2 self-test');

      const gcm = await cryptoService.aesEncrypt(key, sample, 'message');
      const clear = await cryptoService.aesDecrypt(key, gcm, 'message');
      if (cryptoService.utf8BytesToString(clear) !== 'SDC crypto v2 self-test')
        throw new Error('AES-GCM roundtrip mismatch');

      const tampered = new Uint8Array(gcm).slice();
      tampered[tampered.length - 1] ^= 1;
      let tamperRejected = false;
      try {
        await cryptoService.aesDecrypt(key, tampered, 'message');
      } catch (_) {
        tamperRejected = true;
      }
      if (!tamperRejected) throw new Error('AES-GCM tamper test failed');

      const legacy = await cryptoService.aesEncryptLegacy(key, sample);
      const legacyClear = await cryptoService.aesDecrypt(key, legacy);
      if (
        cryptoService.utf8BytesToString(legacyClear) !==
        'SDC crypto v2 self-test'
      )
        throw new Error('AES-CBC compatibility roundtrip mismatch');

      const salt = cryptoService.getRandomBytes(16);
      const pb = await cryptoService.pbkdf2Sha256('self-test', salt, 1000, 32);
      if (pb.byteLength !== 32) throw new Error('PBKDF2 length mismatch');

      const hk = await cryptoService.hkdfSha256(
        raw,
        salt,
        cryptoService.stringToUtf8Bytes('SDC self-test'),
        32
      );
      if (hk.byteLength !== 32) throw new Error('HKDF length mismatch');

      const a = await cryptoService.dhGenerateKeys();
      const b = await cryptoService.dhGenerateKeys();
      const [sa, sb] = await Promise.all([
        cryptoService.dhGetSecretFull(a.privateKey, b.publicKey),
        cryptoService.dhGetSecretFull(b.privateKey, a.publicKey),
      ]);
      if (
        cryptoService.bytesToBase64(sa) !==
        cryptoService.bytesToBase64(sb)
      )
        throw new Error('ephemeral ECDH mismatch');

      const id = await cryptoService.identityGenerateKeys();
      const sig = await cryptoService.identitySign(id.privateKey, sample);
      if (!(await cryptoService.identityVerify(id.publicKey, sig, sample)))
        throw new Error('ECDSA verification failed');

      cryptoService.v2Enabled = true;
      cryptoService.selfTestResult = {
        ok: true,
        elapsedMs: Math.round(performance.now() - started),
        aes: 'AES-256-GCM-128',
        legacyRead: 'AES-256-CBC',
        kdf: 'PBKDF2-HMAC-SHA-256',
        exchangeKdf: 'HKDF-SHA-256',
        identity: 'ECDSA-P-521/SHA-512',
        exchange: 'ephemeral ECDH-P-521',
      };
    } catch (error) {
      cryptoService.v2Enabled = false;
      cryptoService.selfTestResult = {
        ok: false,
        elapsedMs: Math.round(performance.now() - started),
        error: error?.message || String(error),
      };
      console.error('[SDC][CRYPTO] self-test failed; new encryption falls back to legacy CBC', error);
    }

    console.log('[SDC][CRYPTO] self-test', cryptoService.selfTestResult);
    return cryptoService.selfTestResult;
  }

  // DatabaseManager - Centralized database operations
  class DatabaseManager {
    constructor() {
      this.dbChanged = false;
      this.saveDbTimeout = null;
    }

    // Key Cache Management
    trimKeyCache() {
      let keyHashes = Object.keys(Cache.keys);
      if (keyHashes.length === CONFIG.limits.keyCacheSize) {
        let lastseen = Number.MAX_SAFE_INTEGER;
        let keyToTrim;
        for (let hash of keyHashes) {
          let key = DataBase.keys[hash];
          if (key.l < lastseen) {
            keyToTrim = hash;
            lastseen = key.l;
          }
        }
        delete Cache[keyToTrim];
      }
    }

    async getKeyByHash(hashBase64, out) {
      let keyObj = DataBase.keys[hashBase64];
      if (keyObj == null) return null;
      if (out != null) out[0] = keyObj;
      keyObj.l = Date.now();
      this.dbChanged = true;

      let cachedKey = Cache.keys[hashBase64];
      if (cachedKey != null) return cachedKey;

      let keyBase64 = keyObj.k;
      let keyBytes = cryptoService.base64ToBytes(keyBase64);

      if (DataBase.isEncrypted)
        keyBytes = await cryptoService.aesDecrypt(Cache.dbKey, keyBytes, 'db-key');

      let key = await cryptoService.aesImportKey(keyBytes);
      this.trimKeyCache();
      Cache.keys[hashBase64] = key;
      return key;
    }

    async getKeyBytesByHash(hashBase64) {
      let keyObj = DataBase.keys[hashBase64];
      if (keyObj == null) return null;
      keyObj.l = Date.now();
      this.dbChanged = true;

      let keyBase64 = keyObj.k;
      let keyBytes = cryptoService.base64ToBytes(keyBase64);

      if (DataBase.isEncrypted)
        keyBytes = await cryptoService.aesDecrypt(Cache.dbKey, keyBytes, 'db-key');

      return keyBytes;
    }

    async saveKey(keyBytes, type, descriptor, hidden) {
      let keyHashBase64 = cryptoService.bytesToBase64(
        await cryptoService.sha512_128(keyBytes)
      );
      if (DataBase.keys[keyHashBase64] != null) return keyHashBase64;
      let keyObj = {
        t: type,
        d: descriptor,
        r: Date.now(),
        l: Date.now(),
        h: hidden || type > 1 ? 1 : 0,
      };

      if (DataBase.isEncrypted)
        keyBytes = await cryptoService.aesEncrypt(Cache.dbKey, keyBytes, 'db-key');

      keyObj.k = cryptoService.bytesToBase64(keyBytes);
      DataBase.keys[keyHashBase64] = keyObj;
      this.fastSaveDb();
      return keyHashBase64;
    }

    changeKeyDescriptor(hash, descriptor) {
      DataBase.keys[hash].d = descriptor
        .replace(/[`\r\n]/g, '')
        .substr(0, 250);
      this.fastSaveDb();
    }

    changeKeyHidden(hash, hidden) {
      DataBase.keys[hash].h = hidden;
      this.fastSaveDb();
    }

    async deleteKey(hash) {
      if (hash === DataBase.personalKeyHash) {
        await this.newPersonalKey();
        return;
      }
      this.replaceChannelKeys(hash, DataBase.personalKeyHash);
      delete DataBase.keys[hash];
      if (DataBase.trustedKeys != null && DataBase.trustedKeys[hash]) {
        if (DataBase.trustedKeys.length === 1) delete DataBase.trustedKeys;
        else delete DataBase.trustedKeys[hash];
      }
      this.dbChanged = true;
    }

    replaceChannelKeys(oldHash, newHash) {
      Object.values(DataBase.channels).forEach((x) => {
        if (x.k === oldHash) x.k = newHash;
      });
      this.fastSaveDb();
    }

    async newPersonalKey() {
      if (DataBase.personalKeyHash != null)
        this.changeKeyDescriptor(
          DataBase.personalKeyHash,
          'Old personal key'
        );
      let newPersonalKeyHash = await this.saveKey(
        cryptoService.getRandomBytes(32),
        3,
        '#Your personal key#'
      );
      this.replaceChannelKeys(DataBase.personalKeyHash, newPersonalKeyHash);
      DataBase.personalKeyHash = newPersonalKeyHash;
      this.fastSaveDb();
    }

    toggleKeyTrusted(hash) {
      let keyObj = DataBase.keys[hash];
      if (keyObj.t === 3) return;
      let trustedKeys = DataBase.trustedKeys;
      if (trustedKeys == null)
        DataBase.trustedKeys = trustedKeys = { hash: 1 };
      else {
        if (DataBase.trustedKeys[hash]) {
          if (DataBase.trustedKeys.length === 1) delete DataBase.trustedKeys;
          else delete DataBase.trustedKeys[hash];
        } else DataBase.trustedKeys[hash] = 1;
      }
      this.dbChanged = true;
    }

    // Channel Configuration
    getChannelConfig(channelId) {
      let channelConfig = DataBase.channels[channelId];
      if (channelConfig != null) {
        channelConfig.l = Date.now();
        this.dbChanged = true;
      }
      return channelConfig;
    }

    getOrCreateChannelConfig(channelId) {
      let channelConfig = DataBase.channels[channelId];
      if (channelConfig != null) {
        channelConfig.l = Date.now();
        this.dbChanged = true;
        return channelConfig;
      }
      return this.newChannelConfig(channelId);
    }

    newChannelConfig(channelId, keyHash, descriptor, encrypt) {
      let channelConfig = {
        k: keyHash || DataBase.personalKeyHash,
        e: encrypt ? 1 : 0,
        l: Date.now(),
      };
      if (descriptor != null) channelConfig.d = descriptor;
      else {
        let channel = Discord.getChannel(channelId);
        if (channel != null && channel.type === 1)
          channelConfig.d = `DM with <@${channel.recipients[0]}>`;
        else channelConfig.d = `<#${channelId}>`;
      }
      DataBase.channels[channelId] = channelConfig;
      this.fastSaveDb();
      return channelConfig;
    }

    deleteChannelConfig(channelId) {
      if (Cache.channelId === channelId) Cache.channelConfig = null;
      delete DataBase.channels[channelId];
      this.dbChanged = true;
    }

    // Database Save/Load
    async saveDb() {
      if (!this.dbChanged) return;
      this.dbChanged = false;
      await Utils.StorageSave('SimpleDiscordCrypt', DataBase);
    }

    fastSaveDb() {
      this.dbChanged = true;
      if (this.saveDbTimeout != null) clearTimeout(this.saveDbTimeout);
      this.saveDbTimeout = setTimeout(() => {
        this.saveDbTimeout = null;
        this.saveDb();
      }, 10);
    }

    formatDescriptor(descriptor) {
      return descriptor
        .replace(/<@(\d{1,20})>/g, (m, x) => {
          let user = Discord.getUser(x);
          if (user != null) x = user.username;
          return x;
        })
        .replace(/<#(\d{1,20})>/g, (m, x) => {
          let channel = Discord.getChannel(x);
          if (channel == null) return m;
          if (channel.guild_id == null) return channel.name;
          let guild = Discord.getGuild(channel.guild_id);
          return `${guild.name} #${channel.name}`;
        });
    }
  }

  // Create singleton instance
  const dbManager = new DatabaseManager();

  // DiscordModuleFinder - Unified module discovery with fallbacks
  class DiscordModuleFinder {
    constructor() {
      this.moduleCache = new Map();
      this.useBdApi = typeof BdApi !== 'undefined' && BdApi.Webpack;
    }

    // Generic finder with multiple fallback strategies
    findWithFallbacks(config) {
      let match = null;

      // Strategy 0: Special case for MessageDispatcher - use BdApi.Webpack.getModule with filter
      if (config.isDispatcher && this.useBdApi) {
        console.log('[SDC] Trying isDispatcher strategy with BdApi.Webpack.getModule...');
        try {
          // Stratégie 1: Chercher via _dispatcher (Store._dispatcher contient le Dispatcher réel)
          let dispatcher = null;
          try {
            const storeWithDispatcher = BdApi.Webpack.getByKeys('_dispatcher');
            if (storeWithDispatcher?._dispatcher && typeof storeWithDispatcher._dispatcher.dispatch === 'function') {
              dispatcher = storeWithDispatcher._dispatcher;
              console.log('[SDC] Found Dispatcher via Store._dispatcher:', dispatcher);
            }
          } catch (e) {
            console.log('[SDC] Strategy 1 (_dispatcher) failed:', e);
          }

          // Stratégie 2: Chercher par propriétés internes Flux (_actionHandlers, _subscriptions)
          if (!dispatcher) {
            dispatcher = BdApi.Webpack.getModule((m) => {
              if (!m || typeof m !== 'object') return false;
              if (m === Object || m === Function) return false;
              if (typeof Atomics !== 'undefined' && m === Atomics) return false;

              // Vérifier les propriétés internes du Dispatcher Flux
              const hasInternalProps = m._currentDispatchActionType !== undefined ||
                m._actionHandlers !== undefined ||
                m._subscriptions !== undefined;
              const hasDispatch = typeof m.dispatch === 'function';

              if (hasInternalProps && hasDispatch) {
                console.log('[SDC] Found Dispatcher via internal props:', m);
                return true;
              }
              return false;
            });
          }

          // Stratégie 3: Si pas trouvé, chercher par signature classique
          if (!dispatcher) {
            dispatcher = BdApi.Webpack.getModule((m) => {
              if (!m || typeof m !== 'object') return false;
              if (m === Object || m === Function) return false;
              if (typeof Atomics !== 'undefined' && m === Atomics) return false;
              if (typeof SharedArrayBuffer !== 'undefined' && m === SharedArrayBuffer) return false;

              // Vérifier signature Flux Dispatcher
              const hasDispatch = typeof m.dispatch === 'function';
              const hasRegister = typeof m.register === 'function';
              const hasSubscribe = typeof m.subscribe === 'function';
              const hasUnsubscribe = typeof m.unsubscribe === 'function';

              if (hasDispatch && hasRegister && hasSubscribe && hasUnsubscribe) {
                console.log('[SDC] Found Dispatcher via function signature:', m);
                return true;
              }
              return false;
            });
          }

          if (dispatcher) {
            console.log('[SDC] ✓ Dispatcher found via BdApi.Webpack.getModule!');
            match = {
              module: dispatcher,
              path: 'BdApi.Webpack.getModule',
              pattern: 'Flux Dispatcher filter'
            };
          } else {
            console.warn('[SDC] BdApi.Webpack.getModule returned null/undefined for Dispatcher');
          }
        } catch (e) {
          console.error('[SDC] Erreur lors de la recherche du Dispatcher via BdApi:', e);
        }
      }

      // Strategy 1: BdApi Store (if store name provided)
      if (!match && this.useBdApi && config.storeName) {
        try {
          const store = BdApi.Webpack.Stores?.[config.storeName];
          if (store) {
            match = {
              module: store,
              path: `BdApi.Webpack.Stores.${config.storeName}`,
              pattern: 'BdApi Store'
            };
          }
        } catch (e) {
          // Ignorer les erreurs d'accès aux stores
        }
      }

      // Strategy 2: BdApi getStore (if store name provided)
      if (!match && this.useBdApi && config.storeName) {
        try {
          const store = BdApi.Webpack.getStore(config.storeName);
          if (store) {
            match = {
              module: store,
              path: 'BdApi.Webpack.getStore',
              pattern: 'BdApi getStore'
            };
          }
        } catch (e) {
          // Ignorer les erreurs lors de getStore
        }
      }

      // Strategy 3: BdApi getByKeys (if keys provided)
      if (!match && this.useBdApi && config.keys && config.keys.length > 0) {
        for (const keySet of config.keys) {
          try {
            const bdModule = BdApi.Webpack.getByKeys(...keySet);
            // Exclure les objets natifs JavaScript (Atomics, SharedArrayBuffer, etc.)
            if (bdModule &&
              bdModule !== Object &&
              bdModule !== Function &&
              (typeof Atomics === 'undefined' || bdModule !== Atomics) &&
              (typeof SharedArrayBuffer === 'undefined' || bdModule !== SharedArrayBuffer) &&
              bdModule?.constructor?.name !== 'Atomics') {
              match = {
                module: bdModule,
                path: 'BdApi',
                pattern: `BdApi.Webpack.getByKeys(${keySet.join(', ')})`
              };
              break;
            }
          } catch (e) {
            // Ignorer les erreurs lors de getByKeys
            continue;
          }
        }
      }

      // Strategy 4: Robust pattern search (if patterns provided and findModuleRobust exists)
      if (!match && config.patterns && config.findModuleRobust) {
        match = config.findModuleRobust(config.patterns);
      }

      return match;
    }

    // Find multiple modules in batch
    findModules(modulesConfig, findModuleRobust, getAllExports) {
      const results = {};
      const useBdApi = this.useBdApi;

      for (const [name, config] of Object.entries(modulesConfig)) {
        const match = this.findWithFallbacks({
          ...config,
          findModuleRobust,
          useBdApi
        });

        if (match) {
          results[name] = match.module;
        }
      }

      return results;
    }
  }

  // Create singleton instance
  const moduleFinder = new DiscordModuleFinder();

  var Discord;
  var Utils = {
    // Mode debug persistant - activable via: window.SDC_DEBUG = true
    get debugMode() {
      if (typeof window.SDC_DEBUG !== 'undefined') return window.SDC_DEBUG;
      try {
        const stored = localStorage.getItem('SDC_DEBUG');
        return stored === 'true';
      } catch (e) {
        return false;
      }
    },
    set debugMode(value) {
      window.SDC_DEBUG = value;
      try {
        localStorage.setItem('SDC_DEBUG', value ? 'true' : 'false');
      } catch (e) {
        // Ignore localStorage errors
      }
    },
    Debug: (message, data) => {
      if (!Utils.debugMode) return;
      if (data !== undefined) {
        console.log(
          `%c[SDC:DEBUG] %c${message}`,
          `color:${BaseColor};font-weight:bold`,
          '',
          data
        );
      } else {
        console.log(
          `%c[SDC:DEBUG] %c${message}`,
          `color:${BaseColor};font-weight:bold`,
          ''
        );
      }
    },
    Log: (message) => {
      console.log(
        `%c[SimpleDiscordCrypt] %c${message}`,
        `color:${BaseColor};font-weight:bold`,
        ''
      );
    },
    Warn: (message) => {
      console.warn(
        `%c[SimpleDiscordCrypt] %c${message}`,
        `color:${BaseColor};font-weight:bold`,
        ''
      );
    },
    Error: (message) => {
      console.error(
        `%c[SimpleDiscordCrypt] %c${message}`,
        `color:${BaseColor};font-weight:bold`,
        ''
      );
    },
    validateModule: (module, moduleName, expectedMethods = []) => {
      const result = {
        valid: false,
        reason: '',
        foundMethods: [],
        moduleType: 'unknown'
      };

      if (!module) {
        result.reason = 'Module is null or undefined';
        return result;
      }

      // Détecter objets natifs JavaScript (avec vérifications d'existence)
      const nativeObjects = [
        Object, Function, Array, Promise,
        typeof Atomics !== 'undefined' ? Atomics : null,
        typeof SharedArrayBuffer !== 'undefined' ? SharedArrayBuffer : null
      ].filter(Boolean);

      if (nativeObjects.includes(module)) {
        result.reason = `Module is native JavaScript object: ${module.constructor?.name}`;
        result.moduleType = 'native';
        return result;
      }

      // Collecter méthodes trouvées AVANT de vérifier le constructor
      // (certains modules Discord légitimes ont constructor.name === 'Object')
      try {
        result.foundMethods = Object.keys(module).filter(k => {
          try {
            return typeof module[k] === 'function';
          } catch (e) {
            return false;
          }
        });
      } catch (e) {
        result.reason = 'Cannot enumerate module properties';
        return result;
      }

      // Analyser constructeur
      try {
        const constructorName = module.constructor?.name;
        // IMPORTANT: Ne rejeter 'Object'/'Function' QUE si le module n'a pas de méthodes Discord
        // (MessageQueue a constructor.name='Object' mais c'est un vrai module Discord)
        if (['Atomics', 'SharedArrayBuffer'].includes(constructorName)) {
          result.reason = `Constructor name indicates native object: ${constructorName}`;
          result.moduleType = 'native';
          return result;
        }
        if (['Object', 'Function'].includes(constructorName)) {
          // Vérifier si c'est vraiment un objet natif ou un module Discord
          // Si le module a des méthodes, c'est probablement un module Discord légitime
          if (result.foundMethods.length === 0) {
            result.reason = `Constructor name indicates native object with no methods: ${constructorName}`;
            result.moduleType = 'native';
            return result;
          }
          // Sinon, c'est un module Discord valide (comme MessageQueue)
        }
        result.moduleType = constructorName || 'anonymous';
      } catch (e) {
        // Ignore
      }

      // Vérifier méthodes attendues
      if (expectedMethods.length > 0) {
        const missing = expectedMethods.filter(method => !result.foundMethods.includes(method));
        if (missing.length > 0) {
          result.reason = `Missing expected methods: ${missing.join(', ')}`;
          return result;
        }
      }

      // Validation spéciale pour MessageDispatcher
      if (moduleName === 'MessageDispatcher') {
        if (typeof module.dispatch !== 'function') {
          result.reason = 'Missing dispatch function';
          return result;
        }

        // Vérifier les propriétés internes du Dispatcher Flux (nouveau format Discord)
        const hasInternalProps = module._currentDispatchActionType !== undefined ||
          module._actionHandlers !== undefined ||
          module._subscriptions !== undefined ||
          module._processingWaitQueue !== undefined;

        // Vérifier présence méthodes Flux (au moins 2 sur 4)
        const fluxMethods = [
          typeof module.register === 'function',
          typeof module.subscribe === 'function',
          typeof module.wait === 'function',
          typeof module.isDispatching === 'function'
        ];
        const fluxMethodCount = fluxMethods.filter(Boolean).length;
        const hasFluxMethods = fluxMethodCount >= 2;

        // Accepter le module si:
        // 1. Il a des propriétés internes Flux OU
        // 2. Il a au moins 2 méthodes Flux classiques
        if (!hasInternalProps && !hasFluxMethods) {
          result.reason = 'Not a valid Flux Dispatcher (missing internal props and Flux methods)';
          return result;
        }

        Utils.Debug(`MessageDispatcher validation - hasInternalProps: ${hasInternalProps}, fluxMethodCount: ${fluxMethodCount}`);
      }

      result.valid = true;
      result.reason = 'Valid module';
      return result;
    },
    Webpack: function () {
      if (this.cachedWebpack) return this.cachedWebpack;

      let webpackExports;

      /*if (typeof BdApi !== 'undefined' && BdApi?.Webpack) {
        const getModuleOptions = { searchExports: true };
        const { getModule } = BdApi.Webpack;
        const findModule = filter => getModule(filter, getModuleOptions);
        return (this.cachedWebpack = {
          findModule,
          findModuleByUniqueProperties: propNames =>
            findModule(module => propNames.every(prop => module[prop] !== undefined)),
        });
      } else*/ if (Discord.window.webpackChunkdiscord_app != null) {
        const id = Symbol();
        Discord.window.webpackChunkdiscord_app.push([
          [id],
          {},
          (req) => {
            // It seems to get called with two different require functions
            if (req.c != null) {
              webpackExports = req;
            }
          },
        ]);
      } else {
        return null;
      }

      const cachedExports = new Set();
      let cachedExportsCount = 0;
      const moduleCache = new Set();

      const addModuleToCache = (module) => {
        if (typeof module !== 'object' && typeof module !== 'function') return;

        if (module.__esModule && module.default) module = module.default;

        moduleCache.add(module);
      };

      const addModulesToCache = (modules) => {
        const isModuleLike = (x) =>
          x && (typeof x === 'object' || typeof x === 'function');

        for (const rawModule of modules) {
          const exports = rawModule.exports;
          if (!cachedExports.has(exports)) {
            cachedExports.add(exports);

            if (typeof exports === 'object' && !exports.__esModule) {
              const properties = Object.values(
                Object.getOwnPropertyDescriptors(exports)
              );
              try {
                // These getters should work without the this parameter
                properties
                  .filter((x) => x.get)
                  .map(({ get }) => get())
                  .filter(isModuleLike)
                  .forEach(addModuleToCache);
              } catch { }
              properties
                .map((x) => x.value)
                .filter(isModuleLike)
                .forEach(addModuleToCache);
            }

            addModuleToCache(exports);
          }
        }
      };

      const findModule = (filter) => {
        const cache = webpackExports?.c;
        if (cache == null) return null;

        const cacheItems = Object.values(cache);
        if (cacheItems.length !== cachedExportsCount) {
          addModulesToCache(cacheItems);
          cachedExportsCount = cacheItems.length;
        }

        for (const module of moduleCache.values()) {
          try {
            if (filter(module)) return module;
          } catch (e) {
            // Ignorer les erreurs liées aux objets Proxy lors du filtrage
            continue;
          }
        }

        return null;
      };

      const findModuleByUniqueProperties = (propNames) =>
        findModule((module) => {
          try {
            return propNames.every((prop) => {
              try {
                return module[prop] !== undefined;
              } catch (e) {
                return false;
              }
            });
          } catch (e) {
            return false;
          }
        });

      // Fonction pour explorer les exports minifiés (Z, ZP, default, etc.)
      const getAllExports = (module) => {
        if (!module || typeof module !== 'object') return [module];
        const exports = [module];

        // Exports communs minifiés
        if (module.Z) exports.push(module.Z);
        if (module.ZP) exports.push(module.ZP);
        if (module.default) exports.push(module.default);

        // Exports avec une seule clé (pattern de minification)
        try {
          const keys = Object.keys(module);
          if (keys.length === 1 && typeof module[keys[0]] === 'object') {
            exports.push(module[keys[0]]);
          }
        } catch (e) {
          // Ignorer les erreurs liées aux objets Proxy
        }

        return exports;
      };

      // Recherche robuste avec scoring
      const findModuleRobust = (patterns) => {
        const cache = webpackExports?.c;
        if (cache == null) return null;

        const cacheItems = Object.values(cache);
        if (cacheItems.length !== cachedExportsCount) {
          addModulesToCache(cacheItems);
          cachedExportsCount = cacheItems.length;
        }

        let bestMatch = null;
        let bestScore = 0;
        let bestPath = '';

        for (const module of moduleCache.values()) {
          const allExports = getAllExports(module);

          for (let i = 0; i < allExports.length; i++) {
            const exp = allExports[i];
            if (!exp || typeof exp !== 'object') continue;

            let score = 0;
            let matchedPattern = null;
            let path = '';
            try {
              path = i === 0 ? '' : (module.Z === exp ? '.Z' : module.ZP === exp ? '.ZP' : module.default === exp ? '.default' : `.${Object.keys(module).find(k => module[k] === exp)}`);
            } catch (e) {
              path = '';
            }

            // Tester chaque pattern
            for (const pattern of patterns) {
              try {
                if (pattern.props && Array.isArray(pattern.props)) {
                  // Chercher par propriétés
                  const matches = pattern.props.filter(prop => {
                    try {
                      return exp[prop] !== undefined;
                    } catch (e) {
                      return false;
                    }
                  });
                  if (matches.length > 0) {
                    score += matches.length * 10;
                    matchedPattern = pattern;
                  }
                }

                if (pattern.filter && typeof pattern.filter === 'function') {
                  // Chercher par fonction filter
                  try {
                    if (pattern.filter(exp)) {
                      score += 50;
                      matchedPattern = pattern;
                    }
                  } catch (e) { }
                }

                if (pattern.displayName && exp.displayName === pattern.displayName) {
                  score += 100;
                  matchedPattern = pattern;
                }

                if (pattern.prototype && exp.prototype) {
                  const protoProps = pattern.prototype.filter(prop => {
                    try {
                      return exp.prototype[prop] !== undefined;
                    } catch (e) {
                      return false;
                    }
                  });
                  if (protoProps.length > 0) {
                    score += protoProps.length * 20;
                    matchedPattern = pattern;
                  }
                }
              } catch (e) {
                // Ignorer les erreurs lors du test de ce pattern
                continue;
              }
            }

            if (score > bestScore) {
              bestScore = score;
              bestMatch = { module: exp, original: module, path, pattern: matchedPattern };
              bestPath = path;
            }
          }
        }

        return bestMatch;
      };

      // Utilitaire de validation de modules
      // Logger exhaustif d'un module
      const deepLogModule = (module, name) => {
        if (!module) return;

        // Analyser les fonctions
        try {
          const funcs = Object.keys(module).filter(k => {
            try {
              return typeof module[k] === 'function';
            } catch (e) {
              return false;
            }
          });
        } catch (e) {
          // Ignorer les erreurs liées aux objets Proxy
        }

        // Analyser les sous-exports
      };

      return (this.cachedWebpack = {
        findModule,
        findModuleByUniqueProperties,
        findModuleRobust,
        deepLogModule,
        getAllExports,
      });
    },
  };
  var DataBase;
  var Cache;
  var Blacklist;
  var Patcher;
  var KeyRotators;
  var ImageZoom;
  var ResolveInitPromise;
  var InitPromise = new Promise((resolve) => {
    ResolveInitPromise = resolve;
  });

  // ============================================================================
  // SECTION 3: INITIALIZATION & MODULE DISCOVERY
  // ============================================================================

  function Init(final) {
    Discord = {
      window: typeof unsafeWindow !== 'undefined' ? unsafeWindow : window,
    };

    const webpackUtil = Utils.Webpack();
    if (webpackUtil == null) {
      if (final) Utils.Error('Webpack not found.');
      return 0;
    }

    const { findModule, findModuleByUniqueProperties, findModuleRobust, deepLogModule, getAllExports } = webpackUtil;

    let modules = {};

    // Utiliser l'API BetterDiscord si disponible (gère automatiquement les exports minifiés)
    const useBdApi = typeof BdApi !== 'undefined' && BdApi.Webpack;

    // Configuration déclarative pour tous les modules Discord nécessaires
    const MODULE_CONFIG = {
      /**
       * MODULE_CONFIG - Configuration de recherche des modules Discord
       * 
       * Structure pour chaque module:
       * {
       *   storeName: string|null - Nom du store Flux (si applicable)
       *   keys: Array<string[]> - Combinaisons de propriétés à rechercher via BdApi.Webpack
       *   patterns: Array<{props: string[]}|{filter: Function}> - Patterns de matching
       * }
       * 
       * ORDRE DE SPÉCIFICITÉ: Toujours du plus strict au plus permissif
       * - Pattern 1: Le plus spécifique (4+ méthodes, checks avancés)
       * - Pattern 2-3: Spécificité moyenne (2-3 méthodes)
       * - Pattern 4: Fallback permissif (1-2 méthodes, avec validations)
       * 
       * ✅ BON EXEMPLE (MessageDispatcher):
       *   patterns: [
       *     { filter: (m) => {
       *         // Exclusion explicite objets natifs
       *         if (m === Atomics || m === SharedArrayBuffer) return false;
       *         // Vérifier 3+ méthodes Flux spécifiques
       *         return typeof m.dispatch === 'function' &&
       *                typeof m.subscribe === 'function' &&
       *                typeof m.wait === 'function';
       *       }
       *     },
       *     { props: ['dispatch', 'subscribe', 'register'] }, // Fallback
       *   ]
       * 
       * ❌ MAUVAIS EXEMPLE:
       *   patterns: [
       *     { props: ['dispatch'] }, // Trop générique!
       *     { filter: (m) => typeof m.dispatch === 'function' } // Match Atomics!
       *   ]
       * 
       * CHECKLIST AVANT AJOUT/MODIFICATION:
       * □ Exclure objets natifs JS (Atomics, SharedArrayBuffer, Object, etc.)
       * □ Vérifier 3+ méthodes simultanément dans pattern principal
       * □ Tester contre faux positifs: Atomics.wait, Object.keys, etc.
       * □ Ordonner patterns du plus strict au plus permissif
       * □ Ajouter commentaire si logique métier spécifique
       * 
       * CONFIG_VERSION: 2.0 (2026-01-30 - Fix MessageDispatcher + validation)
       */
      MessageQueue: {
        storeName: null,
        keys: [
          ['sendMessage', 'editMessage', 'deleteMessage'],
          ['sendMessage', 'editMessage', 'receiveMessage'],
          ['sendMessage', 'editMessage'],
        ],
        patterns: [
          { props: ['sendMessage', 'editMessage', 'deleteMessage'] },
          { props: ['sendMessage', 'editMessage', 'receiveMessage'] },
          { props: ['sendMessage', 'editMessage'] },
          { filter: (m) => typeof m.sendMessage === 'function' && typeof m.editMessage === 'function' },
        ]
      },
      MessageDispatcher: {
        isDispatcher: true, // Flag pour utiliser la stratégie spéciale BdApi
        storeName: null, // Pas un store, mais le Dispatcher Flux
        keys: [
          // IMPORTANT: Ne jamais inclure 'wait' seul car Atomics.wait existe!
          ['_currentDispatchActionType', '_processingWaitQueue', '_subscriptions'],
          ['_actionHandlers', '_subscriptions'],
          ['dispatch', 'subscribe', 'register'], // Removed 'wait' - Atomics has wait()
          ['dispatch', 'register', 'subscribe'],
          ['dispatch', 'isDispatching', 'register'], // Use isDispatching instead of wait
        ],
        patterns: [
          // PATTERN PRIORITAIRE: Utiliser BdApi pour trouver le vrai Dispatcher
          {
            filter: (m) => {
              // Exclusion immédiate objets natifs
              if (m === Object || m === Function) return false;
              if (typeof Atomics !== 'undefined' && m === Atomics) return false;
              if (typeof SharedArrayBuffer !== 'undefined' && m === SharedArrayBuffer) return false;

              try {
                const constructorName = m.constructor?.name;
                // Atomics a constructor.name === 'Object', donc on exclut les 'Object' sans autre propriété Discord
                if (constructorName === 'Object') {
                  // Vérifier si c'est vraiment un objet Discord ou juste un natif
                  const keys = Object.keys(m);
                  // Atomics a des méthodes spécifiques: load, store, add, sub, and, or, xor, compareExchange
                  const atomicsMethods = ['load', 'store', 'add', 'sub', 'and', 'or', 'xor', 'compareExchange'];
                  const hasAtomicsMethods = atomicsMethods.filter(k => keys.includes(k)).length >= 6;
                  if (hasAtomicsMethods) return false; // C'est Atomics
                }
                if (['Atomics', 'SharedArrayBuffer', 'Function'].includes(constructorName)) {
                  return false;
                }
              } catch (e) {
                // Ignore
              }

              // Vérifier signature Flux Dispatcher
              if (typeof m.dispatch !== 'function') return false;
              if (typeof m.register !== 'function') return false;
              if (typeof m.wait !== 'function') return false;

              // Dispatcher a typiquement _subscriptions ou _callbacks
              const hasInternals = '_subscriptions' in m || '_callbacks' in m || '_isDispatching' in m;

              return hasInternals || typeof m.isDispatching === 'function';
            }
          },
          // FALLBACKS: Combinaisons spécifiques de 3+ méthodes
          { props: ['dispatch', 'subscribe', 'register', 'wait'] },
          { props: ['dispatch', 'subscribe', 'register'] },
          { props: ['dispatch', 'register', 'wait', 'isDispatching'] },
          // DERNIER RECOURS: Avec validation supplémentaire
          {
            filter: (m) => {
              // Exclusion objets natifs même en fallback
              if (typeof Atomics !== 'undefined' && m === Atomics) return false;
              if (typeof SharedArrayBuffer !== 'undefined' && m === SharedArrayBuffer) return false;
              try {
                const constructorName = m.constructor?.name;
                if (['Atomics', 'SharedArrayBuffer'].includes(constructorName)) return false;
              } catch (e) { }

              return typeof m.dispatch === 'function' &&
                typeof m.register === 'function' &&
                typeof m.wait === 'function';
            }
          },
        ]
      },
      UserCache: {
        storeName: 'UserStore',
        keys: [
          ['getUser', 'getCurrentUser'],
          ['getUser', 'getUsers', 'getCurrentUser'],
        ],
        patterns: [
          { props: ['getUser', 'getUsers', 'getCurrentUser'] },
          { props: ['getUser', 'getCurrentUser'] },
          { displayName: 'UserStore' },
          { filter: (m) => typeof m.getUser === 'function' && typeof m.getCurrentUser === 'function' },
        ]
      },
      ChannelCache: {
        storeName: 'ChannelStore',
        keys: [
          ['getChannel', 'getDMFromUserId'],
          ['getChannel', 'getChannelId'],
        ],
        patterns: [
          { props: ['getChannel', 'getDMFromUserId'] },
          { props: ['getChannel', 'hasChannel'] },
          { displayName: 'ChannelStore' },
          { filter: (m) => typeof m.getChannel === 'function' },
        ]
      },
      GuildCache: {
        storeName: 'GuildStore',
        keys: [
          ['getGuild', 'getGuilds'],
          ['getGuild'],
        ],
        patterns: [
          { props: ['getGuild', 'getGuilds'] },
          { props: ['getGuild'] },
          { displayName: 'GuildStore' },
        ]
      },
      MessageStore: {
        storeName: 'MessageStore',
        keys: [
          ['getMessage', 'getMessages'],
        ],
        patterns: [
          { props: ['getMessage', 'getMessages'] },
          { props: ['getMessage'] },
          { displayName: 'MessageStore' },
        ]
      },
      SelectedChannelStore: {
        storeName: 'SelectedChannelStore',
        keys: [
          ['getChannelId', 'getVoiceChannelId'],
          ['getChannelId'],
        ],
        patterns: [
          { props: ['getChannelId', 'getVoiceChannelId'] },
          { props: ['getChannelId'] },
        ]
      },
      PermissionStore: {
        storeName: 'PermissionStore',
        keys: [
          ['can', 'canAccessGuildSettings', 'getGuildPermissions'],
          ['can', 'canManageUser'],
          ['can', 'getGuildPermissions'],
        ],
        patterns: [
          // Pattern strict: méthodes Discord-specific ensemble
          { props: ['can', 'getGuildPermissions', 'getHighestRole'] },
          { props: ['can', 'canAccessGuildSettings', 'getGuildPermissions'] },
          { props: ['can', 'canManageUser', 'getGuildPermissions'] },
          // Fallback avec validation
          {
            filter: (m) => {
              // Exiger 'can' + au moins une autre méthode permission
              if (typeof m.can !== 'function') return false;
              const hasOtherPermMethod = (
                typeof m.getGuildPermissions === 'function' ||
                typeof m.canAccessGuildSettings === 'function' ||
                typeof m.canManageUser === 'function'
              );
              return hasOtherPermMethod;
            }
          },
        ]
      },
      FileUploader: {
        storeName: null,
        keys: [
          ['upload', 'uploadFiles', 'cancel', 'instantBatchUpload'],
          ['upload', 'uploadFiles', 'cancel'],
          ['instantBatchUpload', 'upload'],
        ],
        patterns: [
          // Pattern strict: uploader complet avec cancel
          { props: ['upload', 'uploadFiles', 'cancel', 'instantBatchUpload'] },
          { props: ['upload', 'uploadFiles', 'cancel'] },
          { props: ['instantBatchUpload', 'upload', 'cancel'] },
          // Fallback: au moins 2 méthodes upload
          { props: ['upload', 'uploadFiles'] },
          { props: ['instantBatchUpload', 'upload'] },
          // Dernier recours avec validation
          {
            filter: (m) => {
              if (typeof m.upload !== 'function') return false;
              // Exiger au moins une autre méthode d'upload
              const hasOtherUploadMethod = (
                typeof m.uploadFiles === 'function' ||
                typeof m.instantBatchUpload === 'function' ||
                typeof m.cancel === 'function'
              );
              return hasOtherUploadMethod;
            }
          },
        ]
      },
      CloudUploader: {
        storeName: null,
        keys: [
          ['uploadFiles', 'cancel'],
          ['uploadFiles'],
        ],
        patterns: [
          { props: ['uploadFiles', 'cancel'] },
          { props: ['uploadFiles'] },
        ]
      }
    };

    // Debug: Accéder directement au cache webpack et chercher les modules Discord
    const webpackCache = Discord.window.webpackChunkdiscord_app?.push([[Symbol()], {}, (req) => req.c]);

    const discoveredModules = { message: [], user: [], channel: [], dispatcher: [], upload: [] };

    if (webpackCache) {
      const cacheKeys = Object.keys(webpackCache);

      let analyzed = 0;
      for (const key of cacheKeys) {
        const mod = webpackCache[key];
        if (mod && mod.exports) {
          const exp = mod.exports;

          // Regarder dans l'export principal et les sous-propriétés
          const checkExport = (obj, path = '') => {
            if (!obj || typeof obj !== 'object') return;

            try {
              const keys = Object.keys(obj);

              // Chercher des fonctions de message
              const messageFuncs = keys.filter(k => {
                try {
                  const val = obj[k];
                  return typeof val === 'function' && (
                    k === 'sendMessage' || k === 'editMessage' || k === 'deleteMessage' ||
                    k === 'createMessage' || k === 'receiveMessage'
                  );
                } catch (e) {
                  return false;
                }
              });
              if (messageFuncs.length > 0) {
                discoveredModules.message.push({ id: key, path, funcs: messageFuncs, keys: keys.slice(0, 20), obj });
              }

              // Chercher des fonctions user
              const userFuncs = keys.filter(k => {
                try {
                  const val = obj[k];
                  return typeof val === 'function' && (
                    k === 'getUser' || k === 'getUsers' || k === 'getCurrentUser' || k === 'findByTag'
                  );
                } catch (e) {
                  return false;
                }
              });
              if (userFuncs.length > 0) {
                discoveredModules.user.push({ id: key, path, funcs: userFuncs, keys: keys.slice(0, 20), obj });
              }

              // Chercher des fonctions channel
              const channelFuncs = keys.filter(k => {
                try {
                  const val = obj[k];
                  return typeof val === 'function' && (
                    k === 'getChannel' || k === 'getDMFromUserId' || k === 'getChannelId'
                  );
                } catch (e) {
                  return false;
                }
              });
              if (channelFuncs.length > 0) {
                discoveredModules.channel.push({ id: key, path, funcs: channelFuncs, keys: keys.slice(0, 20), obj });
              }

              // Chercher dispatcher
              if (keys.includes('dispatch') && typeof obj.dispatch === 'function') {
                discoveredModules.dispatcher.push({ id: key, path, keys: keys.slice(0, 20), obj });
              }

              // Chercher upload
              const uploadFuncs = keys.filter(k => {
                try {
                  const val = obj[k];
                  return typeof val === 'function' && (
                    k === 'upload' || k === 'instantBatchUpload' || k === 'uploadFiles'
                  );
                } catch (e) {
                  return false;
                }
              });
              if (uploadFuncs.length > 0) {
                discoveredModules.upload.push({ id: key, path, funcs: uploadFuncs, keys: keys.slice(0, 20), obj });
              }
            } catch (e) {
              // Ignorer les erreurs liées aux objets Proxy ou objets natifs
              return;
            }
          };

          try {
            checkExport(exp, '');

            // Aussi vérifier les sous-exports (exp.Z, exp.default, etc.)
            if (exp.Z) checkExport(exp.Z, '.Z');
            if (exp.ZP) checkExport(exp.ZP, '.ZP');
            if (exp.default) checkExport(exp.default, '.default');
          } catch (e) {
            // Ignorer les erreurs pour ce module spécifique
          }

          analyzed++;
        }

        // Limit pour performance
        if (analyzed > CONFIG.limits.maxModuleSearchIterations && Object.values(discoveredModules).some(arr => arr.length > 0)) break;
      }
    }

    // Debug: Chercher les nouveaux modules Discord (ActionCreators, Stores, etc.)
    const discordModules = [];
    let moduleCount = 0;

    findModule((module) => {
      moduleCount++;
      if (typeof module === 'object' && module !== null) {
        try {
          const moduleKeys = Object.keys(module);

          // Chercher des fonctions qui semblent liées aux messages
          const messageFuncs = moduleKeys.filter(key => {
            try {
              const keyLower = key.toLowerCase();
              return (keyLower.includes('sendmessage') ||
                keyLower.includes('editmessage') ||
                keyLower.includes('deletemessage') ||
                (keyLower.includes('send') && keyLower.includes('message')) ||
                (keyLower.includes('create') && keyLower.includes('message')));
            } catch (e) {
              return false;
            }
          });

          if (messageFuncs.length > 0) {
            discordModules.push({
              category: 'Messages',
              funcs: messageFuncs,
              allKeys: moduleKeys,
              sample: module
            });
          }

          // Chercher UserStore, ChannelStore, etc.
          const storeFuncs = moduleKeys.filter(key => {
            try {
              const keyLower = key.toLowerCase();
              return (keyLower.includes('getuser') ||
                keyLower.includes('getchannel') ||
                keyLower.includes('currentuser'));
            } catch (e) {
              return false;
            }
          });

          if (storeFuncs.length > 0) {
            discordModules.push({
              category: 'Stores',
              funcs: storeFuncs,
              allKeys: moduleKeys,
              sample: module
            });
          }

          // Chercher upload
          const uploadFuncs = moduleKeys.filter(key => {
            try {
              const keyLower = key.toLowerCase();
              return keyLower.includes('upload') && !keyLower.includes('__wbg');
            } catch (e) {
              return false;
            }
          });

          if (uploadFuncs.length > 0) {
            discordModules.push({
              category: 'Upload',
              funcs: uploadFuncs,
              allKeys: moduleKeys,
              sample: module
            });
          }
        } catch (e) {
          // Ignorer les erreurs liées aux objets Proxy ou objets natifs
        }
      }
      return false;
    });

    // ========================================================================
    // UNIFIED MODULE DISCOVERY - Using declarative MODULE_CONFIG
    // ========================================================================

    // Find all required Discord modules using the unified finder
    for (const [moduleName, config] of Object.entries(MODULE_CONFIG)) {
      const match = moduleFinder.findWithFallbacks({
        ...config,
        findModuleRobust,
        useBdApi
      });

      if (match && match.module) {
        if (moduleName === 'MessageQueue') {
          console.log('[SDC] MessageQueue trouvé via:', match.pattern);
          console.log('[SDC] MessageQueue module:', match.module);
          console.log('[SDC] MessageQueue keys:', Object.keys(match.module).slice(0, 20));
          deepLogModule(match.module, 'MessageQueue');
        }
        // Validation du module trouvé
        const validation = Utils.validateModule(match.module, moduleName, []);

        if (moduleName === 'MessageQueue') {
          console.log('[SDC] MessageQueue validation:', validation);
          console.log('[SDC] MessageQueue valid:', validation.valid);
          console.log('[SDC] MessageQueue reason:', validation.reason);
          console.log('[SDC] MessageQueue foundMethods:', validation.foundMethods.slice(0, 10));
        }

        if (moduleName === 'MessageDispatcher') {
          console.log('[SDC] MessageDispatcher trouvé:', match.module);
          console.log('[SDC] Type:', validation.moduleType);
          console.log('[SDC] Méthodes:', validation.foundMethods.join(', '));
          console.log('[SDC] Validation:', validation.valid ? '✅ VALIDE' : '❌ INVALIDE - ' + validation.reason);

          if (!validation.valid) {
            console.error('[SDC] ⚠️ ATTENTION: Module trouvé mais validation échouée!');
            console.error('[SDC] Raison:', validation.reason);
            console.error('[SDC] Le module sera REJETÉ pour éviter "dispatch is not a function"');
          }
        }

        // Rejeter le module si validation échoue
        if (validation.valid) {
          modules[moduleName] = match.module;
          Utils.Debug(`Module ${moduleName} found and validated`, {
            type: validation.moduleType,
            methods: validation.foundMethods,
          });
        } else {
          Utils.Debug(`Module ${moduleName} found but REJECTED`, {
            type: validation.moduleType,
            reason: validation.reason,
            methods: validation.foundMethods
          });
        }
      } else {
        if (moduleName === 'MessageDispatcher') {
          console.warn('[SDC] MessageDispatcher NON trouvé!');
        }
        Utils.Debug(`Module ${moduleName} NOT found`);
      }
    }

    // Log discovery results
    const foundModules = Object.keys(MODULE_CONFIG).filter(name => modules[name] != null);
    const foundCount = foundModules.length;
    const totalCount = Object.keys(MODULE_CONFIG).length;

    if (foundCount < totalCount) {
      Utils.Log(`Module discovery: ${foundCount}/${totalCount} found`);
      const missing = Object.keys(MODULE_CONFIG).filter(name => modules[name] == null);
      Utils.Warn(`Missing modules: ${missing.join(', ')}`);
    }

    // Message d'aide debug
    if (Utils.debugMode) {
      console.log('%c[SDC] Mode DEBUG actif', 'color:#00ff00;font-weight:bold;font-size:14px');
      console.log('%cCommandes disponibles:', 'color:#00ff00;font-weight:bold');
      console.log('  window.SDC_DEBUG = false  - Désactiver le mode debug');
      console.log('  Utils.Webpack().validateModule(module, "ModuleName")  - Valider un module');
      console.log('  Discord  - Accéder aux modules Discord chargés');
    } else {
      console.log('%c[SDC] Pour activer le mode debug: window.SDC_DEBUG = true puis rechargez (Ctrl+R)', 'color:#888');
    }

    // Legacy variable names for backward compatibility
    let messageQueueMatch = modules.MessageQueue ? { module: modules.MessageQueue } : null;
    let dispatcherMatch = modules.MessageDispatcher ? { module: modules.MessageDispatcher } : null;
    let userCacheMatch = modules.UserCache ? { module: modules.UserCache } : null;
    let channelCacheMatch = modules.ChannelCache ? { module: modules.ChannelCache } : null;
    let selectedChannelMatch = modules.SelectedChannelStore ? { module: modules.SelectedChannelStore } : null;
    let guildCacheMatch = modules.GuildCache ? { module: modules.GuildCache } : null;
    let fileUploaderMatch = modules.FileUploader ? { module: modules.FileUploader } : null;
    let cloudUploadHelperMatch = modules.CloudUploadHelper ? { module: modules.CloudUploadHelper } : null;
    let relationshipMatch = modules.RelationshipStore ? { module: modules.RelationshipStore } : null;
    let privateChannelMatch = modules.PrivateChannelManager ? { module: modules.PrivateChannelManager } : null;
    let premiumMatch = modules.Premium ? { module: modules.Premium } : null;
    let messageCacheMatch = modules.MessageStore ? { module: modules.MessageStore } : null;

    // ========================================================================
    // SPECIAL MODULE FINDING - Complex modules requiring custom logic
    // ========================================================================

    // CloudUploadPrototype - requires prototype or direct object handling
    let cloudUploadProtoMatch = null;
    if (useBdApi) {
      const uploaderModule = BdApi.Webpack.getModule(
        (m) => m && typeof m === 'object' && (
          typeof m.upload === 'function' ||
          typeof m.uploadFileToCloud === 'function'
        ),
        { first: true, searchExports: true }
      );
      if (uploaderModule) cloudUploadProtoMatch = uploaderModule;
    }
    if (!cloudUploadProtoMatch) {
      cloudUploadProtoMatch = findModule(
        (x) => x.prototype?.uploadFileToCloud && x.prototype.upload
      );
    }
    if (cloudUploadProtoMatch) {
      modules.CloudUploadPrototype = cloudUploadProtoMatch.prototype || cloudUploadProtoMatch;
      deepLogModule(modules.CloudUploadPrototype, 'CloudUploadPrototype');
    }

    // PermissionEvaluator - requires complex bigint filtering logic
    let permissionEvaluatorCan;
    modules.PermissionEvaluator = findModule((x) => {
      const getters = Object.values(Object.getOwnPropertyDescriptors(x)).map(x => x.get);
      if (getters.includes(undefined)) return false;
      let properties;
      try {
        properties = getters.map(x => x());
      } catch {
        return false;
      }
      const bigints = properties.filter(x => typeof x === 'bigint');
      if (bigints.length < 3) return false;
      const knownPermissionsMask = 0x7ffffffffffffn;
      const defaultPermissions = 1720707884502593n;
      const managementPermissions = 8798106288300n;
      if (
        !bigints.includes(0n) ||
        !bigints.some(x => (x & knownPermissionsMask) === defaultPermissions) ||
        !bigints.some(x => (x & knownPermissionsMask) === managementPermissions)
      ) {
        return false;
      }
      const canFunctionRegex =
        /^function \w+\(\w+\)\s*{\s*let\s*{\s*permission:\s*\w+,\s*user:\s*\w+,\s*context:/s;
      const functionToString = Function.prototype.toString;
      permissionEvaluatorCan = properties.find(
        x => typeof x === 'function' && canFunctionRegex.test(functionToString.apply(x))
      );
      return permissionEvaluatorCan != null;
    });

    // ========================================================================
    // MODULE VALIDATION & STATISTICS
    // ========================================================================

    const moduleNames = ['MessageQueue', 'MessageDispatcher', 'UserCache', 'ChannelCache',
      'SelectedChannelStore', 'GuildCache', 'FileUploader', 'CloudUploadPrototype',
      'CloudUploadHelper', 'PermissionEvaluator', 'RelationshipStore',
      'PrivateChannelManager', 'Premium', 'MessageCache'];

    const modulesFoundCount = moduleNames.filter(name => modules[name] != null).length;

    Discord.modules = modules;

    let nodeHttps;
    let nodeHttpsOptions;
    if (typeof require !== 'undefined') {
      nodeHttps = require('https');
      nodeHttpsOptions = {
        agent: nodeHttps.Agent && new nodeHttps.Agent({ keepAlive: true }),
        timeout: 120000,
      };
    }

    Object.assign(Utils, {
      StorageSave:
        typeof GM_getValue !== 'undefined' && typeof GM_setValue !== 'undefined'
          ? (key, value) =>
            new Promise((resolve) => {
              resolve(GM_setValue(key, JSON.stringify(value)));
            })
          : typeof chrome !== 'undefined' && chrome.storage != null
            ? (key, value) =>
              new Promise((resolve) => {
                chrome.storage.sync.set({ key: value }, resolve);
              })
            : (key, value) =>
              new Promise((resolve) => {
                resolve(SavedLocalStorage.setItem(key, JSON.stringify(value)));
              }),
      StorageLoad:
        typeof GM_getValue !== 'undefined' && typeof GM_setValue !== 'undefined'
          ? (key) =>
            new Promise((resolve) => {
              let jsonValue = GM_getValue(key);
              if (jsonValue == null) resolve(null);
              resolve(JSON.parse(jsonValue));
            })
          : typeof chrome !== 'undefined' && chrome.storage != null
            ? (key) =>
              new Promise((resolve) => {
                chrome.storage.sync.get(key, (result) => resolve(result[key]));
              })
            : (key) =>
              new Promise((resolve) => {
                let jsonValue = SavedLocalStorage.getItem(key);
                if (jsonValue == null) resolve(null);
                resolve(JSON.parse(jsonValue));
              }),

      Sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
      ReadFile: (file) =>
        new Promise((resolve, reject) => {
          let fileReader = new FileReader();
          fileReader.onload = () => resolve(fileReader.result);
          fileReader.onerror = () => reject(fileReader.error);
          fileReader.readAsArrayBuffer(file);
        }),
      DownloadFile:
        typeof GM_xmlhttpRequest !== 'undefined'
          ? (url) =>
            new Promise((resolve, reject) => {
              GM_xmlhttpRequest({
                method: 'GET',
                url,
                responseType: 'arraybuffer',
                onload: (result) => resolve(result.response),
                onerror: reject,
              });
            })
          : nodeHttps != null
            ? function (url) {
              return new Promise((resolve, reject) => {
                const request = nodeHttps.get(
                  url,
                  nodeHttpsOptions,
                  (response) => {
                    let data = [];
                    response.on('data', (chunk) => data.push(chunk));
                    response.on('end', () => resolve(this.ConcatBuffers(data)));
                    response.on('aborted', reject);
                  }
                );
                request.on('error', reject);
                request.on('timeout', function () {
                  this.abort();
                });
              });
            }
            : (url) =>
              new Promise((resolve, reject) => {
                let xhr = new XMLHttpRequest();
                xhr.responseType = 'arraybuffer';
                xhr.onload = () => resolve(xhr.response);
                xhr.onerror = reject;
                xhr.open('GET', url);
                xhr.withCredentials = true;
                xhr.send();
              }),

      DownloadBlob: (filename, blob) => {
        let url = URL.createObjectURL(blob);
        let a = document.createElement('a');
        a.href = url;
        a.download = filename;
        a.style = 'display:none';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);

        // Chromium can start the actual download asynchronously. Revoking the
        // object URL immediately can therefore produce an empty/unreadable file
        // on some Discord/Electron builds.
        setTimeout(() => {
          try { URL.revokeObjectURL(url); } catch (_) {}
        }, 30000);
      },

      TryCompress: (buffer) => cryptoService.tryCompress(buffer),
      TryDecompress: async (buffer) => await cryptoService.tryDecompress(buffer),

      GetNonce:
        window.BigInt != null
          ? () =>
            (
              BigInt(Date.now() - 14200704e5 /*DISCORD_EPOCH*/) << BigInt(22)
            ).toString()
          : () => Date.now().toString(),

      FormatTime: (timestamp) => {
        if (!timestamp || isNaN(timestamp)) return 'Never';
        let timezoneOffset = new Date().getTimezoneOffset() * 60000;
        let dateNow = new Date(Date.now() - timezoneOffset)
          .toISOString()
          .slice(0, 10);
        let datetime = new Date(timestamp - timezoneOffset).toISOString();
        let date = datetime.slice(0, 10);
        let time = datetime.slice(11, 16);
        return `${date === dateNow ? 'Today at' : date} ${time}`;
      },

      Intersect: (a, b) => {
        let ai = 0,
          bi = 0;
        let alen = a.length,
          blen = b.length;
        let result = [];
        while (ai < alen && bi < blen) {
          if (a[ai] < b[bi]) ai++;
          else if (a[ai] > b[bi]) bi++;
          else {
            result.push(a[ai]);
            ai++;
            bi++;
          }
        }
        return result;
      },

      Sha256: async (buffer) => await cryptoService.sha256(buffer),
      Sha512: async (buffer) => await cryptoService.sha512(buffer),
      Sha512_128: async (buffer) => await cryptoService.sha512_128(buffer),
      Sha512_128str: async (string) => await cryptoService.sha512_128str(string),
      Sha512_256: async (buffer) => await cryptoService.sha512_256(buffer),
      Sha512_256str: async (string) => await cryptoService.sha512_256str(string),

      AesImportKey: async (buffer) => await cryptoService.aesImportKey(buffer),
      AesEncrypt: async (key, buffer, purpose) => await cryptoService.aesEncrypt(key, buffer, purpose),
      AesEncryptLegacy: async (key, buffer) => await cryptoService.aesEncryptLegacy(key, buffer),
      AesDecrypt: async (key, buffer, purpose) => await cryptoService.aesDecrypt(key, buffer, purpose),
      AesEncryptString: async (key, string, purpose) => await cryptoService.aesEncryptString(key, string, purpose),
      AesDecryptString: async (key, buffer, purpose) => await cryptoService.aesDecryptString(key, buffer, purpose),
      AesEncryptCompressString: async (key, string) => await cryptoService.aesEncryptCompressString(key, string),
      AesEncryptCompressStringLegacy: async (key, string) => await cryptoService.aesEncryptCompressStringLegacy(key, string),
      AesDecryptDecompressString: async (key, string) => await cryptoService.aesDecryptDecompressString(key, string),

      DhGenerateKeys: async () => await cryptoService.dhGenerateKeys(),
      DhImportPublicKey: async (buffer) => await cryptoService.dhImportPublicKey(buffer),
      DhImportPrivateKey: async (buffer) => await cryptoService.dhImportPrivateKey(buffer),
      DhImportPrivateKeyFallback: async (buffer) => await cryptoService.dhImportPrivateKeyFallback(buffer),
      DhExportPublicKey: async (key) => await cryptoService.dhExportPublicKey(key),
      DhExportPrivateKey: async (key) => await cryptoService.dhExportPrivateKey(key),
      DhExportPrivateKeyFallback: async (key) => await cryptoService.dhExportPrivateKeyFallback(key),
      DhGetSecret: async (privateKey, publicKey) => await cryptoService.dhGetSecret(privateKey, publicKey),
      DhGetSecretFull: async (privateKey, publicKey) => await cryptoService.dhGetSecretFull(privateKey, publicKey),
      HkdfSha256: async (ikm, salt, info, length) => await cryptoService.hkdfSha256(ikm, salt, info, length),
      Pbkdf2Sha256: async (password, salt, iterations, length) => await cryptoService.pbkdf2Sha256(password, salt, iterations, length),
      IdentityGenerateKeys: async () => await cryptoService.identityGenerateKeys(),
      IdentityImportPublicKey: async (buffer) => await cryptoService.identityImportPublicKey(buffer),
      IdentityImportPrivateKey: async (buffer) => await cryptoService.identityImportPrivateKey(buffer),
      IdentityExportPublicKey: async (key) => await cryptoService.identityExportPublicKey(key),
      IdentityExportPrivateKey: async (key) => await cryptoService.identityExportPrivateKey(key),
      IdentitySign: async (key, data) => await cryptoService.identitySign(key, data),
      IdentityVerify: async (key, signature, data) => await cryptoService.identityVerify(key, signature, data),
      CryptoV2SelfTest: async () => await runCryptoV2SelfTest(),

      StringToUtf8Bytes: (string) => cryptoService.stringToUtf8Bytes(string),
      StringToAsciiBytes: (string) => cryptoService.stringToAsciiBytes(string),
      StringToUtf16Shorts: (string) => cryptoService.stringToUtf16Shorts(string),
      StringToUtf16Bytes: (string) => cryptoService.stringToUtf16Bytes(string),
      AsciiBytesToString: (buffer) => cryptoService.asciiBytesToString(buffer),
      Utf16ShortsToString: (buffer) => cryptoService.utf16ShortsToString(buffer),
      Utf8BytesToString: (buffer) => cryptoService.utf8BytesToString(buffer),

      BytesToBase64: (buffer) => cryptoService.bytesToBase64(buffer),
      Base64ToBytes: (string) => cryptoService.base64ToBytes(string),
      BytesToBase64url: (buffer) => cryptoService.bytesToBase64url(buffer),
      Base64urlToBytes: (string) => cryptoService.base64urlToBytes(string),

      GetRandomBytes: (n) => cryptoService.getRandomBytes(n),
      GetRandomUints: (n) => cryptoService.getRandomUints(n),
      ConcatBuffers: (buffers) => cryptoService.concatBuffers(buffers),

      PayloadEncode: (buffer) => cryptoService.payloadEncode(buffer),
      PayloadDecode: (string) => cryptoService.payloadDecode(string),

      AttachEventToClass: (rootElement, className, eventName, callback) => {
        for (let element of rootElement.getElementsByClassName(className))
          element.addEventListener(eventName, callback);
      },

      trimKeyCache: () => dbManager.trimKeyCache(),
      GetKeyByHash: async (hashBase64, out) => await dbManager.getKeyByHash(hashBase64, out),
      GetKeyBytesByHash: async (hashBase64) => await dbManager.getKeyBytesByHash(hashBase64),
      SaveKey: async (keyBytes, type, descriptor, hidden) => await dbManager.saveKey(keyBytes, type, descriptor, hidden),

      // Proxy dbChanged to dbManager
      get dbChanged() { return dbManager.dbChanged; },
      set dbChanged(value) { dbManager.dbChanged = value; },

      LoadDb: function (callback, failCallback, reload) {
        (async () => {
          const selfTest = await this.CryptoV2SelfTest();
          if (!reload) DataBase = await this.StorageLoad('SimpleDiscordCrypt');
          if (DataBase != null) {
            Cache = { keys: {} };

            const finishLoad = async () => {
              if (selfTest.ok) await ensureIdentityKeys();
              if (callback) callback();
            };

            if (DataBase.isEncrypted) {
              const newdbCallback = () => {
                this.NewDb(callback);
              };
              const passwordCallback = async (password) => {
                try {
                  if (DataBase.dbCryptoVersion === SDC_DB_CRYPTO_VERSION) {
                    if (!selfTest.ok)
                      throw new Error(
                        'Crypto v2 is unavailable; this database requires AES-GCM/PBKDF2 support.'
                      );

                    const dbKey = await deriveDbKeyV2(
                      password,
                      DataBase.dbKdfSalt,
                      DataBase.dbKdfIterations
                    );
                    if (!(await verifyDbKeyV2(dbKey, DataBase.dbCheck))) {
                      UnlockWindow.Show(passwordCallback, newdbCallback);
                      return;
                    }
                    Cache.dbKey = dbKey;
                    await finishLoad();
                    return;
                  }

                  // Legacy password verification remains read-only and is used
                  // once to atomically migrate the database to PBKDF2 + GCM.
                  const legacyHash = this.BytesToBase64(
                    await this.Sha512_128str(
                      password + DataBase.dbPasswordSalt
                    )
                  );
                  if (legacyHash !== DataBase.dbPasswordHash) {
                    UnlockWindow.Show(passwordCallback, newdbCallback);
                    return;
                  }

                  const legacyDbKey = await this.AesImportKey(
                    await this.Sha512_256str(
                      password + DataBase.dbKeySalt
                    )
                  );

                  if (!selfTest.ok) {
                    Cache.dbKey = legacyDbKey;
                    console.warn('[SDC][CRYPTO] Legacy database unlocked without v2 migration because self-test failed');
                  } else {
                    await migrateLegacyDatabaseCryptoV2(
                      password,
                      legacyDbKey
                    );
                  }
                  await finishLoad();
                } catch (error) {
                  console.error('[SDC][CRYPTO] database unlock/migration failed', error);
                  UnlockWindow.Show(passwordCallback, newdbCallback);
                }
              };

              UnlockWindow.Show(passwordCallback, newdbCallback, failCallback);
            } else {
              if (selfTest.ok && DataBase.dbCryptoVersion == null) {
                DataBase.dbCryptoVersion = SDC_DB_CRYPTO_VERSION;
                this.dbChanged = true;
              }
              await finishLoad();
            }
          } else {
            this.NewDb(callback, failCallback);
          }
        })();
      },
      SaveDb: async () => await dbManager.saveDb(),
      saveDbTimeout: null,
      FastSaveDb: () => dbManager.fastSaveDb(),

      DownloadDb: async function (uncompressed) {
        let buffer = this.StringToUtf8Bytes(JSON.stringify(DataBase)).buffer;
        if (!uncompressed) buffer = await this.TryCompress(buffer);
        this.DownloadBlob(
          uncompressed ? 'SimpleDiscordCrypt.json' : 'SimpleDiscordCrypt.dat',
          new Blob([buffer])
        );
      },
      fileInput: (() => {
        //need reference to keep gc away (bug?)
        let fileInput = document.createElement('input');
        fileInput.type = 'file';
        return fileInput;
      })(),
      ImportDb: function (callback, secondary) {
        this.fileInput.accept = '.json,.dat';
        this.fileInput.click();
        this.fileInput.onchange = async () => {
          let buffer = await this.ReadFile(this.fileInput.files[0]);
          DataBase = JSON.parse(
            this.Utf8BytesToString(await this.TryDecompress(buffer))
          );
          if (secondary) DataBase.isSecondary = true;
          else delete DataBase.isSecondary;
          this.FastSaveDb();
          this.LoadDb(callback, null, true);
        };
      },

      NewDb: function (callback, cancelCallback) {
        NewdbWindow.Show(
          async (password) => {
            DataBase = {
              isEncrypted: password !== '',
              keys: {},
              channels: {},
              autoKeyExchange: 'DM+friends',
            };
            Cache = { keys: {} };
            DataBase.dbCryptoVersion = SDC_DB_CRYPTO_VERSION;
            if (DataBase.isEncrypted) {
              const salt = this.GetRandomBytes(16);
              DataBase.dbKdf = 'PBKDF2-HMAC-SHA-256';
              DataBase.dbKdfSalt = this.BytesToBase64(salt);
              DataBase.dbKdfIterations = SDC_DB_KDF_ITERATIONS;
              Cache.dbKey = await deriveDbKeyV2(
                password,
                DataBase.dbKdfSalt,
                DataBase.dbKdfIterations
              );
              DataBase.dbCheck = await makeDbCheckV2(Cache.dbKey);
            }

            await this.NewPersonalKey();
            await this.NewDhKeys();
            await ensureIdentityKeys();
            this.FastSaveDb();
            if (callback) callback();
          },
          () => {
            this.ImportDb(() => {
              NewdbWindow.Remove();
              if (callback) callback();
            });
          },
          () => {
            this.ImportDb(() => {
              NewdbWindow.Remove();
              if (callback) callback();
            }, true);
          },
          cancelCallback
        );
      },
      NewDbPassword: function (callback) {
        NewPasswordWindow.Show(async (password) => {
          try {
            const newDataBase = Object.assign({}, DataBase);
            const oldDbKey = Cache.dbKey;

            const clearKeys = {};
            for (const [keyHash, oldKey] of Object.entries(DataBase.keys || {})) {
              let keyBytes = this.Base64ToBytes(oldKey.k);
              if (DataBase.isEncrypted) {
                keyBytes = await this.AesDecrypt(
                  oldDbKey,
                  keyBytes,
                  'db-key'
                );
              }
              clearKeys[keyHash] = keyBytes;
            }

            let dhKeyBytes = this.Base64ToBytes(DataBase.dhPrivateKey);
            if (DataBase.isEncrypted) {
              dhKeyBytes = await this.AesDecrypt(
                oldDbKey,
                dhKeyBytes,
                'db-dh'
              );
            }

            let identityKeyBytes = DataBase.identityPrivateKey
              ? this.Base64ToBytes(DataBase.identityPrivateKey)
              : null;
            if (identityKeyBytes && DataBase.isEncrypted) {
              identityKeyBytes = await this.AesDecrypt(
                oldDbKey,
                identityKeyBytes,
                'db-identity'
              );
            }

            const enableProtection = password !== '';
            newDataBase.isEncrypted = enableProtection;
            newDataBase.dbCryptoVersion = SDC_DB_CRYPTO_VERSION;

            let newDbKey = null;
            if (enableProtection) {
              const salt = this.GetRandomBytes(16);
              newDataBase.dbKdf = 'PBKDF2-HMAC-SHA-256';
              newDataBase.dbKdfSalt = this.BytesToBase64(salt);
              newDataBase.dbKdfIterations = SDC_DB_KDF_ITERATIONS;
              newDbKey = await deriveDbKeyV2(
                password,
                newDataBase.dbKdfSalt,
                newDataBase.dbKdfIterations
              );
              newDataBase.dbCheck = await makeDbCheckV2(newDbKey);
            } else {
              delete newDataBase.dbKdf;
              delete newDataBase.dbKdfSalt;
              delete newDataBase.dbKdfIterations;
              delete newDataBase.dbCheck;
            }
            delete newDataBase.dbPasswordSalt;
            delete newDataBase.dbKeySalt;
            delete newDataBase.dbPasswordHash;

            const keys = {};
            for (const [keyHash, oldKey] of Object.entries(DataBase.keys || {})) {
              const newKey = Object.assign({}, oldKey);
              let keyBytes = clearKeys[keyHash];
              if (enableProtection) {
                keyBytes = await this.AesEncrypt(
                  newDbKey,
                  keyBytes,
                  'db-key'
                );
              }
              newKey.k = this.BytesToBase64(keyBytes);
              keys[keyHash] = newKey;
            }
            newDataBase.keys = keys;

            if (enableProtection) {
              dhKeyBytes = await this.AesEncrypt(
                newDbKey,
                dhKeyBytes,
                'db-dh'
              );
              if (identityKeyBytes) {
                identityKeyBytes = await this.AesEncrypt(
                  newDbKey,
                  identityKeyBytes,
                  'db-identity'
                );
              }
            }
            newDataBase.dhPrivateKey = this.BytesToBase64(dhKeyBytes);
            if (identityKeyBytes)
              newDataBase.identityPrivateKey = this.BytesToBase64(
                identityKeyBytes
              );

            DataBase = newDataBase;
            Cache.dbKey = newDbKey;
            this.FastSaveDb();
            if (callback) callback();
          } catch (error) {
            console.error('[SDC][CRYPTO] password change failed; database left untouched', error);
            Utils.Error('Unable to change database password safely.');
          }
        });
      },
      NewDhKeys: async function () {
        let dhKeys = await this.DhGenerateKeys();
        let dhPrivateKeyBytes;
        let dhPrivateKeyFallback = false;
        try {
          dhPrivateKeyBytes = await this.DhExportPrivateKey(dhKeys.privateKey);
        } catch (e) {
          dhPrivateKeyBytes = await this.DhExportPrivateKeyFallback(
            dhKeys.privateKey
          );
          dhPrivateKeyFallback = true;
        }

        let dhPublicKeyBytes = await this.DhExportPublicKey(dhKeys.publicKey);

        if (DataBase.isEncrypted)
          dhPrivateKeyBytes = await this.AesEncrypt(
            Cache.dbKey,
            dhPrivateKeyBytes,
            'db-dh'
          );

        if (dhPrivateKeyFallback) DataBase.dhPrivateKeyFallback = true;
        else delete DataBase.dhPrivateKeyFallback;
        DataBase.dhPrivateKey = this.BytesToBase64(dhPrivateKeyBytes);
        DataBase.dhPublicKey = this.BytesToBase64(dhPublicKeyBytes);
        this.FastSaveDb();
      },
      ReadDhKey: async function () {
        let dhPrivateKeyBytes = this.Base64ToBytes(DataBase.dhPrivateKey);
        if (DataBase.isEncrypted)
          dhPrivateKeyBytes = await this.AesDecrypt(
            Cache.dbKey,
            dhPrivateKeyBytes,
            'db-dh'
          );

        if (DataBase.dhPrivateKeyFallback) {
          let dhPrivateKey = await this.DhImportPrivateKeyFallback(
            dhPrivateKeyBytes
          );
          try {
            dhPrivateKeyBytes = await this.DhExportPrivateKey(dhPrivateKey);
            if (DataBase.isEncrypted)
              dhPrivateKeyBytes = await this.AesEncrypt(
                Cache.dbKey,
                dhPrivateKeyBytes,
                'db-dh'
              );

            delete DataBase.dhPrivateKeyFallback;
            DataBase.dhPrivateKey = this.BytesToBase64(dhPrivateKeyBytes);
          } catch (e) { }

          return dhPrivateKey;
        } else return await this.DhImportPrivateKey(dhPrivateKeyBytes);
      },
      ChangeKeyDescriptor: (hash, descriptor) => dbManager.changeKeyDescriptor(hash, descriptor),
      ChangeKeyHidden: (hash, hidden) => dbManager.changeKeyHidden(hash, hidden),
      DeleteKey: async (hash) => await dbManager.deleteKey(hash),
      ReplaceChannelKeys: (oldHash, newHash) => dbManager.replaceChannelKeys(oldHash, newHash),
      NewPersonalKey: async () => await dbManager.newPersonalKey(),
      ToggleKeyTrusted: (hash) => dbManager.toggleKeyTrusted(hash),

      FormatDescriptor: (descriptor) => dbManager.formatDescriptor(descriptor),

      GetChannelConfig: (channelId) => dbManager.getChannelConfig(channelId),
      GetOrCreateChannelConfig: (channelId) => dbManager.getOrCreateChannelConfig(channelId),
      NewChannelConfig: (channelId, keyHash, descriptor, encrypt) => dbManager.newChannelConfig(channelId, keyHash, descriptor, encrypt),
      DeleteChannelConfig: (channelId) => dbManager.deleteChannelConfig(channelId),
      GetCurrentChannelKeyHash: () => {
        return Cache.channelConfig != null
          ? Cache.channelConfig.k
          : DataBase.personalKeyHash;
      },
      GetCurrentChannelEncrypt: () => {
        return (
          Cache.channelConfig != null &&
          Cache.channelConfig.e &&
          Cache.channelBlacklist !== 1
        );
      },
      ToggleCurrentChannelEncrypt: function () {
        if (Cache.channelBlacklist === 1) return;

        if (Cache.channelConfig == null)
          Cache.channelConfig = this.NewChannelConfig(
            Cache.channelId,
            null,
            null,
            true
          );
        else {
          Cache.channelConfig.e = Cache.channelConfig.e ? 0 : 1;
          this.dbChanged = true;
        }

        this.ClearCurrentChannelAttachments();
      },
      SetCurrentChannelKey: async function (hash) {
        if (Cache.channelConfig == null)
          Cache.channelConfig = this.NewChannelConfig(
            Cache.channelId,
            hash,
            null,
            false
          );
        else {
          let oldKeyHash = Cache.channelConfig.k;
          if (hash === oldKeyHash) return;
          if (DataBase.keys[oldKeyHash].t /*type*/ === 2 /*conversation*/) {
            if (
              await PopupManager.NewPromise(
                `The plugin prevented you from switching key in a secured DM, hit cancel if you want to do it anyway`,
                true
              )
            )
              return;
          }
          Cache.channelConfig.k = hash;
          this.dbChanged = true;
        }

        this.ClearCurrentChannelAttachments();
      },
      SetChannelKey: function (channelId, hash) {
        let channelConfig = this.GetOrCreateChannelConfig(channelId);
        let oldKeyHash = channelConfig.k;
        if (hash === oldKeyHash) return;
        channelConfig.k = hash;
        this.dbChanged = true;

        this.ClearChannelAttachments(channelId);
      },
      GetCurrentChannelIsDm: () =>
        Discord.getChannel(Cache.channelId).type === 1,
      GetCurrentDmUserId: () =>
        Discord.getChannel(Cache.channelId).recipients[0],
      RefreshCache: () => {
        Cache.channelId = Discord.getChannelId();
        Cache.channelConfig = DataBase.channels[Cache.channelId];
        if (Cache.channelConfig != null) Cache.channelConfig.l = Date.now();
        if (Blacklist != null) {
          let channel = Discord.getChannel(Cache.channelId);
          if (channel == null) return false;
          let guildId = channel.guild_id;
          Cache.channelBlacklist = guildId == null ? null : Blacklist[guildId];
        }
        return true;
      },

      ClearChannelAttachments(channelId) {
        Discord.dispatch({
          type: 'UPLOAD_ATTACHMENT_CLEAR_ALL_FILES',
          channelId,
          draftType: 0,
        });
      },
      ClearCurrentChannelAttachments: function () {
        this.ClearChannelAttachments(Cache.channelId);
      },

      SendSystemMessage: function (channelId, sysmsg) {
        // Format moderne Discord Canary 2026: sendMessage(channelId, messageObject, undefined, options)
        const messageObject = {
          content:
            '```ml\n-----SYSTEM MESSAGE-----\n```' +
            sysmsg +
            '\n```yaml\n🔒\n```',
          tts: false,
          invalidEmojis: [],
          validNonShortcutEmojis: [],
          // Marquer comme message système pour bypasser handleSend
          _sdc_system_message: true
        };

        const options = {
          alsoForwardToChannelId: undefined,
          location: 'chat_input'
        };

        // Appeler avec le format moderne (channelId, messageObject, undefined, options)
        const result = Discord.enqueue(channelId, messageObject, undefined, options);
      },
      SendPersonalKey: async function (channelId) {
        let channelConfig = this.GetChannelConfig(channelId);
        if (channelConfig == null) return;
        let keyHash = channelConfig.k;
        if (keyHash === DataBase.personalKeyHash) return;

        let keyHashPayload = this.PayloadEncode(this.Base64ToBytes(keyHash));
        let key = await this.GetKeyByHash(keyHash);
        let personalKey = await this.GetKeyBytesByHash(
          DataBase.personalKeyHash
        );
        let encryptedPersonalKey;
        if (channelConfig.cryptoProtocol === 1)
          encryptedPersonalKey = await this.AesEncryptLegacy(key, personalKey);
        else
          encryptedPersonalKey = await this.AesEncrypt(
            key,
            personalKey,
            'personal-key'
          );
        let personalKeyPayload = this.PayloadEncode(encryptedPersonalKey);

        this.SendSystemMessage(
          channelId,
          `*type*: \`PERSONAL KEY\`\n*key*: \`${keyHashPayload}\`\n*personalKey*: \`${personalKeyPayload}\``
        );

        // [BUG FIX #3] Clear keyExchangeWhitelist after sending personal key
        let channel = Discord.getChannel(channelId);
        if (channel && channel.type === 1 && channel.recipients && channel.recipients[0]) {
          const userId = channel.recipients[0];
          delete keyExchangeWhitelist[userId];
        }

        delete channelConfig.w;
        this.dbChanged = true;
      },
      AddListener: (listenerMap, key, listener) => {
        let listeners = listenerMap[key];
        if (listeners == null) listenerMap[key] = [listener];
        else listeners.push(listener);
      },
      RemoveListener: (listenerMap, key, listener) => {
        let listeners = listenerMap[key];
        if (listeners == null) return;
        let index = listeners.indexOf(listener);
        if (index === -1) return;
        if (listeners.length === 1) {
          delete listenerMap[key];
          return;
        }
        listeners.splice(index, 1);
      },
      ListenerEvent: (listenerMap, key) => {
        let listeners = listenerMap[key];
        if (listeners == null) return;
        for (let listener of listeners) listener();
      },
      ListenerBulkEvent: function (listenerMap, keyList) {
        let listenerKeys = Object.keys(listenerMap);
        if (listenerKeys.length === 0) return;
        let foundKeys = this.Intersect(keyList.sort(), listenerKeys.sort());
        for (let key of foundKeys)
          for (let listener of listenerMap[key]) listener();
      },
      messageDeleteListeners: {},
      AddMessageDeleteListener: function (messageId, listener) {
        this.AddListener(this.messageDeleteListeners, messageId, listener);
      },
      RemoveMessageDeleteListener: function (messageId, listener) {
        this.RemoveListener(this.messageDeleteListeners, messageId, listener);
      },
      MessageDeleteEvent: function (messageId) {
        this.ListenerEvent(this.messageDeleteListeners, messageId);
      },
      MessageDeleteBulkEvent: function (messageIdList) {
        this.ListenerBulkEvent(this.messageDeleteListeners, messageIdList);
      },
      keyShareListeners: {},
      AddKeyShareListener: function (keyHash, listener) {
        this.AddListener(this.keyShareListeners, keyHash, listener);
      },
      RemoveKeyShareListener: function (keyHash, listener) {
        this.RemoveListener(this.keyShareListeners, keyHash, listener);
      },
      KeyShareEvent: function (keyHash) {
        this.ListenerEvent(this.keyShareListeners, keyHash);
      },
      keyExchangeListeners: {},
      AddKeyExchangeListener: function (userId, listener) {
        this.AddListener(this.keyExchangeListeners, userId, listener);
      },
      RemoveKeyExchangeListener: function (userId, listener) {
        this.RemoveListener(this.keyExchangeListeners, userId, listener);
      },
      KeyExchangeEvent: function (userId) {
        this.ListenerEvent(this.keyExchangeListeners, userId);
      },
      channelSelectListeners: {},
      AddChannelSelectListener: function (channelId, listener) {
        this.AddListener(this.channelSelectListeners, channelId, listener);
      },
      RemoveChannelSelectListener: function (channelId, listener) {
        this.RemoveListener(this.channelSelectListeners, channelId, listener);
      },
      ChannelSelectEvent: function (channelId) {
        this.ListenerEvent(this.channelSelectListeners, channelId);
      },
      ongoingKeyExchanges: {},
      InitKeyExchange: async function (user, autoOnMessage, autoOnKey) {
        let userId = user.id;
        let currentUserId = Discord.getCurrentUser().id;
        if (userId === currentUserId) return 0;

        // A manual exchange (the context-menu action in a DM) is the only action
        // that clears a previous refusal for this peer. Automatic exchanges caused
        // by unknown encrypted messages stay suppressed until the user does this.
        if (!autoOnMessage) {
          ClearDeniedKeyPeer(userId);
        } else if (IsDeniedKeyPeer(userId)) {
          console.log('[SDC] Automatic key exchange suppressed for previously denied peer', { userId });
          return 0;
        }

        let channelId = Discord.getDMFromUserId(userId);
        let channelConfig;
        if (autoOnMessage) {
          channelConfig = this.GetChannelConfig(channelId);
          if (
            channelConfig != null &&
            (channelConfig.s /*systemMessageTime*/ > 0 ||
              channelConfig.w) /*waitingForSystemMessage*/
          )
            return 2;

          // Never initiate a first/automatic exchange silently. Friendship is not
          // sufficient consent for cryptographic key establishment: when this path
          // was triggered by an incoming encrypted message, require an explicit OK.
          if (this.ongoingKeyExchanges[userId]) return 0;
          this.ongoingKeyExchanges[userId] = true;
          if (user.username == null) user = Discord.getUser(userId);
          const displayName =
            user?.global_name || user?.username || userId;
          const discriminator =
            user?.discriminator && user.discriminator !== '0'
              ? `#${user.discriminator}`
              : '';
          let popupOverride = {};
          let popup = PopupManager.NewPromise(
            `Would you like to initiate key exchange with ${displayName}${discriminator}?`,
            false,
            popupOverride
          );
          const autoCancel = () => {
            delete this.ongoingKeyExchanges[userId];
            popupOverride.cancel();
          };
          this.AddMessageDeleteListener(autoOnMessage, autoCancel);
          this.AddKeyShareListener(autoOnKey, autoCancel);
          let force = await popup;
          this.RemoveMessageDeleteListener(autoOnMessage, autoCancel);
          this.RemoveKeyShareListener(autoOnKey, autoCancel);
          if (!force) {
            DenyKeyPeer(userId, 'automatic-exchange');
            return 0;
          }
        }
        delete this.ongoingKeyExchanges[userId]; //this way once canceled you either have to add them as friend or restart the plugin

        keyExchangeWhitelist[userId] = true;
        console.log('[SDC] InitKeyExchange: User whitelisted', { userId });

        if (channelId == null) {
          // ensurePrivateChannel n'existe plus dans l'API Discord moderne
          // Alternative : créer le canal DM via l'API REST
          try {
            console.log('[SDC] InitKeyExchange: Creating DM channel with user', { userId });

            // Trouver le token depuis les modules internes
            const tokenModule = Discord.modules && Object.values(Discord.modules).find(
              m => m?.default?.getToken || m?.getToken
            );
            const token = tokenModule?.default?.getToken ? tokenModule.default.getToken() : tokenModule?.getToken?.();

            if (!token) {
              console.error('[SDC] InitKeyExchange: Could not find auth token');
              console.warn('[SDC] InitKeyExchange: Please send a regular message to this user first to create a DM channel.');
              return 0;
            }

            const response = await fetch('/api/v9/users/@me/channels', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Authorization': token
              },
              body: JSON.stringify({ recipients: [userId] })
            });

            if (response.ok) {
              const channel = await response.json();
              channelId = channel.id;
              console.log('[SDC] InitKeyExchange: DM channel created', { channelId });
            } else {
              const errorText = await response.text();
              console.error('[SDC] InitKeyExchange: Failed to create DM channel', errorText);
              console.warn('[SDC] InitKeyExchange: Please send a regular message to this user first.');
              return 0;
            }
          } catch (error) {
            console.error('[SDC] InitKeyExchange: Error creating DM channel', error);
            console.warn('[SDC] InitKeyExchange: Please send a regular message to this user first.');
            return 0;
          }
        }

        let dhPublicKeyPayload = this.PayloadEncode(
          this.Base64ToBytes(DataBase.dhPublicKey)
        );

        let sysMsg;
        if (cryptoService.v2Enabled) {
          await ensureIdentityKeys();
          const ephemeral = await this.DhGenerateKeys();
          const ephemeralPublicBytes = await this.DhExportPublicKey(
            ephemeral.publicKey
          );
          const identityPublicBytes = this.Base64ToBytes(
            DataBase.identityPublicKey
          );
          const transcript = kexTranscriptInit(
            currentUserId,
            userId,
            channelId,
            ephemeralPublicBytes
          );
          const signatureBytes = await signKexTranscript(transcript);

          pendingV2KeyExchanges[userId] = {
            channelId,
            privateKey: ephemeral.privateKey,
            publicKeyBytes: ephemeralPublicBytes,
            createdAt: Date.now(),
          };

          sysMsg =
            `*type*: \`DH KEY\`\n` +
            `*protocol*: \`2\`\n` +
            `*dhKey*: \`${dhPublicKeyPayload}\`\n` +
            `*ephKey*: \`${this.PayloadEncode(ephemeralPublicBytes)}\`\n` +
            `*identityKey*: \`${this.PayloadEncode(identityPublicBytes)}\`\n` +
            `*signature*: \`${this.PayloadEncode(signatureBytes)}\``;

          console.log('[SDC] InitKeyExchange: Sending signed ephemeral DH KEY v2', {
            channelId,
            userId,
          });
        } else {
          sysMsg = `*type*: \`DH KEY\`\n*dhKey*: \`${dhPublicKeyPayload}\``;
          console.warn('[SDC][CRYPTO] v2 unavailable; sending legacy DH KEY');
        }
        this.SendSystemMessage(channelId, sysMsg);
        channelConfig =
          channelConfig || this.GetOrCreateChannelConfig(channelId);
        channelConfig.w = 1;
        this.dbChanged = true;
        console.log('[SDC] InitKeyExchange: DH KEY sent, w=1');
        return 1;
      },
      ongoingKeyRequests: {},
      RequestKey: async function (keyHash, user, autoOnMessage) {
        let userId = user.id;
        if (DataBase.keys[keyHash] != null) return false;

        if (autoOnMessage && IsDeniedKeyPeer(userId)) {
          console.log('[SDC] Automatic key request suppressed for previously denied peer', {
            userId,
            keyHash: keyHash?.slice(0, 8),
          });
          return false;
        }

        let channelId = Discord.getDMFromUserId(userId);
        if (channelId == null) return false;

        let channelConfig;
        let requestId = keyHash + userId;
        if (autoOnMessage) {
          channelConfig = this.GetChannelConfig(channelId);
          if (
            channelConfig != null &&
            channelConfig.w /*waitingForSystemMessage*/
          )
            return false;

          if (
            /friend/i.test(DataBase.autoKeyExchange) &&
            typeof Discord.isFriend === 'function' &&
            !Discord.isFriend(userId)
          ) {
            if (this.ongoingKeyRequests[requestId]) return false;
            if (this.ongoingKeyExchanges[userId]) return false;
            if (
              channelConfig == null ||
              DataBase.trustedKeys == null ||
              !DataBase.trustedKeys[channelConfig.k /*keyHash*/]
            ) {
              this.ongoingKeyRequests[requestId] = true;
              if (user.username == null) user = Discord.getUser(userId);
              let popupOverride = {};
              let popup = PopupManager.NewPromise(
                `Would you like to request key from ${user.username}#${user.discriminator}`,
                true,
                popupOverride
              );
              const autoCancel = () => {
                delete this.ongoingKeyRequests[requestId];
                popupOverride.cancel();
              };
              this.AddMessageDeleteListener(autoOnMessage, autoCancel);
              this.AddKeyShareListener(keyHash, autoCancel);
              let force = await popup;
              this.RemoveMessageDeleteListener(autoOnMessage, autoCancel);
              this.RemoveKeyShareListener(keyHash, autoCancel);
              if (!force) return false;
            }
          }
        }
        delete this.ongoingKeyRequests[requestId];

        keyExchangeWhitelist[userId] = true;

        let requestedKeyPayload = this.PayloadEncode(
          this.Base64ToBytes(keyHash)
        );

        this.SendSystemMessage(
          channelId,
          `*type*: \`KEY REQUEST\`\n*requestedKey*: \`${requestedKeyPayload}\``
        );
        channelConfig =
          channelConfig || this.GetOrCreateChannelConfig(channelId);
        channelConfig.w = 1;
        this.dbChanged = true;
        return true;
      },
      ongoingKeyExchangesWithRequest: {},
      InitKeyExchangeAndRequestKey: async function (
        keyHash,
        user,
        autoOnMessage
      ) {
        let requestId = keyHash + user.id;
        let ongoing = this.ongoingKeyExchangesWithRequest[requestId];
        if (ongoing && autoOnMessage) return false;

        let initKeyExchangeStatus;
        try {
          initKeyExchangeStatus = await this.InitKeyExchange(
            user,
            autoOnMessage,
            keyHash
          );
        } catch (error) {
          console.error('[SDC] InitKeyExchangeAndRequestKey: Error in InitKeyExchange', error);
          return false;
        }

        if (initKeyExchangeStatus === 0) return false;
        if (ongoing) return false;
        this.ongoingKeyExchangesWithRequest[requestId] = true;
        let promiseResolve;
        if (initKeyExchangeStatus === 1) {
          await new Promise((resolve) => {
            promiseResolve = resolve;
            this.AddKeyExchangeListener(user.id, resolve);
          });
          this.RemoveKeyExchangeListener(user.id, promiseResolve);
        }
        if (
          await this.RequestKey(
            keyHash,
            user,
            initKeyExchangeStatus === 1 ? null : autoOnMessage
          )
        ) {
          await new Promise((resolve) => {
            promiseResolve = resolve;
            this.AddKeyShareListener(keyHash, resolve);
          });
          this.RemoveKeyShareListener(keyHash, promiseResolve);
        }
        delete this.ongoingKeyExchangesWithRequest[requestId];
        return true;
      },
      ShareKey: async function (keyHash, channelId, nonForced, user) {
        console.log('[SDC] ShareKey: Starting key share', { keyHash: keyHash?.substring(0, 8), channelId });
        let keyObj = DataBase.keys[keyHash];
        if (keyObj == null) {
          console.warn('[SDC] ShareKey: Key not found in database', keyHash?.substring(0, 8));
          this.SendSystemMessage(
            channelId,
            `*type*: \`KEY SHARE\`\n*status*: \`NOT FOUND\``
          );
          return;
        }
        let channelConfig;
        if (nonForced != null && (nonForced || keyObj.h) /*hidden*/) {
          channelConfig = DataBase.channels[channelId];
          if (
            channelConfig == null ||
            DataBase.trustedKeys == null ||
            !DataBase.trustedKeys[channelConfig.k /*keyHash*/]
          ) {
            if (user.username == null) user = Discord.getUser(user.id);
            if (
              !(await PopupManager.NewPromise(
                `Would you like to share key "${Utils.FormatDescriptor(
                  keyObj.d
                )}" with ${user.username}#${user.discriminator}`,
                true
              ))
            ) {
              this.SendSystemMessage(
                channelId,
                `*type*: \`KEY SHARE\`\n*status*: \`DENIED\``
              );
              return;
            }
          }
        }

        let sharedKeyBase64 = keyObj.k;
        let sharedKeyBytes = this.Base64ToBytes(sharedKeyBase64);
        if (DataBase.isEncrypted)
          sharedKeyBytes = await this.AesDecrypt(Cache.dbKey, sharedKeyBytes, 'db-key');

        if (channelConfig == null)
          channelConfig = this.GetOrCreateChannelConfig(channelId);

        // [BUG FIX #1] Valider que channelConfig.k existe avant encryption
        if (!channelConfig.k) {
          console.error('[SDC] ShareKey: No channel key set (channelConfig.k is null/undefined)', { channelId });
          this.SendSystemMessage(
            channelId,
            `*type*: \`KEY SHARE\`\n*status*: \`ERROR - No channel key set\``
          );
          return;
        }

        let key = await this.GetKeyByHash(channelConfig.k);
        if (!key) {
          console.error('[SDC] ShareKey: Channel key not found in database', { keyHash: channelConfig.k?.substring(0, 8) });
          this.SendSystemMessage(
            channelId,
            `*type*: \`KEY SHARE\`\n*status*: \`ERROR - Channel key not found\``
          );
          return;
        }

        let keyHashPayload = this.PayloadEncode(
          this.Base64ToBytes(channelConfig.k)
        );

        let encryptedSharedKey;
        if (channelConfig.cryptoProtocol === 1)
          encryptedSharedKey = await Utils.AesEncryptLegacy(
            key,
            sharedKeyBytes
          );
        else
          encryptedSharedKey = await Utils.AesEncrypt(
            key,
            sharedKeyBytes,
            'key-share'
          );
        let sharedKeyPayload = this.PayloadEncode(encryptedSharedKey);

        if (keyHash === DataBase.personalKeyHash) {
          let keyDescriptor = `<@${Discord.getCurrentUser().id
            }>'s personal key`;
          this.SendSystemMessage(
            channelId,
            `*type*: \`KEY SHARE\`\n*status*: \`OK\`\n*key*: \`${keyHashPayload}\`\n*sharedKey*: \`${sharedKeyPayload}\`\n*keyType*: \`PERSONAL\`\n*keyDescriptor*: \`${keyDescriptor}\``
          );
        } else {
          const keyTypes = { 1: 'GROUP', 2: 'CONVERSATION', 3: 'PERSONAL' };
          let keyType = keyTypes[keyObj.t];
          let keyDescriptor = keyObj.d;
          let systemMessage = `*type*: \`KEY SHARE\`\n*status*: \`OK\`\n*key*: \`${keyHashPayload}\`\n*sharedKey*: \`${sharedKeyPayload}\`\n*keyType*: \`${keyType}\`\n*keyDescriptor*: \`${keyDescriptor}\``;
          if (keyObj.t === 1 /*group*/) {
            if (keyObj.h /*hidden*/) systemMessage += `\n*keyHidden*: \`YES\``;
            let sharedChannels = [];
            for (let [id, config] of Object.entries(DataBase.channels)) {
              if (config.k === keyHash) {
                let channel = Discord.getChannel(id);
                if (channel == null || channel.type === 1 /*DM*/) continue;

                if (sharedChannels.push(id) === 20) break;
              }
            }
            systemMessage += `\n*sharedChannels*: \`${JSON.stringify(
              sharedChannels
            )}\``;
          }

          this.SendSystemMessage(channelId, systemMessage);
        }

        delete channelConfig.w;
        this.dbChanged = true;
      },
      KeyRotationTimeout: function (keyHash, keyRotator, timeFromNow) {
        return setTimeout(async () => {
          delete DataBase.keyRotators[keyHash];
          delete KeyRotators[keyHash];
          let now = Date.now();
          let rotationCtr = Math.floor(
            (now - keyRotator.start) / keyRotator.interval
          );
          let oldKey = DataBase.keys[keyHash];
          if (oldKey == null) {
            this.dbChanged = true;
            return;
          }
          let dhPrivateKeyBytes = this.Base64ToBytes(DataBase.dhPrivateKey);
          if (DataBase.isEncrypted)
            dhPrivateKeyBytes = await this.AesDecrypt(
              Cache.dbKey,
              dhPrivateKeyBytes,
              'db-dh'
            );
          let seed = this.Base64ToBytes(keyRotator.seed);
          let newName =
            /^(.*?)(?: +\d+)?$/.exec(oldKey.d /*descriptor*/)[1] +
            ' ' +
            rotationCtr;

          let nextKeyBytes;
          if (keyRotator.v >= 2) {
            // v22 rotations derive from the current group key using HKDF. This
            // avoids the previous ad-hoc SHA-512(seed || local-DH-private-key)
            // construction and is deterministic for every holder of the group
            // key + rotator metadata.
            const currentKeyBytes = await this.GetKeyBytesByHash(keyHash);
            const salt = await this.Sha256(seed);
            const info = this.StringToUtf8Bytes(
              `SDC-KEY-ROTATION-V2|${rotationCtr}|${keyRotator.start}|${keyRotator.interval}`
            );
            nextKeyBytes = await this.HkdfSha256(
              currentKeyBytes,
              salt,
              info,
              32
            );
          } else {
            // Existing schedules remain fully compatible with v21 and older.
            let seedEdit = new DataView(seed.buffer);
            seedEdit.setUint32(
              0,
              seedEdit.getUint32(0, true) ^ rotationCtr,
              true
            );
            nextKeyBytes = await this.Sha512_256(
              this.ConcatBuffers([seed, dhPrivateKeyBytes])
            );
          }

          let newKeyHash = await this.SaveKey(
            nextKeyBytes,
            1 /*group*/,
            newName,
            oldKey.h /*hidden*/
          );
          DataBase.keyRotators[newKeyHash] = keyRotator;
          oldKey.d /*descriptor*/ = 'Rotated ' + oldKey.d;
          this.dbChanged = true;
          this.ReplaceChannelKeys(keyHash, newKeyHash);
          if (
            Cache.channelConfig != null &&
            Cache.channelConfig.k /*keyHash*/ === newKeyHash
          )
            MenuBar.Update();
          this.StartKeyRotation(newKeyHash, keyRotator);
        }, timeFromNow);
      },
      StartKeyRotation: function (keyHash, keyRotator) {
        let now = Date.now();
        let timeFromNow =
          keyRotator.start > now
            ? keyRotator.start - now
            : Math.ceil(
              (1 - (((now - keyRotator.start) / keyRotator.interval) % 1)) *
              keyRotator.interval
            );
        KeyRotators[keyHash] = this.KeyRotationTimeout(
          keyHash,
          keyRotator,
          timeFromNow
        );
      },
      StopKeyRotation: (keyHash) => clearTimeout(KeyRotators[keyHash]),
      UpdateMessageContent: (message) => {
        if (message.edited_timestamp == null) {
          message.edited_timestamp = message.timestamp;
          Discord.dispatch({ type: 'MESSAGE_UPDATE', message });
          message.edited_timestamp = null; //in case the message is still loading when updated
        } else Discord.dispatch({ type: 'MESSAGE_UPDATE', message });
      },

      Can: (permission, user, context) =>
        Discord.can({ permission, user, context }),
    });

    if (!window.crypto || !crypto.subtle) {
      Utils.Error('Crypto API not found.');
      return -1;
    }

    Discord.window.SdcDownloadUrl = (filename, url) => {
      let a = document.createElement('a');
      a.href = url;
      a.download = filename;
      a.style = 'display:none';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    };
    Discord.window.SdcDecryptDl = async (filename, keyHash, url) => {
      try {
        let encryptedFileBuffer;

        // BdApi.Net.fetch handles redirects and current Discord CDN URLs more
        // reliably than the old javascript: link + raw https.get path.
        if (BdApi?.Net?.fetch) {
          try {
            const response = await BdApi.Net.fetch(url, {
              method: 'GET',
              redirect: 'follow',
              timeout: 120000,
              headers: { Accept: '*/*' },
            });

            if (!response.ok) {
              throw new Error(`Attachment HTTP ${response.status}`);
            }

            encryptedFileBuffer = await response.arrayBuffer();
          } catch (fetchError) {
            gifResolverWarn('attachment', 'download:bdapi-fallback', {
              filename,
              url,
              message: fetchError?.message || String(fetchError),
            });
          }
        }

        if (!encryptedFileBuffer) {
          encryptedFileBuffer = await Utils.DownloadFile(url);
        }

        let fileBuffer = await Utils.AesDecrypt(
          await Utils.GetKeyByHash(keyHash),
          encryptedFileBuffer,
          'file'
        );

        Utils.DownloadBlob(filename, new File([fileBuffer], filename));

        gifResolverLog('attachment', 'download:success', {
          filename,
          encryptedBytes: encryptedFileBuffer.byteLength,
          decryptedBytes: fileBuffer.byteLength,
        });

        return true;
      } catch (error) {
        gifResolverWarn('attachment', 'download:failed', {
          filename,
          url,
          name: error?.name,
          message: error?.message || String(error),
        });
        throw error;
      }
    };
    Discord.window.SdcCryptoStatus = async () => {
      const identityPublic = DataBase?.identityPublicKey
        ? Utils.Base64ToBytes(DataBase.identityPublicKey)
        : null;
      return {
        selfTest: await runCryptoV2SelfTest(),
        databaseCryptoVersion: DataBase?.dbCryptoVersion || 1,
        databaseKdf: DataBase?.dbKdf || (DataBase?.isEncrypted ? 'legacy-SHA-512' : 'none'),
        databaseKdfIterations: DataBase?.dbKdfIterations || null,
        writeCipher: cryptoService.v2Enabled ? 'AES-256-GCM-128' : 'AES-256-CBC (fallback)',
        legacyReadCipher: 'AES-256-CBC',
        identityFingerprint: identityPublic
          ? await identityFingerprint(identityPublic)
          : null,
        peerIdentities: Object.keys(DataBase?.peerIdentityKeys || {}).length,
      };
    };

    Discord.window.SdcRestorePreV22Database = async () => {
      const backup = await Utils.StorageLoad('SimpleDiscordCrypt-pre-v22');
      if (backup == null) return { restored: false, reason: 'no-backup' };
      await Utils.StorageSave('SimpleDiscordCrypt', backup);
      return {
        restored: true,
        message: 'Pre-v22 database restored. Fully restart Discord before loading SDC again.',
      };
    };

    Discord.window.SdcClearKeys = (filterFunc) => {
      const typeLookup = [null, 'GROUP', 'CONVERSATION', 'PERSONAL'];
      for (let [hash, keyObj] of Object.entries(DataBase.keys)) {
        if (
          filterFunc({
            type: typeLookup[keyObj.t],
            lastseen: keyObj.l,
            descriptor: Utils.FormatDescriptor(keyObj.d),
            hidden: !!keyObj.h,
            registered: keyObj.r,
          })
        )
          Utils.DeleteKey(hash);
      }
    };
    Discord.window.SdcClearChannels = (filterFunc) => {
      for (let [hash, channelObj] of Object.entries(DataBase.channels)) {
        if (
          filterFunc({
            lastseen: channelObj.l,
            descriptor: Utils.FormatDescriptor(channelObj.d),
            encrypted: !!channelObj.e,
          })
        )
          Utils.DeleteChannelConfig(hash);
      }
    };
    Discord.window.SdcSetPingOn = (regexStr) => {
      if (!regexStr) {
        if (Cache.pingOn == null) return;
        Cache.pingOn = null;
        delete DataBase.pingOn;
      } else {
        regexStr = regexStr.toString();
        let fullRegex = /^\/(.*)\/([imsu]{0,4})$/.exec(regexStr);
        Cache.pingOn = fullRegex
          ? new RegExp(fullRegex[1], fullRegex[2])
          : new RegExp(regexStr);
        DataBase.pingOn = regexStr;
      }
      Utils.dbChanged = true;
    };
    Discord.window.SdcSetKeyRotation = (days, start) => {
      days = Number(days);
      if (start != null) {
        start = Date.parse(start);
        if (!start) {
          Utils.Error('Invalid start time');
          return;
        }
      }
      let channelConfig = Cache.channelConfig;
      if (channelConfig == null) {
        Utils.Error('There is no key selected in this channel');
        return;
      }
      let keyHash = channelConfig.k; /*keyHash*/
      let keyRotator;
      if (DataBase.keyRotators != null)
        keyRotator = DataBase.keyRotators[keyHash];
      if (days > 0) {
        const day = 24 * 60 * 60 * 1000;
        let interval = days * day;
        if (start == null) {
          let now = Date.now();
          start = now - (now % interval) + interval;
          if (start < now + day) start += interval;
        }
        if (keyRotator == null) {
          let keyType = DataBase.keys[keyHash].t; /*type*/
          if (keyType === 3 /*personal*/) {
            Utils.Error('You cannot add key rotation to your personal key');
            return;
          }
          if (keyType === 2 /*conversation*/) {
            Utils.Error('You cannot use key rotation for key exchanges');
            return;
          }
          if (DataBase.keyRotators == null) DataBase.keyRotators = {};
          DataBase.keyRotators[keyHash] = { interval, start, seed: keyHash, v: 2 };
        } else {
          interval = day * days;
          if (keyRotator.start < Date.now())
            Utils.Warn(
              "Plase note that the numbering has been reset, you might want to change the key's name"
            );
          keyRotator.interval = interval;
          keyRotator.start = start;
          Utils.StopKeyRotation(keyHash);
          Utils.StartKeyRotation(keyHash, keyRotator);
        }
        if (DataBase.dhPrivateKeyFallback)
          Utils.Warn(
            'You are using the plugin in compatibility mode, make sure to remove all key rotation if you import the database into other devices'
          );
        Utils.Log('Key rotation will start on ' + new Date(start));
      } else {
        if (keyRotator == null) {
          Utils.Error('There is no key rotation on the current key');
          return;
        }
        if (DataBase.keyRotators.length === 1) delete DataBase.keyRotators;
        else delete DataBase.keyRotators[keyHash];
        Utils.StopKeyRotation(keyHash);
        delete KeyRotators[keyHash];
        Utils.Log('Key rotation stopped');
      }
      Utils.dbChanged = true;
    };

    // Registre pour sauvegarder les exports trouvés par mirrorFunction
    const moduleExports = {};

    const mirrorFunction = (moduleName, functionName) => {
      let module = modules[moduleName];
      let mirroredName = `original_${functionName}`;
      let targetExport = module; // Par défaut, le module lui-même

      // Chercher la fonction dans plusieurs emplacements possibles
      let originalFunction = module[functionName]; // Direct

      // Si pas trouvée directement, chercher dans les exports minifiés
      if (typeof originalFunction !== 'function') {
        const possiblePaths = [module.Z, module.ZP, module.default];
        for (const path of possiblePaths) {
          if (path && typeof path[functionName] === 'function') {
            originalFunction = path[functionName];
            targetExport = path; // Update target export
            break;
          }
        }
      }

      // Si toujours pas trouvée, chercher dans les objets à une seule clé
      if (typeof originalFunction !== 'function') {
        try {
          const keys = Object.keys(module);
          if (keys.length === 1 && typeof module[keys[0]] === 'object') {
            const singleKey = module[keys[0]];
            if (typeof singleKey[functionName] === 'function') {
              originalFunction = singleKey[functionName];
              targetExport = singleKey;
            }
          }
        } catch (e) {
          // Ignorer les erreurs liées aux objets Proxy
        }
      }

      if (typeof originalFunction !== 'function') {
        console.error(`[SDC] ✗ ${moduleName}.${functionName}() est invalide ou introuvable`);
        return false; // Retourner false au lieu de throw
      }

      // Sauvegarder l'export trouvé pour hookFunction
      if (!moduleExports[moduleName]) moduleExports[moduleName] = {};
      moduleExports[moduleName][functionName] = { targetExport, originalFunction };

      Discord[mirroredName] = originalFunction;
      Discord[functionName] = function () {
        // Preserve the real receiver when a hooked/native method is called through
        // targetExport. Native DOM methods (notably HTMLIFrameElement#setAttribute)
        // throw "Illegal invocation" if they are called with the prototype itself
        // instead of the actual DOM element. Direct Discord.* calls still use the
        // discovered export as their receiver.
        const receiver = this && this !== Discord ? this : targetExport;
        return Reflect.apply(originalFunction, receiver, arguments);
      };
      return true;
    };
    const hookFunction = (moduleName, functionName, alias) => {
      alias ??= functionName;
      let detourName = `detour_${alias}`;
      let detourFunction = Discord[alias];

      Object.defineProperty(Discord, detourName, {
        get: () => detourFunction,
        set: (value) => (detourFunction = value),
      });

      // Utiliser l'export trouvé par mirrorFunction si disponible
      let targetExport = moduleExports[moduleName]?.[functionName]?.targetExport;

      if (!targetExport) {
        // Fallback : chercher manuellement
        const module = modules[moduleName];
        if (!module) {
          console.error(`[SDC] ✗ Module ${moduleName} non trouvé pour hook`);
          return false;
        }

        const exports = [module, module.Z, module.ZP, module.default].filter(Boolean);
        for (const exp of exports) {
          if (typeof exp[functionName] === 'function') {
            targetExport = exp;
            break;
          }
        }
      }

      if (!targetExport) {
        console.error(`[SDC] ✗ ${moduleName}.${functionName} non trouvé pour hook`);
        return false;
      }

      // Hook la fonction
      targetExport[functionName] = function () {
        return Reflect.apply(detourFunction, this, arguments);
      };

      return true;
    };

    try {
      // Gérer MessageQueue avec fallback enqueue/sendMessage
      const messageQueueModule = modules.MessageQueue;
      if (messageQueueModule) {
        // Chercher enqueue ou sendMessage dans tous les exports possibles
        const mqExports = [
          messageQueueModule,
          messageQueueModule.Z,
          messageQueueModule.ZP,
          messageQueueModule.default
        ].filter(Boolean);

        let enqueueFunc = null;
        let enqueueTarget = null;
        let funcName = null;

        // Trouver la fonction et son emplacement
        for (const exp of mqExports) {
          if (typeof exp.enqueue === 'function') {
            enqueueFunc = exp.enqueue;
            enqueueTarget = exp;
            funcName = 'enqueue';
            break;
          } else if (typeof exp.sendMessage === 'function') {
            enqueueFunc = exp.sendMessage;
            enqueueTarget = exp;
            funcName = 'sendMessage';
            break;
          }
        }

        // editMessage is a separate Discord action. Older SDC versions hooked it,
        // but the modern compatibility path only hooked sendMessage/enqueue. As a
        // result Discord sent the editor marker (:ENC: / <:ENC:...>) as plaintext.
        let editFunc = null;
        let editTarget = null;
        for (const exp of mqExports) {
          if (typeof exp.editMessage === 'function') {
            editFunc = exp.editMessage;
            editTarget = exp;
            break;
          }
        }

        if (editFunc && editTarget) {
          Discord.original_editMessage = editFunc;
          Discord.editMessageTarget = editTarget;

          let detourEditFunction = editFunc;
          Object.defineProperty(Discord, 'detour_editMessage', {
            get: () => detourEditFunction,
            set: (value) => (detourEditFunction = value),
          });

          Discord.editMessage = function () {
            return Reflect.apply(detourEditFunction, editTarget, arguments);
          };

          editTarget.editMessage = function () {
            return Reflect.apply(detourEditFunction, this, arguments);
          };

          console.log('[SDC] ✓ MessageQueue.editMessage hooked');
        } else {
          console.warn('[SDC] MessageQueue.editMessage not found; encrypted message editing will be unavailable');
        }

        if (enqueueFunc && enqueueTarget) {

          // Sauvegarder la fonction originale ET son contexte
          Discord.original_enqueue = enqueueFunc;
          Discord.enqueueTarget = enqueueTarget;  // Sauvegarder le contexte pour l'utiliser dans detour_enqueue

          // Initialiser detour_enqueue à l'original (sera remplacé par Load())
          let detourFunction = enqueueFunc;
          Object.defineProperty(Discord, 'detour_enqueue', {
            get: () => detourFunction,
            set: (value) => (detourFunction = value),
          });

          // Créer Discord.enqueue qui passe par le detour
          Discord.enqueue = function () {
            // Appeler le detour pour que nos hooks s'appliquent aussi aux appels manuels
            return Reflect.apply(detourFunction, enqueueTarget, arguments);
          };

          // Hook la fonction originale pour appeler detour_enqueue
          const originalEnqueue = enqueueFunc;
          enqueueTarget[funcName] = function () {
            return Reflect.apply(detourFunction, this, arguments);
          };

        }
      }

      // Mirror MessageDispatcher.dispatch si disponible
      if (modules.MessageDispatcher && typeof modules.MessageDispatcher.dispatch === 'function') {
        console.log('[SDC] MessageDispatcher disponible, miroring dispatch...');
        if (mirrorFunction('MessageDispatcher', 'dispatch')) {
          console.log('[SDC] ✓ Discord.dispatch mirrored successfully');
          // Initialiser le detour (sera remplacé par Load())
          let detourFunction = Discord.dispatch;
          Object.defineProperty(Discord, 'detour_dispatch', {
            get: () => detourFunction,
            set: (value) => (detourFunction = value),
          });

          // Hook la fonction dispatch pour utiliser detour_dispatch
          const targetExport = moduleExports['MessageDispatcher']?.['dispatch']?.targetExport;
          if (targetExport) {
            targetExport.dispatch = function () {
              return Reflect.apply(detourFunction, this, arguments);
            };
          }
        } else {
          console.error('[SDC] ✗ Failed to mirror MessageDispatcher.dispatch');
        }
      } else {
        console.error('[SDC] ✗ MessageDispatcher NOT available or dispatch function missing');
        console.log('[SDC] modules.MessageDispatcher:', modules.MessageDispatcher);
      }

      mirrorFunction('UserCache', 'getUser');
      mirrorFunction('UserCache', 'getCurrentUser');
      mirrorFunction('ChannelCache', 'getChannel');
      mirrorFunction('ChannelCache', 'getDMFromUserId');
      mirrorFunction('SelectedChannelStore', 'getChannelId');
      mirrorFunction('GuildCache', 'getGuild');

      // FileUploader - Skip si vide (pas critique pour chiffrement de messages)
      let fileUploaderSuccess = false;
      if (modules.FileUploader) {
        try {
          const uploaderKeys = Object.keys(modules.FileUploader);
          if (uploaderKeys.length > 0) {
            // Essayer silencieusement sans logger les erreurs (module non critique)
            const originalConsoleError = console.error;
            console.error = () => { }; // Supprimer temporairement les logs d'erreur
            const uploadResult = mirrorFunction('FileUploader', 'upload');
            const batchResult = mirrorFunction('FileUploader', 'instantBatchUpload');
            const filesResult = mirrorFunction('FileUploader', 'uploadFiles');
            console.error = originalConsoleError; // Restaurer console.error
            fileUploaderSuccess = uploadResult || batchResult || filesResult;
          }
        } catch (e) {
          // Ignorer les erreurs liées aux objets Proxy
        }
      }

      if (modules.RelationshipStore && typeof modules.RelationshipStore.isFriend === 'function') {
        mirrorFunction('RelationshipStore', 'isFriend');
      }

      // ensurePrivateChannel n'existe plus dans l'API Discord moderne
      // La création de canaux DM est maintenant gérée via l'API REST dans InitKeyExchange
      // if (modules.PrivateChannelManager && typeof modules.PrivateChannelManager.ensurePrivateChannel === 'function') {
      //   mirrorFunction('PrivateChannelManager', 'ensurePrivateChannel');
      // }

      let cloudUploadHelperSuccess = false;
      if (modules.CloudUploadHelper && typeof modules.CloudUploadHelper.getUploadPayload === 'function') {
        cloudUploadHelperSuccess = mirrorFunction('CloudUploadHelper', 'getUploadPayload');
      }

      let cloudUploadProtoSuccess = false;
      if (modules.CloudUploadPrototype) {
        // Essayer silencieusement uploadFileToCloud (non critique)
        const originalConsoleError = console.error;
        console.error = () => { }; // Supprimer temporairement les logs d'erreur
        cloudUploadProtoSuccess = mirrorFunction('CloudUploadPrototype', 'uploadFileToCloud');
        console.error = originalConsoleError; // Restaurer console.error

        // Gérer cloudUpload avec fallback
        Discord.cloudUpload = modules.CloudUploadPrototype.upload ||
          modules.CloudUploadPrototype.Z?.upload ||
          modules.CloudUploadPrototype.ZP?.upload ||
          modules.CloudUploadPrototype.default?.upload;
      }

      Discord.can = permissionEvaluatorCan;

      // MessageDispatcher.dispatch est déjà configuré manuellement plus haut (detour_dispatch)
      // Pas besoin d'appeler hookFunction pour lui

      // FileUploader hooks - Seulement si mirrorFunction a réussi
      if (fileUploaderSuccess) {
        if (Discord.upload) hookFunction('FileUploader', 'upload');
        if (Discord.instantBatchUpload) hookFunction('FileUploader', 'instantBatchUpload');
        if (Discord.uploadFiles) hookFunction('FileUploader', 'uploadFiles');
      }

      if (cloudUploadHelperSuccess && Discord.getUploadPayload) {
        hookFunction('CloudUploadHelper', 'getUploadPayload');
      }

      if (cloudUploadProtoSuccess && Discord.uploadFileToCloud) {
        hookFunction('CloudUploadPrototype', 'uploadFileToCloud');
      }
      if (modules.CloudUploadPrototype && Discord.cloudUpload) {
        hookFunction('CloudUploadPrototype', 'upload', 'cloudUpload');
      }

    } catch (err) {
      Utils.Error(err);
      return -1;
    }

    const iframePrototype = Discord.window.HTMLIFrameElement.prototype;
    const iframeAttributeProperty = Object.getOwnPropertyDescriptor(
      iframePrototype,
      'setAttribute'
    );
    if (!iframeAttributeProperty || iframeAttributeProperty.configurable) {
      modules.IframePrototype = iframePrototype;
      mirrorFunction('IframePrototype', 'setAttribute');
      hookFunction('IframePrototype', 'setAttribute');
    }

    if (
      modules.Premium != null &&
      Object.getOwnPropertyDescriptor(modules.Premium, 'canUseEmojisEverywhere')
        ?.configurable
    ) {
      mirrorFunction('Premium', 'canUseEmojisEverywhere');
      hookFunction('Premium', 'canUseEmojisEverywhere');
      if (modules.Premium.canUseAnimatedEmojis != null) {
        mirrorFunction('Premium', 'canUseAnimatedEmojis');
        hookFunction('Premium', 'canUseAnimatedEmojis');
      }
    }
    if (
      modules.MessageCache != null &&
      modules.MessageCache.getMessage != null
    ) {
      mirrorFunction('MessageCache', 'getMessage');
    }

    Style.Inject();

    LockMessages();
    Utils.LoadDb(() => {
      Load();
      UnlockMessages(true);
      ResolveInitPromise({ Load, Unload });
    }, UnlockMessages);

    //convenience feature
    ImageZoom = {};
    const isDesktopDc = navigator.userAgent.includes('discord');
    let closeModal = () => {
      document.querySelector(BackdropSelector).click();
    };
    let zoom = function (event) {
      this.removeEventListener('click', zoom);
      let url;
      if (this.src != null) {
        const urlObj = new URL(this.src, location.href);
        urlObj.searchParams.delete('width');
        urlObj.searchParams.delete('height');
        url = urlObj.href;
      }
      let parent = this.parentElement;
      parent.addEventListener('click', closeModal);
      parent.classList.add('sdc-zoom');
      let p = parent.parentElement;
      p.style = null;
      /*for(let child of p.childNodes) {
            if(child !== parent) child.remove();
        }*/
      p.parentElement.style = 'position: fixed; left: 0; top: 0';
      while (true) {
        p = p.parentElement;
        if (p == null || p.classList.contains(ModalClass)) break;
        p.parentElement.style = 'position: fixed; left: 0; top: 0';
        //p.style.transform = null;
        //p.style.backgroundColor = 'transparent';
      }
      parent.style =
        'width: 100vw; height: 100vh; display: flex; overflow: auto; outline: 0';
      this.style =
        'position: relative; max-width: 100%; height: auto; user-select: none; -moz-user-select: none';
      let loading = false;
      if (
        url != null &&
        url.length !== this.src.length &&
        !url.startsWith('blob:')
      ) {
        let loadStart = Date.now();
        const onLoad = () => {
          let duration;
          if (Date.now() - loadStart < 200) duration = 100;
          else duration = 100 + Math.log(this.naturalWidth / this.width) * 400;
          const onTransitionEnd = () => {
            parent.style.justifyContent = null;
            parent.style.alignItems = null;
            this.style.margin = 'auto';
            parent.scroll(
              (this.width - parent.clientWidth) / 2,
              (this.height - parent.clientHeight) / 2
            );
            this.removeEventListener('transitionend', onTransitionEnd);
            this.style.transitionDuration = null;
          };
          this.addEventListener('transitionend', onTransitionEnd);
          this.style.transitionDuration = duration + 'ms';
          this.style.minWidth =
            (this.naturalWidth > parent.clientWidth * 2
              ? parent.clientWidth * 2
              : this.naturalWidth) + 'px';
          this.removeEventListener('load', onLoad);
          loading = false;
        };
        this.addEventListener('load', onLoad);
        parent.style.justifyContent = 'center';
        parent.style.alignItems = 'center';
        this.style.minWidth =
          (this.naturalWidth > parent.clientWidth * 2
            ? parent.clientWidth * 2
            : this.naturalWidth) + 'px';
        loading = true;
        this.src = url; //img.src can be sync in FF
      } else {
        this.style.margin = 'auto';
        this.style.minWidth =
          (this.naturalWidth > parent.clientWidth * 2
            ? parent.clientWidth * 2
            : this.naturalWidth) + 'px';
        parent.scroll(
          (this.width - parent.clientWidth) / 2,
          (this.height - parent.clientHeight) / 2
        );
      }
      this.draggable = false;
      let dragDelta;
      let oldX, oldY;
      let clickRemoved;
      const drag = (event) => {
        let deltaX = oldX - event.clientX,
          deltaY = oldY - event.clientY;
        oldX = event.clientX;
        oldY = event.clientY;
        parent.scrollBy(deltaX, deltaY);
        if (clickRemoved) return;
        dragDelta += Math.sqrt(deltaX * deltaX + deltaY * deltaY);
        if (dragDelta > 10 /*px*/) {
          parent.removeEventListener('click', closeModal);
          clickRemoved = true;
        }
      };
      const stopDrag = () => {
        let w = Discord.window;
        w.removeEventListener('mousemove', drag);
        w.removeEventListener('mouseup', stopDrag);
        w.removeEventListener('blur', stopDrag);
        if (clickRemoved)
          setTimeout(() => parent.addEventListener('click', closeModal), 100);
      };
      this.addEventListener('mousedown', (event) => {
        if (event.button !== 0 /*Left click*/) return;
        dragDelta = 0;
        clickRemoved = false;
        oldX = event.clientX;
        oldY = event.clientY;
        let w = Discord.window;
        w.addEventListener('mousemove', drag);
        w.addEventListener('mouseup', stopDrag);
        w.addEventListener('blur', stopDrag);
      });
      this.addEventListener('dragstart', (event) => {
        event.preventDefault();
      });
      parent.tabIndex = 0;
      parent.focus();
      let loadAdded = false;
      parent.addEventListener(
        'keydown',
        (event) => {
          if (
            loading ||
            (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight')
          )
            return;
          let images = document.querySelectorAll(ChatImageSelector);
          let count = images.length;
          for (let i = 0; i < count; i++)
            if (images[i].src.startsWith(url)) {
              let image =
                event.key === 'ArrowLeft' ? images[i - 1] : images[i + 1];
              if (image != null && !image.src.startsWith('data:')) {
                //still loading
                const urlObj = new URL(image.src, location.href);
                urlObj.searchParams.delete('width');
                urlObj.searchParams.delete('height');
                url = urlObj.href;
                if (!loadAdded) {
                  this.addEventListener('load', () => {
                    this.style.minWidth =
                      (this.naturalWidth > parent.clientWidth * 2
                        ? parent.clientWidth * 2
                        : this.naturalWidth) + 'px';
                    parent.scroll(
                      (this.width - parent.clientWidth) / 2,
                      (this.height - parent.clientHeight) / 2
                    );
                    loading = false;
                  });
                  loadAdded = true;
                }
                loading = true;
                this.src = url;
                image.scrollIntoView(/*event.key !== 'ArrowLeft'*/); //loading more images can cause some to be skipped if they are still loading
              }
              break;
            }
          event.preventDefault();
        },
        true
      );
      if (isDesktopDc) {
        this.addEventListener('contextmenu', (event) => {
          if (!loading && this.src) {
            const urlObj = new URL(this.src, location.href);
            urlObj.searchParams.delete('width');
            urlObj.searchParams.delete('height');
            urlObj.searchParams.delete('format');
            const filename = urlObj.hash
              ? urlObj.hash.slice(1).split('?', 1)[0]
              : urlObj.pathname.split('/').pop();
            Discord.window.SdcDownloadUrl(filename, urlObj.href);
          }
          event.preventDefault();
        });
      }

      event.stopPropagation();
    };
    ImageZoom.zoom = zoom;
    ImageZoom.observer = new MutationObserver((changes) => {
      for (let change of changes)
        for (let added of change.addedNodes)
          if (added.tagName === 'IMG') {
            if (added.matches(ModalImgSelector)) {
              added.addEventListener('click', zoom);
            }
            return;
          } else if (
            added.classList != null &&
            added.classList.contains(ModalClass)
          ) {
            let img = added.querySelector(ImageWrapperImgSelector);
            if (img != null) {
              img.addEventListener('click', zoom);
            }
            return;
          }
    });
    return 1;
  }

  async function handleMessage(event) {
    if (!(await processMessage(event.message)))
      return await Discord.original_dispatch.apply(this, arguments);
  }
  async function handleMessages(event) {
    if (!event.messages || !Array.isArray(event.messages))
      return await Discord.original_dispatch.apply(this, arguments);

    for (let message of event.messages.slice()) //in case they reverse the array
      await processMessage(message);

    return await Discord.original_dispatch.apply(this, arguments);
  }
  async function handleSearch(event) {
    for (let group of event.messages)
      for (let message of group) await processMessage(message);

    return await Discord.original_dispatch.apply(this, arguments);
  }
  async function handleUpdate(event) {
    let message = event.message;
    if (
      message.content == null &&
      message.embeds != null &&
      message.embeds.length === 1
    ) {
      let embed = message.embeds[0];
      if (
        embed.footer != null &&
        (embed.footer.text === 'SimpleDiscordCrypt' ||
          embed.footer.text === '🔒')
      ) {
        return; //ignore embed-only updates
      }
    }

    if (!(await processMessage(message)))
      return await Discord.original_dispatch.apply(this, arguments);
  }

  // ============================================================================
  // SECTION 4: MESSAGE PROCESSING & ENCRYPTION
  // ============================================================================

  const messageRegex = CONFIG.patterns.message;
  const systemMessageRegex = CONFIG.patterns.systemMessage;
  const unknownKeyMessage = CONFIG.messages.unknownKey;
  const invalidMessage = CONFIG.messages.invalid;

  async function processMessage(message, ignoreAttachments) {
    let result;
    const content = message.content;
    const messageMatch = messageRegex.exec(content);
    if (messageMatch != null) {
      //simple messsage
      result = await decryptMessage(
        message,
        messageMatch[1],
        ignoreAttachments
      );
    } else {
      const systemMessageMatch = systemMessageRegex.exec(content);
      if (systemMessageMatch != null) {
        //simple system message
        processUpdateSystemMessage(message, systemMessageMatch[1]);
      } else {
        result = await processEmbeds(message, ignoreAttachments);
      }
    }

    if (Cache.pingOn != null && Cache.pingOn.test(message.content))
      message.mentions = [Discord.getCurrentUser()];

    return result;
  }

  function scrollChat(by) {
    let messageContainer = document.querySelector(MessageScrollerSelector);
    if (messageContainer == null) return;
    if (
      messageContainer.scrollTop + 1 >=
      messageContainer.scrollHeight - messageContainer.clientHeight
    )
      return; //scrolled to bottom
    messageContainer.scrollTop += by;
  }

  var mediaTypes = CONFIG.mediaTypes;
  const extensionRegex = CONFIG.patterns.extension;
  var downloadLocked = false;
  var downloadLocks = [];

  const EncryptedAttachmentDownloads = new Map();
  const EncryptedAttachmentDownloadPaths = new Map();
  let EncryptedAttachmentDownloadCounter = 0;
  const MAX_ENCRYPTED_ATTACHMENT_DOWNLOADS = 500;

  let encryptedImageContextMenuUnpatch = null;
  let encryptedImageOverflowMenuObserver = null;
  let encryptedImageOverflowPointerHandler = null;
  let encryptedImageOverflowPending = null;
  let encryptedImageOverflowSuppressUntil = 0;

  function getEncryptedAttachmentPathKey(value) {
    try {
      const parsed = new URL(String(value || ''), location.href);
      if (!/^https?:$/i.test(parsed.protocol)) return null;
      return `${parsed.hostname.toLowerCase()}${parsed.pathname}`;
    } catch (_) {
      return null;
    }
  }

  function registerEncryptedAttachmentDownload(
    filename,
    keyHash,
    encryptedUrl,
    messageId,
    channelId
  ) {
    const pathKey = getEncryptedAttachmentPathKey(encryptedUrl);

    if (pathKey != null) {
      const previousId = EncryptedAttachmentDownloadPaths.get(pathKey);
      const previous = previousId
        ? EncryptedAttachmentDownloads.get(previousId)
        : null;

      if (previous) {
        previous.filename = filename;
        previous.keyHash = keyHash;
        previous.encryptedUrl = encryptedUrl;
        previous.messageId = messageId || previous.messageId || null;
        previous.channelId = channelId || previous.channelId || null;
        previous.lastSeen = Date.now();
        scheduleEncryptedAttachmentDownloadScan();
        return previous.id;
      }
    }

    const id =
      `${Date.now().toString(36)}-${(++EncryptedAttachmentDownloadCounter).toString(36)}`;

    const meta = {
      id,
      filename,
      keyHash,
      encryptedUrl,
      pathKey,
      messageId: messageId || null,
      channelId: channelId || null,
      lastSeen: Date.now(),
    };

    EncryptedAttachmentDownloads.set(id, meta);
    if (pathKey != null) EncryptedAttachmentDownloadPaths.set(pathKey, id);

    while (
      EncryptedAttachmentDownloads.size >
      MAX_ENCRYPTED_ATTACHMENT_DOWNLOADS
    ) {
      const oldestId = EncryptedAttachmentDownloads.keys().next().value;
      const oldest = EncryptedAttachmentDownloads.get(oldestId);
      EncryptedAttachmentDownloads.delete(oldestId);
      if (
        oldest?.pathKey &&
        EncryptedAttachmentDownloadPaths.get(oldest.pathKey) === oldestId
      ) {
        EncryptedAttachmentDownloadPaths.delete(oldest.pathKey);
      }
    }

    gifResolverLog('attachment', 'download:registered', {
      id,
      filename,
      messageId: messageId || null,
      channelId: channelId || null,
      pathKey,
    });

    scheduleEncryptedAttachmentDownloadScan();
    return id;
  }

  function findEncryptedAttachmentDownloadForHref(href) {
    const pathKey = getEncryptedAttachmentPathKey(href);
    if (pathKey == null) return null;

    let id = EncryptedAttachmentDownloadPaths.get(pathKey);
    if (id != null) {
      const direct = EncryptedAttachmentDownloads.get(id);
      if (direct) return direct;
    }

    // Discord can move cdn.discordapp.com files through another CDN host while
    // retaining the /attachments/<channel>/<attachment>/... path.
    let parsedPath;
    try {
      parsedPath = new URL(String(href), location.href).pathname;
    } catch (_) {
      return null;
    }

    for (const meta of EncryptedAttachmentDownloads.values()) {
      try {
        if (new URL(meta.encryptedUrl).pathname === parsedPath) {
          return meta;
        }
      } catch (_) {}
    }

    return null;
  }

  function isEncryptedImageAttachmentMeta(meta) {
    if (!meta?.filename) return false;
    const match = extensionRegex.exec(meta.filename);
    if (match == null) return false;
    return mediaTypes[match[1].toLowerCase()] === 'img';
  }

  function getEncryptedAttachmentDownloadsForMessage(messageId) {
    if (!messageId) return [];

    const result = [];
    for (const meta of EncryptedAttachmentDownloads.values()) {
      if (String(meta.messageId || '') === String(messageId)) {
        result.push(meta);
      }
    }

    // Keep registration/attachment order stable.
    return result;
  }

  function getEncryptedImageDownloadsForMessage(messageId) {
    if (!messageId) return [];

    const result = [];
    for (const meta of EncryptedAttachmentDownloads.values()) {
      if (
        String(meta.messageId || '') === String(messageId) &&
        isEncryptedImageAttachmentMeta(meta)
      ) {
        result.push(meta);
      }
    }

    // Keep registration/attachment order stable.
    return result;
  }

  function getRegisteredEncryptedImageMessageId(candidate) {
    const id = String(candidate || '');
    if (!/^\d{17,20}$/.test(id)) return null;

    for (const meta of EncryptedAttachmentDownloads.values()) {
      if (String(meta.messageId || '') === id) {
        return id;
      }
    }

    return null;
  }

  function findRegisteredEncryptedImageMessageIdInValue(value, depth = 0, seen = null) {
    if (value == null || depth > 4) return null;

    if (typeof value === 'string' || typeof value === 'number') {
      return getRegisteredEncryptedImageMessageId(value);
    }

    if (typeof value !== 'object') return null;

    if (!seen) seen = new Set();
    if (seen.has(value)) return null;
    seen.add(value);

    const directId = getRegisteredEncryptedImageMessageId(value.id);
    if (directId) {
      // Prefer objects that actually resemble Discord message data, but the
      // registry match itself is already unique enough to be safe.
      if (
        'attachments' in value ||
        'content' in value ||
        'channel_id' in value ||
        'channelId' in value ||
        'author' in value
      ) {
        return directId;
      }
    }

    const directCandidates = [
      value.message,
      value.targetMessage,
      value.contextMessage,
      value.referencedMessage,
      value.item,
      value.record,
      value.data,
    ];

    for (const candidate of directCandidates) {
      const found = findRegisteredEncryptedImageMessageIdInValue(
        candidate,
        depth + 1,
        seen
      );
      if (found) return found;
    }

    // Scan a small number of prop values. Avoid React children/owners/functions
    // to keep this bounded and prevent expensive walks on large render trees.
    let scanned = 0;
    for (const [key, child] of Object.entries(value)) {
      if (scanned >= 30) break;
      if (
        key === 'children' ||
        key === '_owner' ||
        key === 'return' ||
        key === 'child' ||
        key === 'sibling' ||
        typeof child === 'function'
      ) {
        continue;
      }

      scanned++;
      const found = findRegisteredEncryptedImageMessageIdInValue(
        child,
        depth + 1,
        seen
      );
      if (found) return found;
    }

    return null;
  }

  function getMessageIdFromContextMenuReactTarget(target) {
    if (!target || !(target instanceof Element)) return null;

    let fiber = null;
    try {
      fiber = BdApi?.ReactUtils?.getInternalInstance?.(target);
    } catch (_) {}

    let current = fiber;
    const seenFibers = new Set();

    for (let depth = 0; current && depth < 45; depth++) {
      if (seenFibers.has(current)) break;
      seenFibers.add(current);

      const sources = [
        current.memoizedProps,
        current.pendingProps,
        current.stateNode?.props,
      ];

      for (const source of sources) {
        const found =
          findRegisteredEncryptedImageMessageIdInValue(source);
        if (found) return found;
      }

      current = current.return;
    }

    return null;
  }

  function getMessageIdFromContextMenuTarget(target) {
    if (!target || !(target instanceof Element)) return null;

    // 1) React Fiber is the most reliable source on current Discord builds.
    const reactMessageId =
      getMessageIdFromContextMenuReactTarget(target);
    if (reactMessageId) return reactMessageId;

    // 2) Fall back to DOM attributes. Discord changes class names frequently,
    // so inspect common message/list attributes without depending on CSS names.
    let node = target;
    for (
      let depth = 0;
      node && depth < 20;
      depth++, node = node.parentElement
    ) {
      const values = [
        node.id,
        node.getAttribute?.('data-list-item-id'),
        node.getAttribute?.('aria-labelledby'),
        node.getAttribute?.('data-message-id'),
      ].filter(Boolean);

      for (const value of values) {
        const snowflakes = String(value).match(/\d{17,20}/g) || [];
        for (const candidate of snowflakes.reverse()) {
          const found =
            getRegisteredEncryptedImageMessageId(candidate);
          if (found) return found;
        }
      }
    }

    // 3) Attachment-link fallback for non-image attachment layouts.
    node = target;
    for (
      let depth = 0;
      node && depth < 16;
      depth++, node = node.parentElement
    ) {
      const anchors = node.querySelectorAll?.('a[href]') || [];
      for (const anchor of anchors) {
        const meta = findEncryptedAttachmentDownloadForHref(
          anchor.getAttribute('href') || anchor.href || ''
        );
        if (meta?.messageId) {
          return String(meta.messageId);
        }
      }
    }

    return null;
  }

  function getEncryptedAttachmentKind(meta) {
    if (!meta?.filename) return 'file';

    const match = extensionRegex.exec(meta.filename);
    if (match == null) return 'file';

    const mediaType = mediaTypes[match[1].toLowerCase()];
    if (mediaType === 'img') return 'image';
    if (mediaType === 'video') return 'video';
    return 'file';
  }

  async function downloadEncryptedImageFromContextMenu(meta) {
    if (!meta) return;

    gifResolverLog('attachment', 'attachment-context-menu:download-start', {
      id: meta.id,
      filename: meta.filename,
      messageId: meta.messageId,
    });

    try {
      await Discord.window.SdcDecryptDl(
        meta.filename,
        meta.keyHash,
        meta.encryptedUrl
      );

      try {
        BdApi?.UI?.showToast?.(
          `${meta.filename} téléchargé et déchiffré`,
          { type: 'success' }
        );
      } catch (_) {}

      gifResolverLog('attachment', 'attachment-context-menu:download-success', {
        id: meta.id,
        filename: meta.filename,
        messageId: meta.messageId,
      });
    } catch (error) {
      try {
        BdApi?.UI?.showToast?.(
          `Échec du téléchargement de ${meta.filename}`,
          { type: 'error' }
        );
      } catch (_) {}

      gifResolverWarn('attachment', 'attachment-context-menu:download-failed', {
        id: meta.id,
        filename: meta.filename,
        messageId: meta.messageId,
        message: error?.message || String(error),
      });
    }
  }

  function appendEncryptedImageContextMenuGroup(menuTree, metas) {
    if (!menuTree?.props || !Array.isArray(metas) || metas.length === 0)
      return false;

    const ContextMenu = BdApi?.ContextMenu;
    if (!ContextMenu?.buildMenuChildren) return false;

    let menuItem;

    if (metas.length === 1) {
      const meta = metas[0];
      menuItem = {
        type: 'item',
        id: 'sdc-download-encrypted-image',
        label:
          getEncryptedAttachmentKind(meta) === 'image'
            ? 'Télécharger l’image déchiffrée'
            : getEncryptedAttachmentKind(meta) === 'video'
              ? 'Télécharger la vidéo déchiffrée'
              : 'Télécharger le fichier déchiffré',
        action: () => downloadEncryptedImageFromContextMenu(meta),
      };
    } else {
      menuItem = {
        type: 'submenu',
        id: 'sdc-download-encrypted-images',
        label: 'Télécharger les pièces jointes déchiffrées',
        items: metas.map((meta, index) => ({
          type: 'item',
          id: `sdc-download-encrypted-image-${index}`,
          label: meta.filename || `Image ${index + 1}`,
          action: () => downloadEncryptedImageFromContextMenu(meta),
        })),
      };
    }

    const built = ContextMenu.buildMenuChildren([
      {
        type: 'group',
        items: [menuItem],
      },
    ]);

    if (!built?.length) return false;

    const children = menuTree.props.children;

    if (Array.isArray(children)) {
      // Put SDC's download action just before the final destructive/utility
      // group when possible. This keeps it visually close to Discord's own
      // message actions without modifying their components.
      const insertAt = Math.max(0, children.length - 1);
      children.splice(insertAt, 0, ...built);
    } else if (children != null) {
      menuTree.props.children = [children, ...built];
    } else {
      menuTree.props.children = built;
    }

    return true;
  }

  function isLikelyDiscordMessageActionsMenu(menu) {
    if (!menu || !(menu instanceof Element)) return false;
    if (menu.getAttribute('role') !== 'menu') return false;

    const text = String(menu.innerText || '').toLowerCase();

    // Current Discord UI strings + a few French equivalents. We only need
    // enough signal to distinguish the message actions popover from reactions,
    // profile menus, channel menus, etc.
    const signals = [
      'copy message link',
      'delete message',
      'mark unread',
      'speak message',
      'copy text',
      'reply',
      'forward',
      'copier le lien du message',
      'supprimer le message',
      'marquer comme non lu',
      'copier le texte',
      'répondre',
      'transférer',
    ];

    let score = 0;
    for (const signal of signals) {
      if (text.includes(signal)) score++;
      if (score >= 2) return true;
    }

    // Structural fallback: a real message actions menu generally contains
    // several menuitems. Do not accept it unless we also see at least one
    // message-ish action term.
    const items = menu.querySelectorAll('[role="menuitem"]');
    return (
      items.length >= 5 &&
      /\b(reply|forward|message|unread|répondre|transférer)\b/i.test(text)
    );
  }

  function getVisibleDiscordMessageActionsMenus() {
    const menus = Array.from(document.querySelectorAll('[role="menu"]'));

    return menus.filter((menu) => {
      const rect = menu.getBoundingClientRect?.();
      if (
        !rect ||
        rect.width <= 0 ||
        rect.height <= 0 ||
        rect.bottom < 0 ||
        rect.right < 0 ||
        rect.top > window.innerHeight ||
        rect.left > window.innerWidth
      ) {
        return false;
      }

      return isLikelyDiscordMessageActionsMenu(menu);
    });
  }

  function replaceClonedDiscordMenuItemLabel(item, label) {
    const walker = document.createTreeWalker(
      item,
      NodeFilter.SHOW_TEXT
    );

    let node;
    let best = null;

    while ((node = walker.nextNode())) {
      const value = String(node.nodeValue || '').trim();
      if (!value) continue;

      if (best == null || value.length > best.value.length) {
        best = { node, value };
      }
    }

    if (best) {
      best.node.nodeValue = label;
      return true;
    }

    return false;
  }

  function replaceClonedDiscordMenuItemIcon(item) {
    const svg = item.querySelector?.('svg');
    if (!svg) return;

    try {
      svg.setAttribute('viewBox', '0 0 24 24');
      svg.setAttribute('aria-hidden', 'true');
      svg.innerHTML =
        '<path fill="currentColor" d="M11 3a1 1 0 0 1 2 0v10.586l3.293-3.293a1 1 0 1 1 1.414 1.414l-5 5a1 1 0 0 1-1.414 0l-5-5a1 1 0 1 1 1.414-1.414L11 13.586V3Zm-6 16a1 1 0 0 1 1-1h12a1 1 0 1 1 0 2H6a1 1 0 0 1-1-1Z"></path>';
    } catch (_) {}
  }

  function stripDuplicateDomIds(root) {
    if (!root || !(root instanceof Element)) return;
    root.removeAttribute('id');
    for (const child of root.querySelectorAll('[id]')) {
      child.removeAttribute('id');
    }
  }

  function closeEncryptedImageOverflowMenu(menu) {
    try {
      document.dispatchEvent(
        new KeyboardEvent('keydown', {
          key: 'Escape',
          code: 'Escape',
          keyCode: 27,
          which: 27,
          bubbles: true,
          cancelable: true,
        })
      );
    } catch (_) {}

    // Fallback for builds where Escape is handled on window.
    try {
      window.dispatchEvent(
        new KeyboardEvent('keydown', {
          key: 'Escape',
          code: 'Escape',
          bubbles: true,
          cancelable: true,
        })
      );
    } catch (_) {}
  }

  function buildEncryptedImageOverflowMenuItem(
    template,
    meta,
    index,
    total,
    menu
  ) {
    const item = template.cloneNode(true);
    stripDuplicateDomIds(item);

    item.dataset.sdcEncryptedImageDownloadMenuItem = meta.id;
    item.removeAttribute('aria-disabled');
    item.setAttribute('role', 'menuitem');
    item.setAttribute('tabindex', '-1');

    let label;
    if (total === 1) {
      const kind = getEncryptedAttachmentKind(meta);
      label =
        kind === 'image'
          ? 'Télécharger l’image déchiffrée'
          : kind === 'video'
            ? 'Télécharger la vidéo déchiffrée'
            : 'Télécharger le fichier déchiffré';
    } else {
      label = `Télécharger ${meta.filename}`;
    }

    replaceClonedDiscordMenuItemLabel(item, label);
    replaceClonedDiscordMenuItemIcon(item);

    item.addEventListener(
      'click',
      (event) => {
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation();

        encryptedImageOverflowSuppressUntil = Date.now() + 500;
        closeEncryptedImageOverflowMenu(menu);

        void downloadEncryptedImageFromContextMenu(meta);
      },
      true
    );

    item.addEventListener(
      'keydown',
      (event) => {
        if (event.key !== 'Enter' && event.key !== ' ') return;

        event.preventDefault();
        event.stopPropagation();

        encryptedImageOverflowSuppressUntil = Date.now() + 500;
        closeEncryptedImageOverflowMenu(menu);

        void downloadEncryptedImageFromContextMenu(meta);
      },
      true
    );

    return item;
  }

  function injectEncryptedImageOverflowMenu(menu, pending) {
    if (!menu || !pending) return false;

    if (menu.dataset.sdcEncryptedImageDownloadMenu === '1') {
      return true;
    }

    const metas = getEncryptedAttachmentDownloadsForMessage(
      pending.messageId
    );
    if (!metas.length) return false;

    const items = Array.from(
      menu.querySelectorAll('[role="menuitem"]')
    );
    if (!items.length) return false;

    const normalizedText = (item) =>
      String(item.innerText || '').trim().toLowerCase();

    // Prefer cloning a neutral, ordinary message action to inherit Discord's
    // exact classes/layout. Avoid Delete Message because it carries danger
    // styling.
    const template =
      items.find((item) =>
        /copy message link|speak message|mark unread|copy text|copier le lien du message|marquer comme non lu|copier le texte/i.test(
          normalizedText(item)
        )
      ) ||
      items.find(
        (item) =>
          !/delete message|supprimer le message/i.test(
            normalizedText(item)
          )
      );

    if (!template) return false;

    const deleteItem = items.find((item) =>
      /delete message|supprimer le message/i.test(
        normalizedText(item)
      )
    );

    let parent = null;
    let reference = null;

    if (deleteItem?.parentElement) {
      parent = deleteItem.parentElement;
      reference = deleteItem;
    } else if (template.parentElement) {
      parent = template.parentElement;
      reference = template.nextSibling;
    }

    if (!parent) return false;

    menu.dataset.sdcEncryptedImageDownloadMenu = '1';

    metas.forEach((meta, index) => {
      const item = buildEncryptedImageOverflowMenuItem(
        template,
        meta,
        index,
        metas.length,
        menu
      );

      parent.insertBefore(item, reference);
    });

    gifResolverLog(
      'attachment',
      'attachment-overflow-menu:injected',
      {
        messageId: pending.messageId,
        count: metas.length,
        filenames: metas.map((meta) => meta.filename),
      }
    );

    return true;
  }

  function scanEncryptedImageOverflowMenu() {
    const pending = encryptedImageOverflowPending;
    if (!pending) return;

    if (Date.now() > pending.expiresAt) {
      gifResolverLog(
        'attachment',
        'attachment-overflow-menu:expired',
        { messageId: pending.messageId }
      );
      encryptedImageOverflowPending = null;
      return;
    }

    const menus = getVisibleDiscordMessageActionsMenus();
    if (!menus.length) return;

    // The menu opened most recently is normally the last portal menu in DOM.
    // If several are visible, prefer the one nearest to the click position.
    let menu = menus[menus.length - 1];

    if (
      Number.isFinite(pending.clientX) &&
      Number.isFinite(pending.clientY) &&
      menus.length > 1
    ) {
      let bestDistance = Infinity;

      for (const candidate of menus) {
        const rect = candidate.getBoundingClientRect();
        const x = Math.max(
          rect.left,
          Math.min(pending.clientX, rect.right)
        );
        const y = Math.max(
          rect.top,
          Math.min(pending.clientY, rect.bottom)
        );
        const dx = x - pending.clientX;
        const dy = y - pending.clientY;
        const distance = dx * dx + dy * dy;

        if (distance < bestDistance) {
          bestDistance = distance;
          menu = candidate;
        }
      }
    }

    if (injectEncryptedImageOverflowMenu(menu, pending)) {
      encryptedImageOverflowPending = null;
    }
  }

  function armEncryptedImageOverflowMenu(event) {
    if (Date.now() < encryptedImageOverflowSuppressUntil) return;

    const target =
      event?.target instanceof Element ? event.target : null;
    if (!target) return;

    const button = target.closest(
      'button,[role="button"]'
    );
    if (!button) return;

    const messageId =
      getMessageIdFromContextMenuTarget(button);
    if (!messageId) return;

    const metas =
      getEncryptedAttachmentDownloadsForMessage(messageId);
    if (!metas.length) return;

    const ariaLabel = String(
      button.getAttribute('aria-label') ||
        button.getAttribute('data-tooltip-text') ||
        button.getAttribute('data-text-variant') ||
        ''
    ).trim();

    const hasPopup =
      button.getAttribute('aria-haspopup') === 'menu';

    const likelyMoreButton =
      hasPopup ||
      /more|plus|options|actions|autres|menu/i.test(
        ariaLabel
      );

    // Discord's three-dot action normally advertises a menu or "More". Do not
    // arm for ordinary Reply/Reaction buttons unless the build omits all menu
    // semantics and the icon button has no text at all.
    const text = String(button.innerText || '').trim();
    if (
      !likelyMoreButton &&
      (ariaLabel || text)
    ) {
      return;
    }

    encryptedImageOverflowPending = {
      messageId,
      clientX: Number(event.clientX),
      clientY: Number(event.clientY),
      expiresAt: Date.now() + 1800,
    };

    gifResolverLog(
      'attachment',
      'attachment-overflow-menu:armed',
      {
        messageId,
        ariaLabel: ariaLabel || null,
        hasPopup,
        filenames: metas.map((meta) => meta.filename),
      }
    );

    // Depending on React scheduling, the portal can be mounted synchronously,
    // on the next microtask, or on a later frame.
    queueMicrotask(scanEncryptedImageOverflowMenu);
    setTimeout(scanEncryptedImageOverflowMenu, 0);
    setTimeout(scanEncryptedImageOverflowMenu, 40);
    setTimeout(scanEncryptedImageOverflowMenu, 120);
    setTimeout(scanEncryptedImageOverflowMenu, 300);
  }

  function installEncryptedImageContextMenu() {
    if (
      encryptedImageOverflowMenuObserver != null ||
      encryptedImageOverflowPointerHandler != null
    ) {
      return true;
    }

    try {
      // The three-dot message menu is a click popover, not a
      // CONTEXT_MENU_OPEN menu. Observe the actual DOM portal instead.
      encryptedImageOverflowPointerHandler =
        armEncryptedImageOverflowMenu;

      document.addEventListener(
        'pointerdown',
        encryptedImageOverflowPointerHandler,
        true
      );

      encryptedImageOverflowMenuObserver =
        new MutationObserver((mutations) => {
          if (!encryptedImageOverflowPending) return;

          for (const mutation of mutations) {
            if (
              mutation.type === 'childList' &&
              mutation.addedNodes.length
            ) {
              scanEncryptedImageOverflowMenu();
              break;
            }
          }
        });

      encryptedImageOverflowMenuObserver.observe(
        document.body || document.documentElement,
        {
          childList: true,
          subtree: true,
        }
      );

      gifResolverLog(
        'attachment',
        'attachment-overflow-menu:installed',
        {
          mode: 'three-dot-popover-dom',
        }
      );

      return true;
    } catch (error) {
      gifResolverWarn(
        'attachment',
        'attachment-overflow-menu:install-failed',
        {
          message: error?.message || String(error),
          stack: error?.stack,
        }
      );

      return false;
    }
  }

  function uninstallEncryptedImageContextMenu() {
    if (encryptedImageOverflowPointerHandler != null) {
      try {
        document.removeEventListener(
          'pointerdown',
          encryptedImageOverflowPointerHandler,
          true
        );
      } catch (_) {}
    }

    encryptedImageOverflowPointerHandler = null;

    if (encryptedImageOverflowMenuObserver != null) {
      try {
        encryptedImageOverflowMenuObserver.disconnect();
      } catch (_) {}
    }

    encryptedImageOverflowMenuObserver = null;
    encryptedImageOverflowPending = null;

    // Clean up the old v19/v20 ContextMenu patch if this userscript was
    // hot-reloaded over a previous version in the same Discord process.
    if (typeof encryptedImageContextMenuUnpatch === 'function') {
      try {
        encryptedImageContextMenuUnpatch();
      } catch (_) {}
    }
    encryptedImageContextMenuUnpatch = null;
  }

  function getEncryptedAttachmentDownloadIcon() {
    return `
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M12 3v11"></path>
        <path d="m7.5 10 4.5 4.5 4.5-4.5"></path>
        <path d="M5 19h14"></path>
      </svg>`;
  }

  function getEncryptedAttachmentSpinner() {
    return '<span class="sdc-attachment-download-spinner"></span>';
  }

  function findEncryptedAttachmentCard(anchor) {
    const preferred = [
      '[class*="fileWrapper"]',
      '[class*="nonVisualMediaItem"]',
      '[class*="attachment"]',
      '[class*="file__"]',
      '[class^="file_"]',
    ];

    for (const selector of preferred) {
      const card = anchor.closest?.(selector);
      if (!card) continue;
      const rect = card.getBoundingClientRect?.();
      if (
        !rect ||
        (rect.width >= 140 && rect.height >= 38 && rect.height <= 220)
      ) {
        return card;
      }
    }

    let node = anchor.parentElement;
    let fallback = node;
    for (let i = 0; node && i < 8; i++, node = node.parentElement) {
      const rect = node.getBoundingClientRect?.();
      if (
        rect &&
        rect.width >= 180 &&
        rect.height >= 40 &&
        rect.height <= 180
      ) {
        fallback = node;
      }
    }
    return fallback;
  }

  async function performEncryptedAttachmentDownload(meta, button) {
    if (!meta || !button || button.dataset.sdcBusy === '1') return;

    button.dataset.sdcBusy = '1';
    button.disabled = true;
    button.classList.add('sdc-attachment-download-loading');
    button.innerHTML = getEncryptedAttachmentSpinner();
    button.title = `Déchiffrement de ${meta.filename}…`;

    try {
      await Discord.window.SdcDecryptDl(
        meta.filename,
        meta.keyHash,
        meta.encryptedUrl
      );

      button.classList.remove('sdc-attachment-download-loading');
      button.classList.add('sdc-attachment-download-success');
      button.textContent = '✓';
      button.title = `${meta.filename} téléchargé`;

      setTimeout(() => {
        if (!button.isConnected) return;
        button.classList.remove('sdc-attachment-download-success');
        button.innerHTML = getEncryptedAttachmentDownloadIcon();
        button.title = `Télécharger et déchiffrer ${meta.filename}`;
      }, 1400);
    } catch (error) {
      button.classList.remove('sdc-attachment-download-loading');
      button.classList.add('sdc-attachment-download-error');
      button.textContent = '!';
      button.title =
        `Échec du téléchargement de ${meta.filename}: ` +
        (error?.message || String(error));

      setTimeout(() => {
        if (!button.isConnected) return;
        button.classList.remove('sdc-attachment-download-error');
        button.innerHTML = getEncryptedAttachmentDownloadIcon();
        button.title = `Télécharger et déchiffrer ${meta.filename}`;
      }, 2500);
    } finally {
      button.disabled = false;
      button.dataset.sdcBusy = '0';
    }
  }

  function encryptedAttachmentAnchorClick(event) {
    const id = this.dataset.sdcEncryptedAttachmentId;
    const meta = EncryptedAttachmentDownloads.get(id);
    if (!meta) return;

    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation?.();

    const card = findEncryptedAttachmentCard(this);
    const escapedId =
      typeof CSS !== 'undefined' && CSS.escape
        ? CSS.escape(id)
        : id.replace(/[^a-zA-Z0-9_-]/g, '\\$&');
    const button =
      card?.querySelector?.(
        `.sdc-attachment-download-btn[data-sdc-download-id="${escapedId}"]`
      ) || null;

    if (button) {
      performEncryptedAttachmentDownload(meta, button);
    } else {
      // Fallback if Discord changed the attachment DOM before the observer
      // managed to inject the visual button.
      const virtualButton = document.createElement('button');
      performEncryptedAttachmentDownload(meta, virtualButton);
    }
  }

  function ensureEncryptedAttachmentDownloadButton(anchor, meta) {
    if (!anchor || !meta) return;

    // IMPORTANT: Patcher.observer watches anchor attributes. Reassigning the
    // same data-sdc-* value on every observer callback creates a self-sustaining
    // MutationObserver loop and can freeze/crash Discord.
    if (anchor.dataset.sdcEncryptedAttachmentId !== meta.id) {
      anchor.dataset.sdcEncryptedAttachmentId = meta.id;
    }

    if (anchor.dataset.sdcEncryptedAttachmentBound !== '1') {
      anchor.dataset.sdcEncryptedAttachmentBound = '1';
      gifResolverLog('attachment', 'download:anchor-bound', {
        id: meta.id,
        filename: meta.filename,
        messageId: meta.messageId,
      });
      anchor.addEventListener(
        'click',
        encryptedAttachmentAnchorClick,
        true
      );
    }

    const card = findEncryptedAttachmentCard(anchor);
    if (!card) return;

    if (!card.classList.contains('sdc-attachment-download-card')) {
      card.classList.add('sdc-attachment-download-card');
    }

    const escapedId =
      typeof CSS !== 'undefined' && CSS.escape
        ? CSS.escape(meta.id)
        : meta.id.replace(/[^a-zA-Z0-9_-]/g, '\\$&');
    let button = card.querySelector(
      `.sdc-attachment-download-btn[data-sdc-download-id="${escapedId}"]`
    );

    if (!button) {
      // Remove stale SDC buttons if React reused the same attachment card.
      for (const stale of card.querySelectorAll(
        '.sdc-attachment-download-btn'
      )) {
        stale.remove();
      }

      button = document.createElement('button');
      button.type = 'button';
      button.className = 'sdc-attachment-download-btn';
      button.dataset.sdcDownloadId = meta.id;
      button.innerHTML = getEncryptedAttachmentDownloadIcon();
      button.title = `Télécharger et déchiffrer ${meta.filename}`;
      button.setAttribute(
        'aria-label',
        `Télécharger et déchiffrer ${meta.filename}`
      );

      button.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation?.();

        const currentMeta = EncryptedAttachmentDownloads.get(
          button.dataset.sdcDownloadId
        );
        if (currentMeta) {
          performEncryptedAttachmentDownload(currentMeta, button);
        }
      });

      card.appendChild(button);

      gifResolverLog('attachment', 'download:button-injected', {
        id: meta.id,
        filename: meta.filename,
        messageId: meta.messageId,
      });
    }
  }

  function tryBindEncryptedAttachmentLink(anchor) {
    if (!anchor || anchor.tagName !== 'A') return false;
    const href =
      anchor.getAttribute('href') ||
      anchor.href ||
      '';
    const meta = findEncryptedAttachmentDownloadForHref(href);
    if (!meta) return false;

    ensureEncryptedAttachmentDownloadButton(anchor, meta);
    return true;
  }

  function scanEncryptedAttachmentDownloadLinks(root = document) {
    if (!root?.querySelectorAll) return;

    if (root.tagName === 'A') {
      tryBindEncryptedAttachmentLink(root);
    }

    for (const anchor of root.querySelectorAll('a[href]')) {
      tryBindEncryptedAttachmentLink(anchor);
    }
  }

  let encryptedAttachmentScanTimer = null;
  function scheduleEncryptedAttachmentDownloadScan() {
    if (encryptedAttachmentScanTimer != null) return;
    encryptedAttachmentScanTimer = setTimeout(() => {
      encryptedAttachmentScanTimer = null;
      scanEncryptedAttachmentDownloadLinks();
    }, 0);
  }

  function cleanupEncryptedAttachmentDownloadUi() {
    if (encryptedAttachmentScanTimer != null) {
      clearTimeout(encryptedAttachmentScanTimer);
      encryptedAttachmentScanTimer = null;
    }

    for (const anchor of document.querySelectorAll(
      'a[data-sdc-encrypted-attachment-bound="1"]'
    )) {
      anchor.removeEventListener(
        'click',
        encryptedAttachmentAnchorClick,
        true
      );
      delete anchor.dataset.sdcEncryptedAttachmentBound;
      delete anchor.dataset.sdcEncryptedAttachmentId;
    }

    for (const button of document.querySelectorAll(
      '.sdc-attachment-download-btn'
    )) {
      button.remove();
    }

    for (const card of document.querySelectorAll(
      '.sdc-attachment-download-card'
    )) {
      card.classList.remove('sdc-attachment-download-card');
    }

    EncryptedAttachmentDownloads.clear();
    EncryptedAttachmentDownloadPaths.clear();
  }

  async function decryptAttachment(
    key,
    keyHash,
    message,
    attachment,
    channelConfig
  ) {
    let encryptedFilename = Utils.Base64urlToBytes(attachment.filename);
    let filename;
    try {
      filename = await Utils.AesDecryptString(key, encryptedFilename, 'filename');
    } catch (e) {
      filename = 'file';
    }

    attachment.filename = filename;
    //attachment.size = fileBuffer.byteLength;
    let encryptedUrl = attachment.url;

    let match = extensionRegex.exec(filename);
    let mediaType;
    if (match != null) mediaType = mediaTypes[match[1].toLowerCase()];
    const encryptedDownloadId =
      registerEncryptedAttachmentDownload(
        filename,
        keyHash,
        encryptedUrl,
        message?.id,
        message?.channel_id
      );

    if (mediaType == null) {
      // Keep Discord's real CDN URL in the attachment object. Modern Discord
      // filters javascript: URLs, which is why the old SdcDecryptDl link could
      // render as an unusable/non-downloadable attachment.
      attachment.url = encryptedUrl;
      attachment.__sdcEncryptedDownloadId = encryptedDownloadId;
      delete attachment.proxy_url;
      message.attachments.push(attachment);
      return;
    }

    let spoiler = filename.startsWith('SPOILER_');
    let placeholder;
    let isVideo = false;
    if (mediaType === 'img') {
      placeholder = spoiler
        ? {
          type: 'rich',
          thumbnail: {
            url: 'data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw==',
            width: 1,
            height: 80,
          },
        }
        : {
          type: 'image',
          thumbnail: {
            url: 'data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw==',
            width: 1,
            height: 300,
          },
        };
    } else {
      isVideo = true;
      placeholder = {
        type: 'image',
        title: 'Loading...',
        thumbnail: {
          url: 'data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw==',
          width: 400,
          height: 300,
        },
      };
    }
    message.embeds.push(placeholder);

    const downloadAndProcess = async () => {
      if (downloadLocked) {
        await new Promise((resolve) =>
          downloadLocks.push([message.channel_id, resolve])
        );
      } else downloadLocked = true;

      let encryptedFileBuffer;
      try {
        encryptedFileBuffer = await Utils.DownloadFile(encryptedUrl);
      } catch (e) {
        Utils.Error('File download faled');
        return;
      } finally {
        if (downloadLocks.length !== 0) {
          let unlockNext;
          let importantDlIndex = downloadLocks.findIndex(
            ([channelId]) => channelId === Cache.channelId
          );
          unlockNext =
            importantDlIndex > 0
              ? downloadLocks.splice(importantDlIndex, 1)[0][1]
              : downloadLocks.shift()[1];
          unlockNext();
        } else downloadLocked = false;
      }

      let fileBuffer = await Utils.AesDecrypt(
        await Utils.GetKeyByHash(keyHash),
        encryptedFileBuffer
      );
      let blob = new File([fileBuffer], filename);
      let bloburl = `${URL.createObjectURL(
        new File([fileBuffer], filename)
      )}#${filename}`;
      let url;
      // Use the blob URL itself for media. The old javascript:SdcDownloadUrl
      // scheme is filtered by current Discord builds.
      let downloadUrl = bloburl;

      let width;
      let height;
      if (FixedCsp || isVideo) {
        url = bloburl;
        let tmpMedia = document.createElement(mediaType);
        if (isVideo) {
          await new Promise((resolve) => {
            tmpMedia.onloadeddata = () => {
              tmpMedia.ontimeupdate = resolve;
              tmpMedia.currentTime = 0;
            };
            tmpMedia.src = url;
          });
          width = tmpMedia.videoWidth;
          height = tmpMedia.videoHeight;
          let canvas = document.createElement('canvas');
          let ctx = canvas.getContext('2d');

          let coverImageUrl;
          if (FixedCsp) {
            canvas.width = width;
            canvas.height = height;
            if (spoiler) ctx.filter = 'blur(50px)';
            ctx.drawImage(tmpMedia, 0, 0);
            coverImageUrl =
              URL.createObjectURL(
                await new Promise((resolve) => canvas.toBlob(resolve))
              ) + '#';
          } else {
            let posterWidth = width;
            let posterHeight = height;
            if (width > 800 || height > 600) {
              if (width / 800 > height / 600) {
                posterWidth = 800;
                posterHeight = Math.round(height / (width / 800));
              } else {
                posterWidth = Math.round(width / (height / 600));
                posterHeight = 600;
              }
            }
            canvas.width = posterWidth;
            canvas.height = posterHeight;
            if (spoiler) ctx.filter = 'blur(50px)';
            ctx.drawImage(tmpMedia, 0, 0, posterWidth, posterHeight);
            coverImageUrl = canvas.toDataURL('image/webp', 0.6);
          }

          Object.assign(placeholder, {
            type: 'video',
            //color: BaseColorInt,
            url: '/#' + downloadUrl, //ugly hack because Discord now filters urls here
            title: 'Download',
            thumbnail: { url: coverImageUrl, width, height }, //for some reason chromium seems to replace the cover image sadly
            video: { url: downloadUrl, proxy_url: url, width, height },
          });
        } else {
          await new Promise((resolve) => {
            tmpMedia.onload = resolve;
            tmpMedia.src = url;
          });
          width = tmpMedia.width;
          height = tmpMedia.height;

          Object.assign(placeholder, {
            type: spoiler ? 'rich' : 'image',
            url: downloadUrl,
            thumbnail: {
              url: downloadUrl,
              proxy_url: url,
              width,
              height,
            },
          });
        }
      } else {
        let id = Patcher.FreeImageId++;
        url = `https://media.discordapp.net/attachments/479272118538862592/479272171944804377/keylogo.png#${id}`;
        let bitmap = await createImageBitmap(blob); //resets image rotation it seems
        width = bitmap.width;
        height = bitmap.height;

        Patcher.Images[id] = blob;

        Object.assign(placeholder, {
          type: spoiler ? 'rich' : 'image',
          url: downloadUrl,
          thumbnail: {
            url: downloadUrl,
            proxy_url: url,
            width,
            height,
          },
        });
      }

      Discord.dispatch({ type: 'MESSAGE_UPDATE', message });

      /*if(message.channel_id !== Cache.channelId) return;
 
        let displayHeight = height;
        if(!spoiler || mediaType === 'video') {
            if(width > 400 || height > 300) { //image will be resized
                if(width / 400 > height / 300) { //scale by with
                    displayHeight = Math.round(height / (width / 400));
                }
                else { //scale by height
                    displayHeight = 300;
                }
            }
            if(displayHeight !== 300) scrollChat(300 - displayHeight);
        }
        else {
            if(width > 80 || height > 80) { //image will be resized
                if(width > height) {
                    displayHeight = Math.round(height / (width / 80));
                }
                else {
                    displayHeight = 80;
                }
            }
            if(displayHeight !== 80) scrollChat(80 - displayHeight);
        }*/
    };
    if (
      message.channel_id === Cache.channelId ||
      (channelConfig != null &&
        channelConfig.l /*lastseen*/ > Date.now() - InactiveChannelTime)
    )
      downloadAndProcess();
    else {
      let onChannelOpen = () => {
        downloadAndProcess();
        Utils.RemoveChannelSelectListener(message.channel_id, onChannelOpen);
      };
      Utils.AddChannelSelectListener(message.channel_id, onChannelOpen);
    }
  }

  const starttimeRegex = CONFIG.patterns.starttime;
  function createYoutubeEmbed(id, timequery) {
    let embedUrl = `https://youtube.com/embed/${id}`;
    if (timequery != null) {
      let time = timequery.split('=')[1];
      let timeMatch = starttimeRegex.exec(time);
      let t = 0;
      if (timeMatch[1] !== undefined) t += timeMatch[1] * 3600;
      if (timeMatch[2] !== undefined) t += timeMatch[2] * 60;
      if (timeMatch[3] !== undefined) t += parseInt(timeMatch[3]);
      if (t !== 0) time = t;
      embedUrl += '?start=' + time;
    }
    return {
      type: 'video',
      url: `https://youtube.com/watch?v=${id}`,
      thumbnail: {
        url: `https://i.ytimg.com/vi/${id}/maxresdefault.jpg`,
        width: 1280,
        height: 720,
      },
      video: { url: embedUrl, width: 1280, height: 720 },
    };
  }
  const youtubeRegex = CONFIG.patterns.youtube;
  function embedYoutube(message, url, queryString) {
    let match = youtubeRegex.exec(queryString);
    if (match != null)
      message.embeds.push(createYoutubeEmbed(match[1], match[2]));
  }
  const youtuRegex = CONFIG.patterns.youtu;
  function embedYoutu(message, url, queryString) {
    let match = youtuRegex.exec(queryString);
    if (match != null)
      message.embeds.push(createYoutubeEmbed(match[1], match[2]));
  }
  const imageRegex = CONFIG.patterns.image;
  function embedImage(message, url, queryString, forceImage) {
    if (!forceImage && !imageRegex.test(queryString)) return;

    let placeholder = {
      type: 'image',
      url,
      thumbnail: {
        url: 'data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw==',
        width: 1,
        height: 300,
      },
    };
    message.embeds.push(placeholder);
    let tmpimg = document.createElement('img');
    tmpimg.onload = () => {
      let width = tmpimg.width;
      let height = tmpimg.height;
      placeholder.thumbnail = { url, width, height };
      Discord.dispatch({ type: 'MESSAGE_UPDATE', message });

      /*if(message.channel_id === Cache.channelId) {
            let displayHeight = height;
            if(width > 400 || height > 300) {
                if(width / 400 > height / 300) {
                    displayHeight = Math.round(height / (width / 400));
                }
                else {
                    displayHeight = 300;
                }
            }
            if(displayHeight !== 300) scrollChat(300 - displayHeight);
        }*/
    };
    tmpimg.src = url;
  }

  // --------------------------------------------------------------------------
  // Rich GIF link support (v23)
  // --------------------------------------------------------------------------
  // Discord never sees the clear-text URL of an encrypted message, so its own
  // unfurler cannot resolve page-style GIF links. Keep that work isolated to a
  // strict Tenor/KLIPY allowlist and reuse the existing image renderer once a
  // trusted direct media URL has been found.
  const gifPageMediaCache = new Map();
  const gifPageMediaPending = new Map();
  const GIF_PAGE_CACHE_LIMIT = 150;
  const GIF_PAGE_POSITIVE_TTL = 24 * 60 * 60 * 1000;
  const GIF_PAGE_NEGATIVE_TTL = 2 * 60 * 1000;
  const GIF_RESOLVER_VERBOSE_LOGS = true;

  // Binary media cache used for providers whose CDN refuses or fails when the
  // Discord renderer loads the remote image directly. BdApi.Net.fetch runs
  // outside the page's normal image loading path; the bytes are then exposed
  // to Discord through a local blob: URL.
  const gifBlobMediaCache = new Map();
  const GIF_BLOB_CACHE_LIMIT = 40;
  const GIF_BLOB_MAX_BYTES = 25 * 1024 * 1024;

  function releaseGifBlobEntry(entry) {
    if (!entry?.blobUrl) return;
    try { URL.revokeObjectURL(entry.blobUrl); } catch (_) {}
  }

  function clearGifBlobMediaCache() {
    for (const entry of gifBlobMediaCache.values()) releaseGifBlobEntry(entry);
    gifBlobMediaCache.clear();
  }

  function cacheGifBlobMedia(mediaUrl, entry) {
    const previous = gifBlobMediaCache.get(mediaUrl);
    if (previous && previous.blobUrl !== entry?.blobUrl) releaseGifBlobEntry(previous);
    gifBlobMediaCache.delete(mediaUrl);
    gifBlobMediaCache.set(mediaUrl, entry);
    while (gifBlobMediaCache.size > GIF_BLOB_CACHE_LIMIT) {
      const firstKey = gifBlobMediaCache.keys().next().value;
      const first = gifBlobMediaCache.get(firstKey);
      gifBlobMediaCache.delete(firstKey);
      releaseGifBlobEntry(first);
    }
  }

  function inferGifMediaContentType(mediaUrl, headerValue) {
    const value = String(headerValue || '').split(';')[0].trim().toLowerCase();
    if (value.startsWith('image/')) return value;
    let pathname = '';
    try { pathname = new URL(mediaUrl).pathname.toLowerCase(); } catch (_) {}
    if (pathname.endsWith('.gif')) return 'image/gif';
    if (pathname.endsWith('.webp')) return 'image/webp';
    if (pathname.endsWith('.png')) return 'image/png';
    if (pathname.endsWith('.jpg') || pathname.endsWith('.jpeg')) return 'image/jpeg';
    if (pathname.endsWith('.avif')) return 'image/avif';
    return value || 'application/octet-stream';
  }

  async function fetchGifMediaAsBlobUrl(mediaUrl, provider, pageUrl) {
    if (provider === 'klipy') {
      let parsed;
      try { parsed = new URL(mediaUrl); } catch (_) {}
      if (
        !parsed ||
        parsed.protocol !== 'https:' ||
        !(
          parsed.hostname === 'klipy.com' ||
          parsed.hostname.endsWith('.klipy.com')
        ) ||
        parsed.pathname === '/' ||
        parsed.pathname.length < 3
      ) {
        throw new Error(`Invalid KLIPY media URL: ${mediaUrl}`);
      }
    }

    const cached = gifBlobMediaCache.get(mediaUrl);
    if (cached?.blobUrl) {
      gifResolverLog(provider, 'binary:cache-hit', {
        mediaUrl,
        blobUrl: cached.blobUrl,
        contentType: cached.contentType,
        bytes: cached.bytes,
      });
      return cached;
    }

    gifResolverLog(provider, 'binary:fetch', { mediaUrl, pageUrl });
    const headers = {
      Accept: 'image/avif,image/webp,image/apng,image/gif,image/*,*/*;q=0.8',
    };
    if (pageUrl) headers.Referer = pageUrl;

    const response = await BdApi.Net.fetch(mediaUrl, {
      method: 'GET',
      redirect: 'follow',
      timeout: 15000,
      headers,
    });

    const contentTypeHeader = response.headers?.get?.('content-type') || '';
    const contentLengthHeader = response.headers?.get?.('content-length') || null;
    const contentType = inferGifMediaContentType(mediaUrl, contentTypeHeader);

    gifResolverLog(provider, 'binary:response', {
      status: response.status,
      ok: response.ok,
      finalUrl: response.url,
      contentTypeHeader,
      contentType,
      contentLength: contentLengthHeader,
    });

    if (!response.ok) {
      throw new Error(`GIF media HTTP ${response.status}`);
    }
    if (!contentType.startsWith('image/')) {
      throw new Error(`Unexpected GIF media Content-Type: ${contentType}`);
    }

    const arrayBuffer = await response.arrayBuffer();
    const bytes = arrayBuffer.byteLength;
    gifResolverLog(provider, 'binary:downloaded', { mediaUrl, bytes, contentType });

    if (!bytes) throw new Error('GIF media response is empty');
    if (bytes > GIF_BLOB_MAX_BYTES) {
      throw new Error(`GIF media too large (${bytes} bytes)`);
    }

    const blob = new Blob([arrayBuffer], { type: contentType });
    const blobUrl = URL.createObjectURL(blob);
    const entry = { blobUrl, contentType, bytes, sourceUrl: mediaUrl };
    cacheGifBlobMedia(mediaUrl, entry);

    gifResolverLog(provider, 'binary:blob-created', {
      mediaUrl, blobUrl, contentType, bytes,
    });
    return entry;
  }

  function gifResolverLog(provider, stage, details) {
    if (!GIF_RESOLVER_VERBOSE_LOGS) return;
    const prefix = `[SDC][GIF][${String(provider || 'unknown').toUpperCase()}]`;
    if (details === undefined) console.log(prefix, stage);
    else console.log(prefix, stage, details);
  }

  function gifResolverWarn(provider, stage, details) {
    const prefix = `[SDC][GIF][${String(provider || 'unknown').toUpperCase()}]`;
    if (details === undefined) console.warn(prefix, stage);
    else console.warn(prefix, stage, details);
  }

  const KLIPY_API_KEY_STORAGE = 'SDC_KLIPY_API_KEY';
  let klipyMissingApiKeyLogged = false;

  function maskKlipyApiKey(value) {
    const key = String(value || '').trim();
    if (!key) return null;
    if (key.length <= 8) return '********';
    return key.slice(0, 4) + '…' + key.slice(-4);
  }

  function getKlipyApiKey() {
    try {
      return String(
        SavedLocalStorage?.getItem(KLIPY_API_KEY_STORAGE) || ''
      ).trim();
    } catch (_) {
      return '';
    }
  }

  function clearKlipyResolverCaches() {
    for (const key of Array.from(gifPageMediaCache.keys())) {
      if (String(key).startsWith('klipy:')) gifPageMediaCache.delete(key);
    }
    for (const key of Array.from(gifPageMediaPending.keys())) {
      if (String(key).startsWith('klipy:')) gifPageMediaPending.delete(key);
    }
  }

  function setKlipyApiKey(value) {
    const key = String(value || '').trim();
    try {
      if (!key) {
        SavedLocalStorage?.removeItem(KLIPY_API_KEY_STORAGE);
        clearKlipyResolverCaches();
        klipyMissingApiKeyLogged = false;
        gifResolverLog('klipy', 'api:key-cleared');
        return { configured: false };
      }

      SavedLocalStorage?.setItem(KLIPY_API_KEY_STORAGE, key);
      clearKlipyResolverCaches();
      klipyMissingApiKeyLogged = false;
      gifResolverLog('klipy', 'api:key-saved-but-unused-in-v16', {
        configured: true,
        masked: maskKlipyApiKey(key),
        mode: 'discord-native-unfurl',
      });
      return {
        configured: true,
        masked: maskKlipyApiKey(key),
      };
    } catch (error) {
      gifResolverWarn('klipy', 'api:key-save-failed', {
        message: error?.message || String(error),
      });
      return { configured: false, error: error?.message || String(error) };
    }
  }

  function exposeKlipyApiControl() {
    const control = {
      setKey: (key) => setKlipyApiKey(key),
      clearKey: () => setKlipyApiKey(''),
      status: () => {
        const key = getKlipyApiKey();
        return {
          configured: Boolean(key),
          masked: maskKlipyApiKey(key),
          storage: 'localStorage',
          endpoint: null,
          mode: 'discord-native-unfurl',
          apiKeyRequired: false,
        };
      },
      clearCache: () => {
        clearKlipyResolverCaches();
        gifResolverLog('klipy', 'cache:manual-clear');
        return true;
      },
    };

    try {
      Object.defineProperty(window, 'SDC_KLIPY_API', {
        value: control,
        writable: false,
        enumerable: false,
        configurable: true,
      });
    } catch (_) {
      try { window.SDC_KLIPY_API = control; } catch (_) {}
    }
  }

  exposeKlipyApiControl();

  function cacheGifPageMedia(cacheKey, mediaUrl) {
    if (gifPageMediaCache.size >= GIF_PAGE_CACHE_LIMIT) {
      const firstKey = gifPageMediaCache.keys().next().value;
      if (firstKey != null) gifPageMediaCache.delete(firstKey);
    }
    gifPageMediaCache.set(cacheKey, {
      mediaUrl: mediaUrl || null,
      expiresAt:
        Date.now() +
        (mediaUrl
          ? GIF_PAGE_POSITIVE_TTL
          : cacheKey.startsWith('klipy:')
            ? 30 * 1000
            : GIF_PAGE_NEGATIVE_TTL),
    });
  }

  function getCachedGifPageMedia(cacheKey) {
    const cached = gifPageMediaCache.get(cacheKey);
    if (!cached) return { hit: false, mediaUrl: null };
    if (cached.expiresAt <= Date.now()) {
      gifPageMediaCache.delete(cacheKey);
      return { hit: false, mediaUrl: null };
    }
    return { hit: true, mediaUrl: cached.mediaUrl };
  }

  function decodeHtmlUrl(value) {
    if (!value) return null;
    let decoded = String(value)
      .replace(/\\u003A/gi, ':')
      .replace(/\\u002F/gi, '/')
      .replace(/\\u0026/gi, '&')
      .replace(/\\u003D/gi, '=')
      .replace(/\\x3A/gi, ':')
      .replace(/\\x2F/gi, '/')
      .replace(/\\x26/gi, '&')
      .replace(/\\:/g, ':')
      .replace(/\\\//g, '/');
    try {
      const textarea = document.createElement('textarea');
      textarea.innerHTML = decoded;
      decoded = textarea.value;
    } catch (_) {
      decoded = decoded.replace(/&amp;/gi, '&');
    }

    // Next.js often percent-encodes the real media URL inside /_next/image?url=...
    // Decode a few layers, but stop as soon as decoding no longer changes it.
    for (let i = 0; i < 3; i++) {
      try {
        const next = decodeURIComponent(decoded);
        if (next === decoded) break;
        decoded = next;
      } catch (_) {
        break;
      }
    }
    return decoded;
  }

  function unwrapGifMediaUrl(value, provider, baseUrl) {
    let candidate = decodeHtmlUrl(value);
    if (!candidate) return null;

    for (let depth = 0; depth < 4; depth++) {
      let absolute;
      try {
        absolute = new URL(candidate, baseUrl || undefined).href;
      } catch (_) {
        return null;
      }

      if (isTrustedGifMediaUrl(absolute, provider)) return absolute;

      let parsed;
      try {
        parsed = new URL(absolute);
      } catch (_) {
        return null;
      }

      // Next/Image and similar proxy URLs carry the original asset as a query
      // parameter. Prefer that original URL rather than embedding the proxy.
      let nested = null;
      for (const key of [
        'url',
        'src',
        'image',
        'image_url',
        'media',
        'media_url',
        'original',
      ]) {
        const value = parsed.searchParams.get(key);
        if (value) {
          nested = value;
          break;
        }
      }

      if (!nested) return null;
      candidate = decodeHtmlUrl(nested);
      baseUrl = absolute;
    }

    return null;
  }

  function isTrustedGifMediaUrl(candidate, provider) {
    try {
      const parsed = new URL(candidate);
      if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return false;
      const host = parsed.hostname.toLowerCase();

      if (provider === 'tenor') {
        return (
          host === 'media.tenor.com' ||
          /^media\d+\.tenor\.com$/.test(host) ||
          host === 'c.tenor.com'
        );
      }

      if (provider === 'klipy') {
        // KLIPY currently uses several numbered CDN hosts (static, static2,
        // static3, ...), but the CDN root itself is NOT media. Require a real
        // asset path so values such as https://static2.klipy.com/ can never
        // win candidate selection.
        if (!/^static\d*\.klipy\.com$/.test(host)) return false;
        const path = parsed.pathname || '/';
        if (path === '/' || path.length < 5) return false;
        return (
          /^\/ii\//i.test(path) ||
          /\.(?:gif|webp|png|jpe?g|avif)(?:$|\?)/i.test(path + parsed.search)
        );
      }
    } catch (_) {}
    return false;
  }

  function scoreGifMediaUrl(candidate, provider, sourcePriority) {
    if (!isTrustedGifMediaUrl(candidate, provider)) return -1;
    let score = sourcePriority || 0;
    let parsed;
    try {
      parsed = new URL(candidate);
    } catch (_) {
      return -1;
    }
    const path = (parsed.pathname + parsed.search).toLowerCase();
    const host = parsed.hostname.toLowerCase();

    // Prefer animated image formats. PNG/JPEG remain valid fallbacks because
    // some providers expose only a poster in OpenGraph metadata.
    if (/\.gif(?:$|\?)/i.test(path)) score += 100;
    else if (/\.webp(?:$|\?)/i.test(path)) score += 95;
    else if (/\.(?:png|jpe?g)(?:$|\?)/i.test(path)) score += 45;
    else score += 30; // Tenor/KLIPY CDN URLs do not always carry extensions.

    if (provider === 'tenor') {
      if (host === 'media.tenor.com' || /^media\d+\.tenor\.com$/.test(host))
        score += 30;
      if (host === 'c.tenor.com') score += 25;
    } else if (provider === 'klipy') {
      if (/^static\d*\.klipy\.com$/.test(host)) score += 30;
      else if (host.endsWith('.klipy.com')) score += 20;
    }

    // Avoid obviously non-content assets when raw page data contains logos,
    // favicons or website chrome.
    if (/(?:logo|favicon|avatar|icon|sprite)/i.test(path)) score -= 80;
    return score;
  }

  function selectBestGifMediaUrl(candidates, provider) {
    let best = null;
    let bestScore = -1;
    for (const item of candidates) {
      const rawValue = item?.url || item;
      const absolute =
        unwrapGifMediaUrl(rawValue, provider, item?.baseUrl) ||
        (() => {
          try {
            return new URL(decodeHtmlUrl(rawValue), item?.baseUrl || undefined)
              .href;
          } catch (_) {
            return null;
          }
        })();
      if (!absolute) continue;

      const score = scoreGifMediaUrl(
        absolute,
        provider,
        Number(item?.priority) || 0
      );
      if (score > bestScore) {
        bestScore = score;
        best = absolute;
      }
    }
    if (provider === 'klipy' && best) {
      try {
        const parsed = new URL(best);
        if (
          /^static\d*\.klipy\.com$/i.test(parsed.hostname) &&
          (parsed.pathname === '/' || parsed.pathname.length < 5)
        ) {
          gifResolverWarn('klipy', 'candidate:rejected-cdn-root', { best });
          return null;
        }
      } catch (_) {}
    }
    return best;
  }

  function extractKlipyDirectAssetCandidates(rawText, pageUrl) {
    const candidates = [];
    if (!rawText) return candidates;

    // Next.js serializes URLs in several forms:
    //   https://static2.klipy.com/...
    //   https\://static2.klipy.com/...
    //   https:\/\/static2.klipy.com\/...
    //   https:\u002F\u002Fstatic2.klipy.com\u002F...
    // Normalize only a temporary copy used for URL discovery.
    let normalized = String(rawText)
      .replace(/\\u003A/gi, ':')
      .replace(/\\u002F/gi, '/')
      .replace(/\\x3A/gi, ':')
      .replace(/\\x2F/gi, '/')
      .replace(/\\:/g, ':')
      .replace(/\\\//g, '/')
      .replace(/&amp;/gi, '&');

    const addMatches = (regex, priority, source) => {
      for (const match of normalized.matchAll(regex)) {
        const url = match[0]
          .replace(/[\\]+$/g, '')
          .replace(/[),.;]+$/g, '');
        candidates.push({
          url,
          baseUrl: pageUrl,
          priority,
          source,
        });
      }
    };

    // Prefer actual GIFs first, then animated WebP/images.
    addMatches(
      /https?:\/\/static\d*\.klipy\.com\/ii\/[^\s"'<>\\]+?\.gif(?:\?[^\s"'<>\\]*)?/gi,
      320,
      'raw-static-gif'
    );
    addMatches(
      /https?:\/\/static\d*\.klipy\.com\/ii\/[^\s"'<>\\]+?\.webp(?:\?[^\s"'<>\\]*)?/gi,
      240,
      'raw-static-webp'
    );
    addMatches(
      /https?:\/\/static\d*\.klipy\.com\/ii\/[^\s"'<>\\]+?\.(?:png|jpe?g|avif)(?:\?[^\s"'<>\\]*)?/gi,
      160,
      'raw-static-image'
    );

    return candidates;
  }

  function extractGifMediaCandidates(html, pageUrl, provider) {
    const candidates =
      provider === 'klipy'
        ? extractKlipyDirectAssetCandidates(html, pageUrl)
        : [];
    const add = (url, priority = 0) => {
      if (url) candidates.push({ url, baseUrl: pageUrl, priority });
    };

    const addSrcset = (srcset, priority = 0) => {
      if (!srcset) return;
      for (const entry of String(srcset).split(',')) {
        const url = entry.trim().split(/\s+/)[0];
        if (url) add(url, priority);
      }
    };

    try {
      const doc = new DOMParser().parseFromString(html, 'text/html');
      const selectors = [
        ['meta[property="og:image:secure_url"]', 140],
        ['meta[property="og:image"]', 135],
        ['meta[name="twitter:image"]', 130],
        ['meta[name="twitter:image:src"]', 125],
        ['link[rel="image_src"]', 120],
        ['meta[property="og:video:secure_url"]', 40],
        ['meta[property="og:video:url"]', 40],
        ['meta[property="og:video"]', 35],
      ];
      for (const [selector, priority] of selectors) {
        for (const element of doc.querySelectorAll(selector)) {
          add(element.content || element.href, priority);
        }
      }

      // Structured data is especially useful on KLIPY. Its ImageObject exposes
      // contentUrl for the actual GIF, independently from the React page.
      for (const script of doc.querySelectorAll('script[type="application/ld+json"]')) {
        try {
          const data = JSON.parse(script.textContent || '');
          const stack = [data];
          while (stack.length) {
            const item = stack.pop();
            if (!item) continue;
            if (Array.isArray(item)) {
              stack.push(...item);
              continue;
            }
            if (typeof item !== 'object') continue;

            if (typeof item.contentUrl === 'string') add(item.contentUrl, 190);
            if (typeof item.thumbnailUrl === 'string') add(item.thumbnailUrl, 70);
            for (const value of Object.values(item)) {
              if (value && typeof value === 'object') stack.push(value);
            }
          }
        } catch (_) {}
      }

      // KLIPY currently uses Next.js. The original static*.klipy.com asset may
      // live in srcset, poster, lazy-load attributes, or inside /_next/image.
      for (const element of doc.querySelectorAll(
        'img, source, video, picture source'
      )) {
        add(element.getAttribute('src'), 80);
        add(element.getAttribute('poster'), 85);
        add(element.getAttribute('data-src'), 75);
        add(element.getAttribute('data-original'), 75);
        add(element.getAttribute('data-url'), 70);
        addSrcset(element.getAttribute('srcset'), 90);
        addSrcset(element.getAttribute('data-srcset'), 85);
      }

      // Also inspect attributes on arbitrary elements. Frameworks sometimes
      // keep the media URL in a data-* attribute before hydration.
      for (const element of doc.querySelectorAll('*')) {
        for (const attr of [
          'content',
          'href',
          'src',
          'poster',
          'data-src',
          'data-url',
          'data-image',
          'data-original',
        ]) {
          const value = element.getAttribute?.(attr);
          if (value && /klipy|tenor|_next\/image/i.test(value)) add(value, 55);
        }
        addSrcset(element.getAttribute?.('srcset'), 65);
      }
    } catch (_) {}

    // Next.js / serialized JSON data frequently contains the best animated URL
    // even when OpenGraph exposes only a poster image.
    let normalized = String(html)
      .replace(/\\u003A/gi, ':')
      .replace(/\\u002F/gi, '/')
      .replace(/\\u0026/gi, '&')
      .replace(/\\u003D/gi, '=')
      .replace(/\\x3A/gi, ':')
      .replace(/\\x2F/gi, '/')
      .replace(/\\x26/gi, '&')
      .replace(/\\:/g, ':')
      .replace(/\\\//g, '/');

    // Decode the common percent-encoded form used by Next/Image without
    // decodeURIComponent() on the whole HTML document.
    normalized = normalized
      .replace(/%3A/gi, ':')
      .replace(/%2F/gi, '/')
      .replace(/%3F/gi, '?')
      .replace(/%3D/gi, '=')
      .replace(/%26/gi, '&');

    let hostPattern;
    if (provider === 'tenor') {
      hostPattern =
        /https?:\/\/(?:media(?:\d+)?|c)\.tenor\.com\/[^\s"'<>\\]+/gi;
    } else {
      hostPattern =
        /https?:\/\/static\d*\.klipy\.com\/[^\s"'<>\\]+/gi;
    }
    for (const match of normalized.matchAll(hostPattern)) add(match[0], 110);

    // Extract URLs hidden inside Next.js' image proxy. unwrapGifMediaUrl()
    // will recover the original static*.klipy.com URL from these candidates.
    const nextImagePattern =
      /(?:https?:\/\/(?:www\.)?klipy\.com)?\/_next\/image\?[^\s"'<>\\]+/gi;
    for (const match of normalized.matchAll(nextImagePattern)) add(match[0], 100);

    return candidates;
  }

  function collectJsonMediaCandidates(value, pageUrl, out, depth = 0) {
    if (depth > 7 || value == null) return;
    if (typeof value === 'string') {
      out.push({ url: value, baseUrl: pageUrl, priority: 80 });
      return;
    }
    if (Array.isArray(value)) {
      for (const item of value)
        collectJsonMediaCandidates(item, pageUrl, out, depth + 1);
      return;
    }
    if (typeof value === 'object') {
      for (const [key, item] of Object.entries(value)) {
        const bonus = /(?:gif|image|media|url|src|thumbnail)/i.test(key) ? 25 : 0;
        if (typeof item === 'string')
          out.push({ url: item, baseUrl: pageUrl, priority: 80 + bonus });
        else collectJsonMediaCandidates(item, pageUrl, out, depth + 1);
      }
    }
  }

  async function fetchGifPage(pageUrl) {
    if (typeof BdApi === 'undefined' || !BdApi.Net?.fetch)
      throw new Error('BdApi.Net.fetch unavailable');
    return BdApi.Net.fetch(pageUrl, {
      method: 'GET',
      redirect: 'follow',
      timeout: 8000,
      headers: {
        Accept: 'text/html,application/xhtml+xml,application/json;q=0.9,*/*;q=0.8',
      },
    });
  }

  async function resolveTenorMedia(pageUrl) {
    const candidates = [];

    // Tenor exposes an oEmbed endpoint for page-style share URLs. Prefer it
    // because it is smaller and less sensitive to changes in the website HTML.
    try {
      const oembedUrl =
        'https://tenor.com/oembed?url=' + encodeURIComponent(pageUrl);
      const response = await fetchGifPage(oembedUrl);
      if (response.ok) {
        const data = await response.json();
        collectJsonMediaCandidates(data, pageUrl, candidates);
        if (typeof data?.html === 'string') {
          candidates.push(
            ...extractGifMediaCandidates(data.html, pageUrl, 'tenor')
          );
        }
        // Do not return yet: the page HTML often contains a higher-quality
        // animated GIF/WebP than oEmbed's thumbnail. We combine both sets of
        // candidates and rank them together below.
      }
    } catch (error) {
      console.debug('[SDC] Tenor oEmbed fallback:', error?.message || error);
    }

    // Fallback to the actual page. This also covers Tenor URL variants not
    // supported by oEmbed.
    try {
      const response = await fetchGifPage(pageUrl);
      if (!response.ok) return null;
      const html = await response.text();
      candidates.push(
        ...extractGifMediaCandidates(html, response.url || pageUrl, 'tenor')
      );
      return selectBestGifMediaUrl(candidates, 'tenor');
    } catch (error) {
      console.warn('[SDC] Tenor embed: failed to resolve', pageUrl, error);
      return null;
    }
  }

  function getTopGifCandidateDiagnostics(candidates, provider, limit = 12) {
    const rows = [];
    for (const item of candidates) {
      const rawValue = item?.url || item;
      const resolved =
        unwrapGifMediaUrl(rawValue, provider, item?.baseUrl) ||
        (() => {
          try {
            return new URL(decodeHtmlUrl(rawValue), item?.baseUrl || undefined).href;
          } catch (_) {
            return null;
          }
        })();
      if (!resolved) continue;
      const score = scoreGifMediaUrl(
        resolved,
        provider,
        Number(item?.priority) || 0
      );
      if (score < 0) continue;
      rows.push({
        score,
        priority: Number(item?.priority) || 0,
        source: item?.source || null,
        rawUrl: String(rawValue).slice(0, 500),
        url: resolved,
      });
    }
    rows.sort((a, b) => b.score - a.score);
    return rows.slice(0, limit);
  }

  const KLIPY_FRAME_PREFIX = 'sdc-klipy-frame:';

  function encodeKlipyFrameUrl(url) {
    return KLIPY_FRAME_PREFIX + encodeURIComponent(url);
  }

  function decodeKlipyFrameUrl(value) {
    if (typeof value !== 'string' || !value.startsWith(KLIPY_FRAME_PREFIX))
      return null;
    try {
      return decodeURIComponent(value.slice(KLIPY_FRAME_PREFIX.length));
    } catch (_) {
      return null;
    }
  }

  function isTrustedKlipyFrameUrl(value) {
    try {
      const parsed = new URL(value);
      const host = parsed.hostname.toLowerCase();
      if (!(host === 'klipy.com' || host.endsWith('.klipy.com'))) return false;
      return /^https:$/.test(parsed.protocol);
    } catch (_) {
      return false;
    }
  }

  function extractIframeUrls(html, baseUrl) {
    const urls = [];
    if (!html) return urls;

    try {
      const doc = new DOMParser().parseFromString(String(html), 'text/html');
      for (const iframe of doc.querySelectorAll('iframe[src]')) {
        const raw = decodeHtmlUrl(iframe.getAttribute('src'));
        if (!raw) continue;
        try {
          urls.push(new URL(raw, baseUrl).href);
        } catch (_) {}
      }
    } catch (_) {}

    // Fallback for malformed/minified oEmbed HTML.
    const normalized = String(html)
      .replace(/\\u003A/gi, ':')
      .replace(/\\u002F/gi, '/')
      .replace(/\\x3A/gi, ':')
      .replace(/\\x2F/gi, '/')
      .replace(/\\:/g, ':')
      .replace(/\\\//g, '/')
      .replace(/&amp;/gi, '&');
    for (const match of normalized.matchAll(/<iframe[^>]+src=["']([^"']+)["']/gi)) {
      try {
        const resolved = new URL(decodeHtmlUrl(match[1]), baseUrl).href;
        if (!urls.includes(resolved)) urls.push(resolved);
      } catch (_) {}
    }

    return urls;
  }

  function chooseKlipyFrameUrl(data, pageUrl) {
    const iframeUrls = extractIframeUrls(data?.html, pageUrl).filter(
      isTrustedKlipyFrameUrl
    );

    // Prefer explicit player/embed URLs returned by oEmbed.
    iframeUrls.sort((a, b) => {
      const score = (url) =>
        (/\/player(?:$|[?/#])/i.test(url) ? 20 : 0) +
        (/\/embed(?:$|[?/#])/i.test(url) ? 15 : 0) +
        (/api\.klipy\.com/i.test(url) ? 10 : 0);
      return score(b) - score(a);
    });
    if (iframeUrls[0]) return { url: iframeUrls[0], source: 'oembed-html' };

    // The KLIPY page metadata advertises /gifs/<slug>/player. This is a
    // player endpoint specifically intended for embedding and avoids fetching
    // the protected public HTML page from the Discord process.
    try {
      const parsed = new URL(pageUrl);
      if (
        (parsed.hostname === 'klipy.com' || parsed.hostname === 'www.klipy.com') &&
        /^\/gifs\/[^/]+\/?$/i.test(parsed.pathname)
      ) {
        parsed.hostname = 'klipy.com';
        parsed.pathname = parsed.pathname.replace(/\/$/, '') + '/player';
        parsed.search = '';
        parsed.hash = '';
        return { url: parsed.href, source: 'derived-player' };
      }
    } catch (_) {}

    return null;
  }

  function collectKlipyOembedUrlCandidates(data, pageUrl) {
    const candidates = [];
    const seen = new Set();

    const add = (value, key = '', priority = 0) => {
      if (typeof value !== 'string') return;
      const decoded = decodeHtmlUrl(value);
      if (!decoded || !/^https?:\/\//i.test(decoded)) return;

      let absolute;
      try {
        absolute = new URL(decoded, pageUrl).href;
      } catch (_) {
        return;
      }

      let parsed;
      try {
        parsed = new URL(absolute);
      } catch (_) {
        return;
      }

      if (parsed.protocol !== 'https:') return;
      const host = parsed.hostname.toLowerCase();
      if (!(host === 'klipy.com' || host.endsWith('.klipy.com'))) return;

      if (absolute === pageUrl || parsed.pathname === '/') return;
      if (/\/gifs\/[^/]+\/player\/?$/i.test(parsed.pathname)) return;

      if (seen.has(absolute)) return;
      seen.add(absolute);

      let bonus = priority;
      if (/gif/i.test(key)) bonus += 80;
      if (/thumbnail/i.test(key)) bonus += 60;
      if (/image|media|src|url/i.test(key)) bonus += 30;
      if (/\.gif(?:$|[?#])/i.test(absolute)) bonus += 160;
      else if (/\.webp(?:$|[?#])/i.test(absolute)) bonus += 100;
      else if (/\.(?:png|jpe?g|avif)(?:$|[?#])/i.test(absolute)) bonus += 70;

      candidates.push({ url: absolute, key, priority: bonus });
    };

    const walk = (value, key = '', depth = 0) => {
      if (depth > 8 || value == null) return;

      if (typeof value === 'string') {
        add(value, key, 0);
        return;
      }

      if (Array.isArray(value)) {
        for (const item of value) walk(item, key, depth + 1);
        return;
      }

      if (typeof value === 'object') {
        for (const [childKey, child] of Object.entries(value)) {
          if (childKey === 'html' && typeof child === 'string') {
            try {
              const doc = new DOMParser().parseFromString(child, 'text/html');
              for (const el of doc.querySelectorAll(
                '[src], [href], [poster], [data-src], [data-url]'
              )) {
                for (const attr of [
                  'src',
                  'href',
                  'poster',
                  'data-src',
                  'data-url',
                ]) {
                  const v = el.getAttribute?.(attr);
                  if (v) add(v, `html:${attr}`, 20);
                }
              }
            } catch (_) {}
            continue;
          }

          walk(child, childKey, depth + 1);
        }
      }
    };

    walk(data);
    candidates.sort((a, b) => b.priority - a.priority);
    return candidates;
  }

  async function probeKlipyImageUrl(candidate, pageUrl) {
    const mediaUrl = candidate?.url || candidate;
    if (!mediaUrl) return null;

    gifResolverLog('klipy', 'oembed:probe-fetch', {
      mediaUrl,
      key: candidate?.key || null,
      priority: candidate?.priority || 0,
    });

    try {
      const response = await BdApi.Net.fetch(mediaUrl, {
        method: 'GET',
        redirect: 'follow',
        timeout: 8000,
        headers: {
          Accept: 'image/avif,image/webp,image/apng,image/gif,image/*,*/*;q=0.8',
          Referer: pageUrl,
        },
      });

      const contentTypeHeader =
        response.headers?.get?.('content-type') || '';
      const contentType = inferGifMediaContentType(
        response.url || mediaUrl,
        contentTypeHeader
      );

      gifResolverLog('klipy', 'oembed:probe-response', {
        requestedUrl: mediaUrl,
        finalUrl: response.url,
        status: response.status,
        ok: response.ok,
        contentTypeHeader,
        contentType,
        contentLength:
          response.headers?.get?.('content-length') || null,
      });

      if (!response.ok || !contentType.startsWith('image/')) return null;

      return {
        url: response.url || mediaUrl,
        contentType,
        score:
          (contentType === 'image/gif' ? 1000 : 0) +
          (contentType === 'image/webp' ? 700 : 0) +
          300 +
          (candidate?.priority || 0),
      };
    } catch (error) {
      gifResolverWarn('klipy', 'oembed:probe-failed', {
        mediaUrl,
        key: candidate?.key || null,
        name: error?.name,
        message: error?.message || String(error),
      });
      return null;
    }
  }

  async function resolveKlipyOembedMedia(data, pageUrl) {
    const rawCandidates = collectKlipyOembedUrlCandidates(data, pageUrl);

    gifResolverLog('klipy', 'oembed:raw-candidates', {
      count: rawCandidates.length,
      candidates: rawCandidates.slice(0, 30),
    });

    const strictCandidates = rawCandidates.map((item) => ({
      url: item.url,
      baseUrl: pageUrl,
      priority: item.priority,
      source: `oembed:${item.key}`,
    }));

    const strictDirect = selectBestGifMediaUrl(
      strictCandidates,
      'klipy'
    );
    if (strictDirect) {
      gifResolverLog('klipy', 'oembed:strict-direct', {
        selected: strictDirect,
      });
      return strictDirect;
    }

    const probed = [];
    for (const candidate of rawCandidates.slice(0, 12)) {
      const result = await probeKlipyImageUrl(candidate, pageUrl);
      if (result) probed.push(result);
      if (result?.contentType === 'image/gif') break;
    }

    probed.sort((a, b) => b.score - a.score);

    gifResolverLog('klipy', 'oembed:probe-results', {
      count: probed.length,
      results: probed,
      selected: probed[0]?.url || null,
    });

    return probed[0]?.url || null;
  }

  async function resolveKlipyPlayerMedia(frameUrl, pageUrl) {
    if (!frameUrl || !isTrustedKlipyFrameUrl(frameUrl)) return null;

    gifResolverLog('klipy', 'player:fetch', { frameUrl, pageUrl });

    try {
      const headers = {
        Accept:
          'text/html,application/xhtml+xml,application/json;q=0.9,*/*;q=0.8',
        Referer: pageUrl,
        'Accept-Language':
          (typeof navigator !== 'undefined' && navigator.language) ||
          'en-US,en;q=0.9',
      };

      if (typeof navigator !== 'undefined' && navigator.userAgent) {
        headers['User-Agent'] = navigator.userAgent;
      }

      const response = await BdApi.Net.fetch(frameUrl, {
        method: 'GET',
        redirect: 'follow',
        timeout: 10000,
        headers,
      });

      gifResolverLog('klipy', 'player:response', {
        status: response.status,
        ok: response.ok,
        finalUrl: response.url,
        contentType: response.headers?.get?.('content-type') || null,
      });

      if (!response.ok) return null;

      const body = await response.text();
      const candidates = extractGifMediaCandidates(
        body,
        response.url || frameUrl,
        'klipy'
      );
      const selected = selectBestGifMediaUrl(candidates, 'klipy');

      gifResolverLog('klipy', 'player:candidates', {
        bytes: body.length,
        count: candidates.length,
        selected,
        top: getTopGifCandidateDiagnostics(candidates, 'klipy'),
      });

      return selected;
    } catch (error) {
      gifResolverWarn('klipy', 'player:failed', {
        frameUrl,
        name: error?.name,
        message: error?.message || String(error),
      });
      return null;
    }
  }

  function normalizeKlipyIdentity(value) {
    return String(value || '')
      .normalize('NFKD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/https?:\/\/(?:www\.)?klipy\.com\/gifs\//g, '')
      .replace(/[^a-z0-9]+/g, ' ')
      .trim()
      .replace(/\s+/g, ' ');
  }

  function getKlipyPageSlug(pageUrl) {
    try {
      const parsed = new URL(pageUrl);
      const match = /^\/gifs\/([^/?#]+)/i.exec(parsed.pathname);
      return match ? decodeURIComponent(match[1]) : '';
    } catch (_) {
      return '';
    }
  }

  function redactKlipyApiUrl(value) {
    try {
      const parsed = new URL(value);
      if (parsed.searchParams.has('key')) {
        parsed.searchParams.set('key', '<redacted>');
      }
      return parsed.href;
    } catch (_) {
      return String(value || '').replace(
        /([?&]key=)[^&]+/i,
        '$1<redacted>'
      );
    }
  }

  function collectKlipyResultStrings(value, out, path = '', depth = 0) {
    if (depth > 7 || value == null) return;
    if (typeof value === 'string') {
      out.push({ path, value });
      return;
    }
    if (Array.isArray(value)) {
      value.forEach((item, index) =>
        collectKlipyResultStrings(
          item,
          out,
          `${path}[${index}]`,
          depth + 1
        )
      );
      return;
    }
    if (typeof value === 'object') {
      for (const [key, child] of Object.entries(value)) {
        collectKlipyResultStrings(
          child,
          out,
          path ? `${path}.${key}` : key,
          depth + 1
        );
      }
    }
  }

  function extractKlipyApiResults(payload) {
    const directArrays = [
      payload?.results,
      payload?.data?.results,
      payload?.data?.data,
      payload?.data,
    ];

    for (const candidate of directArrays) {
      if (
        Array.isArray(candidate) &&
        candidate.some((item) => item && typeof item === 'object')
      ) {
        return candidate.filter(
          (item) => item && typeof item === 'object'
        );
      }
    }

    // Defensive compatibility with possible wrapper changes.
    const queue = [{ value: payload, depth: 0 }];
    const seen = new Set();
    while (queue.length) {
      const { value, depth } = queue.shift();
      if (!value || typeof value !== 'object' || depth > 4) continue;
      if (seen.has(value)) continue;
      seen.add(value);

      for (const [key, child] of Object.entries(value)) {
        if (
          /results?|items?|gifs?/i.test(key) &&
          Array.isArray(child) &&
          child.some((item) => item && typeof item === 'object')
        ) {
          return child.filter(
            (item) => item && typeof item === 'object'
          );
        }
        if (child && typeof child === 'object') {
          queue.push({ value: child, depth: depth + 1 });
        }
      }
    }

    return [];
  }

  function collectKlipyApiMediaCandidates(result) {
    const strings = [];
    collectKlipyResultStrings(result, strings);

    const candidates = [];
    const seen = new Set();

    for (const item of strings) {
      const raw = decodeHtmlUrl(item.value);
      if (!raw || !/^https:\/\//i.test(raw)) continue;

      let parsed;
      try {
        parsed = new URL(raw);
      } catch (_) {
        continue;
      }

      const host = parsed.hostname.toLowerCase();
      const path = parsed.pathname || '/';
      if (
        !(
          host === 'klipy.com' ||
          host.endsWith('.klipy.com')
        )
      ) {
        continue;
      }

      // Never confuse a public share/player/API page with media.
      if (
        path === '/' ||
        /^\/gifs\/[^/]+\/?$/i.test(path) ||
        /\/player\/?$/i.test(path) ||
        /^\/v\d+\//i.test(path) ||
        /^\/api\//i.test(path)
      ) {
        continue;
      }

      const id = parsed.href;
      if (seen.has(id)) continue;
      seen.add(id);

      const field = String(item.path || '').toLowerCase();
      let score = 0;

      if (/\.gif(?:$|[?#])/i.test(id)) score += 2000;
      else if (/\.webp(?:$|[?#])/i.test(id)) score += 1200;
      else if (/\.(?:png|jpe?g|avif)(?:$|[?#])/i.test(id)) score += 700;

      // Tenor-compatible KLIPY v2 response.
      if (/media_formats\.gif\.url/.test(field)) score += 1200;
      if (/media_formats\.mediumgif\.url/.test(field)) score += 900;
      if (/media_formats\.tinygif\.url/.test(field)) score += 700;
      if (/media_formats\.nanogif\.url/.test(field)) score += 600;
      if (/media_formats\.preview\.url/.test(field)) score += 400;

      // Native KLIPY-style structures observed in their web data.
      if (/file\.hd\.gif\.url/.test(field)) score += 1300;
      if (/file\.md\.gif\.url/.test(field)) score += 1000;
      if (/file\..*\.gif\.url/.test(field)) score += 800;
      if (/thumbnail/.test(field)) score -= 200;

      if (/^static\d*\.klipy\.com$/i.test(host)) score += 500;
      if (/\/ii\//i.test(path)) score += 300;

      if (score <= 0) continue;

      candidates.push({
        url: id,
        score,
        source: item.path,
      });
    }

    candidates.sort((a, b) => b.score - a.score);
    return candidates;
  }

  function scoreKlipyApiResult(
    result,
    pageUrl,
    slug,
    title,
    query,
    index
  ) {
    const strings = [];
    collectKlipyResultStrings(result, strings);

    const pageCanonical = String(pageUrl).replace(/\/+$/, '');
    const slugNorm = normalizeKlipyIdentity(slug);
    const titleNorm = normalizeKlipyIdentity(title);
    const queryNorm = normalizeKlipyIdentity(query);

    let score = Math.max(0, 100 - index);
    const reasons = [];

    for (const item of strings) {
      const value = String(item.value || '');
      const norm = normalizeKlipyIdentity(value);
      const field = String(item.path || '').toLowerCase();

      if (
        value.replace(/\/+$/, '') === pageCanonical
      ) {
        score += 6000;
        reasons.push('exact-page-url');
      }

      if (
        slugNorm &&
        (
          (/slug/.test(field) && norm === slugNorm) ||
          /\/gifs\//i.test(value) &&
            normalizeKlipyIdentity(value) === slugNorm
        )
      ) {
        score += 5000;
        reasons.push('exact-slug');
      }

      if (
        titleNorm &&
        titleNorm.length >= 3 &&
        /title|content_description|description|name/.test(field) &&
        norm === titleNorm
      ) {
        score += 2600;
        reasons.push('exact-title');
      }

      if (
        queryNorm &&
        queryNorm.length >= 3 &&
        /title|content_description|description|name/.test(field) &&
        norm === queryNorm
      ) {
        score += 1600;
        reasons.push('exact-query');
      }

      if (
        slugNorm &&
        slugNorm.length >= 5 &&
        norm.includes(slugNorm)
      ) {
        score += 700;
      }

      if (
        titleNorm &&
        titleNorm.length >= 5 &&
        norm.includes(titleNorm)
      ) {
        score += 500;
      }
    }

    const media = collectKlipyApiMediaCandidates(result);
    if (media.length) {
      score += Math.min(800, Math.round(media[0].score / 4));
      reasons.push('has-media');
    }

    return {
      result,
      index,
      score,
      reasons: Array.from(new Set(reasons)),
      media,
    };
  }

  async function fetchKlipyOfficialSearch(query, apiKey) {
    const endpoint = new URL('https://api.klipy.com/v2/search');
    endpoint.searchParams.set('q', query);
    endpoint.searchParams.set('key', apiKey);
    endpoint.searchParams.set('limit', '25');

    gifResolverLog('klipy', 'api:search', {
      query,
      url: redactKlipyApiUrl(endpoint.href),
    });

    const response = await BdApi.Net.fetch(endpoint.href, {
      method: 'GET',
      redirect: 'follow',
      timeout: 10000,
      headers: {
        Accept: 'application/json,text/plain;q=0.9,*/*;q=0.8',
      },
    });

    gifResolverLog('klipy', 'api:response', {
      query,
      status: response.status,
      ok: response.ok,
      finalUrl: redactKlipyApiUrl(response.url || endpoint.href),
      contentType: response.headers?.get?.('content-type') || null,
      rateLimitRemaining:
        response.headers?.get?.('x-ratelimit-remaining') || null,
    });

    if (!response.ok) {
      let bodyPreview = null;
      try {
        bodyPreview = (await response.text()).slice(0, 1000);
      } catch (_) {}

      gifResolverWarn('klipy', 'api:http-error', {
        query,
        status: response.status,
        bodyPreview,
      });
      return null;
    }

    try {
      return await response.json();
    } catch (error) {
      gifResolverWarn('klipy', 'api:json-parse-failed', {
        query,
        message: error?.message || String(error),
      });
      return null;
    }
  }

  async function resolveKlipyOfficialApiMedia(
    pageUrl,
    oembedData,
    apiKey
  ) {
    const slug = getKlipyPageSlug(pageUrl);
    const title = String(oembedData?.title || '').trim();

    const queries = [];
    const addQuery = (value) => {
      const query = String(value || '').trim();
      if (!query) return;
      if (!queries.some((item) => item.toLowerCase() === query.toLowerCase())) {
        queries.push(query);
      }
    };

    // Search by the human title first; it is provided by KLIPY's successful
    // oEmbed endpoint. The slug is the deterministic fallback.
    addQuery(title);
    addQuery(slug.replace(/[-_]+/g, ' ').trim());

    gifResolverLog('klipy', 'api:resolver-start', {
      pageUrl,
      slug,
      title,
      queries,
      key: maskKlipyApiKey(apiKey),
    });

    let best = null;

    for (const query of queries.slice(0, 2)) {
      const payload = await fetchKlipyOfficialSearch(query, apiKey);
      if (!payload) continue;

      const results = extractKlipyApiResults(payload);

      gifResolverLog('klipy', 'api:result-count', {
        query,
        count: results.length,
        topLevelKeys:
          payload && typeof payload === 'object'
            ? Object.keys(payload).slice(0, 30)
            : [],
      });

      const ranked = results
        .map((result, index) =>
          scoreKlipyApiResult(
            result,
            pageUrl,
            slug,
            title,
            query,
            index
          )
        )
        .filter((item) => item.media.length)
        .sort((a, b) => b.score - a.score);

      gifResolverLog('klipy', 'api:ranked', {
        query,
        top: ranked.slice(0, 8).map((item) => ({
          index: item.index,
          score: item.score,
          reasons: item.reasons,
          media: item.media.slice(0, 3),
        })),
      });

      if (ranked.length && (!best || ranked[0].score > best.score)) {
        best = ranked[0];
      }

      // An exact URL/slug match is deterministic; no second API call needed.
      if (
        best &&
        (
          best.reasons.includes('exact-page-url') ||
          best.reasons.includes('exact-slug')
        )
      ) {
        break;
      }
    }

    if (!best?.media?.length) {
      gifResolverWarn('klipy', 'api:no-matching-media', {
        pageUrl,
        slug,
        title,
      });
      return null;
    }

    // Avoid returning an unrelated GIF for extremely ambiguous one-character
    // titles unless the API result actually matched the slug/page.
    const deterministic =
      best.reasons.includes('exact-page-url') ||
      best.reasons.includes('exact-slug');
    const strongTitle =
      title.length >= 3 &&
      (
        best.reasons.includes('exact-title') ||
        best.reasons.includes('exact-query')
      );

    if (!deterministic && !strongTitle) {
      gifResolverWarn('klipy', 'api:match-too-weak', {
        pageUrl,
        slug,
        title,
        score: best.score,
        reasons: best.reasons,
      });
      return null;
    }

    const selected = best.media[0].url;

    gifResolverLog('klipy', 'api:selected', {
      pageUrl,
      slug,
      title,
      score: best.score,
      reasons: best.reasons,
      selected,
      mediaSource: best.media[0].source,
    });

    return selected;
  }

  async function resolveKlipyMedia(pageUrl) {
    gifResolverLog('klipy', 'resolver:start', { pageUrl });

    const apiKey = getKlipyApiKey();
    gifResolverLog('klipy', 'api:key-status', {
      configured: Boolean(apiKey),
      masked: maskKlipyApiKey(apiKey),
    });

    if (!apiKey) {
      if (!klipyMissingApiKeyLogged) {
        klipyMissingApiKeyLogged = true;
        gifResolverWarn('klipy', 'api:key-missing', {
          message:
            'KLIPY API key required. In DevTools run: ' +
            'SDC_KLIPY_API.setKey("YOUR_KLIPY_API_KEY")',
        });
      }
      return null;
    }

    // KLIPY's oEmbed endpoint is reachable from Discord and gives us the
    // canonical content title. It deliberately does not expose the actual GIF
    // URL, so the official v2 API is used for media resolution.
    try {
      const oembedUrl =
        'https://api.klipy.com/api/v1/web/gifs/embed/oembed?format=json&url=' +
        encodeURIComponent(pageUrl);

      gifResolverLog('klipy', 'oembed:fetch', { url: oembedUrl });

      const oembedResponse = await BdApi.Net.fetch(oembedUrl, {
        method: 'GET',
        redirect: 'follow',
        timeout: 8000,
        headers: {
          Accept: 'application/json,text/plain;q=0.9,*/*;q=0.8',
        },
      });

      gifResolverLog('klipy', 'oembed:response', {
        status: oembedResponse.status,
        ok: oembedResponse.ok,
        finalUrl: oembedResponse.url,
        contentType: oembedResponse.headers?.get?.('content-type') || null,
      });

      let oembedData = null;
      if (oembedResponse.ok) {
        try {
          oembedData = await oembedResponse.json();
        } catch (error) {
          gifResolverWarn('klipy', 'oembed:json-parse-failed', {
            message: error?.message || String(error),
          });
        }
      }

      gifResolverLog('klipy', 'oembed:identity', {
        pageUrl,
        title: oembedData?.title ?? null,
        thumbnail_width: oembedData?.thumbnail_width ?? null,
        thumbnail_height: oembedData?.thumbnail_height ?? null,
      });

      const apiMedia = await resolveKlipyOfficialApiMedia(
        pageUrl,
        oembedData,
        apiKey
      );

      if (apiMedia) {
        gifResolverLog('klipy', 'resolver:success-official-api', {
          pageUrl,
          selected: apiMedia,
        });
        return apiMedia;
      }

      gifResolverWarn('klipy', 'resolver:no-media-from-official-api', {
        pageUrl,
        title: oembedData?.title ?? null,
      });
      return null;
    } catch (error) {
      gifResolverWarn('klipy', 'resolver:exception', {
        pageUrl,
        name: error?.name,
        message: error?.message || String(error),
        stack: error?.stack,
      });
      return null;
    }
  }

  async function resolveGifPageMedia(pageUrl, provider) {
    const cacheKey = provider + ':' + pageUrl;
    const cached = getCachedGifPageMedia(cacheKey);
    if (cached.hit) {
      gifResolverLog(provider, 'cache:hit', {
        pageUrl,
        mediaUrl: cached.mediaUrl,
      });
      return cached.mediaUrl;
    }

    gifResolverLog(provider, 'cache:miss', { pageUrl });

    if (gifPageMediaPending.has(cacheKey)) {
      gifResolverLog(provider, 'pending:reuse', { pageUrl });
      return gifPageMediaPending.get(cacheKey);
    }

    const pending = (async () => {
      let mediaUrl = null;
      try {
        mediaUrl =
          provider === 'tenor'
            ? await resolveTenorMedia(pageUrl)
            : await resolveKlipyMedia(pageUrl);

        if (provider === 'klipy' && mediaUrl) {
          try {
            const parsed = new URL(mediaUrl);
            if (
              parsed.protocol !== 'https:' ||
              !(
                parsed.hostname === 'klipy.com' ||
                parsed.hostname.endsWith('.klipy.com')
              ) ||
              parsed.pathname === '/' ||
              /^\/gifs\/[^/]+\/?$/i.test(parsed.pathname) ||
              /\/player\/?$/i.test(parsed.pathname) ||
              /^\/v\d+\//i.test(parsed.pathname) ||
              /^\/api\//i.test(parsed.pathname)
            ) {
              gifResolverWarn(
                'klipy',
                'cache:reject-invalid-media-url',
                { pageUrl, mediaUrl }
              );
              mediaUrl = null;
            }
          } catch (_) {
            mediaUrl = null;
          }
        }

        cacheGifPageMedia(cacheKey, mediaUrl);
        gifResolverLog(provider, 'cache:store', {
          pageUrl,
          mediaUrl,
          positive: Boolean(mediaUrl),
        });
        return mediaUrl;
      } finally {
        gifPageMediaPending.delete(cacheKey);
      }
    })();

    gifPageMediaPending.set(cacheKey, pending);
    return pending;
  }

  function embedResolvedGifImage(message, displayUrl, sourceUrl, provider) {
    if (!Array.isArray(message.embeds)) message.embeds = [];

    const placeholder = {
      type: 'image',
      // Keep the original remote URL in embed.url so repeated MESSAGE_UPDATE
      // processing can recognize this embed even when thumbnail.url is blob:.
      url: sourceUrl,
      ...(provider === 'klipy'
        ? {
            provider: {
              name: 'KLIPY',
              url: 'https://klipy.com',
            },
          }
        : {}),
      thumbnail: {
        url: 'data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw==',
        width: 1,
        height: 300,
      },
    };
    message.embeds.push(placeholder);

    gifResolverLog(provider, 'image:probe-start', {
      sourceUrl,
      displayUrl,
      isBlob: /^blob:/i.test(displayUrl),
      messageId: message?.id || null,
    });

    const tmpimg = document.createElement('img');
    let settled = false;
    const timeout = setTimeout(() => {
      if (settled) return;
      settled = true;
      gifResolverWarn(provider, 'image:probe-timeout', {
        sourceUrl,
        displayUrl,
        messageId: message?.id || null,
      });
      const index = message.embeds.indexOf(placeholder);
      if (index !== -1) message.embeds.splice(index, 1);
      Discord.dispatch({ type: 'MESSAGE_UPDATE', message });
    }, 10000);

    tmpimg.onload = () => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      const width = tmpimg.naturalWidth || tmpimg.width || 1;
      const height = tmpimg.naturalHeight || tmpimg.height || 1;
      placeholder.thumbnail = { url: displayUrl, width, height };

      gifResolverLog(provider, 'image:onload', {
        sourceUrl,
        displayUrl,
        width,
        height,
        complete: tmpimg.complete,
        messageId: message?.id || null,
      });
      Discord.dispatch({ type: 'MESSAGE_UPDATE', message });
    };

    tmpimg.onerror = (event) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      gifResolverWarn(provider, 'image:onerror', {
        sourceUrl,
        displayUrl,
        isBlob: /^blob:/i.test(displayUrl),
        eventType: event?.type || null,
        messageId: message?.id || null,
      });
      // Do not leave the old 300px blank placeholder behind on failure.
      const index = message.embeds.indexOf(placeholder);
      if (index !== -1) message.embeds.splice(index, 1);
      Discord.dispatch({ type: 'MESSAGE_UPDATE', message });
    };

    tmpimg.src = displayUrl;
    return placeholder;
  }

  async function embedKlipyResolvedImage(message, mediaUrl, pageUrl) {
    try {
      const entry = await fetchGifMediaAsBlobUrl(mediaUrl, 'klipy', pageUrl);
      return embedResolvedGifImage(
        message,
        entry.blobUrl,
        mediaUrl,
        'klipy'
      );
    } catch (error) {
      gifResolverWarn('klipy', 'binary:fallback-to-direct', {
        mediaUrl,
        pageUrl,
        name: error?.name,
        message: error?.message || String(error),
        stack: error?.stack,
      });
      // Last resort: try the remote URL, but with explicit onerror cleanup and
      // diagnostics so a failed CDN load can no longer leave a blank square.
      return embedResolvedGifImage(message, mediaUrl, mediaUrl, 'klipy');
    }
  }

  function embedTrustedDirectImage(message, url) {
    let queryString = '';
    try {
      const parsed = new URL(url);
      queryString = parsed.pathname.replace(/^\//, '') + parsed.search;
    } catch (_) {}
    embedImage(message, url, queryString, true);
  }

  function embedGifPage(message, url, queryString, provider) {
    queryString = queryString || '';
    if (provider === 'tenor' && !/^view\//i.test(queryString)) return;
    if (provider === 'klipy' && !/^gifs\//i.test(queryString)) return;

    gifResolverLog(provider, 'embed:detected-page', {
      url,
      queryString,
      messageId: message?.id || null,
      channelId: message?.channel_id || null,
    });

    resolveGifPageMedia(url, provider).then(async (mediaUrl) => {
      gifResolverLog(provider, 'embed:resolved', {
        pageUrl: url,
        mediaUrl,
        messageId: message?.id || null,
      });
      if (!mediaUrl) return;
      if (!Array.isArray(message.embeds)) message.embeds = [];

      const klipyFrameUrl =
        provider === 'klipy' ? decodeKlipyFrameUrl(mediaUrl) : null;
      if (klipyFrameUrl) {
        gifResolverWarn('klipy', 'embed:legacy-frame-rejected', {
          pageUrl: url,
          frameUrl: klipyFrameUrl,
          messageId: message?.id || null,
        });
        return;
      }

      if (
        message.embeds.some(
          (embed) =>
            embed?.url === mediaUrl ||
            embed?.thumbnail?.url === mediaUrl ||
            embed?.image?.url === mediaUrl
        )
      ) {
        gifResolverLog(provider, 'embed:already-present', {
          pageUrl: url,
          mediaUrl,
          messageId: message?.id || null,
        });
        return;
      }

      if (provider === 'klipy') {
        await embedKlipyResolvedImage(message, mediaUrl, url);
      } else {
        embedTrustedDirectImage(message, mediaUrl);
      }

      gifResolverLog(provider, 'embed:dispatch-message-update', {
        pageUrl: url,
        mediaUrl,
        embedCount: Array.isArray(message.embeds) ? message.embeds.length : null,
        messageId: message?.id || null,
      });
      Discord.dispatch({ type: 'MESSAGE_UPDATE', message });
    }).catch((error) => {
      gifResolverWarn(provider, 'embed:promise-rejected', {
        pageUrl: url,
        name: error?.name,
        message: error?.message || String(error),
        stack: error?.stack,
      });
    });
  }

  function embedTenor(message, url, queryString) {
    embedGifPage(message, url, queryString, 'tenor');
  }

  function embedKlipy(message, url, queryString) {
    gifResolverLog('klipy', 'native-unfurl:client-resolver-skipped', {
      url,
      queryString: queryString || '',
      messageId: message?.id || null,
      nativeEmbedPresent:
        Array.isArray(message?.embeds) &&
        message.embeds.some(isNativeKlipyEmbed),
    });
    // v16 intentionally does not fetch klipy.com, /player, oEmbed, or the KLIPY
    // API. Discord's own backend has already seen the plaintext transport URL
    // and is responsible for producing the native link preview.
  }

  var EmbedFrames = [];
  function embedEncrypted(message, url, queryString) {
    if (Discord.detour_setAttribute != null) {
      let embedFrameId = EmbedFrames.push(url) - 1;
      message.embeds.push({
        type: 'link',
        provider: { url: null, name: 'Spotify' },
        url: 'https://open.spotify.com/playlist//' + embedFrameId,
      });
    } else {
      message.embeds.push({
        type: 'video',
        url,
        thumbnail: {
          url: 'https://media.discordapp.net/attachments/449522590978146304/465783850144890890/key128.png',
          width: 128,
          height: 128,
        },
        video: { url, width: 400, height: 300 },
      });
    }
  }
  function embedMega(message, url, queryString) {
    if (!queryString.startsWith('embed')) {
      if (queryString.startsWith('file')) queryString = queryString.substr(4);
      url = 'https://mega.nz/embed' + queryString;
    }
    embedEncrypted(message, url, null);
  }
  const validSoundcloudRegex = CONFIG.patterns.validSoundcloud;
  function embedSoundcloud(message, url, queryString) {
    if (validSoundcloudRegex.test(queryString))
      embedEncrypted(
        message,
        'https://w.soundcloud.com/player/?visual=true&url=' +
        encodeURIComponent(url),
        null
      );
  }
  const linkEmbedders = {
    'www.youtube.com': embedYoutube,
    'youtu.be': embedYoutu,
    'cdn.discordapp.com': embedImage,
    'media.discordapp.net': embedImage,
    'i.imgur.com': embedImage,

    // v17: native Discord KLIPY unfurl + safe encrypted attachment download buttons.
    'gif.fxtwitter.com': embedImage,
    'static.klipy.com': embedTrustedDirectImage,
    'static1.klipy.com': embedTrustedDirectImage,
    'static2.klipy.com': embedTrustedDirectImage,
    'static3.klipy.com': embedTrustedDirectImage,
    'static4.klipy.com': embedTrustedDirectImage,
    'media.tenor.com': embedTrustedDirectImage,
    'media1.tenor.com': embedTrustedDirectImage,
    'c.tenor.com': embedTrustedDirectImage,
    'tenor.com': embedTenor,
    'www.tenor.com': embedTenor,
    'klipy.com': embedKlipy,
    'www.klipy.com': embedKlipy,
  };
  if (FixedCsp)
    Object.assign(linkEmbedders, {
      'i.redd.it': embedImage,
      'soundcloud.com': embedSoundcloud,
      'share.riseup.net': embedEncrypted,
      'mega.nz': embedMega,
    });

  const MENTION_EVERYONE_CHECK = 0x20000n;
  const everyoneRegex = CONFIG.patterns.everyone;
  const roleMentionRegex = CONFIG.patterns.roleMention;
  const urlRegex =
    /(?:<https?:\/\/(?:[^\s\/?\.#]+\.)+(?:[^\s\/?\.#]+)\/[^\s<>'"]+>|https?:\/\/((?:[^\s\/?\.#]+\.)+(?:[^\s\/?\.#]+))\/([^\s<>'"]+))/g;
  const KLIPY_NATIVE_UNFURL_ENABLED = true;

  function normalizeKlipyNativeUrl(value) {
    try {
      const parsed = new URL(String(value || ''));
      if (parsed.protocol !== 'https:') return null;
      const host = parsed.hostname.toLowerCase();
      if (host !== 'klipy.com' && host !== 'www.klipy.com') return null;
      if (!/^\/gifs\/[^/?#]+/i.test(parsed.pathname)) return null;
      parsed.hash = '';
      return parsed.href;
    } catch (_) {
      return null;
    }
  }

  function extractKlipyNativeUnfurlUrls(content) {
    if (!KLIPY_NATIVE_UNFURL_ENABLED || !content) return [];

    const found = new Set();
    const regex =
      /https:\/\/(?:www\.)?klipy\.com\/gifs\/[^\s<>'"\])}]+/gi;

    for (const match of String(content).matchAll(regex)) {
      let candidate = String(match[0] || '')
        .replace(/[.,;:!?]+$/g, '')
        .trim();
      const normalized = normalizeKlipyNativeUrl(candidate);
      if (normalized) found.add(normalized);
    }

    return Array.from(found).slice(0, 4);
  }

  function isNativeKlipyEmbed(embed) {
    if (!embed || typeof embed !== 'object') return false;

    const providerName = String(embed.provider?.name || '').toLowerCase();
    if (providerName === 'klipy') return true;

    const urls = [
      embed.url,
      embed.image?.url,
      embed.image?.proxy_url,
      embed.thumbnail?.url,
      embed.thumbnail?.proxy_url,
      embed.video?.url,
      embed.video?.proxy_url,
    ].filter(Boolean);

    return urls.some((value) => {
      try {
        const parsed = new URL(String(value));
        const host = parsed.hostname.toLowerCase();
        return (
          host === 'klipy.com' ||
          host === 'www.klipy.com' ||
          /^static\d*\.klipy\.com$/.test(host) ||
          host === 'media.discordapp.net' ||
          /^images-ext-\d+\.discordapp\.net$/.test(host)
        );
      } catch (_) {
        return false;
      }
    });
  }

  function appendKlipyNativeUnfurlTransport(content, urls) {
    if (!urls || urls.length === 0) return content;
    return String(content) + '\n' + urls.join('\n');
  }

  function postProcessMessage(message, content) {
    let currentUser = Discord.getCurrentUser();
    if (
      content.includes(`<@${currentUser.id}>`) ||
      content.includes(`<@!${currentUser.id}>`)
    ) {
      message.mentions = [currentUser];
    } else if (message.author != null) {
      let guildId = message.guild_id;
      let channel;
      if (guildId == null) {
        channel = Discord.getChannel(message.channel_id);
        guildId = channel.guild_id;
      }
      if (guildId != null) {
        let canMentionEveryone;
        if (everyoneRegex.test(content)) {
          if (channel == null) channel = Discord.getChannel(message.channel_id);
          message.mention_everyone = canMentionEveryone = Utils.Can(
            MENTION_EVERYONE_CHECK,
            message.author,
            channel
          );
        }

        let mentionRoles = [...content.matchAll(roleMentionRegex)].map(
          (x) => x[1]
        );
        if (mentionRoles.length !== 0) {
          if (canMentionEveryone == null) {
            if (channel == null)
              channel = Discord.getChannel(message.channel_id);
            canMentionEveryone = Utils.Can(
              MENTION_EVERYONE_CHECK,
              message.author,
              channel
            );
          }
          if (!canMentionEveryone) {
            let guild = Discord.getGuild(guildId);
            mentionRoles = mentionRoles.filter(
              (x) => guild.roles[x] && guild.roles[x].mentionable
            );
          }
          message.mention_roles = mentionRoles;
        }
      }
    }

    let url;
    while ((url = urlRegex.exec(content)) != null && url[1] != null) {
      let linkEmbedder = linkEmbedders[url[1]];
      if (linkEmbedder != null) linkEmbedder(message, url[0], url[2]);
    }
    urlRegex.lastIndex = 0;
  }

  let keywaitingMessages = {};
  async function decryptWaitingMessages(keyHash) {
    let waitingMessages = keywaitingMessages[keyHash];
    if (waitingMessages == null) return;
    for (let [message, payload, originalRef] of waitingMessages) {
      decryptMessage(Object.assign(originalRef, message), payload).then(() =>
        Utils.UpdateMessageContent(originalRef)
      );
    }
    delete keywaitingMessages[keyHash];
  }

  let keyChangeWatchers = {};
  async function decryptMessage(message, payload, ignoreAttachments) {
    if (message.referenced_message != null)
      await processMessage(message.referenced_message, true);

    let payloadBuffer = Utils.PayloadDecode(payload).buffer;
    let keyHashBytes = payloadBuffer.slice(0, 16);
    let keyHashBase64 = Utils.BytesToBase64(keyHashBytes);
    let keyObjRef = [];
    let key = await Utils.GetKeyByHash(keyHashBase64, keyObjRef);

    if (key == null) {
      let messageDeleted = false;
      if (!DataBase.isSecondary && message.author != null) {
        let keyExchangeConcluded = false;
        let keyExchange = Utils.InitKeyExchangeAndRequestKey(
          keyHashBase64,
          message.author,
          message.id
        );

        let onMessageDelete;
        let messageDeleteException = new Promise((resolve) => {
          onMessageDelete = () => {
            messageDeleted = true;
            resolve();
          };
          Utils.AddMessageDeleteListener(message.id, onMessageDelete);
        });

        for (let i = 1; i <= 5; i++) {
          await Promise.race([
            keyExchange,
            Utils.Sleep(i * 200),
            messageDeleteException,
          ]);
          if (messageDeleted) break;

          key = await Utils.GetKeyByHash(keyHashBase64);
          if (key != null || keyExchangeConcluded) break;
        }
        Utils.RemoveMessageDeleteListener(message.id, onMessageDelete);
      }
      if (key == null) {
        if (!messageDeleted) {
          let waitingMessages = keywaitingMessages[keyHashBase64];
          if (waitingMessages == null)
            keywaitingMessages[keyHashBase64] = waitingMessages = [];
          waitingMessages.push([Object.assign({}, message), payload, message]);
        }
        message.content = unknownKeyMessage;
        message.embeds = [];
        message.attachments = [];
        return messageDeleted;
      }
    }

    let channelId = message.channel_id;
    let channelConfig =
      channelId === Cache.channelId
        ? Cache.channelConfig
        : DataBase.channels[channelId]; //don't bump lastseen
    let keyObj = keyObjRef[0];
    let myKey;
    let differentKey = false;
    let differentKeyDescriptor;
    let differentKeyDesc;
    let notPersonalKey = keyObj.t /*type*/ !== 3; /*personal*/
    if (channelConfig == null) {
      differentKey = notPersonalKey;
    } else if (keyHashBase64 !== channelConfig.k /*key*/) {
      if (notPersonalKey) differentKey = true;
      else {
        myKey = DataBase.keys[channelConfig.k];
        if (myKey.t /*type*/ !== 3 /*personal*/) differentKey = true;
      }
    }
    if (differentKey) {
      differentKeyDescriptor = Utils.FormatDescriptor(keyObj.d /*descriptor*/);
      differentKeyDesc = differentKeyDescriptor
        .replace(/ /g, '_')
        .replace(/\W/g, '');
    }
    let timestamp = new Date(message.timestamp).getTime();
    if (differentKey && notPersonalKey && channelConfig != null) {
      if (timestamp > Date.now() - IgnoreDiffKeyAge) {
        let keyChangeWatcher = keyChangeWatchers[channelId];
        if (keyChangeWatcher == null)
          keyChangeWatchers[channelId] = { different: 1, sameKeyTime: 0 };
        else if (
          timestamp > keyChangeWatcher.sameKeyTime &&
          ++keyChangeWatcher.different === DiffKeyTrigger &&
          KeyRotators[channelConfig.k] == null
        ) {
          if (myKey == null) myKey = DataBase.keys[channelConfig.k];
          if (myKey.t /*type*/ !== 2 /*conversation*/)
            (async () => {
              let popupOverride = {};
              let popup = PopupManager.NewPromise(
                `Would you like to set key to "${differentKeyDescriptor}" in "${Utils.FormatDescriptor(
                  channelConfig.d
                )}"`,
                true,
                popupOverride
              );
              const autoCancel = () => {
                keyChangeWatcher.different = 0;
                popupOverride.cancel();
              };
              Utils.AddMessageDeleteListener(message.id, autoCancel);
              let changeKey = await popup;
              Utils.RemoveMessageDeleteListener(message.id, autoCancel);
              if (changeKey) {
                if (channelId === Cache.channelId) {
                  await Utils.SetCurrentChannelKey(keyHashBase64);
                  MenuBar.Update();
                } else Utils.SetChannelKey(channelId, keyHashBase64);
              }
            })();
        }
      }
    } else if (timestamp > Date.now() - IgnoreDiffKeyAge) {
      let keyChangeWatcher = keyChangeWatchers[channelId];
      if (keyChangeWatcher == null)
        keyChangeWatchers[channelId] = { different: 0, sameKeyTime: timestamp };
      else if (keyChangeWatcher.sameKeyTime < timestamp) {
        keyChangeWatcher.different = 0;
        keyChangeWatcher.sameKeyTime = timestamp;
      }
    }

    const preservedNativeKlipyEmbeds = Array.isArray(message.embeds)
      ? message.embeds.filter(isNativeKlipyEmbed)
      : [];

    if (preservedNativeKlipyEmbeds.length) {
      gifResolverLog('klipy', 'native-unfurl:preserve-server-embed', {
        messageId: message?.id || null,
        count: preservedNativeKlipyEmbeds.length,
        embeds: preservedNativeKlipyEmbeds.map((embed) => ({
          type: embed?.type || null,
          url: embed?.url || null,
          provider: embed?.provider?.name || null,
          imageUrl: embed?.image?.url || null,
          videoUrl: embed?.video?.url || null,
          proxyUrl:
            embed?.video?.proxy_url ||
            embed?.image?.proxy_url ||
            embed?.thumbnail?.proxy_url ||
            null,
        })),
      });
    }

    // Keep only Discord's native KLIPY preview. SDC's encrypted-message embed
    // and stale third-party embeds are still removed as before.
    message.embeds = preservedNativeKlipyEmbeds;

    if (payloadBuffer.byteLength === 16) {
      if (!differentKey) message.content = '<:ENC:465534298662109185>⁣';
      //invisible separator at the end to make the emoji smaller
      else message.content = `<:ENC_${differentKeyDesc}:611264394747183115>⁣`;
    } else {
      let content;
      try {
        let encryptedMessage = payloadBuffer.slice(16);
        content = await Utils.AesDecryptDecompressString(key, encryptedMessage);
      } catch (e) {
        message.content = invalidMessage;
        message.attachments = [];
        return false;
      }
      if (!differentKey)
        message.content = '<:ENC:465534298662109185>' + content;
      else
        message.content =
          `<:ENC_${differentKeyDesc}:611264394747183115>` + content;
      //message.content = content.replace(/^/gm, "<:ENC:465534298662109185>"); //bad for code blocks
      postProcessMessage(message, content);
    }

    if (
      message.attachments != null &&
      message.attachments.length !== 0 &&
      !ignoreAttachments
    ) {
      let attachments = message.attachments;
      message.attachments = [];
      for (let attachment of attachments) {
        try {
          await decryptAttachment(
            key,
            keyHashBase64,
            message,
            attachment,
            channelConfig
          );
        } catch (e) {
          attachment.filename = '-----ENCRYPTED FILE FAILED TO DECRYPT-----';
        }
      }
    }
    return false;
  }

  function getSystemMessageProperty(propertyName, sysmsg) {
    let match = new RegExp(`\\*${propertyName}\\*:\\s*\`(.*?)\``, 'i').exec(
      sysmsg
    );
    return match == null ? null : match[1];
  }

  const unknownKeySystemMessage = CONFIG.messages.unknownKeySystem;
  const invalidSystemMessage = CONFIG.messages.invalidSystem;
  const blockedSystemMessage = CONFIG.messages.blocked;
  var keyExchangeWhitelist = {};
  const pendingV2KeyExchanges = {};

  function kexTranscriptInit(initiatorId, responderId, channelId, ephBytes) {
    return Utils.StringToUtf8Bytes(
      [
        'SDC-KEX-V2',
        'INIT',
        String(initiatorId),
        String(responderId),
        String(channelId),
        Utils.BytesToBase64(ephBytes),
      ].join('|')
    );
  }

  function kexTranscriptResponse(
    initiatorId,
    responderId,
    channelId,
    initEphBytes,
    responseEphBytes
  ) {
    return Utils.StringToUtf8Bytes(
      [
        'SDC-KEX-V2',
        'RESP',
        String(initiatorId),
        String(responderId),
        String(channelId),
        Utils.BytesToBase64(initEphBytes),
        Utils.BytesToBase64(responseEphBytes),
      ].join('|')
    );
  }

  async function identityFingerprint(publicBytes) {
    return Utils.BytesToBase64url(
      (await Utils.Sha256(publicBytes)).slice(0, 16)
    );
  }

  async function verifyAndPinPeerIdentity(
    userId,
    publicBytes,
    signatureBytes,
    transcript
  ) {
    const publicKey = await Utils.IdentityImportPublicKey(publicBytes);
    if (!(await Utils.IdentityVerify(publicKey, signatureBytes, transcript)))
      throw new Error('Peer identity signature verification failed');

    const encoded = Utils.BytesToBase64(publicBytes);
    const fingerprint = await identityFingerprint(publicBytes);
    if (!DataBase.peerIdentityKeys) DataBase.peerIdentityKeys = {};
    const known = DataBase.peerIdentityKeys[userId];

    if (known && known.publicKey !== encoded) {
      const oldFingerprint = known.fingerprint || 'unknown';
      const accepted = await PopupManager.NewPromise(
        `SECURITY WARNING: the cryptographic identity for this user changed.\n\nOld: ${oldFingerprint}\nNew: ${fingerprint}\n\nAccept the new identity key?`,
        true
      );
      if (!accepted)
        throw new Error('Peer identity key changed and replacement was rejected');
    }

    DataBase.peerIdentityKeys[userId] = {
      publicKey: encoded,
      fingerprint,
      firstSeen: known?.firstSeen || Date.now(),
      lastSeen: Date.now(),
    };
    Utils.dbChanged = true;
    return { publicKey, fingerprint };
  }

  async function signKexTranscript(transcript) {
    const privateKey = await readIdentityPrivateKey();
    return await Utils.IdentitySign(privateKey, transcript);
  }

  async function deriveConversationKeyV2(
    privateKey,
    remotePublicKey,
    initiatorId,
    responderId,
    channelId,
    initEphBytes,
    responseEphBytes
  ) {
    const sharedSecret = await Utils.DhGetSecretFull(
      privateKey,
      remotePublicKey
    );
    const salt = await Utils.Sha256(
      Utils.ConcatBuffers([initEphBytes, responseEphBytes])
    );
    const info = Utils.StringToUtf8Bytes(
      `SDC-KEX-V2|${initiatorId}|${responderId}|${channelId}`
    );
    return await Utils.HkdfSha256(
      sharedSecret,
      salt,
      info,
      32
    );
  }

  // Peers explicitly refused by the local user. This is persisted inside the SDC
  // database so a message refresh/restart cannot reopen the same confirmation.
  // The entry is intentionally peer-wide: a refused stranger cannot just request a
  // different key to force another popup. It is cleared only by a manual DM exchange.
  function IsDeniedKeyPeer(userId) {
    return !!(
      userId &&
      DataBase &&
      DataBase.deniedKeyPeers &&
      Object.prototype.hasOwnProperty.call(DataBase.deniedKeyPeers, userId)
    );
  }

  function DenyKeyPeer(userId, reason) {
    if (!userId || !DataBase) return;
    if (!DataBase.deniedKeyPeers) DataBase.deniedKeyPeers = {};
    DataBase.deniedKeyPeers[userId] = {
      t: Date.now(),
      r: reason || 'denied',
    };
    Utils.dbChanged = true;
    // Save immediately: a Discord refresh right after pressing Cancel must not lose
    // the refusal before the regular 10-second database save interval runs.
    try {
      Utils.FastSaveDb();
    } catch (error) {
      console.warn('[SDC] Could not immediately persist denied key peer', error);
    }
  }

  function ClearDeniedKeyPeer(userId) {
    if (!IsDeniedKeyPeer(userId)) return;
    delete DataBase.deniedKeyPeers[userId];
    if (Object.keys(DataBase.deniedKeyPeers).length === 0)
      delete DataBase.deniedKeyPeers;
    Utils.dbChanged = true;
    try {
      Utils.FastSaveDb();
    } catch (error) {
      console.warn('[SDC] Could not immediately persist cleared key peer refusal', error);
    }
    console.log('[SDC] Previous key refusal cleared by manual exchange', { userId });
  }

  async function processSystemMessage(message, sysmsg) {
    let channel = Discord.getChannel(message.channel_id);
    if (channel.type !== 1 /*DM*/) return false;

    message.embeds = [];
    let timestamp = new Date(message.timestamp).getTime();
    let channelConfig = Utils.GetOrCreateChannelConfig(message.channel_id);
    let oldMessage = true;
    if (
      channelConfig.s /*systemMessageTime*/ == null ||
      timestamp > channelConfig.s
    ) {
      channelConfig.s = timestamp;
      Utils.dbChanged = true;
      oldMessage = false;
    }

    let messageType = getSystemMessageProperty('type', sysmsg);
    let userId;
    if (message.author == null) oldMessage = true;
    else {
      userId = message.author.id;
      if (userId === Discord.getCurrentUser().id) oldMessage = true;
    }

    if (
      DataBase.isSecondary &&
      !keyExchangeWhitelist[userId] &&
      (messageType !== 'KEY SHARE' ||
        DataBase.trustedKeys == null ||
        !DataBase.trustedKeys[channelConfig.s])
    )
      oldMessage = true; //check the sender key later

    let nonForced = true;
    if (!oldMessage) {
      // Require an explicit decision for a new incoming cryptographic exchange.
      // Do not leave the message as SYSTEM MESSAGE BLOCKED while the promise is
      // waiting: processUpdateSystemMessage() is intentionally asynchronous, so
      // that temporary value is what Discord renders until the user answers.
      const isIncomingKeyExchange =
        messageType === 'DH KEY' ||
        messageType === 'DH RESPONSE' ||
        messageType === 'PERSONAL KEY';

      if (
        isIncomingKeyExchange &&
        IsDeniedKeyPeer(userId) &&
        !keyExchangeWhitelist[userId]
      ) {
        const username =
          message.author.global_name || message.author.username || userId;
        const discriminator =
          message.author.discriminator && message.author.discriminator !== '0'
            ? `#${message.author.discriminator}`
            : '';
        message.content = `💻 Key exchange from ${username}${discriminator} ignored (previously declined).`;
        message.embeds = [];
        return true;
      }

      if (isIncomingKeyExchange && !keyExchangeWhitelist[userId]) {
        const username =
          message.author.global_name || message.author.username || userId;
        const discriminator =
          message.author.discriminator && message.author.discriminator !== '0'
            ? `#${message.author.discriminator}`
            : '';

        message.content = `💻 Key exchange request from ${username}${discriminator} — waiting for your confirmation…`;
        message.embeds = [];

        let accepted = false;
        try {
          accepted = await PopupManager.NewPromise(
            `Would you like to accept key exchange from ${username}${discriminator}?`,
            true
          );
        } catch (error) {
          console.error('[SDC] Unable to display key exchange confirmation', error);
          message.content = '💻 Unable to display the key exchange confirmation.';
          return true;
        }

        if (!accepted) {
          console.log('[SDC] Incoming key exchange denied', {
            userId,
            messageType,
          });
          DenyKeyPeer(userId, 'incoming-exchange');
          message.content = `💻 Key exchange from ${username}${discriminator} declined.`;
          return true;
        }

        keyExchangeWhitelist[userId] = true;
        console.log('[SDC] Incoming key exchange accepted', {
          userId,
          messageType,
        });
      }

      // Preserve the original key-request sharing policy. This flag is used by
      // KEY REQUEST/ShareKey and is independent from accepting the DH exchange.
      if (
        !(
          /friend/i.test(DataBase.autoKeyExchange) &&
          typeof Discord.isFriend === 'function' &&
          !Discord.isFriend(userId)
        )
      )
        nonForced = false;
    }

    switch (messageType) {
      case 'DH KEY':
        {
          message.content = '💻 H-hi I would like to know you better';
          if (oldMessage) return false;

          const protocol = getSystemMessageProperty('protocol', sysmsg);
          if (protocol === '2') {
            try {
              const ephPayload = getSystemMessageProperty('ephKey', sysmsg);
              const identityPayload = getSystemMessageProperty(
                'identityKey',
                sysmsg
              );
              const signaturePayload = getSystemMessageProperty(
                'signature',
                sysmsg
              );
              if (!ephPayload || !identityPayload || !signaturePayload) break;

              const initiatorId = message.author.id;
              const responderId = Discord.getCurrentUser().id;
              const initEphBytes = Utils.PayloadDecode(ephPayload);
              const identityBytes = Utils.PayloadDecode(identityPayload);
              const signatureBytes = Utils.PayloadDecode(signaturePayload);
              const initTranscript = kexTranscriptInit(
                initiatorId,
                responderId,
                message.channel_id,
                initEphBytes
              );
              const peerIdentity = await verifyAndPinPeerIdentity(
                userId,
                identityBytes,
                signatureBytes,
                initTranscript
              );

              const initEphPublic = await Utils.DhImportPublicKey(
                initEphBytes
              );
              const responseEphemeral = await Utils.DhGenerateKeys();
              const responseEphBytes = await Utils.DhExportPublicKey(
                responseEphemeral.publicKey
              );
              const conversationKeyBytes = await deriveConversationKeyV2(
                responseEphemeral.privateKey,
                initEphPublic,
                initiatorId,
                responderId,
                message.channel_id,
                initEphBytes,
                responseEphBytes
              );

              const keyHash = await Utils.SaveKey(
                conversationKeyBytes,
                2,
                `DM key with <@${message.author.id}>`
              );
              Utils.KeyShareEvent(keyHash);
              channelConfig.k = keyHash;
              channelConfig.cryptoProtocol = 2;
              if (message.channel_id === Cache.channelId) {
                Cache.channelConfig = channelConfig;
                MenuBar.Update();
              }

              await ensureIdentityKeys();
              const identityPublicBytes = Utils.Base64ToBytes(
                DataBase.identityPublicKey
              );
              const responseTranscript = kexTranscriptResponse(
                initiatorId,
                responderId,
                message.channel_id,
                initEphBytes,
                responseEphBytes
              );
              const responseSignature = await signKexTranscript(
                responseTranscript
              );
              const conversationKey = await Utils.AesImportKey(
                conversationKeyBytes
              );
              const encryptedPersonalKey = await Utils.AesEncrypt(
                conversationKey,
                await Utils.GetKeyBytesByHash(DataBase.personalKeyHash),
                'personal-key'
              );

              const legacyDhPublicPayload = Utils.PayloadEncode(
                Utils.Base64ToBytes(DataBase.dhPublicKey)
              );
              Utils.SendSystemMessage(
                message.channel_id,
                `*type*: \`DH RESPONSE\`\n` +
                  `*protocol*: \`2\`\n` +
                  `*dhKey*: \`${legacyDhPublicPayload}\`\n` +
                  `*ephKey*: \`${Utils.PayloadEncode(responseEphBytes)}\`\n` +
                  `*identityKey*: \`${Utils.PayloadEncode(identityPublicBytes)}\`\n` +
                  `*signature*: \`${Utils.PayloadEncode(responseSignature)}\`\n` +
                  `*personalKey*: \`${Utils.PayloadEncode(encryptedPersonalKey)}\``
              );

              channelConfig.w = 1;
              Utils.dbChanged = true;
              console.log('[SDC][CRYPTO] kex:v2-response-sent', {
                userId,
                keyHash: keyHash?.slice(0, 8),
                peerFingerprint: peerIdentity.fingerprint,
              });
              decryptWaitingMessages(keyHash);
              return true;
            } catch (error) {
              console.error('[SDC][CRYPTO] kex:v2 DH KEY failed', error);
              break;
            }
          }

          // Legacy v1 exchange remains readable for old peers.
          let dhKeyPayload = getSystemMessageProperty('dhKey', sysmsg);
          if (dhKeyPayload == null) break;
          try {
            let dhRemoteKeyBytes = Utils.PayloadDecode(dhKeyPayload);
            let dhRemoteKey = await Utils.DhImportPublicKey(dhRemoteKeyBytes);
            let dhPrivateKey = await Utils.ReadDhKey();
            let sharedSecret = await Utils.DhGetSecret(
              dhPrivateKey,
              dhRemoteKey
            );
            let keyHash = await Utils.SaveKey(
              sharedSecret,
              2,
              `DM key with <@${message.author.id}>`
            );
            Utils.KeyShareEvent(keyHash);
            channelConfig.k = keyHash;
            channelConfig.cryptoProtocol = 1;
            if (message.channel_id === Cache.channelId) {
              Cache.channelConfig = channelConfig;
              MenuBar.Update();
            }

            let dhPublicKeyPayload = Utils.PayloadEncode(
              Utils.Base64ToBytes(DataBase.dhPublicKey)
            );
            let key = await Utils.AesImportKey(sharedSecret);
            let encryptedPersonalKey = await Utils.AesEncryptLegacy(
              key,
              await Utils.GetKeyBytesByHash(DataBase.personalKeyHash)
            );
            let personalKeyPayload = Utils.PayloadEncode(encryptedPersonalKey);
            Utils.SendSystemMessage(
              message.channel_id,
              `*type*: \`DH RESPONSE\`\n*dhKey*: \`${dhPublicKeyPayload}\`\n*personalKey*: \`${personalKeyPayload}\``
            );
            channelConfig.w = 1;
            Utils.dbChanged = true;
            decryptWaitingMessages(keyHash);
          } catch (e) {
            break;
          }
        }
        return true;
      case 'DH RESPONSE':
        {
          message.content = '💻 I like you :3, you can have my number';
          if (oldMessage) return false;

          const protocol = getSystemMessageProperty('protocol', sysmsg);
          if (protocol === '2') {
            try {
              const pending = pendingV2KeyExchanges[userId];
              if (
                !pending ||
                pending.channelId !== message.channel_id ||
                Date.now() - pending.createdAt > 10 * 60 * 1000
              ) {
                throw new Error('No valid pending ephemeral exchange state');
              }

              const responseEphPayload = getSystemMessageProperty(
                'ephKey',
                sysmsg
              );
              const identityPayload = getSystemMessageProperty(
                'identityKey',
                sysmsg
              );
              const signaturePayload = getSystemMessageProperty(
                'signature',
                sysmsg
              );
              const remotePersonalKeyPayload = getSystemMessageProperty(
                'personalKey',
                sysmsg
              );
              if (
                !responseEphPayload ||
                !identityPayload ||
                !signaturePayload ||
                !remotePersonalKeyPayload
              )
                break;

              const initiatorId = Discord.getCurrentUser().id;
              const responderId = message.author.id;
              const responseEphBytes = Utils.PayloadDecode(
                responseEphPayload
              );
              const identityBytes = Utils.PayloadDecode(identityPayload);
              const signatureBytes = Utils.PayloadDecode(signaturePayload);
              const responseTranscript = kexTranscriptResponse(
                initiatorId,
                responderId,
                message.channel_id,
                pending.publicKeyBytes,
                responseEphBytes
              );
              const peerIdentity = await verifyAndPinPeerIdentity(
                userId,
                identityBytes,
                signatureBytes,
                responseTranscript
              );

              const responseEphPublic = await Utils.DhImportPublicKey(
                responseEphBytes
              );
              const conversationKeyBytes = await deriveConversationKeyV2(
                pending.privateKey,
                responseEphPublic,
                initiatorId,
                responderId,
                message.channel_id,
                pending.publicKeyBytes,
                responseEphBytes
              );
              delete pendingV2KeyExchanges[userId];

              const keyHash = await Utils.SaveKey(
                conversationKeyBytes,
                2,
                `DM key with <@${message.author.id}>`
              );
              Utils.KeyShareEvent(keyHash);
              channelConfig.k = keyHash;
              channelConfig.cryptoProtocol = 2;
              Utils.dbChanged = true;
              if (message.channel_id === Cache.channelId) {
                Cache.channelConfig = channelConfig;
                MenuBar.Update();
              }

              const key = await Utils.AesImportKey(conversationKeyBytes);
              const remotePersonalKey = await Utils.AesDecrypt(
                key,
                Utils.PayloadDecode(remotePersonalKeyPayload),
                'personal-key'
              );
              if (remotePersonalKey.byteLength !== 32) break;
              const remotePersonalKeyHash = await Utils.SaveKey(
                remotePersonalKey,
                3,
                `<@${message.author.id}>'s personal key`
              );
              Utils.KeyShareEvent(remotePersonalKeyHash);

              await Utils.SendPersonalKey(message.channel_id);
              delete keyExchangeWhitelist[userId];
              Utils.KeyExchangeEvent(userId);
              decryptWaitingMessages(keyHash);
              decryptWaitingMessages(remotePersonalKeyHash);
              console.log('[SDC][CRYPTO] kex:v2-complete', {
                userId,
                keyHash: keyHash?.slice(0, 8),
                peerFingerprint: peerIdentity.fingerprint,
              });
              return true;
            } catch (error) {
              delete pendingV2KeyExchanges[userId];
              console.error('[SDC][CRYPTO] kex:v2 DH RESPONSE failed', error);
              break;
            }
          }

          // Legacy response from a pre-v22 peer.
          delete pendingV2KeyExchanges[userId];
          let dhKeyPayload = getSystemMessageProperty('dhKey', sysmsg);
          if (dhKeyPayload == null) break;
          let remotePersonalKeyPayload = getSystemMessageProperty(
            'personalKey',
            sysmsg
          );
          if (remotePersonalKeyPayload == null) break;
          try {
            let dhRemoteKeyBytes = Utils.PayloadDecode(dhKeyPayload);
            let dhRemoteKey = await Utils.DhImportPublicKey(dhRemoteKeyBytes);
            let dhPrivateKey = await Utils.ReadDhKey();
            let sharedSecret = await Utils.DhGetSecret(
              dhPrivateKey,
              dhRemoteKey
            );
            let keyHash = await Utils.SaveKey(
              sharedSecret,
              2,
              `DM key with <@${message.author.id}>`
            );
            Utils.KeyShareEvent(keyHash);
            channelConfig.k = keyHash;
            channelConfig.cryptoProtocol = 1;
            Utils.dbChanged = true;
            if (message.channel_id === Cache.channelId) {
              Cache.channelConfig = channelConfig;
              MenuBar.Update();
            }

            let key = await Utils.AesImportKey(sharedSecret);
            let remotePersonalKey = await Utils.AesDecrypt(
              key,
              Utils.PayloadDecode(remotePersonalKeyPayload),
              'personal-key'
            );
            if (remotePersonalKey.byteLength !== 32) break;
            let remotePersonalKeyHash = await Utils.SaveKey(
              remotePersonalKey,
              3,
              `<@${message.author.id}>'s personal key`
            );
            Utils.KeyShareEvent(remotePersonalKeyHash);
            await Utils.SendPersonalKey(message.channel_id);
            delete keyExchangeWhitelist[userId];
            Utils.KeyExchangeEvent(userId);
            decryptWaitingMessages(keyHash);
            decryptWaitingMessages(remotePersonalKeyHash);
          } catch (e) {
            break;
          }
        }
        return true;
      case 'PERSONAL KEY':
        {
          message.content = '💻 Here is my number, now we can talk any time!!';
          if (oldMessage) return false;

          let keyHashPayload = getSystemMessageProperty('key', sysmsg);
          if (keyHashPayload == null) break;
          let remotePersonalKeyPayload = getSystemMessageProperty(
            'personalKey',
            sysmsg
          );
          if (remotePersonalKeyPayload == null) break;
          try {
            let keyHash = Utils.BytesToBase64(
              Utils.PayloadDecode(keyHashPayload)
            );
            let key = await Utils.GetKeyByHash(keyHash);
            if (key == null) {
              message.content = unknownKeySystemMessage;
              return true;
            }

            let remotePersonalKey = await Utils.AesDecrypt(
              key,
              Utils.PayloadDecode(remotePersonalKeyPayload)
            );
            if (remotePersonalKey.byteLength !== 32) break;
            let remotePersonalKeyHash = await Utils.SaveKey(
              remotePersonalKey,
              3 /*personal*/,
              `<@${message.author.id}>'s personal key`
            );
            Utils.KeyShareEvent(remotePersonalKeyHash);

            delete channelConfig.w; //waitingForSystemMessage
            Utils.dbChanged = true;
            delete keyExchangeWhitelist[userId];

            Utils.KeyExchangeEvent(userId);

            decryptWaitingMessages(remotePersonalKeyHash);
          } catch (e) {
            break;
          }
        }
        return true;
      case 'KEY REQUEST':
        {
          message.content = '💻 Hey, can you tell me what this means?';
          if (oldMessage) return false;

          let requestedKeyPayload = getSystemMessageProperty(
            'requestedKey',
            sysmsg
          );
          if (requestedKeyPayload == null) break;
          try {
            let keyHash = Utils.BytesToBase64(
              Utils.PayloadDecode(requestedKeyPayload)
            );

            const requestedKey = DataBase.keys[keyHash];
            const requesterName =
              message.author.global_name || message.author.username || userId;
            const requesterDiscriminator =
              message.author.discriminator && message.author.discriminator !== '0'
                ? `#${message.author.discriminator}`
                : '';
            const requestedDescriptor = requestedKey
              ? Utils.FormatDescriptor(requestedKey.d)
              : keyHash.slice(0, 12) + '…';

            if (IsDeniedKeyPeer(userId)) {
              console.log('[SDC] Key request ignored for previously denied peer', {
                userId,
                keyHash: keyHash.slice(0, 8),
              });
              message.content = `💻 Key request from ${requesterName}${requesterDiscriminator} ignored (previously declined).`;
              return true;
            }

            const allowShare = await PopupManager.NewPromise(
              `Allow ${requesterName}${requesterDiscriminator} to receive key "${requestedDescriptor}"?`,
              true
            );

            if (!allowShare) {
              console.log('[SDC] Incoming key request denied', {
                userId,
                keyHash: keyHash.slice(0, 8),
              });
              DenyKeyPeer(userId, 'key-request');
              Utils.SendSystemMessage(
                message.channel_id,
                `*type*: \`KEY SHARE\`\n*status*: \`DENIED\``
              );
              message.content = `💻 Key request from ${requesterName}${requesterDiscriminator} declined.`;
              return true;
            }

            // The explicit confirmation above is the authorization. Pass null so
            // ShareKey does not open a second sender-side confirmation dialog.
            await Utils.ShareKey(
              keyHash,
              message.channel_id,
              null,
              message.author
            );
          } catch (e) {
            break;
          }
        }
        return true;
      case 'KEY SHARE':
        {
          let status = getSystemMessageProperty('status', sysmsg);
          const statusMsgs = {
            OK: '💻 There you go, take good care of it!',
            DENIED: "💻 That's a secret!!!",
            'NOT FOUND': "💻 Huh? I don't know",
          };
          let statusMsg = statusMsgs[status];
          if (statusMsg == null) break;
          message.content = statusMsg;
          if (oldMessage || status !== 'OK') return false;

          let keyHashPayload = getSystemMessageProperty('key', sysmsg);
          if (keyHashPayload == null) break;
          let sharedKeyPayload = getSystemMessageProperty('sharedKey', sysmsg);
          if (sharedKeyPayload == null) break;
          let keyTypeName = getSystemMessageProperty('keyType', sysmsg);
          if (keyTypeName == null) break;
          let keyDescriptor = getSystemMessageProperty('keyDescriptor', sysmsg);
          if (keyDescriptor == null) break;

          const senderName =
            message.author.global_name || message.author.username || userId;
          const senderDiscriminator =
            message.author.discriminator && message.author.discriminator !== '0'
              ? `#${message.author.discriminator}`
              : '';

          if (IsDeniedKeyPeer(userId)) {
            console.log('[SDC] Shared key ignored for previously denied peer', {
              userId,
              keyTypeName,
              keyDescriptor,
            });
            message.content = `💻 Shared key from ${senderName}${senderDiscriminator} ignored (previously declined).`;
            delete channelConfig.w;
            Utils.dbChanged = true;
            delete keyExchangeWhitelist[userId];
            return true;
          }

          message.content = `💻 ${senderName}${senderDiscriminator} wants to share key "${keyDescriptor}" — waiting for your confirmation…`;

          const acceptSharedKey = await PopupManager.NewPromise(
            `Accept shared key "${keyDescriptor}" from ${senderName}${senderDiscriminator}?`,
            true
          );
          if (!acceptSharedKey) {
            console.log('[SDC] Incoming shared key denied', {
              userId,
              keyTypeName,
              keyDescriptor,
            });
            DenyKeyPeer(userId, 'shared-key');
            message.content = `💻 Shared key from ${senderName}${senderDiscriminator} declined.`;
            delete channelConfig.w;
            Utils.dbChanged = true;
            delete keyExchangeWhitelist[userId];
            return true;
          }

          console.log('[SDC] Incoming shared key explicitly accepted', {
            userId,
            keyTypeName,
            keyDescriptor,
          });
          try {
            let keyHash = Utils.BytesToBase64(
              Utils.PayloadDecode(keyHashPayload)
            );
            let key = await Utils.GetKeyByHash(keyHash);
            if (key == null) {
              message.content = unknownKeySystemMessage;
              return true;
            }

            let sharedKey = await Utils.AesDecrypt(
              key,
              Utils.PayloadDecode(sharedKeyPayload),
              'key-share'
            );
            if (sharedKey.byteLength !== 32) break;
            const keyTypeNames = { GROUP: 1, CONVERSATION: 2, PERSONAL: 3 }; //let's get personal :3
            let keyType = keyTypeNames[keyTypeName];
            if (keyType == null) break;

            if (keyType !== 1 /*group*/) keyDescriptor += ` by <@${userId}>`;

            let keyHidden =
              getSystemMessageProperty('keyHidden', sysmsg) === 'YES';

            let sharedKeyHash = await Utils.SaveKey(
              sharedKey,
              keyType,
              keyDescriptor,
              keyHidden
            );
            Utils.KeyShareEvent(sharedKeyHash);

            delete channelConfig.w; //waitingForSystemMessage
            Utils.dbChanged = true;
            delete keyExchangeWhitelist[userId];

            if (keyType === 1 /*group*/) {
              let sharedChannelsJson = getSystemMessageProperty(
                'sharedChannels',
                sysmsg
              );
              if (sharedChannelsJson != null) {
                let trustedKey =
                  DataBase.trustedKeys != null && DataBase.trustedKeys[keyHash];
                let sharedChannels = JSON.parse(sharedChannelsJson);
                for (let channelId of sharedChannels) {
                  let channelConfig = DataBase.channels[channelId];
                  if (channelConfig == null) {
                    let sharedChannelConfig = Utils.NewChannelConfig(
                      channelId,
                      sharedKeyHash
                    );
                    if (channelId === Cache.channelId) {
                      Cache.channelConfig = sharedChannelConfig;
                      MenuBar.Update();
                    }
                  } else if (trustedKey) {
                    let currentKey = DataBase.keys[channelConfig.k /*keyHash*/];
                    if (currentKey.t /*type*/ !== 1 /*group*/) continue;
                    channelConfig.k /*keyHash*/ = sharedKeyHash;
                    Utils.dbChanged = true;
                    if (channelId === Cache.channelId) MenuBar.Update();
                  }
                }
              }
            }
            decryptWaitingMessages(sharedKeyHash);
          } catch (e) {
            break;
          }
        }
        return true;
      default:
        message.content = invalidSystemMessage;
        return false;
    }
    message.content = invalidSystemMessage;
    return true;
  }

  function processUpdateSystemMessage(message, sysmsg) {
    processSystemMessage(message, sysmsg).then((delayed) => {
      if (delayed) Utils.UpdateMessageContent(message);
    });
  }

  const descriptionRegex = CONFIG.patterns.description;
  async function processEmbeds(message, ignoreAttachments) {
    if (message.embeds == null || message.embeds.length !== 1) return;
    let embed = message.embeds[0];
    if (
      embed.footer == null ||
      (embed.footer.text !== 'SimpleDiscordCrypt' &&
        embed.footer.text !== '🔒')
    )
      return;

    if (embed.author == null) return;

    if (embed.author.name === '-----ENCRYPTED MESSAGE-----') {
      if (!descriptionRegex.test(embed.description)) return;
      return await decryptMessage(
        message,
        embed.description,
        ignoreAttachments
      );
    } else if (embed.author.name === '-----SYSTEM MESSAGE-----') {
      processUpdateSystemMessage(message, embed.description);
    }
  }

  function handleChannelSelect(event) {
    if (Blacklist != null) {
      let guildId = event.guildId;
      Cache.channelBlacklist = guildId == null ? null : Blacklist[guildId];
    }
    let channelId = event.channelId;
    if (channelId != null) {
      Cache.channelId = channelId;
      Cache.channelConfig = Utils.GetChannelConfig(channelId);

      Utils.ChannelSelectEvent(channelId);

      setTimeout(() => {
        MenuBar.Update();
      }, 0);
      setTimeout(() => {
        PopupManager.Update();
      }, 0);
      //Update after event is processed by Discord
    }

    return Discord.original_dispatch.apply(this, arguments);
  }

  function handleDelete(event) {
    Utils.MessageDeleteEvent(event.id);
    return Discord.original_dispatch.apply(this, arguments);
  }
  function handleDeletes(event) {
    Utils.MessageDeleteBulkEvent(event.ids);
    return Discord.original_dispatch.apply(this, arguments);
  }

  const EMBED_LINKS_CHECK = 0x4000n;
  const prefixRegex = CONFIG.patterns.prefix;
  const noencprefixRegex = CONFIG.patterns.noencPrefix;
  async function handleSend(channelId, message, forceSimple) {
    let content = message.content;

    // Ne pas chiffrer les messages système
    if (content && content.includes('-----SYSTEM MESSAGE-----')) {
      return null;
    }

    let channelConfig = Utils.GetChannelConfig(channelId);
    let prefixMatch = prefixRegex.exec(content);
    if (channelConfig == null) {
      if (prefixMatch != null) {
        if (Cache.channelBlacklist !== 1)
          channelConfig = Utils.NewChannelConfig(channelId);
      } else return null;
    }
    if (prefixMatch != null) content = content.substring(prefixMatch[0].length);
    else if (!channelConfig.e) return null;

    if (Cache.channelBlacklist === 1) {
      if (prefixMatch != null) message.content = content;
      return null;
    }

    let noencprefixMatch = noencprefixRegex.exec(content);
    if (noencprefixMatch != null) {
      message.content = content.substring(noencprefixMatch[0].length);
      return null;
    }

    const klipyNativeUnfurlUrls =
      extractKlipyNativeUnfurlUrls(content);

    if (klipyNativeUnfurlUrls.length) {
      gifResolverLog('klipy', 'native-unfurl:expose-transport-url', {
        channelId,
        count: klipyNativeUnfurlUrls.length,
        urls: klipyNativeUnfurlUrls,
        privacy:
          'KLIPY URL is intentionally plaintext so Discord can generate its native embed; message text remains encrypted.',
      });
    }

    let key = await Utils.GetKeyByHash(channelConfig.k);
    let keyHashBytes = Utils.Base64ToBytes(channelConfig.k);
    let messageBytes;
    if (content !== '') {
      let encryptedMessage =
        channelConfig.cryptoProtocol === 1
          ? await Utils.AesEncryptCompressStringLegacy(key, content)
          : await Utils.AesEncryptCompressString(key, content);
      messageBytes = Utils.ConcatBuffers([keyHashBytes, encryptedMessage]);
    } else messageBytes = keyHashBytes;

    let payload = Utils.PayloadEncode(messageBytes);

    let channel = Discord.getChannel(channelId);
    if (
      forceSimple ||
      Cache.channelBlacklist === 2 ||
      (channel.type === 0 &&
        !Utils.Can(EMBED_LINKS_CHECK, Discord.getCurrentUser(), channel))
    ) {
      message.content = appendKlipyNativeUnfurlTransport(
        payload + ' `🔒`',
        klipyNativeUnfurlUrls
      );
    } else {
      // Pour les messages avec attachments uniquement (content vide), ne pas utiliser d'embed
      // car cela empêche l'affichage des attachments
      if (content === '') {
        message.content = appendKlipyNativeUnfurlTransport(
        payload + ' `🔒`',
        klipyNativeUnfurlUrls
      );
      } else {
        message.content = klipyNativeUnfurlUrls.join('\n');
        message.embed = {
          color: BaseColorInt,
          author: {
            name: '-----ENCRYPTED MESSAGE-----',
            icon_url: 'https://i.imgur.com/pFuRfDE.png',
            url: 'http://gitlab.com/An0/SimpleDiscordCrypt',
          },
          description: payload,
          footer: {
            text: '🔒',
            icon_url: 'https://i.imgur.com/zWXtTpX.png',
          },
        };
      }
    }
    return key;
  }

  async function getChannelKey(channelId) {
    let channelConfig = Utils.GetChannelConfig(channelId);
    if (
      channelConfig == null ||
      !channelConfig.e ||
      Cache.channelBlacklist === 1
    ) {
      return null;
    }

    return await Utils.GetKeyByHash(channelConfig.k);
  }

  // ============================================================================
  // SECTION 5: FILE UPLOAD & ATTACHMENT HANDLING
  // ============================================================================

  const filenameLimit = CONFIG.limits.maxFilenameLength;
  const filenameRegex = CONFIG.patterns.filename;
  async function encryptFilename(key, filename, legacyCrypto = false) {
    let filenameParts = filenameRegex.exec(filename);
    let filenameMax = filenameLimit - filenameParts[2].length;
    filename = filenameParts[1].substr(0, filenameMax) + filenameParts[2];

    let encryptedFilename;
    let filenameBytes = Utils.StringToUtf8Bytes(filename);
    if (filenameBytes.byteLength > filenameLimit)
      filenameBytes = Utils.StringToUtf8Bytes('file' + filenameParts[2]);
    do {
      encryptedFilename = Utils.BytesToBase64url(
        legacyCrypto
          ? await Utils.AesEncryptLegacy(key, filenameBytes)
          : await Utils.AesEncrypt(key, filenameBytes, 'filename')
      );
    } while (
      encryptedFilename.startsWith('_') ||
      encryptedFilename.endsWith('_')
    ); //this character is trimmed by discord (the solution assumes that the encryption looks fully random)

    return encryptedFilename;
  }

  function fixPendingReply(messageOptions) {
    const messageReference = messageOptions?.messageReference;

    if (messageReference != null && Discord.getMessage != null) {
      const referencedMessage = Discord.getMessage(
        messageReference.channel_id,
        messageReference.message_id
      );
      const referencedChannel = Discord.getChannel(messageReference.channel_id);

      if (referencedMessage && referencedChannel) {
        Discord.dispatch({
          type: 'CREATE_PENDING_REPLY',
          message: referencedMessage,
          channel: referencedChannel,
          shouldMention: messageOptions.allowedMentions?.replied_user != false,
          showMentionToggle: true,
        });
      }
    }
  }

  async function handleUpload(params) {
    let { channelId, file, message, hasSpoiler, filename } = params;

    let key = await handleSend(channelId, message, true);
    if (key == null) return;

    if (hasSpoiler) {
      params.hasSpoiler = false;
      if (!filename.startsWith('SPOILER_')) filename = 'SPOILER_' + filename;
    }

    try {
      const legacyCrypto =
        Utils.GetChannelConfig(channelId)?.cryptoProtocol === 1;
      let encryptedFilename = await encryptFilename(
        key,
        filename,
        legacyCrypto
      );
      let fileBuffer = await Utils.ReadFile(file);
      let encryptedBuffer = legacyCrypto
        ? await Utils.AesEncryptLegacy(key, fileBuffer)
        : await Utils.AesEncrypt(key, fileBuffer, 'file');
      params.file = new File([encryptedBuffer], encryptedFilename);
      params.filename = encryptedFilename;
    } catch (e) {
      params.file = null;
    }
  }

  async function handleUploadFiles(params) {

    let { channelId, uploads, parsedMessage } = params;

    let key = await handleSend(channelId, parsedMessage, true);
    if (key == null) return;

    let encryptedUploads = [];
    const legacyCrypto =
      Utils.GetChannelConfig(channelId)?.cryptoProtocol === 1;

    try {
      for (let editableFile of uploads) {
        let filename = editableFile.filename;
        let file = editableFile.item.file;

        // Gérer le spoiler
        if (editableFile.spoiler) {
          editableFile.spoiler = false;
          if (!filename.startsWith('SPOILER_'))
            filename = 'SPOILER_' + filename;
        }

        // Chiffrer le nom du fichier
        let encryptedFilename = await encryptFilename(
          key,
          filename,
          legacyCrypto
        );
        let fileBuffer = await Utils.ReadFile(file);
        let encryptedBuffer = legacyCrypto
          ? await Utils.AesEncryptLegacy(key, fileBuffer)
          : await Utils.AesEncrypt(key, fileBuffer, 'file');
        let encryptedFile = new File([encryptedBuffer], encryptedFilename);

        // Mettre à jour l'objet editableFile
        editableFile.filename = encryptedFilename;
        editableFile.item.file = encryptedFile;
        editableFile.ENCRYPTED_FILE = encryptedFile;

        encryptedUploads.push(editableFile);
      }

      // Remplacer les uploads par les versions chiffrées
      params.uploads = encryptedUploads;
    } catch (err) {
      Utils.Error(err);
    }
  }

  async function handleInstantUploads(channelId, fileList, draftType) {
    let message = { content: '' };
    let key = await handleSend(channelId, message, true);
    if (key == null)
      return Discord.original_instantBatchUpload.apply(this, arguments);

    try {
      const legacyCrypto =
        Utils.GetChannelConfig(channelId)?.cryptoProtocol === 1;
      for (let file of fileList) {
        let encryptedFilename = await encryptFilename(
          key,
          file.name,
          legacyCrypto
        );
        let fileBuffer = await Utils.ReadFile(file);
        let encryptedBuffer = legacyCrypto
          ? await Utils.AesEncryptLegacy(key, fileBuffer)
          : await Utils.AesEncrypt(key, fileBuffer, 'file');
        let encryptedFile = new File([encryptedBuffer], encryptedFilename);

        Discord.upload({
          channelId,
          file: encryptedFile,
          draftType,
          message,
          hasSpoiler: false,
          filename: encryptedFilename,
        });
      }
    } catch (err) {
      Utils.Error(err);
    }
  }

  async function handleCloudUpload() {
    let key = await getChannelKey(this.channelId);
    if (key == null) return await Discord.cloudUpload.apply(this, arguments);

    try {
      let filename = this.filename;
      let file = this.item.file;
      const legacyCrypto =
        Utils.GetChannelConfig(this.channelId)?.cryptoProtocol === 1;
      let encryptedFilename = await encryptFilename(
        key,
        filename,
        legacyCrypto
      );
      let fileBuffer = await Utils.ReadFile(file);
      let encryptedBuffer = legacyCrypto
        ? await Utils.AesEncryptLegacy(key, fileBuffer)
        : await Utils.AesEncrypt(key, fileBuffer, 'file');
      let encryptedFile = new File([encryptedBuffer], encryptedFilename);

      this.ENCRYPTED_FILE = encryptedFile;

      return await Discord.cloudUpload.apply(this, arguments);
    } catch (err) {
      Utils.Error(err);
    }
  }

  function handleGetUploadPayload(cloudFileUpload) {
    // Chercher si ce fichier a été chiffré
    const originalFilename = cloudFileUpload.filename;
    const encryptedData = encryptedFilesMap.get(originalFilename);

    if (encryptedData && encryptedData.channelId === cloudFileUpload.channelId) {

      // Remplacer le fichier dans cloudFileUpload
      if (cloudFileUpload.item && cloudFileUpload.item.file) {
        cloudFileUpload.item.file = encryptedData.encryptedFile;
        cloudFileUpload.filename = encryptedData.encryptedFilename;
      }

      // Nettoyer la Map
      encryptedFilesMap.delete(originalFilename);
    }

    let result = Discord.original_getUploadPayload.apply(this, arguments);

    return result;
  }

  async function handleUploadFileToCloud() {
    if (!this.ENCRYPTED_FILE) {
      return await Discord.original_uploadFileToCloud.apply(this, arguments);
    }

    let item = this.item;
    let originalFile = item.file;
    item.file = this.ENCRYPTED_FILE;

    let resultPromise = Discord.original_uploadFileToCloud.apply(
      this,
      arguments
    );

    item.file = originalFile;

    return await resultPromise;
  }

  var clearAttachmentBlockedChannels = new Set();
  function handleClearAttachments(event) {
    if (!clearAttachmentBlockedChannels.has(event.channelId))
      return Discord.original_dispatch.apply(this, arguments);
  }

  const eventHandlers = {
    CHANNEL_SELECT: handleChannelSelect,
    LOAD_MESSAGES_SUCCESS: handleMessages,
    //'LOAD_MESSAGES_SUCCESS_CACHED': handleMessages,
    LOAD_MESSAGES_AROUND_SUCCESS: handleMessages,
    LOAD_PINNED_MESSAGES_SUCCESS: handleMessages,
    LOAD_RECENT_MENTIONS_SUCCESS: handleMessages,
    SEARCH_FINISH: handleSearch,
    MESSAGE_CREATE: handleMessage,
    MESSAGE_UPDATE: handleUpdate,
    MESSAGE_DELETE: handleDelete,
    MESSAGE_DELETE_BULK: handleDeletes,
    UPLOAD_ATTACHMENT_CLEAR_ALL_FILES: handleClearAttachments,
    UPLOAD_ATTACHMENT_ADD_FILES: handleAddFiles,
  };

  // Map pour stocker les fichiers chiffrés par leur nom original
  const encryptedFilesMap = new Map();

  async function handleAddFiles(event) {

    // Vérifier si on est dans un canal chiffré
    const channelId = event.channelId;
    const channelConfig = Utils.GetChannelConfig(channelId);

    if (!channelConfig || !channelConfig.e) {
      return Discord.original_dispatch.apply(this, arguments);
    }

    const key = await Utils.GetKeyByHash(channelConfig.k);
    const legacyCrypto = channelConfig.cryptoProtocol === 1;

    if (event.files && key) {
      const encryptedFiles = [];

      for (let fileItem of event.files) {
        try {
          // Les fichiers peuvent être wrappés dans un objet avec une propriété 'file'
          const file = fileItem.file || fileItem;
          const filename = file.name;

          const encryptedFilename = await encryptFilename(
            key,
            filename,
            legacyCrypto
          );
          const fileBuffer = await Utils.ReadFile(file);
          const encryptedBuffer = legacyCrypto
            ? await Utils.AesEncryptLegacy(key, fileBuffer)
            : await Utils.AesEncrypt(key, fileBuffer, 'file');
          const encryptedFile = new File([encryptedBuffer], encryptedFilename);

          // Stocker dans la Map avec le nom original comme clé
          encryptedFilesMap.set(filename, {
            encryptedFile,
            encryptedFilename,
            channelId
          });

          // Conserver la structure originale si c'est un wrapper
          const encryptedItem = fileItem.file ? { ...fileItem, file: encryptedFile } : encryptedFile;
          encryptedFiles.push(encryptedItem);
        } catch (err) {
          console.error('[SDC Upload] Erreur chiffrement fichier:', err);
          encryptedFiles.push(fileItem); // Garder l'original en cas d'erreur
        }
      }

      // Remplacer les fichiers par les versions chiffrées
      event.files = encryptedFiles;
    }

    return Discord.original_dispatch.apply(this, arguments);
  }

  var messageLocks = [];
  var UnlockMessages;
  function LockMessages() {
    Discord.detour_dispatch = async function (event) {
      if (
        event.type === 'LOAD_MESSAGES_SUCCESS' ||
        event.type === 'MESSAGE_CREATE' ||
        event.type === 'MESSAGE_UPDATE'
      ) {
        await new Promise((resolve) => {
          messageLocks.push(resolve);
        });

        return await Discord.detour_dispatch.apply(this, arguments);
      }

      return await Discord.original_dispatch.apply(this, arguments);
    };

    UnlockMessages = (lifted) => {
      if (!lifted) Discord.detour_dispatch = Discord.dispatch;
      for (let unlockMessage of messageLocks) unlockMessage();
      messageLocks = [];
    };
  }

  async function LoadBlacklist() {
    // v23: the original plugin downloaded a remotely controlled list of guild
    // IDs from the upstream GitLab repository. We deliberately disable that
    // dependency: no remote request is performed and no guild is restricted.
    Blacklist = {};
    Cache.channelBlacklist = null;

    gifResolverLog('security', 'remote-guild-blacklist:disabled', {
      source: null,
      behavior: 'all guilds unrestricted',
    });

    // Preserve the cache refresh behavior that followed the old blacklist
    // download, because other startup code relies on Cache being current.
    for (let i = 1; ; i++) {
      if ((await Utils.RefreshCache()) || i === 10) break;
      await Utils.Sleep(i * 200);
    }

    Cache.channelBlacklist = null;
    MenuBar.Update();
  }

  function HandleDispatch(event) {
    let handler = eventHandlers[event.type];
    if (handler !== undefined) {
      return handler.apply(this, arguments);
    }

    return Discord.original_dispatch.apply(this, arguments);
  }

  // ============================================================================
  // SECTION 6: PLUGIN LIFECYCLE & EVENT HOOKS
  // ============================================================================

  var dbSaveInterval;
  function Load() {
    Utils.RefreshCache();

    Discord.detour_enqueue = function () {
      // Capturer le contexte et les arguments avant d'entrer dans l'async
      const self = this;
      const args = arguments;

      // Discord s'attend à recevoir une Promise, il faut la retourner
      return (async () => {
        // Discord Canary 2026: sendMessage reçoit directement (channelId, message, ...) au lieu de packet
        let channelId, message;

        // Essayer de détecter la structure
        if (args.length > 0 && args[0]) {
          const firstArg = args[0];

          // Ancien format: packet.message.channelId
          if (firstArg.message && firstArg.message.channelId) {
            channelId = firstArg.message.channelId;
            message = firstArg.message;
          }
          // Format possible: { channelId, message }
          else if (firstArg.channelId) {
            channelId = firstArg.channelId;
            message = firstArg;
          }
          // Format moderne: sendMessage(channelId, messageObject, ...)
          else if (typeof firstArg === 'string' && args[1]) {
            channelId = firstArg;
            message = args[1];
          }
          // Fallback: le premier arg est le message avec channelId dedans
          else if (firstArg.channel_id) {
            channelId = firstArg.channel_id;
            message = firstArg;
          }
        }

        if (channelId && message) {
          await handleSend(channelId, message, true);
        }

        // Nettoyer la propriété _sdc_system_message avant d'appeler Discord
        if (message && message._sdc_system_message) {
          delete message._sdc_system_message;
        }

        // Appeler la fonction originale et retourner sa Promise
        const result = Discord.original_enqueue.apply(Discord.enqueueTarget, args);

        return result;
      })();
    };

    if (Discord.detour_editMessage != null) {
      Discord.detour_editMessage = function () {
        const args = Array.from(arguments);

        return (async () => {
          let channelId = null;
          let contentContainer = null;
          let contentIndex = -1;
          let contentWasString = false;

          // Known Discord shapes include:
          //   editMessage(channelId, messageId, contentString)
          //   editMessage(channelId, messageId, {content: ...})
          //   editMessage(channelId, {content: ...})
          //   editMessage({channelId, content: ...})
          if (typeof args[0] === 'string') channelId = args[0];
          else if (args[0] && typeof args[0] === 'object')
            channelId = args[0].channelId || args[0].channel_id || null;

          // Prefer structured message/content objects because they preserve other
          // edit options. Fall back to the third string argument used by Discord's
          // classic MessageActions.editMessage signature.
          for (const index of [2, 1, 0]) {
            const value = args[index];
            if (value && typeof value === 'object' && typeof value.content === 'string') {
              contentContainer = value;
              contentIndex = index;
              break;
            }
          }

          if (!contentContainer && typeof args[2] === 'string') {
            contentContainer = { content: args[2] };
            contentIndex = 2;
            contentWasString = true;
          }

          if (channelId && contentContainer) {
            await handleSend(channelId, contentContainer, true);

            if (contentWasString) args[contentIndex] = contentContainer.content;
            else args[contentIndex] = contentContainer;
          }

          return Reflect.apply(
            Discord.original_editMessage,
            Discord.editMessageTarget,
            args
          );
        })();
      };
    }

    Discord.detour_dispatch = HandleDispatch;

    Discord.detour_upload = function (params) {
      (async () => {
        await handleUpload(params);

        Discord.original_upload.apply(this, arguments);
      })();
    };

    Discord.detour_instantBatchUpload = function () {
      handleInstantUploads.apply(this, arguments);
    };

    Discord.detour_uploadFiles = function (params) {
      (async () => {
        const channelId = params.channelId;
        clearAttachmentBlockedChannels.add(channelId);

        await handleUploadFiles(params);


        fixPendingReply(params.options);

        Discord.original_uploadFiles.apply(this, arguments);

        clearAttachmentBlockedChannels.delete(channelId);
        Discord.dispatch({
          type: 'UPLOAD_ATTACHMENT_CLEAR_ALL_FILES',
          channelId,
          draftType: 0,
        });
      })();
    };

    Discord.detour_cloudUpload = handleCloudUpload;
    Discord.detour_getUploadPayload = handleGetUploadPayload;
    Discord.detour_uploadFileToCloud = handleUploadFileToCloud;

    if (Discord.detour_setAttribute != null)
      Discord.detour_setAttribute = function (key, value) {
        if (
          key === 'src' &&
          value?.startsWith('https://open.spotify.com/embed/playlist//')
        ) {
          const placeholderValue = value;
          value = EmbedFrames[value.split(/\/playlist\/\/|\?/g, 2)[1]];

          if (value && isTrustedKlipyFrameUrl(value)) {
            gifResolverWarn('klipy', 'iframe:legacy-redirect-blocked', {
              placeholderValue,
              frameUrl: value,
            });
            value = placeholderValue;
          }
        }

        return Discord.original_setAttribute.call(this, key, value);
      };

    if (Discord.detour_canUseEmojisEverywhere != null)
      Discord.detour_canUseEmojisEverywhere = function () {
        return (
          !!Utils.GetCurrentChannelEncrypt() ||
          Discord.original_canUseEmojisEverywhere.apply(this, arguments)
        );
      };
    if (Discord.detour_canUseAnimatedEmojis != null)
      Discord.detour_canUseAnimatedEmojis = function () {
        return (
          !!Utils.GetCurrentChannelEncrypt() ||
          Discord.original_canUseAnimatedEmojis.apply(this, arguments)
        );
      };

    MenuBar.Show(
      () => Utils.GetCurrentChannelEncrypt(),
      () => {
        Utils.ToggleCurrentChannelEncrypt();
        MenuBar.Update();
      },
      () => {
        let currentKeyHash = Utils.GetCurrentChannelKeyHash();
        return [
          Utils.FormatDescriptor(DataBase.keys[currentKeyHash].d),
          DataBase.trustedKeys != null && DataBase.trustedKeys[currentKeyHash],
        ];
      },
      () => {
        let keys = [];
        let currentKeyHash;
        if (Cache.channelConfig != null) {
          currentKeyHash = Cache.channelConfig.k;
          let currentKeyObj = DataBase.keys[currentKeyHash];
          if (currentKeyObj.t /*type*/ === 2 /*conversation*/)
            keys.push({
              hash: currentKeyHash,
              descriptor: Utils.FormatDescriptor(currentKeyObj.d),
              selected: true,
            });
        }

        keys.push({
          hash: DataBase.personalKeyHash,
          descriptor: Utils.FormatDescriptor(
            DataBase.keys[DataBase.personalKeyHash].d
          ),
          selected:
            currentKeyHash == null ||
            DataBase.personalKeyHash === currentKeyHash,
        });

        Object.entries(DataBase.keys)
          .filter(([, x]) => x.t /*type*/ === 1 /*group*/ && !x.h /*hidden*/)
          .sort(([, a], [, b]) => b.l - a.l)
          .forEach(([hash, keyObj]) =>
            keys.push({
              hash,
              descriptor: Utils.FormatDescriptor(keyObj.d),
              selected: hash === currentKeyHash,
            })
          );

        return keys;
      },
      async (key) => {
        await Utils.SetCurrentChannelKey(key.hash);
        MenuBar.Update();
      },
      () => Utils.GetCurrentChannelIsDm(),
      () => Utils.DownloadDb(),
      () => Utils.DownloadDb(true),
      () =>
        Utils.NewDb(() => {
          Utils.RefreshCache();
          MenuBar.Update();
        }),
      () => Utils.NewDbPassword(),
      () => Utils.InitKeyExchange({ id: Utils.GetCurrentDmUserId() }),
      async () => {
        await Utils.SetCurrentChannelKey(
          await Utils.SaveKey(
            Utils.GetRandomBytes(32),
            1 /*group*/,
            `Group <#${Cache.channelId}>`
          )
        );
        MenuBar.Update();
      },
      () => {
        let personalKeyHash = DataBase.personalKeyHash;
        let personalKey = DataBase.keys[personalKeyHash];
        let keys = [
          {
            hash: personalKeyHash,
            rawDescriptor: personalKey.d,
            descriptor: Utils.FormatDescriptor(personalKey.d),
            lastseen: personalKey.l,
            hidden: personalKey.h,
            type: 'PERSONAL',
            trusted:
              DataBase.trustedKeys != null &&
              DataBase.trustedKeys[personalKeyHash],
            protected: true,
          },
        ];
        const keyTypes = { 1: 'GROUP', 2: 'CONVERSATION', 3: 'PERSONAL' };
        Object.entries(DataBase.keys)
          .sort(([, a], [, b]) => b.l - a.l)
          .forEach(([hash, keyObj]) => {
            if (hash !== personalKeyHash)
              keys.push({
                hash,
                rawDescriptor: keyObj.d,
                lastseen: keyObj.l,
                descriptor: Utils.FormatDescriptor(keyObj.d),
                hidden: keyObj.h,
                type: keyTypes[keyObj.t],
                trusted:
                  DataBase.trustedKeys != null && DataBase.trustedKeys[hash],
              });
          });
        KeyManagerWindow.Show(
          keys,
          (key, rawDescriptor) => {
            Utils.ChangeKeyDescriptor(key.hash, rawDescriptor);
            key.rawDescriptor = rawDescriptor;
            key.descriptor = Utils.FormatDescriptor(rawDescriptor);
            MenuBar.Update();
          },
          (key, hidden) => {
            Utils.ChangeKeyHidden(key.hash, hidden);
            key.hidden = hidden;
          },
          (key) => {
            Utils.DeleteKey(key.hash);
            MenuBar.Update();
          }
        );
      },
      () =>
        ChannelManagerWindow.Show(
          Object.entries(DataBase.channels)
            .sort(([, a], [, b]) => b.l - a.l)
            .map(([id, channel]) => ({
              id,
              descriptor: Utils.FormatDescriptor(channel.d),
              lastseen: channel.l,
            })),
          (channel) => {
            Utils.DeleteChannelConfig(channel.id);
            if (channel.id === Cache.channelId) MenuBar.Update();
          }
        ),
      () => {
        let keyHash = Utils.GetCurrentChannelKeyHash();
        KeyVisualizerWindow.Show(Utils.Base64ToBytes(keyHash).buffer, () => {
          Utils.ToggleKeyTrusted(keyHash);
          MenuBar.Update();
        });
      },
      () => {
        let personalKeyHash = DataBase.personalKeyHash;
        let personalKey = DataBase.keys[personalKeyHash];
        let keys = [
          {
            hash: personalKeyHash,
            descriptor: Utils.FormatDescriptor(personalKey.d),
            lastseen: personalKey.l,
          },
        ];
        keys = keys.concat(
          Object.entries(DataBase.keys)
            .filter(([, x]) => x.t /*type*/ === 1 /*group*/)
            .sort(([, a], [, b]) => b.l - a.l)
            .map(([hash, keyObj]) => ({
              hash,
              lastseen: keyObj.l,
              descriptor: Utils.FormatDescriptor(keyObj.d),
            }))
        );

        ShareKeyWindow.Show(keys, (key) =>
          Utils.ShareKey(key.hash, Cache.channelId)
        );
      }
    );

    PopupManager.Inject();

    const executeCall = (event, caller, code) => {
      let match = /^\s*([^\s(]+)\s*\((.*)\)$/s.exec(code);
      if (match != null) {
        event.preventDefault();
        let method = match[1];
        let params = JSON.parse(`[${match[2].replace(/'/g, '"')}]`);
        Discord.window[method].apply(this, params);
      }
    };
    const scriptLink = function (event) {
      return executeCall(event, this, this.attributes.href.value.substr(11));
    };
    const fakeScriptLink = function (event) {
      return executeCall(event, this, this.attributes.href.value.substr(13));
    };
    const tryReplaceLink = (a) => {
      // v17: encrypted attachments no longer rely on javascript: URLs. Match
      // the real Discord CDN URL against the internal registry and attach both
      // a safe click handler and the small download button.
      if (tryBindEncryptedAttachmentLink(a)) return;

      let href = a.attributes.href;
      if (href === undefined) return;
      href = href.value;
      if (href.startsWith('/#javascript:')) {
        a.addEventListener('click', fakeScriptLink);
        a.addEventListener('auxclick', fakeScriptLink);
      } else if (href.startsWith('javascript:')) {
        a.addEventListener(
          href.startsWith('javascript:SdcDecryptDl(') ? 'click' : 'auxclick',
          scriptLink
        );
      }
    };
    //const isFirefox = navigator.userAgent.includes('Firefox');
    if (!FixedCsp) {
      const imgsrcIdRegex = /#([^?]+)/;
      const tryReplaceImage = async (img) => {
        let srcmatch = imgsrcIdRegex.exec(img.src);
        if (srcmatch == null) return;
        let blob = Patcher.Images[srcmatch[1]];
        if (blob == null) return;
        let bitmap = await createImageBitmap(blob);
        let width = bitmap.width;
        let height = bitmap.height;
        let canvas = document.createElement('canvas');
        if (img.matches(ModalImgSelector))
          canvas.addEventListener('click', ImageZoom.zoom);
        else if (
          img.matches(MessageImgSelector) &&
          (width > 800 || height > 600)
        ) {
          if (width / 800 > height / 600) {
            height = Math.round(height / (width / 800));
            width = 800;
          } else {
            width = Math.round(width / (height / 600));
            height = 600;
          }
        }
        canvas.width = width;
        canvas.height = height;
        let ctx = canvas.getContext('2d');
        ctx.drawImage(bitmap, 0, 0, width, height);
        canvas.style.cssText = img.style.cssText;
        img.replaceWith(canvas);
      };
      Patcher = {
        observer: new MutationObserver((mutations) => {
          for (let mutation of mutations) {
            if (mutation.type === 'attributes') {
              // v18: mutations created by the encrypted-attachment UI must
              // never be fed back into tryReplaceLink().
              if (
                typeof mutation.attributeName === 'string' &&
                mutation.attributeName.startsWith('data-sdc-')
              ) {
                continue;
              }

              let tagName = mutation.target.tagName;
              if (tagName === 'IMG') {
                if (mutation.attributeName !== 'src') continue;
                tryReplaceImage(mutation.target);
              } else if (tagName === 'A') {
                tryReplaceLink(mutation.target);
              }
            } else {
              for (let addedNode of mutation.addedNodes) {
                if (addedNode.tagName === 'IMG') {
                  tryReplaceImage(addedNode);
                } else if (addedNode.tagName === 'A') {
                  tryReplaceLink(addedNode);
                }

                if (addedNode.getElementsByTagName == null) continue;

                for (let img of addedNode.getElementsByTagName('img')) {
                  tryReplaceImage(img);
                }

                for (let a of addedNode.getElementsByTagName('a')) {
                  tryReplaceLink(a);
                }
              }
            }
          }
        }),
        Images: [],
        FreeImageId: 0,
      };
    } else {
      Patcher = {
        observer: new MutationObserver((mutations) => {
          for (let mutation of mutations) {
            if (mutation.type === 'attributes') {
              // v18: ignore attributes written by our own attachment binder.
              if (
                typeof mutation.attributeName === 'string' &&
                mutation.attributeName.startsWith('data-sdc-')
              ) {
                continue;
              }

              if (mutation.target.tagName === 'A') {
                tryReplaceLink(mutation.target);
              }
            } else {
              for (let addedNode of mutation.addedNodes) {
                if (addedNode.tagName === 'A') {
                  tryReplaceLink(addedNode);
                }
                if (addedNode.getElementsByTagName == null) continue;
                for (let a of addedNode.getElementsByTagName('a')) {
                  tryReplaceLink(a);
                }
              }
            }
          }
        }),
      };
    }
    Patcher.observer.observe(document.documentElement, {
      attributes: true,
      childList: true,
      subtree: true,
    });

    // Messages already present in the viewport predate the observer.
    scanEncryptedAttachmentDownloadLinks();

    // v23: every encrypted attachment is also downloadable from Discord's
    // three-dot message menu. Non-image files keep their existing ↓ button.
    installEncryptedImageContextMenu();

    dbSaveInterval = setInterval(() => {
      Utils.SaveDb();
    }, 10000);

    KeyRotators = {};
    if (DataBase.keyRotators != null) {
      for (let [keyHash, keyRotator] of Object.entries(DataBase.keyRotators))
        Utils.StartKeyRotation(keyHash, keyRotator);
    }

    let appDiv = document.getElementById('app-mount');
    if (appDiv != null)
      ImageZoom.observer.observe(appDiv, { childList: true, subtree: true });

    if (DataBase.pingOn) {
      let fullRegex = /^\/(.*)\/([imsu]{0,4})$/.exec(DataBase.pingOn);
      Cache.pingOn = fullRegex
        ? new RegExp(fullRegex[1], fullRegex[2])
        : new RegExp(DataBase.pingOn);
    }

    Utils.Log('loaded');

    LoadBlacklist();
  }

  function Unload() {
    const restoreFunction = (moduleName, functionName) => {
      Discord[`detour_${functionName}`] = Discord[`original_${functionName}`];
    };

    restoreFunction('MessageQueue', 'enqueue');
    if (Discord.detour_editMessage != null)
      restoreFunction('MessageQueue', 'editMessage');
    restoreFunction('MessageDispatcher', 'dispatch');
    restoreFunction('FileUploader', 'upload');
    restoreFunction('FileUploader', 'instantBatchUpload');
    restoreFunction('FileUploader', 'uploadFiles');
    restoreFunction('CloudUploadHelper', 'getUploadPayload');
    restoreFunction('CloudUploadPrototype', 'uploadFileToCloud');
    Discord.detour_cloudUpload = Discord.cloudUpload;

    if (Discord.detour_canUseEmojisEverywhere != null)
      restoreFunction('Premium', 'canUseEmojisEverywhere');
    if (Discord.detour_canUseAnimatedEmojis != null)
      restoreFunction('Premium', 'canUseAnimatedEmojis');
    if (Discord.detour_setAttribute != null)
      restoreFunction('IframePrototype', 'setAttribute');

    if (Patcher != null) Patcher.observer.disconnect();

    cleanupEncryptedAttachmentDownloadUi();
    uninstallEncryptedImageContextMenu();

    //Style.Remove();
    UnlockWindow.Remove();
    NewdbWindow.Remove();
    NewPasswordWindow.Remove();
    KeyManagerWindow.Remove();
    ChannelManagerWindow.Remove();
    ShareKeyWindow.Remove();
    MenuBar.Remove();
    PopupManager.Remove();
    KeyVisualizerWindow.Remove();

    clearInterval(dbSaveInterval);

    ImageZoom.observer.disconnect();

    clearGifBlobMediaCache();

    Utils.Log('unloaded');
  }

  var InitTries = 200;
  function TryInit() {
    let final = --InitTries === 0;
    if (Init(final) !== 0 || final) return;

    window.setTimeout(TryInit, 100);
  }

  Utils.Log('injected');

  TryInit();

  return InitPromise;
})();
