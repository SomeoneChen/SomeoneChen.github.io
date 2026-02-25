/**
 * Gugoole Core Script - Optimized Version
 */

// --- Configuration & Constants ---
const CONFIG = {
    IP_CACHE_KEY: 'gugooleIpCache',
    SETTINGS_KEY: 'gugooleSettings',
    CACHE_DURATION: 3600000, // 1 hour
    SLOGANS: [
        "更高效的搜索控制器",
        "势如破竹",
        "我就感觉到快",
        "快如闪电",
        "有催人跑的意思"
    ],
    ENGINES: {
        google: { name: 'Google', url: 'https://www.google.com/search?q=', ai: 'https://www.google.com/search?udm=50&q=' },
        baidu: { name: '百度', url: 'https://www.baidu.com/s?wd=', ai: 'https://chat.baidu.com/search?word=' },
        bing: { name: 'Bing', url: 'https://www.bing.com/search?q=' },
        metaso: { name: '秘塔', url: 'https://metaso.cn/?q=', ai: 'https://metaso.cn/?q=' },
        github: { name: 'GitHub', url: 'https://github.com/search?q=' },
        gitee: { name: 'Gitee', url: 'https://so.gitee.com/?q=' },
        gpt: { name: 'ChatGPT', url: 'https://chatgpt.com/?q=', ai: 'https://chatgpt.com/?q=', suffix: '&hints=search&ref=ext' }
    },
    // Map of keywords to direct URLs and button styles
    SHORTCUTS: {
        bilibili: { url: 'https://www.bilibili.com', bg: 'linear-gradient(135deg, #FF69B4, #FF1493)', label: '打开bilibili', keys: ['b站', '哔哩哔哩'] },
        deepseek: { url: 'https://chat.deepseek.com', bg: 'linear-gradient(135deg, #0066CC, #0099FF)', label: '打开DeepSeek', keys: ['ds'] },
        qwen: { url: 'https://chat.qwen.ai', bg: 'linear-gradient(135deg, #7B68EE, #9370DB)', label: '打开千问', keys: ['qianwen', '千问'] },
        chatgpt: { url: 'https://chatgpt.com', bg: 'linear-gradient(135deg, #10A37F, #00C853)', label: '打开ChatGPT', keys: ['gpt'] },
        grok: { url: 'https://grok.com', bg: 'linear-gradient(135deg, #667eea, #764ba2)', label: '打开Grok', keys: [] },
        claude: { url: 'https://claude.ai', bg: 'linear-gradient(135deg, #4285F4, #357ABD)', label: '打开Claude', keys: [] },
        doubao: { url: 'https://doubao.com', bg: 'linear-gradient(135deg, #FF9500, #FF5E3A)', label: '打开豆包', keys: ['豆包'] }
    },
    // Engine aliases for suffix search (e.g., "search term baidu")
    ALIASES: {
        '百度': 'baidu', 'baidu': 'baidu',
        '谷歌': 'google', 'google': 'google', 'googleai': 'google',
        '谷歌ai': 'google', '百度ai': 'baidu',
        'meta': 'metaso', '秘塔': 'metaso', 'metaso': 'metaso',
        'github': 'github', 'gitee': 'gitee',
        'gpt': 'gpt', 'chatgpt': 'gpt', 'cs': 'gpt'
    }
};

const DEFAULT_SETTINGS = { domestic: CONFIG.ENGINES.baidu.url, international: CONFIG.ENGINES.google.url };

// --- State Management ---
let state = {
    ipDetected: false,
    isChinese: true,
    isInternational: null,
    connectivityPromise: null,
    mode: '检测中...',
    settings: (() => {
        try {
            return JSON.parse(localStorage.getItem(CONFIG.SETTINGS_KEY)) || DEFAULT_SETTINGS;
        } catch (e) { return DEFAULT_SETTINGS; }
    })()
};

// --- Utilities ---
const Utils = {
    fetchWithTimeout: (url, timeout = 5000) =>
        Promise.race([fetch(url), new Promise((_, reject) => setTimeout(() => reject('Timeout'), timeout))]),

    saveSettings: (settings) => {
        state.settings = settings;
        localStorage.setItem(CONFIG.SETTINGS_KEY, JSON.stringify(settings));
    },

    getShortcut: (term) => {
        const lowerTerm = term.toLowerCase();
        for (const [key, val] of Object.entries(CONFIG.SHORTCUTS)) {
            if (key === lowerTerm || val.keys.includes(lowerTerm)) return val;
        }
        return null;
    }
};

// --- IP & Location Logic ---
const IPManager = {
    async checkConnectivity() {
        if (state.connectivityPromise) return state.connectivityPromise;

        state.connectivityPromise = new Promise((resolve) => {
            const timeout = setTimeout(() => {
                state.isInternational = false;
                resolve(false);
            }, 1000);

            fetch('https://www.google.com/generate_204', { mode: 'no-cors', cache: 'no-cache' })
                .then(() => {
                    clearTimeout(timeout);
                    state.isInternational = true;
                    resolve(true);
                })
                .catch(() => {
                    clearTimeout(timeout);
                    state.isInternational = false;
                    resolve(false);
                });
        });
        return state.connectivityPromise;
    },

    async detect() {
        // Use Google check as primary
        const isInternational = await this.checkConnectivity();

        // If not international, or for more detail, we can still fetch IP info in background
        // but for immediate logic, isInternational is enough.

        let result = {
            isChinese: !isInternational,
            mode: isInternational ? '规则模式-国际' : '规则模式-中国'
        };

        // Optional: Background IP detail fetch (don't block UI)
        this.fetchIPDetails().then(details => {
            if (details) {
                result.mode = isInternational ? `规则模式-${details.country || '海外'}` : '规则模式-中国';
                this.applyResult(result);
                localStorage.setItem(CONFIG.IP_CACHE_KEY, JSON.stringify({ data: result, timestamp: Date.now() }));
            }
        });

        this.applyResult(result);
    },

    async fetchIPDetails() {
        try {
            const intl = await Utils.fetchWithTimeout('https://api-ipv4.ip.sb/geoip').then(r => r.json());
            return { country: intl.country, country_code: intl.country_code };
        } catch (e) { return null; }
    },

    applyResult(res) {
        state.isChinese = res.isChinese;
        state.mode = res.mode;
        state.ipDetected = true;
        const el = document.getElementById('footer-ip-location');
        if (el) el.textContent = res.mode;
        this.updateAIButtonVisibility();
    },

    updateAIButtonVisibility() {
        const btn = document.getElementById('ai-search-btn');
        if (!btn) return;
        const currentEngine = state.isChinese ? state.settings.domestic : state.settings.international;
        btn.style.display = currentEngine.includes('bing.com') ? 'none' : 'flex';
    }
};

// --- Search Execution Logic ---
const SearchHandler = {
    async execute(isAI = false) {
        const input = document.getElementById('search-input');
        const term = input.value.trim();
        if (!term) return;

        // 1. Shortcut Check
        const shortcut = Utils.getShortcut(term);
        if (shortcut) {
            window.location.href = shortcut.url;
            return;
        }

        // 2. Parse Term & Engine
        const parts = term.split(' ');
        const last = parts[parts.length - 1].toLowerCase();
        const engineKey = CONFIG.ALIASES[last];

        let finalTerm = term;
        let engineUrl = '';

        if (engineKey) {
            finalTerm = parts.slice(0, -1).join(' ');
            const engineCfg = CONFIG.ENGINES[engineKey];
            engineUrl = (isAI || last.includes('ai')) ? (engineCfg.ai || engineCfg.url) : engineCfg.url;
            if (engineCfg.suffix) engineUrl += engineCfg.suffix;
        } else {
            // Use the result from the initial page-load detection
            const isInternational = await IPManager.checkConnectivity();
            state.isChinese = !isInternational;

            const defaultBase = isInternational ? state.settings.international : state.settings.domestic;

            if (isAI) {
                const cfg = Object.values(CONFIG.ENGINES).find(e => defaultBase.startsWith(e.url.split('?')[0]));
                engineUrl = (cfg && cfg.ai) ? cfg.ai : defaultBase;
            } else {
                engineUrl = defaultBase;
            }
        }

        window.location.href = engineUrl + encodeURIComponent(finalTerm);
    },

    updateUI(value) {
        const btn = document.getElementById('ai-search-btn');
        if (!btn) return;
        const shortcut = Utils.getShortcut(value.trim());
        if (shortcut) {
            btn.style.background = shortcut.bg;
            btn.querySelector('span').textContent = shortcut.label;
        } else {
            btn.style.background = 'linear-gradient(135deg, #4285F4, #34A853, #FBBC05, #EA4335)';
            btn.querySelector('span').textContent = 'AI搜索';
        }
    }
};

// --- UI Components ---
const UI = {
    openSettings() {
        const options = Object.entries(CONFIG.ENGINES).map(([k, v]) =>
            `<option value="${v.url}" ${state.settings.domestic === v.url || state.settings.international === v.url ? '' : ''}>${v.name}</option>`
        ).join('');

        const overlay = document.createElement('div');
        overlay.className = 'settings-overlay';
        // Using direct style for now to satisfy "merged logic" without CSS changes if possible, 
        // but cleaner to use classes.
        overlay.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.5);z-index:9998;display:flex;align-items:center;justify-content:center;';

        const isDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
        const modal = document.createElement('div');
        modal.style.cssText = `background:${isDark ? '#333' : '#fff'};color:${isDark ? '#fff' : '#000'};padding:20px;border-radius:8px;width:300px;box-shadow:0 4px 12px rgba(0,0,0,0.2);`;

        modal.innerHTML = `
            <h3 style="margin-top:0">搜索引擎设置</h3>
            <div style="margin:15px 0">
                <p>国内：</p>
                <select id="set-dom" style="width:100%;padding:8px">${Object.entries(CONFIG.ENGINES).map(([k, v]) => `<option value="${v.url}" ${state.settings.domestic === v.url ? 'selected' : ''}>${v.name}</option>`).join('')}</select>
                <p style="margin-top:10px">国际：</p>
                <select id="set-intl" style="width:100%;padding:8px">${Object.entries(CONFIG.ENGINES).map(([k, v]) => `<option value="${v.url}" ${state.settings.international === v.url ? 'selected' : ''}>${v.name}</option>`).join('')}</select>
            </div>
            <div style="display:flex;justify-content:flex-end;gap:10px">
                <button id="set-cancel" style="padding:8px 16px;cursor:pointer">取消</button>
                <button id="set-save" style="padding:8px 16px;background:#4285f4;color:#fff;border:none;border-radius:4px;cursor:pointer">保存</button>
            </div>
        `;

        overlay.appendChild(modal);
        document.body.appendChild(overlay);

        const close = () => document.body.removeChild(overlay);
        modal.querySelector('#set-cancel').onclick = close;
        modal.querySelector('#set-save').onclick = () => {
            Utils.saveSettings({
                domestic: modal.querySelector('#set-dom').value,
                international: modal.querySelector('#set-intl').value
            });
            IPManager.updateAIButtonVisibility();
            close();
        };
    }
};

// --- Initialization ---
function init() {
    // Random Slogan
    const sloganEl = document.querySelector('.slogan');
    if (sloganEl) {
        sloganEl.textContent = CONFIG.SLOGANS[Math.floor(Math.random() * CONFIG.SLOGANS.length)];
    }

    IPManager.detect();

    const input = document.getElementById('search-input');
    const aiBtn = document.getElementById('ai-search-btn');
    const refreshIp = document.getElementById('footer-ip-location');
    const settingsBtn = document.querySelector('footer .footer-right a');

    if (input) {
        input.addEventListener('keypress', e => e.key === 'Enter' && SearchHandler.execute());
        input.addEventListener('input', e => SearchHandler.updateUI(e.target.value));
    }
    if (aiBtn) aiBtn.addEventListener('click', () => SearchHandler.execute(true));
    if (refreshIp) refreshIp.addEventListener('click', e => { e.preventDefault(); localStorage.removeItem(CONFIG.IP_CACHE_KEY); IPManager.detect(); });
    if (settingsBtn) settingsBtn.addEventListener('click', e => { e.preventDefault(); UI.openSettings(); });
}

if (document.readyState === 'loading') {
    window.addEventListener('DOMContentLoaded', init);
} else {
    init();
}
