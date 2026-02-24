// 正常加载的代码
// 存储搜索引擎设置
const SEARCH_ENGINES = {
    default: {
        domestic: 'https://www.baidu.com/s?wd=',
        international: 'https://www.google.com/search?q='
    }
};

// 存储IP检测结果
let ipInfo = {
    domestic: null,
    international: null,
    isChinese: true,
    mode: '',
    country: '中国',
    ip: '',
    location: ''
};

let ipDetected = false;
const IP_CACHE_KEY = 'gugooleIpCache';
const IP_CACHE_DURATION = 60 * 60 * 1000; // 缓存1小时

// 从本地存储获取设置
function getSettings() {
    try {
        const settings = localStorage.getItem('gugooleSettings');
        return settings ? JSON.parse(settings) : SEARCH_ENGINES.default;
    } catch (e) {
        return SEARCH_ENGINES.default;
    }
}

// 保存设置到本地存储
function saveSettings(settings) {
    try {
        localStorage.setItem('gugooleSettings', JSON.stringify(settings));
    } catch (e) {
        console.error('保存设置失败:', e);
    }
}

// 保存IP检测结果到缓存
function saveIPCache(data) {
    try {
        const cacheData = {
            data: data,
            timestamp: Date.now()
        };
        localStorage.setItem(IP_CACHE_KEY, JSON.stringify(cacheData));
    } catch (e) {
        console.error('保存IP缓存失败:', e);
    }
}

// 从缓存获取IP检测结果
function getIPCache() {
    try {
        const cacheData = localStorage.getItem(IP_CACHE_KEY);
        if (cacheData) {
            const parsedData = JSON.parse(cacheData);
            const now = Date.now();
            if (now - parsedData.timestamp < IP_CACHE_DURATION) {
                return parsedData.data;
            }
        }
        return null;
    } catch (e) {
        console.error('获取IP缓存失败:', e);
        return null;
    }
}

// 清除IP缓存
function clearIPCache() {
    try {
        localStorage.removeItem(IP_CACHE_KEY);
    } catch (e) {
        console.error('清除IP缓存失败:', e);
    }
}

// 带超时的fetch请求
function fetchWithTimeout(url, options = {}, timeout = 5000) { // 超时时间改为5秒
    return Promise.race([
        fetch(url, options),
        new Promise((_, reject) => setTimeout(() => reject(new Error('请求超时')), timeout))
    ]);
}

// 检测国内IP
function detectDomesticIP() {
    return new Promise((resolve) => {
        fetchWithTimeout('https://my.ip.cn/')
            .then(response => response.text())
            .then(data => {
                // 解析HTML获取IP和归属地
                const ipMatch = data.match(/ip：([\d.]+)/);
                const locationMatch = data.match(/归属地：([^<]+)/);
                
                if (ipMatch) {
                    const ip = ipMatch[1];
                    const location = locationMatch ? locationMatch[1] : '';
                    const isChinese = location.includes('中国');
                    console.log('国内IP检测结果:', { ip, location, isChinese });
                    resolve({ ip, location, isChinese });
                } else {
                    resolve(null);
                }
            })
            .catch(error => {
                console.error('国内IP检测失败:', error);
                resolve(null);
            });
    });
}

// 检测国际IP
function detectInternationalIP() {
    return new Promise((resolve) => {
        fetchWithTimeout('https://api-ipv4.ip.sb/geoip')
            .then(response => response.json())
            .then(data => {
                console.log('国际IP检测结果:', data);
                const isChinese = data.country_code === 'CN';
                resolve({ ...data, isChinese });
            })
            .catch(error => {
                console.error('国际IP检测失败:', error);
                resolve(null);
            });
    });
}

// 更新IP位置显示
function updateIPLocationDisplay() {
    const footerIpLocationEl = document.getElementById('footer-ip-location');
    
    // 只显示规则模式信息，不显示具体IP
    const displayText = ipInfo.mode;
    if (footerIpLocationEl) footerIpLocationEl.textContent = displayText;
}

// 检测用户IP位置
function detectIPLocation() {
    return new Promise((resolve) => {
        // 先尝试从缓存获取
        const cachedIP = getIPCache();
        if (cachedIP) {
            console.log('使用缓存的IP检测结果:', cachedIP);
            ipInfo = { ...cachedIP };
            ipDetected = true;
            updateIPLocationDisplay();
            resolve(cachedIP.isChinese);
            return;
        }
        
        // 缓存不存在，执行新的检测
        Promise.all([detectDomesticIP(), detectInternationalIP()])
            .then(([domesticResult, internationalResult]) => {
                ipInfo.domestic = domesticResult;
                ipInfo.international = internationalResult;
                
                // 判定规则
                let isChinese = true;
                let mode = '';
                let country = '中国';
                let ip = '';
                let location = '';
                
                if (domesticResult && internationalResult) {
                    ip = domesticResult.ip;
                    location = domesticResult.location;
                    
                    if (domesticResult.isChinese && !internationalResult.isChinese) {
                        // 国内API返回中国，国际API返回非中国
                        isChinese = true;
                        mode = `规则模式-${internationalResult.country || '国际'}`;
                    } else if (!domesticResult.isChinese && !internationalResult.isChinese) {
                        // 两个API都返回非中国
                        isChinese = false;
                        mode = `全局模式-${internationalResult.country || '国际'}`;
                        country = internationalResult.country || '国际';
                    } else {
                        // 其他情况默认中国
                        isChinese = true;
                        mode = '规则模式-中国';
                    }
                } else if (internationalResult) {
                    // 只有国际API有结果
                    ip = internationalResult.ip;
                    location = `${internationalResult.country} ${internationalResult.city}`;
                    isChinese = internationalResult.isChinese;
                    mode = isChinese ? '规则模式-中国' : `全局模式-${internationalResult.country || '国际'}`;
                    country = isChinese ? '中国' : (internationalResult.country || '国际');
                } else if (domesticResult) {
                    // 只有国内API有结果
                    ip = domesticResult.ip;
                    location = domesticResult.location;
                    isChinese = domesticResult.isChinese;
                    mode = isChinese ? '规则模式-中国' : '全局模式-国际';
                    country = isChinese ? '中国' : '国际';
                } else {
                    // 都没有结果，默认中国
                    isChinese = true;
                    mode = '规则模式-中国';
                }
                
                ipInfo.isChinese = isChinese;
                ipInfo.mode = mode;
                ipInfo.country = country;
                ipInfo.ip = ip;
                ipInfo.location = location;
                ipDetected = true;
                
                // 保存到缓存
                saveIPCache(ipInfo);
                
                // 更新IP位置显示
                updateIPLocationDisplay();
                
                console.log('最终IP检测结果:', ipInfo);
                resolve(isChinese);
            })
            .catch(error => {
                console.error('IP检测失败:', error);
                // 出错时默认认为是中国IP
                ipInfo.isChinese = true;
                ipInfo.mode = '规则模式-中国';
                ipInfo.country = '中国';
                ipInfo.ip = '';
                ipInfo.location = '';
                ipDetected = true;
                
                // 更新IP位置显示
                updateIPLocationDisplay();
                
                resolve(true);
            });
    });
}

// 刷新IP检测
function refreshIPDetection() {
    // 清除缓存
    clearIPCache();
    
    // 更新显示为检测中
    const footerIpLocationEl = document.getElementById('footer-ip-location');
    if (footerIpLocationEl) footerIpLocationEl.textContent = 'IP检测中...';
    
    // 重新检测
    detectIPLocation();
}

// 初始化IP检测
function initIPDetection() {
    // 检测IP
    detectIPLocation();
    
    // 为IP位置链接添加点击事件
    const footerIpLocationEl = document.getElementById('footer-ip-location');
    
    if (footerIpLocationEl) {
        footerIpLocationEl.addEventListener('click', function(e) {
            e.preventDefault();
            refreshIPDetection();
        });
    }
}

// 获取当前应该使用的搜索引擎
function getCurrentSearchEngine() {
    return new Promise((resolve) => {
        if (ipDetected) {
            const settings = getSettings();
            
            // 调整逻辑：如果模式包含"规则模式-"且后面不是"中国"，使用国际搜索引擎
            if (ipInfo.mode.includes('规则模式-') && !ipInfo.mode.includes('规则模式-中国')) {
                resolve(settings.international);
            } else {
                resolve(ipInfo.isChinese ? settings.domestic : settings.international);
            }
        } else {
            // 如果还没有检测IP，先检测
            detectIPLocation().then(() => {
                const settings = getSettings();
                
                // 调整逻辑：如果模式包含"规则模式-"且后面不是"中国"，使用国际搜索引擎
                if (ipInfo.mode.includes('规则模式-') && !ipInfo.mode.includes('规则模式-中国')) {
                    resolve(settings.international);
                } else {
                    resolve(ipInfo.isChinese ? settings.domestic : settings.international);
                }
            });
        }
    });
}

// 解析搜索关键词，提取搜索方式
function parseSearchTerm(searchTerm) {
    const parts = searchTerm.split(' ');
    const lastPart = parts[parts.length - 1].toLowerCase();
    
    // 检查最后一部分是否是搜索方式指定
    const searchModes = {
        '百度': 'https://www.baidu.com/s?wd=',
        '谷歌': 'https://www.google.com/search?q=',
        'google': 'https://www.google.com/search?q=',
        'baidu': 'https://www.baidu.com/s?wd=',
        'googleai': 'https://www.google.com/search?udm=50&q=',
        '谷歌ai': 'https://www.google.com/search?udm=50&q=',
        '百度ai': 'https://chat.baidu.com/search?word=',
        'meta': 'https://metaso.cn/?q=',
        '秘塔': 'https://metaso.cn/?q=',
        'metaso': 'https://metaso.cn/?q=',
        'github': 'https://github.com/search?q=',
        'gitee': 'https://so.gitee.com/?q=',
        'gpt': 'https://chatgpt.com/?q=',
        'chatgpt': 'https://chatgpt.com/?q=',
        'cs': 'https://chatgpt.com/?q='
    };
    
    if (searchModes[lastPart]) {
        // 提取搜索方式和实际搜索词
        const actualSearchTerm = parts.slice(0, -1).join(' ');
        let searchEngine = searchModes[lastPart];
        
        // 为ChatGPT添加额外参数
        if (['gpt', 'chatgpt', 'cs'].includes(lastPart)) {
            searchEngine = 'https://chatgpt.com/?q=';
        }
        
        return {
            searchTerm: actualSearchTerm,
            searchEngine: searchEngine,
            isAISearch: lastPart.includes('ai') || ['gpt', 'chatgpt', 'cs'].includes(lastPart)
        };
    }
    
    // 没有指定搜索方式，使用默认
    return {
        searchTerm: searchTerm,
        searchEngine: null,
        isAISearch: false
    };
}

// 检查快捷关键字并处理
function handleShortcutKeywords(searchTerm, clearInput = false) {
    const bilibiliKeywords = ['bilibili', 'Bilibili', '哔哩哔哩', 'b站', 'B站'];
    const deepseekKeywords = ['deepseek', 'Deepseek', 'DS', 'ds'];
    const qwenKeywords = ['qwen', 'qianwen', '千问'];
    const chatgptKeywords = ['chatgpt', 'ChatGPT'];
    const grokKeywords = ['grok', 'Grok'];
    const claudeKeywords = ['claude', 'Claude'];
    const doubaoKeywords = ['doubao', 'Doubao', '豆包'];
    
    if (bilibiliKeywords.includes(searchTerm)) {
        // 打开bilibili
        if (clearInput) {
            const searchInput = document.getElementById('search-input');
            if (searchInput) {
                searchInput.value = '';
            }
            // 重置按钮状态
            const aiSearchBtn = document.getElementById('ai-search-btn');
            if (aiSearchBtn) {
                aiSearchBtn.style.background = 'linear-gradient(135deg, #4285F4, #34A853, #FBBC05, #EA4335)';
                aiSearchBtn.querySelector('span').textContent = 'AI搜索';
            }
        }
        return { redirect: true, url: 'https://www.bilibili.com' };
    } else if (deepseekKeywords.includes(searchTerm)) {
        // 打开deepseek
        if (clearInput) {
            const searchInput = document.getElementById('search-input');
            if (searchInput) {
                searchInput.value = '';
            }
            // 重置按钮状态
            const aiSearchBtn = document.getElementById('ai-search-btn');
            if (aiSearchBtn) {
                aiSearchBtn.style.background = 'linear-gradient(135deg, #4285F4, #34A853, #FBBC05, #EA4335)';
                aiSearchBtn.querySelector('span').textContent = 'AI搜索';
            }
        }
        return { redirect: true, url: 'https://chat.deepseek.com' };
    } else if (qwenKeywords.includes(searchTerm)) {
        // 打开qwen
        if (clearInput) {
            const searchInput = document.getElementById('search-input');
            if (searchInput) {
                searchInput.value = '';
            }
            // 重置按钮状态
            const aiSearchBtn = document.getElementById('ai-search-btn');
            if (aiSearchBtn) {
                aiSearchBtn.style.background = 'linear-gradient(135deg, #4285F4, #34A853, #FBBC05, #EA4335)';
                aiSearchBtn.querySelector('span').textContent = 'AI搜索';
            }
        }
        return { redirect: true, url: 'https://chat.qwen.ai' };
    } else if (chatgptKeywords.includes(searchTerm)) {
        // 打开chatgpt
        if (clearInput) {
            const searchInput = document.getElementById('search-input');
            if (searchInput) {
                searchInput.value = '';
            }
            // 重置按钮状态
            const aiSearchBtn = document.getElementById('ai-search-btn');
            if (aiSearchBtn) {
                aiSearchBtn.style.background = 'linear-gradient(135deg, #4285F4, #34A853, #FBBC05, #EA4335)';
                aiSearchBtn.querySelector('span').textContent = 'AI搜索';
            }
        }
        return { redirect: true, url: 'https://chatgpt.com' };
    } else if (grokKeywords.includes(searchTerm)) {
        // 打开grok
        if (clearInput) {
            const searchInput = document.getElementById('search-input');
            if (searchInput) {
                searchInput.value = '';
            }
            // 重置按钮状态
            const aiSearchBtn = document.getElementById('ai-search-btn');
            if (aiSearchBtn) {
                aiSearchBtn.style.background = 'linear-gradient(135deg, #4285F4, #34A853, #FBBC05, #EA4335)';
                aiSearchBtn.querySelector('span').textContent = 'AI搜索';
            }
        }
        return { redirect: true, url: 'https://grok.com' };
    } else if (claudeKeywords.includes(searchTerm)) {
        // 打开claude
        if (clearInput) {
            const searchInput = document.getElementById('search-input');
            if (searchInput) {
                searchInput.value = '';
            }
            // 重置按钮状态
            const aiSearchBtn = document.getElementById('ai-search-btn');
            if (aiSearchBtn) {
                aiSearchBtn.style.background = 'linear-gradient(135deg, #4285F4, #34A853, #FBBC05, #EA4335)';
                aiSearchBtn.querySelector('span').textContent = 'AI搜索';
            }
        }
        return { redirect: true, url: 'https://claude.ai' };
    } else if (doubaoKeywords.includes(searchTerm)) {
        // 打开doubao
        if (clearInput) {
            const searchInput = document.getElementById('search-input');
            if (searchInput) {
                searchInput.value = '';
            }
            // 重置按钮状态
            const aiSearchBtn = document.getElementById('ai-search-btn');
            if (aiSearchBtn) {
                aiSearchBtn.style.background = 'linear-gradient(135deg, #4285F4, #34A853, #FBBC05, #EA4335)';
                aiSearchBtn.querySelector('span').textContent = 'AI搜索';
            }
        }
        return { redirect: true, url: 'https://doubao.com' };
    }
    return { redirect: false };
}

// 执行搜索
async function performSearch() {
    const searchInput = document.getElementById('search-input');
    const searchTerm = searchInput.value.trim();
    
    if (searchTerm) {
        // 检查快捷关键字
        const shortcutResult = handleShortcutKeywords(searchTerm, true);
        if (shortcutResult.redirect) {
            window.location.href = shortcutResult.url;
            return;
        }
        
        // 解析搜索词
        const parsed = parseSearchTerm(searchTerm);
        
        if (parsed.searchEngine) {
            // 使用指定的搜索方式
            const encodedSearchTerm = encodeURIComponent(parsed.searchTerm);
            let url = `${parsed.searchEngine}${encodedSearchTerm}`;
            
            // 为ChatGPT添加额外参数
            if (url.includes('chatgpt.com/?q=')) {
                url += '&hints=search&ref=ext';
            }
            
            // 清空输入框
            searchInput.value = '';
            
            // 跳转到搜索结果
            window.location.href = url;
        } else {
            // 使用默认搜索引擎
            const encodedSearchTerm = encodeURIComponent(searchTerm);
            const searchEngine = await getCurrentSearchEngine();
            
            // 清空输入框
            searchInput.value = '';
            
            // 跳转到搜索结果
            window.location.href = `${searchEngine}${encodedSearchTerm}`;
        }
    }
}

// 执行AI搜索
async function performAISearch() {
    const searchInput = document.getElementById('search-input');
    const searchTerm = searchInput.value.trim();
    
    if (searchTerm) {
        // 检查快捷关键字
        const shortcutResult = handleShortcutKeywords(searchTerm, true);
        if (shortcutResult.redirect) {
            window.location.href = shortcutResult.url;
            return;
        }
        
        // 解析搜索词
        const parsed = parseSearchTerm(searchTerm);
        
        if (parsed.searchEngine) {
            // 使用指定的搜索方式
            const encodedSearchTerm = encodeURIComponent(parsed.searchTerm);
            let url = `${parsed.searchEngine}${encodedSearchTerm}`;
            
            // 为ChatGPT添加额外参数
            if (url.includes('chatgpt.com/?q=')) {
                url += '&hints=search&ref=ext';
            }
            
            // 清空输入框
            searchInput.value = '';
            
            // 跳转到搜索结果
            window.location.href = url;
        } else {
            // 使用默认搜索引擎的AI搜索
            const encodedSearchTerm = encodeURIComponent(searchTerm);
            const searchEngine = await getCurrentSearchEngine();
            
            // 清空输入框
            searchInput.value = '';
            
            // 根据搜索引擎选择AI搜索方式
            if (searchEngine.includes('google.com')) {
                // 谷歌AI搜索：添加udm=50参数
                window.location.href = `https://www.google.com/search?udm=50&q=${encodedSearchTerm}`;
            } else if (searchEngine.includes('baidu.com')) {
                // 百度AI搜索：使用chat.baidu.com
                window.location.href = `https://chat.baidu.com/search?word=${encodedSearchTerm}`;
            } else if (searchEngine.includes('metaso.cn')) {
                // 秘塔AI搜索：使用metaso.cn
                window.location.href = `https://metaso.cn/?q=${encodedSearchTerm}`;
            } else if (searchEngine.includes('chatgpt.com')) {
                // ChatGPT搜索：添加额外参数
                window.location.href = `https://chatgpt.com/?q=${encodedSearchTerm}&hints=search&ref=ext`;
            } else {
                // 其他搜索引擎（如Bing）：使用普通搜索
                window.location.href = `${searchEngine}${encodedSearchTerm}`;
            }
        }
    }
}

// 检查是否应该显示AI搜索按钮
async function checkAISearchButtonVisibility() {
    const aiSearchBtn = document.getElementById('ai-search-btn');
    if (aiSearchBtn) {
        const searchEngine = await getCurrentSearchEngine();
        // 当当前搜索引擎为必应时，不显示AI搜索按钮
        if (searchEngine.includes('bing.com')) {
            aiSearchBtn.style.display = 'none';
        } else {
            aiSearchBtn.style.display = 'flex';
        }
    }
}

// 打开设置面板
function openSettings() {
    const settings = getSettings();
    
    // 搜索引擎选项（国内外都可以使用所有搜索引擎）
    const searchEngineOptions = [
        { name: '百度', url: 'https://www.baidu.com/s?wd=' },
        { name: 'Google', url: 'https://www.google.com/search?q=' },
        { name: 'Bing', url: 'https://www.bing.com/search?q=' },
        { name: '秘塔', url: 'https://metaso.cn/?q=' },
        { name: 'GitHub', url: 'https://github.com/search?q=' },
        { name: 'Gitee', url: 'https://so.gitee.com/?q=' },
        { name: 'ChatGPT', url: 'https://chatgpt.com/?q=' }
    ];
    
    // 国内搜索引擎选项
    const domesticOptions = searchEngineOptions;
    
    // 国际搜索引擎选项
    const internationalOptions = searchEngineOptions;
    
    // 创建设置弹窗
    const popup = document.createElement('div');
    popup.style.cssText = `
        position: fixed;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        background-color: #fff;
        color: #000;
        padding: 20px;
        border-radius: 8px;
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
        z-index: 9999;
        min-width: 300px;
    `;
    
    // 黑暗模式适配
    if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
        popup.style.backgroundColor = '#333';
        popup.style.color = '#fff';
    }
    
    // 弹窗内容
    popup.innerHTML = `
        <h3 style="margin-top: 0;">搜索引擎设置</h3>
        <div style="margin-bottom: 15px;">
            <p>国内搜索引擎：</p>
            <select id="domestic-select" style="width: 100%; padding: 8px; margin-top: 5px;">
                ${domesticOptions.map(option => `
                    <option value="${option.url}" ${settings.domestic === option.url ? 'selected' : ''}>
                        ${option.name}
                    </option>
                `).join('')}
            </select>
        </div>
        <div style="margin-bottom: 15px;">
            <p>国际搜索引擎：</p>
            <select id="international-select" style="width: 100%; padding: 8px; margin-top: 5px;">
                ${internationalOptions.map(option => `
                    <option value="${option.url}" ${settings.international === option.url ? 'selected' : ''}>
                        ${option.name}
                    </option>
                `).join('')}
            </select>
        </div>
        <div style="display: flex; justify-content: flex-end; gap: 10px;">
            <button id="cancel-btn" style="padding: 8px 16px; border: 1px solid #ddd; border-radius: 4px; background-color: #f8f9fa; cursor: pointer;">取消</button>
            <button id="save-btn" style="padding: 8px 16px; border: 1px solid #4285f4; border-radius: 4px; background-color: #4285f4; color: white; cursor: pointer;">保存</button>
        </div>
    `;
    
    // 添加遮罩层
    const overlay = document.createElement('div');
    overlay.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        background-color: rgba(0, 0, 0, 0.5);
        z-index: 9998;
    `;
    
    // 添加到页面
    document.body.appendChild(overlay);
    document.body.appendChild(popup);
    
    // 取消按钮
    document.getElementById('cancel-btn').addEventListener('click', function() {
        document.body.removeChild(popup);
        document.body.removeChild(overlay);
    });
    
    // 保存按钮
    document.getElementById('save-btn').addEventListener('click', function() {
        const domesticSelect = document.getElementById('domestic-select');
        const internationalSelect = document.getElementById('international-select');
        
        const newSettings = {
            domestic: domesticSelect.value,
            international: internationalSelect.value
        };
        
        saveSettings(newSettings);
        
        // 显示保存成功提示
        const successPopup = document.createElement('div');
        successPopup.style.cssText = `
            position: fixed;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            background-color: #4CAF50;
            color: white;
            padding: 15px;
            border-radius: 4px;
            z-index: 10000;
        `;
        successPopup.textContent = '设置已保存';
        document.body.appendChild(successPopup);
        
        // 3秒后关闭提示
        setTimeout(() => {
            document.body.removeChild(successPopup);
        }, 2000);
        
        // 关闭设置弹窗
        document.body.removeChild(popup);
        document.body.removeChild(overlay);
    });
}

// 初始化函数
function init() {
    // 初始化IP检测
    initIPDetection();
    
    // 检查是否应该显示AI搜索按钮
    checkAISearchButtonVisibility();
    
    // 为搜索框添加回车键事件监听器和输入事件监听器
        const searchInput = document.getElementById('search-input');
        const aiSearchBtn = document.getElementById('ai-search-btn');
        
        if (searchInput) {
            searchInput.addEventListener('keypress', function(e) {
                if (e.key === 'Enter') {
                    performSearch();
                }
            });
            
            // 监听输入事件，更新AI搜索按钮外观
            searchInput.addEventListener('input', function() {
                const inputValue = this.value.trim();
                const bilibiliKeywords = ['bilibili', 'Bilibili', '哔哩哔哩', 'b站', 'B站'];
                const deepseekKeywords = ['deepseek', 'Deepseek', 'DS', 'ds'];
                const qwenKeywords = ['qwen', 'qianwen', '千问'];
                const chatgptKeywords = ['chatgpt', 'ChatGPT'];
                const grokKeywords = ['grok', 'Grok'];
                const claudeKeywords = ['claude', 'Claude'];
                const doubaoKeywords = ['doubao', 'Doubao', '豆包'];
                
                if (bilibiliKeywords.includes(inputValue)) {
                    // 切换到B站模式
                    if (aiSearchBtn) {
                        aiSearchBtn.style.background = 'linear-gradient(135deg, #FF69B4, #FF1493)';
                        aiSearchBtn.querySelector('span').textContent = '打开bilibili';
                    }
                } else if (deepseekKeywords.includes(inputValue)) {
                    // 切换到DeepSeek模式
                    if (aiSearchBtn) {
                        aiSearchBtn.style.background = 'linear-gradient(135deg, #0066CC, #0099FF)';
                        aiSearchBtn.querySelector('span').textContent = '打开DeepSeek';
                    }
                } else if (qwenKeywords.includes(inputValue)) {
                    // 切换到Qwen模式
                    if (aiSearchBtn) {
                        aiSearchBtn.style.background = 'linear-gradient(135deg, #7B68EE, #9370DB)';
                        aiSearchBtn.querySelector('span').textContent = '打开千问';
                    }
                } else if (chatgptKeywords.includes(inputValue)) {
                    // 切换到ChatGPT模式
                    if (aiSearchBtn) {
                        aiSearchBtn.style.background = 'linear-gradient(135deg, #10A37F, #00C853)';
                        aiSearchBtn.querySelector('span').textContent = '打开ChatGPT';
                    }
                } else if (grokKeywords.includes(inputValue)) {
                    // 切换到Grok模式
                    if (aiSearchBtn) {
                        aiSearchBtn.style.background = 'linear-gradient(135deg, #667eea, #764ba2)';
                        aiSearchBtn.querySelector('span').textContent = '打开Grok';
                    }
                } else if (claudeKeywords.includes(inputValue)) {
                    // 切换到Claude模式
                    if (aiSearchBtn) {
                        aiSearchBtn.style.background = 'linear-gradient(135deg, #4A90E2, #357ABD)';
                        aiSearchBtn.querySelector('span').textContent = '打开Claude';
                    }
                } else if (doubaoKeywords.includes(inputValue)) {
                    // 切换到Doubao模式
                    if (aiSearchBtn) {
                        aiSearchBtn.style.background = 'linear-gradient(135deg, #FF9500, #FF5E3A)';
                        aiSearchBtn.querySelector('span').textContent = '打开豆包';
                    }
                } else {
                    // 恢复默认模式
                    if (aiSearchBtn) {
                        aiSearchBtn.style.background = 'linear-gradient(135deg, #4285F4, #34A853, #FBBC05, #EA4335)';
                        aiSearchBtn.querySelector('span').textContent = 'AI搜索';
                    }
                }
            });
        }
    
    // 为AI搜索按钮添加点击事件监听器
    if (aiSearchBtn) {
        aiSearchBtn.addEventListener('click', performAISearch);
    }
    
    // 为footer设置链接添加点击事件
    const footerSettings = document.querySelector('footer .footer-right a');
    if (footerSettings) {
        footerSettings.addEventListener('click', function(e) {
            e.preventDefault();
            openSettings();
        });
    }
}

// 页面加载时初始化
window.addEventListener('DOMContentLoaded', init);



