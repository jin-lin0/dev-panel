/**
 * i18n - Simple translation system for Chinese/English support
 */

export type Locale = "zh-CN" | "en";

// Default export type
type TranslateFn = (
  key: string,
  params?: Record<string, string | number>,
) => string;

// The translations map
const translations: Record<string, Record<string, string>> = {};

// Current locale
let currentLocale: Locale = "zh-CN";

// Listeners for locale change
const listeners: Array<(locale: Locale) => void> = [];

/**
 * Register translations for a module
 */
export function registerTranslations(
  locale: Locale,
  map: Record<string, string>,
): void {
  if (!translations[locale]) {
    translations[locale] = {};
  }
  Object.assign(translations[locale], map);
}

/**
 * Set current locale
 */
export function setLocale(locale: Locale): void {
  currentLocale = locale;
  listeners.forEach((fn) => fn(locale));
}

/**
 * Get current locale
 */
export function getLocale(): Locale {
  return currentLocale;
}

/**
 * Translate a key to the current locale
 */
export function t(
  key: string,
  params?: Record<string, string | number>,
): string {
  const map = translations[currentLocale];
  let text = map?.[key];
  if (!text) {
    // Fallback to English
    text = translations["en"]?.[key];
  }
  if (!text) {
    return key;
  }
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      text = text.replace(new RegExp(`\\{${k}\\}`, "g"), String(v));
    }
  }
  return text;
}

/**
 * Hook to subscribe to locale changes (for React)
 */
export function onLocaleChange(fn: (locale: Locale) => void): () => void {
  listeners.push(fn);
  return () => {
    const idx = listeners.indexOf(fn);
    if (idx >= 0) listeners.splice(idx, 1);
  };
}

/**
 * Get the translate function for the current locale
 */
export function getT(): TranslateFn {
  return t as TranslateFn;
}

// ===== Register common translations =====

// UI translations
registerTranslations("zh-CN", {
  "app.title": "编码工具 MCP 控制台",
  "app.subtitle": "Web 仪表盘",
  "app.workspace": "工作目录",
  "app.mode": "模式",
  "app.tools": "工具",
  "app.loaded": "已加载",

  // Sidebar tabs
  "tab.info": "服务器信息",
  "tab.setup": "安装向导",
  "tab.browse": "文件浏览",
  "tab.read": "读取文件",
  "tab.search": "搜索",
  "tab.patch": "修改文件",
  "tab.command": "命令执行",
  "tab.language": "语言",

  // Server Info
  "info.server": "服务器",
  "info.name": "名称",
  "info.version": "版本",
  "info.workspace": "工作目录",
  "info.permission": "权限模式",
  "info.profile": "工具配置",
  "info.toolsCount": "工具数量",
  "info.availableTools": "可用工具",
  "info.loading": "加载中...",

  // File Browser
  "browser.title": "文件浏览器",
  "browser.parent": "返回上级",
  "browser.entries": "个条目",

  // Read File
  "read.title": "读取文件",
  "read.path": "文件路径",
  "read.lines": "最大行数",
  "read.offset": "起始行",
  "read.btn": "读取文件",

  // Search
  "search.title": "搜索文本",
  "search.pattern": "搜索模式（正则或文本）",
  "search.path": "路径",
  "search.maxResults": "最大结果数",
  "search.fixed": "固定字符串（非正则）",
  "search.btn": "搜索",

  // Patch
  "patch.title": "修改文件",
  "patch.json": "补丁 JSON",
  "patch.skipMissing": "跳过缺失文件",
  "patch.btn": "应用补丁",
  "patch.hint": "支持类型: add, replace, remove, move",

  // Command
  "command.title": "执行命令",
  "command.input": "命令",
  "command.timeout": "超时时间(毫秒)",
  "command.btn": "运行",
  "command.hint": "权限模式限制网络命令、破坏性命令和 Shell 展开。",

  // Setup Wizard
  "setup.title": "安装配置向导",
  "setup.step1": "基本配置",
  "setup.step2": "认证设置",
  "setup.step3": "隧道设置",
  "setup.step4": "完成",
  "setup.workspace": "工作目录",
  "setup.workspacePlaceholder": "项目路径（如 ./）",
  "setup.port": "端口",
  "setup.profile": "工具配置",
  "setup.profileFull": "完整（所有工具）",
  "setup.profileReadonly": "只读（安全）",
  "setup.authMode": "认证模式",
  "setup.authNone": "无认证",
  "setup.authBearer": "Bearer Token",
  "setup.authOAuth": "OAuth 2.1",
  "setup.token": "Token",
  "setup.autoGenerate": "自动生成",
  "setup.oauthPassword": "OAuth 密码",
  "setup.clientId": "客户端 ID",
  "setup.clientSecret": "客户端密钥",
  "setup.tunnel": "隧道提供商",
  "setup.autoInstall": "自动安装隧道工具",
  "setup.start": "启动服务器并配置隧道",
  "setup.running": "正在配置...",
  "setup.success": "配置完成！",
  "setup.error": "配置失败",
  "setup.mcpUrl": "MCP 端点",
  "setup.tunnelUrl": "隧道 URL",
  "setup.oauthIssuer": "OAuth 发行者",
  "setup.copyBtn": "复制配置",
  "setup.copied": "已复制！",
  "setup.installCloudflared": "安装 cloudflared",
  "setup.installing": "安装中...",
  "setup.cloudflaredStatus": "Cloudflared 状态",
  "setup.installed": "已安装",
  "setup.notInstalled": "未安装",

  // Common
  "common.cancel": "取消",
  "common.confirm": "确认",
  "common.loading": "加载中...",
  "common.error": "错误",
  "common.success": "成功",
  "common.copy": "复制",
  "common.copied": "已复制",
});

registerTranslations("en", {
  "app.title": "dev-panel",
  "app.subtitle": "Web Dashboard",
  "app.workspace": "Workspace",
  "app.mode": "Mode",
  "app.tools": "Tools",
  "app.loaded": "loaded",

  // Sidebar tabs
  "tab.info": "Server Info",
  "tab.setup": "Setup Wizard",
  "tab.browse": "File Browser",
  "tab.read": "Read File",
  "tab.search": "Search",
  "tab.patch": "Patch",
  "tab.command": "Command",
  "tab.language": "Language",

  // Server Info
  "info.server": "Server",
  "info.name": "Name",
  "info.version": "Version",
  "info.workspace": "Workspace",
  "info.permission": "Permission Mode",
  "info.profile": "Tool Profile",
  "info.toolsCount": "Tools Count",
  "info.availableTools": "Available Tools",
  "info.loading": "Loading...",

  // File Browser
  "browser.title": "File Browser",
  "browser.parent": "Go to parent",
  "browser.entries": "entries",

  // Read File
  "read.title": "Read File",
  "read.path": "File Path",
  "read.lines": "Max Lines",
  "read.offset": "Start Line",
  "read.btn": "Read File",

  // Search
  "search.title": "Search Text",
  "search.pattern": "Pattern (regex or text)",
  "search.path": "Path",
  "search.maxResults": "Max Results",
  "search.fixed": "Fixed string (not regex)",
  "search.btn": "Search",

  // Patch
  "patch.title": "Apply Patch",
  "patch.json": "Patches JSON",
  "patch.skipMissing": "Skip missing files",
  "patch.btn": "Apply Patches",
  "patch.hint": "Supported: add, replace, remove, move",

  // Command
  "command.title": "Execute Command",
  "command.input": "Command",
  "command.timeout": "Timeout (ms)",
  "command.btn": "Run",
  "command.hint":
    "Permission mode restricts network, destructive, and shell expansion commands.",

  // Setup Wizard
  "setup.title": "Setup Wizard",
  "setup.step1": "Basic Config",
  "setup.step2": "Auth Settings",
  "setup.step3": "Tunnel Settings",
  "setup.step4": "Complete",
  "setup.workspace": "Workspace",
  "setup.workspacePlaceholder": "Project path (e.g. ./)",
  "setup.port": "Port",
  "setup.profile": "Tool Profile",
  "setup.profileFull": "Full (all tools)",
  "setup.profileReadonly": "Read-only (safe)",
  "setup.authMode": "Auth Mode",
  "setup.authNone": "No Auth",
  "setup.authBearer": "Bearer Token",
  "setup.authOAuth": "OAuth 2.1",
  "setup.token": "Token",
  "setup.autoGenerate": "Auto-generate",
  "setup.oauthPassword": "OAuth Password",
  "setup.clientId": "Client ID",
  "setup.clientSecret": "Client Secret",
  "setup.tunnel": "Tunnel Provider",
  "setup.autoInstall": "Auto-install tunnel tool",
  "setup.start": "Start Server & Configure Tunnel",
  "setup.running": "Configuring...",
  "setup.success": "Configuration Complete!",
  "setup.error": "Configuration Failed",
  "setup.mcpUrl": "MCP Endpoint",
  "setup.tunnelUrl": "Tunnel URL",
  "setup.oauthIssuer": "OAuth Issuer",
  "setup.copyBtn": "Copy Config",
  "setup.copied": "Copied!",
  "setup.installCloudflared": "Install cloudflared",
  "setup.installing": "Installing...",
  "setup.cloudflaredStatus": "Cloudflared Status",
  "setup.installed": "Installed",
  "setup.notInstalled": "Not Installed",

  // Common
  "common.cancel": "Cancel",
  "common.confirm": "Confirm",
  "common.loading": "Loading...",
  "common.error": "Error",
  "common.success": "Success",
  "common.copy": "Copy",
  "common.copied": "Copied",
});
