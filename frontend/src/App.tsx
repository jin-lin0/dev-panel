import React, { useState, useEffect, useCallback } from "react";
import {
  fetchTools,
  fetchServerInfo,
  callTool,
  listFiles,
  readFile,
  ToolInfo,
  ServerInfo,
  ToolResult,
  DirEntry,
} from "./api";
import { t, onLocaleChange, Locale, setLocale, getLocale } from "./i18n";

function useLocale(): Locale {
  const [loc, setLoc] = useState<Locale>(getLocale);
  useEffect(() => onLocaleChange(setLoc), []);
  return loc;
}

type ActiveTab =
  | "info"
  | "setup"
  | "browse"
  | "read"
  | "search"
  | "patch"
  | "command";

const styles: Record<string, any> = {
  container: {
    display: "flex",
    height: "100vh",
    fontFamily:
      '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
    color: "#1a1a2e",
    background: "#f0f2f5",
  },
  sidebar: {
    width: 220,
    background: "linear-gradient(180deg, #1a1a2e 0%, #16213e 100%)",
    color: "#e0e0e0",
    display: "flex",
    flexDirection: "column",
    padding: "16px 0",
    flexShrink: 0,
  },
  sidebarHeader: {
    padding: "0 20px 20px",
    fontSize: 14,
    fontWeight: 600,
    borderBottom: "1px solid rgba(255,255,255,0.1)",
    marginBottom: 8,
  },
  sidebarTitle: {
    fontSize: 18,
    fontWeight: 700,
    color: "#fff",
    marginBottom: 4,
  },
  navItem: (active: boolean) => ({
    padding: "10px 20px",
    cursor: "pointer",
    fontSize: 13,
    display: "flex",
    alignItems: "center",
    gap: 10,
    background: active ? "rgba(255,255,255,0.10)" : "transparent",
    borderLeft: active ? "3px solid #4fc3f7" : "3px solid transparent",
    color: active ? "#fff" : "#a0a0b8",
    transition: "all 0.2s",
  }),
  main: {
    flex: 1,
    display: "flex",
    flexDirection: "column",
    overflow: "hidden",
  },
  header: {
    padding: "16px 24px",
    background: "#fff",
    borderBottom: "1px solid #e0e0e0",
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
  },
  headerTitle: { fontSize: 18, fontWeight: 600 },
  headerBadge: {
    fontSize: 12,
    padding: "4px 10px",
    borderRadius: 12,
    background: "#e3f2fd",
    color: "#1565c0",
  },
  content: { flex: 1, overflow: "auto", padding: 24 },
  card: {
    background: "#fff",
    borderRadius: 10,
    padding: 20,
    boxShadow: "0 1px 3px rgba(0,0,0,0.08)",
    marginBottom: 16,
  },
  cardTitle: { fontSize: 15, fontWeight: 600, marginBottom: 12 },
  input: {
    width: "100%",
    padding: "8px 12px",
    border: "1px solid #d0d0d0",
    borderRadius: 6,
    fontSize: 13,
    outline: "none",
    boxSizing: "border-box",
    marginBottom: 8,
  },
  textarea: {
    width: "100%",
    minHeight: 80,
    padding: "8px 12px",
    border: "1px solid #d0d0d0",
    borderRadius: 6,
    fontSize: 13,
    fontFamily: "monospace",
    outline: "none",
    resize: "vertical",
    boxSizing: "border-box",
    marginBottom: 8,
  },
  button: (primary = false) => ({
    padding: "8px 16px",
    borderRadius: 6,
    border: "none",
    fontSize: 13,
    fontWeight: 500,
    cursor: "pointer",
    background: primary ? "#1565c0" : "#e0e0e0",
    color: primary ? "#fff" : "#333",
    transition: "all 0.2s",
    marginRight: 8,
    marginTop: 4,
  }),
  resultBox: {
    background: "#1a1a2e",
    color: "#e0e0e0",
    borderRadius: 8,
    padding: 16,
    fontFamily: '"SF Mono", "Fira Code", monospace',
    fontSize: 12,
    lineHeight: 1.6,
    overflow: "auto",
    maxHeight: 400,
    whiteSpace: "pre-wrap",
    wordBreak: "break-all",
  },
  errorBox: {
    background: "#fef2f2",
    color: "#991b1b",
    borderRadius: 8,
    padding: 12,
    fontSize: 13,
    marginTop: 8,
  },
  label: {
    fontSize: 12,
    fontWeight: 500,
    color: "#666",
    marginBottom: 4,
    display: "block",
  },
  grid2: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 },
  dirItem: (isDir: boolean) => ({
    padding: "6px 10px",
    cursor: isDir ? "pointer" : "default",
    borderRadius: 4,
    fontSize: 13,
    display: "flex",
    alignItems: "center",
    gap: 6,
    color: isDir ? "#1565c0" : "#333",
  }),
};

const TAB_ICONS: Record<string, string> = {
  info: "ℹ️",
  setup: "🚀",
  browse: "📁",
  read: "📄",
  search: "🔍",
  patch: "✏️",
  command: "💻",
};

export default function App() {
  const [activeTab, setActiveTab] = useState<ActiveTab>("info");
  const [serverInfo, setServerInfo] = useState<ServerInfo | null>(null);
  const [tools, setTools] = useState<ToolInfo[]>([]);
  const [result, setResult] = useState<ToolResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [locale, setLocaleState] = useState<Locale>(getLocale());
  const [showWsPicker, setShowWsPicker] = useState(false);
  const [wsInput, setWsInput] = useState("");
  const [wsError, setWsError] = useState("");

  useEffect(() => {
    fetchServerInfo().then(setServerInfo).catch(console.error);
    fetchTools().then(setTools).catch(console.error);
  }, []);
  useEffect(() => {
    return onLocaleChange((l) => setLocaleState(l));
  }, []);

  const runTool = useCallback(
    async (name: string, args: Record<string, any>) => {
      setLoading(true);
      setResult(null);
      try {
        const res = await callTool(name, args);
        setResult(res);
      } catch (e: any) {
        setResult({
          ok: false,
          error: { code: "NETWORK", message: e.message },
        });
      }
      setLoading(false);
    },
    [],
  );

  const toggleLocale = () => {
    setLocale(locale === "zh-CN" ? "en" : "zh-CN");
  };

  const switchWorkspace = async (newPath: string) => {
    setWsError("");
    try {
      const res = await fetch("/api/workspace", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path: newPath }),
      });
      const data = await res.json();
      if (data.ok) {
        setServerInfo((prev) =>
          prev ? { ...prev, workspace: data.workspace } : prev,
        );
        setShowWsPicker(false);
        setWsInput("");
      } else {
        setWsError(data.error || "Failed");
      }
    } catch (e: any) {
      setWsError(e.message);
    }
  };

  return (
    <div style={styles.container}>
      <div style={styles.sidebar}>
        <div style={styles.sidebarHeader}>
          <div style={styles.sidebarTitle}>🛠️ dev-panel</div>
          <div style={{ fontSize: 11, color: "#888" }}>{t("app.subtitle")}</div>
          {serverInfo && (
            <div
              style={{
                fontSize: 11,
                color: "#aaa",
                marginTop: 8,
                cursor: "pointer",
                textDecoration: "underline dotted",
              }}
              title={
                locale === "zh-CN"
                  ? "点击切换工作目录"
                  : "Click to switch workspace"
              }
              onClick={() => {
                setShowWsPicker(!showWsPicker);
                setWsInput(serverInfo.workspace);
                setWsError("");
              }}
            >
              📁 {serverInfo.workspace.split("/").pop()}
            </div>
          )}
          {showWsPicker && (
            <div style={{ marginTop: 8 }}>
              <input
                style={{
                  width: "100%",
                  padding: "4px 6px",
                  border: "1px solid #555",
                  borderRadius: 4,
                  fontSize: 11,
                  background: "#2a2a3e",
                  color: "#e0e0e0",
                  boxSizing: "border-box",
                }}
                value={wsInput}
                onChange={(e) => setWsInput(e.target.value)}
                placeholder="/path/to/project"
                onKeyDown={(e) => e.key === "Enter" && switchWorkspace(wsInput)}
              />
              <div style={{ display: "flex", gap: 4, marginTop: 4 }}>
                <button
                  style={{
                    padding: "2px 8px",
                    borderRadius: 4,
                    border: "none",
                    fontSize: 10,
                    background: "#4fc3f7",
                    color: "#1a1a2e",
                    cursor: "pointer",
                  }}
                  onClick={() => switchWorkspace(wsInput)}
                >
                  {locale === "zh-CN" ? "切换" : "Switch"}
                </button>
                <button
                  style={{
                    padding: "2px 8px",
                    borderRadius: 4,
                    border: "none",
                    fontSize: 10,
                    background: "#555",
                    color: "#aaa",
                    cursor: "pointer",
                  }}
                  onClick={() => setShowWsPicker(false)}
                >
                  ✕
                </button>
              </div>
              {wsError && (
                <div style={{ fontSize: 10, color: "#ef5350", marginTop: 4 }}>
                  {wsError}
                </div>
              )}
            </div>
          )}
        </div>
        {(Object.keys(TAB_ICONS) as ActiveTab[]).map((tab) => (
          <div
            key={tab}
            style={styles.navItem(activeTab === tab)}
            onClick={() => setActiveTab(tab)}
          >
            <span>{TAB_ICONS[tab]}</span>
            <span>{t(`tab.${tab}`)}</span>
          </div>
        ))}
        <div
          style={{
            ...styles.navItem(false),
            marginTop: "auto",
            borderTop: "1px solid rgba(255,255,255,0.1)",
            paddingTop: 12,
          }}
          onClick={toggleLocale}
        >
          <span>🌐</span>
          <span>{locale === "zh-CN" ? "English" : "中文"}</span>
        </div>
        <div style={{ padding: "12px 20px", fontSize: 11, color: "#666" }}>
          <div>
            {serverInfo?.server.name} v{serverInfo?.server.version}
          </div>
          <div>
            {tools.length} {t("app.tools")} {t("app.loaded")}
          </div>
        </div>
      </div>
      <div style={styles.main}>
        <div style={styles.header}>
          <div style={styles.headerTitle}>
            {TAB_ICONS[activeTab]} {t(`tab.${activeTab}`)}
          </div>
          <div style={styles.headerBadge}>
            {serverInfo?.permissionMode ?? "safe"} {t("app.mode")}
          </div>
        </div>
        <div style={styles.content}>
          {activeTab === "info" && (
            <ServerInfoPanel serverInfo={serverInfo} tools={tools} />
          )}
          {activeTab === "setup" && <SetupWizardPanel />}
          {activeTab === "browse" && <FileBrowserPanel />}
          {activeTab === "read" && (
            <ReadFilePanel runTool={runTool} result={result} />
          )}
          {activeTab === "search" && (
            <SearchPanel runTool={runTool} result={result} />
          )}
          {activeTab === "patch" && (
            <PatchPanel runTool={runTool} result={result} />
          )}
          {activeTab === "command" && (
            <CommandPanel runTool={runTool} result={result} />
          )}
          {loading && (
            <div style={{ textAlign: "center", padding: 20, color: "#888" }}>
              ⏳ {t("common.loading")}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function ServerInfoPanel({
  serverInfo,
  tools,
}: {
  serverInfo: ServerInfo | null;
  tools: ToolInfo[];
}) {
  return (
    <div>
      <div style={styles.card}>
        <div style={styles.cardTitle}>{t("info.server")}</div>
        {serverInfo ? (
          <div style={{ fontSize: 13, lineHeight: 2 }}>
            <div>
              <strong>{t("info.name")}:</strong> {serverInfo.server.name}
            </div>
            <div>
              <strong>{t("info.version")}:</strong> {serverInfo.server.version}
            </div>
            <div>
              <strong>{t("info.workspace")}:</strong> {serverInfo.workspace}
            </div>
            <div>
              <strong>{t("info.permission")}:</strong>{" "}
              {serverInfo.permissionMode}
            </div>
            <div>
              <strong>{t("info.profile")}:</strong> {serverInfo.profile}
            </div>
            <div>
              <strong>{t("info.toolsCount")}:</strong> {serverInfo.tools}
            </div>
          </div>
        ) : (
          <div style={{ color: "#888" }}>{t("info.loading")}</div>
        )}
      </div>
      <div style={styles.card}>
        <div style={styles.cardTitle}>
          {t("info.availableTools")} ({tools.length})
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {tools.map((tool) => (
            <div
              key={tool.name}
              style={{
                padding: "8px 12px",
                background: "#f8f9fa",
                borderRadius: 6,
                fontSize: 13,
              }}
            >
              <div style={{ fontWeight: 600, marginBottom: 2 }}>
                {tool.name}
                {tool.annotations?.tier && (
                  <span
                    style={{
                      marginLeft: 8,
                      fontSize: 10,
                      padding: "1px 6px",
                      borderRadius: 8,
                      background:
                        tool.annotations.tier === "P0" ? "#e3f2fd" : "#f3e5f5",
                      color:
                        tool.annotations.tier === "P0" ? "#1565c0" : "#7b1fa2",
                    }}
                  >
                    {tool.annotations.tier}
                  </span>
                )}
              </div>
              <div style={{ color: "#666", fontSize: 12 }}>
                {tool.description}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function FileBrowserPanel() {
  const [currentPath, setCurrentPath] = useState(".");
  const [entries, setEntries] = useState<DirEntry[]>([]);
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [fileContent, setFileContent] = useState("");
  const [isImage, setIsImage] = useState(false);
  const [imageData, setImageData] = useState("");
  useEffect(() => {
    listFiles(currentPath).then((res) => {
      if (res.ok) setEntries(res.items);
    });
  }, [currentPath]);
  const navigateTo = (dir: string) => {
    const np = currentPath === "." ? dir : `${currentPath}/${dir}`;
    setCurrentPath(np);
    setSelectedFile(null);
  };
  const openFile = async (fp: string) => {
    const full = currentPath === "." ? fp : `${currentPath}/${fp}`;
    setSelectedFile(full);
    const res = await readFile(full);
    if (res.ok) {
      if (res.binary && res.content) {
        setIsImage(true);
        setImageData(`data:${res.mime};base64,${res.content}`);
      } else {
        setIsImage(false);
        setFileContent(res.content || "");
      }
    }
  };
  return (
    <div style={styles.grid2}>
      <div style={styles.card}>
        <div style={styles.cardTitle}>📁 {t("browser.title")}</div>
        <div style={{ fontSize: 12, color: "#666", marginBottom: 8 }}>
          /{currentPath}
        </div>
        <div style={{ maxHeight: 500, overflow: "auto" }}>
          {currentPath !== "." && (
            <div
              style={styles.dirItem(true)}
              onClick={() => {
                const p = currentPath.split("/");
                p.pop();
                setCurrentPath(p.join("/") || ".");
              }}
            >
              📂 ..
            </div>
          )}
          {entries.map((e) => (
            <div
              key={e.name}
              style={styles.dirItem(e.type === "directory")}
              onClick={() =>
                e.type === "directory" ? navigateTo(e.name) : openFile(e.name)
              }
            >
              <span>{e.type === "directory" ? "📂" : "📄"}</span>
              <span>{e.name}</span>
              {e.type === "file" && (
                <span
                  style={{ marginLeft: "auto", color: "#999", fontSize: 11 }}
                >
                  {e.size > 1024
                    ? `${(e.size / 1024).toFixed(1)}KB`
                    : `${e.size}B`}
                </span>
              )}
            </div>
          ))}
        </div>
      </div>
      {selectedFile && (
        <div style={styles.card}>
          <div style={styles.cardTitle}>📄 {selectedFile}</div>
          {isImage ? (
            <img
              src={imageData}
              alt=""
              style={{ maxWidth: "100%", borderRadius: 8 }}
            />
          ) : (
            <div style={styles.resultBox}>{fileContent}</div>
          )}
        </div>
      )}
    </div>
  );
}

function ReadFilePanel({
  runTool,
  result,
}: {
  runTool: any;
  result: ToolResult | null;
}) {
  const [path, setPath] = useState("");
  const [limit, setLimit] = useState("2000");
  const [offset, setOffset] = useState("0");
  return (
    <div>
      <div style={styles.card}>
        <div style={styles.cardTitle}>{t("read.title")}</div>
        <label style={styles.label}>{t("read.path")}</label>
        <input
          style={styles.input}
          value={path}
          onChange={(e) => setPath(e.target.value)}
          placeholder="e.g. src/index.ts"
        />
        <div style={{ display: "flex", gap: 8 }}>
          <div style={{ flex: 1 }}>
            <label style={styles.label}>{t("read.lines")}</label>
            <input
              style={styles.input}
              value={limit}
              onChange={(e) => setLimit(e.target.value)}
            />
          </div>
          <div style={{ flex: 1 }}>
            <label style={styles.label}>{t("read.offset")}</label>
            <input
              style={styles.input}
              value={offset}
              onChange={(e) => setOffset(e.target.value)}
            />
          </div>
        </div>
        <button
          style={styles.button(true)}
          onClick={() =>
            runTool("read_file", {
              path,
              limit: parseInt(limit),
              offset: parseInt(offset),
            })
          }
        >
          📖 {t("read.btn")}
        </button>
      </div>
      <ResultView result={result} />
    </div>
  );
}

function SearchPanel({
  runTool,
  result,
}: {
  runTool: any;
  result: ToolResult | null;
}) {
  const [pattern, setPattern] = useState("");
  const [spath, setSPath] = useState(".");
  const [maxResults, setMaxResults] = useState("50");
  const [fixed, setFixed] = useState(false);
  return (
    <div>
      <div style={styles.card}>
        <div style={styles.cardTitle}>{t("search.title")}</div>
        <label style={styles.label}>{t("search.pattern")}</label>
        <input
          style={styles.input}
          value={pattern}
          onChange={(e) => setPattern(e.target.value)}
          placeholder="e.g. function getData"
        />
        <div style={{ display: "flex", gap: 8 }}>
          <div style={{ flex: 1 }}>
            <label style={styles.label}>{t("search.path")}</label>
            <input
              style={styles.input}
              value={spath}
              onChange={(e) => setSPath(e.target.value)}
            />
          </div>
          <div style={{ flex: 1 }}>
            <label style={styles.label}>{t("search.maxResults")}</label>
            <input
              style={styles.input}
              value={maxResults}
              onChange={(e) => setMaxResults(e.target.value)}
            />
          </div>
        </div>
        <label
          style={{
            ...styles.label,
            display: "flex",
            alignItems: "center",
            gap: 6,
          }}
        >
          <input
            type="checkbox"
            checked={fixed}
            onChange={(e) => setFixed(e.target.checked)}
          />{" "}
          {t("search.fixed")}
        </label>
        <button
          style={styles.button(true)}
          onClick={() =>
            runTool("search_text", {
              pattern,
              path: spath,
              maxResults: parseInt(maxResults),
              fixed,
            })
          }
        >
          🔍 {t("search.btn")}
        </button>
      </div>
      <ResultView result={result} />
    </div>
  );
}

function PatchPanel({
  runTool,
  result,
}: {
  runTool: any;
  result: ToolResult | null;
}) {
  const [patchesJson, setPatchesJson] = useState(
    `[{"type":"add","path":"hello.txt","content":"Hello, World!"}]`,
  );
  const [skipMissing, setSkipMissing] = useState(false);
  return (
    <div>
      <div style={styles.card}>
        <div style={styles.cardTitle}>{t("patch.title")}</div>
        <label style={styles.label}>{t("patch.json")}</label>
        <textarea
          style={{ ...styles.textarea, minHeight: 150 }}
          value={patchesJson}
          onChange={(e) => setPatchesJson(e.target.value)}
        />
        <label
          style={{
            ...styles.label,
            display: "flex",
            alignItems: "center",
            gap: 6,
          }}
        >
          <input
            type="checkbox"
            checked={skipMissing}
            onChange={(e) => setSkipMissing(e.target.checked)}
          />{" "}
          {t("patch.skipMissing")}
        </label>
        <button
          style={styles.button(true)}
          onClick={() => {
            try {
              runTool("apply_patch", {
                patches: JSON.parse(patchesJson),
                skipMissingFiles: skipMissing,
              });
            } catch {}
          }}
        >
          ✏️ {t("patch.btn")}
        </button>
        <div style={{ fontSize: 11, color: "#888", marginTop: 8 }}>
          {t("patch.hint")}
        </div>
      </div>
      <ResultView result={result} />
    </div>
  );
}

function CommandPanel({
  runTool,
  result,
}: {
  runTool: any;
  result: ToolResult | null;
}) {
  const [command, setCommand] = useState("");
  const [timeout, setTimeout_] = useState("30000");
  const handleExec = () =>
    runTool("exec_command", { command, timeout: parseInt(timeout) });
  return (
    <div>
      <div style={styles.card}>
        <div style={styles.cardTitle}>{t("command.title")}</div>
        <label style={styles.label}>{t("command.input")}</label>
        <input
          style={styles.input}
          value={command}
          onChange={(e) => setCommand(e.target.value)}
          placeholder="e.g. ls -la"
          onKeyDown={(e) => e.key === "Enter" && handleExec()}
        />
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <div style={{ width: 120 }}>
            <label style={styles.label}>{t("command.timeout")}</label>
            <input
              style={styles.input}
              value={timeout}
              onChange={(e) => setTimeout_(e.target.value)}
            />
          </div>
          <button
            style={{ ...styles.button(true), marginTop: 16 }}
            onClick={handleExec}
          >
            ▶️ {t("command.btn")}
          </button>
        </div>
        <div style={{ fontSize: 11, color: "#888", marginTop: 8 }}>
          {t("command.hint")}
        </div>
      </div>
      <ResultView result={result} isCommand />
    </div>
  );
}

function ResultView({
  result,
  isCommand,
}: {
  result: ToolResult | null;
  isCommand?: boolean;
}) {
  if (!result) return null;
  const textContent =
    result.content?.find((c) => c.type === "text")?.text || "";
  return (
    <div>
      {!result.ok && result.error && (
        <div style={styles.errorBox}>
          <strong>
            {t("common.error")} [{result.error.code}]:
          </strong>{" "}
          {result.error.message}
          {result.error.category && (
            <div style={{ fontSize: 11, marginTop: 4 }}>
              Category: {result.error.category}
            </div>
          )}
        </div>
      )}
      {result.diagnostics && result.diagnostics.length > 0 && (
        <div style={{ ...styles.card, padding: 12, marginBottom: 8 }}>
          <div style={{ fontSize: 12, color: "#666" }}>
            {result.diagnostics.map((d, i) => (
              <div key={i}>{d}</div>
            ))}
          </div>
        </div>
      )}
      {textContent && (
        <div style={{ ...styles.card, padding: 0, overflow: "hidden" }}>
          <div
            style={{
              ...styles.resultBox,
              maxHeight: isCommand ? 600 : 400,
              border: "none",
            }}
          >
            {textContent}
          </div>
        </div>
      )}
      {result.content
        ?.filter((c) => c.type === "image")
        .map((img, i) => (
          <div key={i} style={styles.card}>
            <img
              src={`data:${img.mimeType};base64,${img.data}`}
              alt=""
              style={{ maxWidth: "100%", borderRadius: 8 }}
            />
          </div>
        ))}
    </div>
  );
}

// ===================== SETUP WIZARD =====================

interface SetupState {
  step: number;
  workspace: string;
  port: string;
  profile: "full" | "read-only";
  authMode: "noauth" | "bearer" | "oauth";
  bearerToken: string;
  oauthPassword: string;
  clientId: string;
  clientSecret: string;
  tunnelProvider: "cloudflared" | "ngrok" | "none";
  autoInstall: boolean;
  status: "idle" | "running" | "done" | "error";
  message: string;
  result: {
    serverUrl?: string;
    tunnelUrl?: string;
    mcpEndpoint?: string;
    oauthIssuer?: string;
    oauthPassword?: string;
    bearerToken?: string;
  };
}

function SetupWizardPanel() {
  const locale = useLocale();
  const [state, setState] = useState<SetupState>({
    step: 0,
    workspace: ".",
    port: "8765",
    profile: "full",
    authMode: "oauth",
    bearerToken: "",
    oauthPassword: "",
    clientId: "",
    clientSecret: "",
    tunnelProvider: "cloudflared",
    autoInstall: true,
    status: "idle",
    message: "",
    result: {},
  });
  const [cloudflaredInstalled, setCloudflaredInstalled] = useState<
    boolean | null
  >(null);

  const checkCloudflared = useCallback(async () => {
    try {
      const res = await fetch("/api/setup/check-cloudflared");
      const data = await res.json();
      setCloudflaredInstalled(data.installed);
    } catch {
      setCloudflaredInstalled(false);
    }
  }, []);
  useEffect(() => {
    checkCloudflared();
  }, [checkCloudflared]);

  const generateToken = () => {
    const buf = new Uint8Array(32);
    crypto.getRandomValues(buf);
    return btoa(String.fromCharCode(...buf))
      .replace(/[+/=]/g, "")
      .slice(0, 43);
  };

  const startSetup = async () => {
    if (state.authMode === "oauth" && !state.clientId.trim()) {
      setState((s) => ({
        ...s,
        message:
          locale === "zh-CN" ? "请输入客户端 ID" : "Client ID is required",
      }));
      return;
    }
    setState((s) => ({ ...s, status: "running", message: "" }));
    const bearerToken =
      state.bearerToken || (state.authMode === "bearer" ? generateToken() : "");
    const oauthPassword =
      state.oauthPassword ||
      (state.authMode === "oauth" ? generateToken() : "");
    try {
      const res = await fetch("/api/setup/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          workspace: state.workspace,
          port: parseInt(state.port),
          profile: state.profile,
          authMode: state.authMode,
          bearerToken,
          oauthPassword,
          clientId: state.clientId || undefined,
          clientSecret: state.clientSecret || undefined,
          tunnelProvider: state.tunnelProvider,
          autoInstall: state.autoInstall,
        }),
      });
      const data = await res.json();
      if (data.ok) {
        setState((s) => ({
          ...s,
          status: "done",
          message: "",
          bearerToken,
          oauthPassword,
          result: data.config || {},
        }));
      } else {
        setState((s) => ({
          ...s,
          status: "error",
          message: data.error || "Setup failed",
        }));
      }
    } catch (e: any) {
      setState((s) => ({ ...s, status: "error", message: e.message }));
    }
  };

  const installCloudflared = async () => {
    setState((s) => ({ ...s, message: t("setup.installing") }));
    try {
      const res = await fetch("/api/setup/install-cloudflared", {
        method: "POST",
      });
      const data = await res.json();
      if (data.ok) {
        setCloudflaredInstalled(true);
        setState((s) => ({
          ...s,
          message: locale === "zh-CN" ? "✅ 安装完成" : "✅ Installed",
        }));
        setTimeout(() => setState((s) => ({ ...s, message: "" })), 3000);
      } else {
        setState((s) => ({ ...s, message: data.error || "Install failed" }));
      }
    } catch (e: any) {
      setState((s) => ({ ...s, message: e.message }));
    }
  };

  const copyConfig = () => {
    const { result, authMode, bearerToken, oauthPassword } = state;
    let text = `# dev-panel Configuration\nMCP Endpoint: ${result.mcpEndpoint || ""}\n`;
    if (result.tunnelUrl) text += `Tunnel URL: ${result.tunnelUrl}\n`;
    if (authMode === "bearer" && bearerToken)
      text += `\n# Headers:\nAuthorization: Bearer ${bearerToken}\n`;
    if (authMode === "oauth") {
      text += `\n# OAuth 2.1:\nIssuer: ${result.oauthIssuer || ""}\nPassword: ${oauthPassword}\nAuthorization metadata: ${result.oauthIssuer || ""}/.well-known/oauth-authorization-server\nProtected resource: ${result.oauthIssuer || ""}/.well-known/oauth-protected-resource\n`;
    }
    navigator.clipboard.writeText(text).then(() => {
      setState((s) => ({ ...s, message: t("setup.copied") }));
      setTimeout(() => setState((s) => ({ ...s, message: "" })), 2000);
    });
  };

  const update = (partial: Partial<SetupState>) =>
    setState((s) => ({ ...s, ...partial }));

  return (
    <div>
      {/* Server config */}
      <div style={styles.card}>
        <div style={styles.cardTitle}>
          🚀 {locale === "zh-CN" ? "服务器配置" : "Server Config"}
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
          <div>
            <label style={styles.label}>{t("setup.workspace")}</label>
            <input
              style={styles.input}
              value={state.workspace}
              onChange={(e) => update({ workspace: e.target.value })}
              placeholder={t("setup.workspacePlaceholder")}
              disabled={state.status === "running"}
            />
          </div>
          <div>
            <label style={styles.label}>{t("setup.port")}</label>
            <input
              style={styles.input}
              value={state.port}
              onChange={(e) => update({ port: e.target.value })}
              disabled={state.status === "running"}
            />
          </div>
          <div>
            <label style={styles.label}>{t("setup.profile")}</label>
            <select
              style={styles.input}
              value={state.profile}
              onChange={(e) => update({ profile: e.target.value as any })}
              disabled={state.status === "running"}
            >
              <option value="full">{t("setup.profileFull")}</option>
              <option value="read-only">{t("setup.profileReadonly")}</option>
            </select>
          </div>
          <div>
            <label style={styles.label}>{t("setup.authMode")}</label>
            <select
              style={styles.input}
              value={state.authMode}
              onChange={(e) => {
                const mode = e.target.value as any;
                update({
                  authMode: mode,
                  oauthPassword:
                    mode === "oauth" && !state.oauthPassword
                      ? generateToken()
                      : state.oauthPassword,
                  bearerToken:
                    mode === "bearer" && !state.bearerToken
                      ? generateToken()
                      : state.bearerToken,
                  clientId:
                    mode === "oauth" && !state.clientId
                      ? "dev-panel"
                      : state.clientId,
                });
              }}
              disabled={state.status === "running"}
            >
              <option value="noauth">{t("setup.authNone")}</option>
              <option value="bearer">{t("setup.authBearer")}</option>
              <option value="oauth">{t("setup.authOAuth")}</option>
            </select>
          </div>
        </div>

        {state.authMode === "bearer" && (
          <div style={{ marginTop: 8 }}>
            <label style={styles.label}>{t("setup.token")}</label>
            <div style={{ display: "flex", gap: 8 }}>
              <input
                style={{ ...styles.input, flex: 1, background: "#f0f4f0" }}
                value={state.bearerToken}
                readOnly
              />
              <button
                style={styles.button(false)}
                onClick={() => update({ bearerToken: generateToken() })}
              >
                {t("setup.autoGenerate")}
              </button>
            </div>
          </div>
        )}

        {state.authMode === "oauth" && (
          <div style={{ marginTop: 8 }}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
              <div>
                <label style={styles.label}>{t("setup.oauthPassword")}</label>
                <div style={{ display: "flex", gap: 8 }}>
                  <input
                    style={{
                      ...styles.input,
                      flex: 1,
                      background: "#f0f4f0",
                    }}
                    value={state.oauthPassword}
                    readOnly
                  />
                  <button
                    style={styles.button(false)}
                    onClick={() => update({ oauthPassword: generateToken() })}
                  >
                    {t("setup.autoGenerate")}
                  </button>
                </div>
              </div>
              <div>
                <label style={styles.label}>
                  {locale === "zh-CN" ? "客户端 ID" : "Client ID"}
                </label>
                <input
                  style={styles.input}
                  value={state.clientId}
                  onChange={(e) => update({ clientId: e.target.value })}
                  disabled={state.status === "running"}
                />
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Tunnel config */}
      <div style={styles.card}>
        <div style={styles.cardTitle}>🌐 {t("setup.step3")}</div>
        <div style={{ display: "flex", gap: 8, alignItems: "flex-end" }}>
          <div style={{ flex: 1 }}>
            <select
              style={styles.input}
              value={state.tunnelProvider}
              onChange={(e) =>
                update({ tunnelProvider: e.target.value as any })
              }
              disabled={state.status === "running"}
            >
              <option value="cloudflared">Cloudflare Tunnel</option>
              <option value="ngrok">ngrok</option>
              <option value="none">
                {locale === "zh-CN" ? "不需要隧道" : "No tunnel"}
              </option>
            </select>
          </div>
          {state.tunnelProvider !== "none" &&
            cloudflaredInstalled === false && (
              <button
                style={{ ...styles.button(false), marginBottom: 8 }}
                onClick={installCloudflared}
              >
                ⬇️ {t("setup.installCloudflared")}
              </button>
            )}
        </div>
        {state.tunnelProvider !== "none" && (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              fontSize: 12,
              color: "#666",
              marginTop: 6,
            }}
          >
            {t("setup.cloudflaredStatus")}:{" "}
            {cloudflaredInstalled === true
              ? `✅ ${t("setup.installed")}`
              : cloudflaredInstalled === false
                ? `⚠️ ${t("setup.notInstalled")}`
                : "..."}
            <label
              style={{
                ...styles.label,
                display: "flex",
                alignItems: "center",
                gap: 4,
                marginLeft: 12,
                marginBottom: 0,
              }}
            >
              <input
                type="checkbox"
                checked={state.autoInstall}
                onChange={(e) => update({ autoInstall: e.target.checked })}
                disabled={state.status === "running"}
              />{" "}
              {t("setup.autoInstall")}
            </label>
          </div>
        )}
      </div>

      {/* Action buttons */}
      <div style={{ marginBottom: 16 }}>
        {state.status !== "done" && (
          <button
            style={{
              ...styles.button(true),
              fontSize: 15,
              padding: "12px 24px",
            }}
            onClick={startSetup}
            disabled={state.status === "running"}
          >
            {state.status === "running"
              ? `⏳ ${t("setup.running")}`
              : `🚀 ${t("setup.start")}`}
          </button>
        )}
        {state.message && state.status !== "error" && (
          <span style={{ fontSize: 13, color: "#856404", marginLeft: 12 }}>
            {state.message}
          </span>
        )}
        {state.status === "error" && (
          <div style={{ ...styles.errorBox, marginTop: 8 }}>
            <strong>{t("setup.error")}:</strong> {state.message}
            <button
              style={{ ...styles.button(false), marginLeft: 8 }}
              onClick={() =>
                setState((s) => ({ ...s, status: "idle", message: "" }))
              }
            >
              {locale === "zh-CN" ? "重试" : "Retry"}
            </button>
          </div>
        )}
      </div>

      {/* Results */}
      {state.status === "done" && (
        <div style={styles.card}>
          <div style={styles.cardTitle}>✅ {t("setup.success")}</div>
          <div style={{ marginBottom: 8 }}>
            <label style={styles.label}>{t("setup.mcpUrl")}</label>
            <div
              style={{ ...styles.input, background: "#f5f5f5", fontSize: 14 }}
            >
              {state.result.mcpEndpoint ||
                `http://localhost:${state.port}/mcp`}
            </div>
          </div>
          {state.result.tunnelUrl && (
            <div style={{ marginBottom: 8 }}>
              <label style={styles.label}>{t("setup.tunnelUrl")}</label>
              <div
                style={{
                  ...styles.input,
                  background: "#f5f5f5",
                  fontSize: 14,
                  color: "#1565c0",
                }}
              >
                {state.result.tunnelUrl}
              </div>
            </div>
          )}
          {state.result.oauthIssuer && (
            <div style={{ marginBottom: 8 }}>
              <label style={styles.label}>{t("setup.oauthIssuer")}</label>
              <div
                style={{
                  ...styles.input,
                  background: "#f5f5f5",
                  fontSize: 14,
                }}
              >
                {state.result.oauthIssuer}
              </div>
            </div>
          )}
          <div style={styles.card}>
            <div style={{ ...styles.cardTitle, fontSize: 13 }}>
              {locale === "zh-CN" ? "完整配置" : "Full Config"}
            </div>
            <pre
              style={{ ...styles.resultBox, maxHeight: 200, fontSize: 11 }}
            >
              {`# dev-panel Configuration
MCP Endpoint: ${state.result.mcpEndpoint || `http://localhost:${state.port}/mcp`}
Tunnel URL: ${state.result.tunnelUrl || "(local)"}

${state.authMode === "bearer" ? `Authorization: Bearer ${state.bearerToken}` : ""}
${
  state.authMode === "oauth"
    ? `OAuth Issuer: ${state.result.oauthIssuer || ""}
OAuth Password: ${state.oauthPassword}
Authorization metadata: ${state.result.oauthIssuer || "http://localhost:" + state.port}/.well-known/oauth-authorization-server
Protected resource: ${state.result.oauthIssuer || "http://localhost:" + state.port}/.well-known/oauth-protected-resource`
    : ""
}`}
            </pre>
            <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
              <button style={styles.button(true)} onClick={copyConfig}>
                📋 {t("setup.copyBtn")}
              </button>
              <button
                style={styles.button(false)}
                onClick={() =>
                  setState((s) => ({
                    ...s,
                    status: "idle",
                    result: {},
                  }))
                }
              >
                🔄 {locale === "zh-CN" ? "重新开始" : "Restart"}
              </button>
            </div>
          </div>
        </div>
      )}

      <TunnelManager />
    </div>
  );
}

// ===== Tunnel Manager =====

interface TunnelInfo {
  id: string;
  localPort: number;
  tunnelUrl: string;
  provider: string;
  started: string;
  running: boolean;
}

function TunnelManager() {
  const loc = useLocale();
  const [tunnels, setTunnels] = useState<TunnelInfo[]>([]);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [expanded, setExpanded] = useState(false);

  const fetchTunnels = useCallback(async () => {
    try {
      const res = await fetch("/api/tunnels");
      const data = await res.json();
      setTunnels(data.tunnels || []);
      if (data.tunnels?.length > 0) setExpanded(true);
    } catch {}
  }, []);
  useEffect(() => {
    fetchTunnels();
    const interval = setInterval(fetchTunnels, 5000);
    return () => clearInterval(interval);
  }, [fetchTunnels]);

  const stopTunnel = async (id: string) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/tunnels/${id}/stop`, { method: "POST" });
      const data = await res.json();
      if (data.ok) {
        setMessage(loc === "zh-CN" ? "隧道已关闭" : "Tunnel stopped");
        fetchTunnels();
      } else {
        setMessage(data.error || "Failed");
      }
    } catch (e: any) {
      setMessage(e.message);
    }
    setLoading(false);
    setTimeout(() => setMessage(""), 3000);
  };
  const stopAllTunnels = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/tunnels/stop-all", { method: "POST" });
      const data = await res.json();
      setMessage(data.message || "Done");
      fetchTunnels();
    } catch (e: any) {
      setMessage(e.message);
    }
    setLoading(false);
    setTimeout(() => setMessage(""), 3000);
  };

  if (tunnels.length === 0 && !expanded) return null;
  return (
    <div style={styles.card}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: 12,
        }}
      >
        <div style={styles.cardTitle}>
          🌐 {loc === "zh-CN" ? "活跃隧道" : "Active Tunnels"}
          {tunnels.length > 0 && (
            <span
              style={{
                marginLeft: 8,
                fontSize: 11,
                padding: "2px 8px",
                borderRadius: 10,
                background: "#e8f5e9",
                color: "#2e7d32",
              }}
            >
              {tunnels.length}
            </span>
          )}
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          {tunnels.length > 0 && (
            <button
              style={{
                ...styles.button(false),
                fontSize: 11,
                padding: "4px 10px",
              }}
              onClick={stopAllTunnels}
              disabled={loading}
            >
              🛑 {loc === "zh-CN" ? "全部关闭" : "Stop All"}
            </button>
          )}
          {tunnels.length === 0 && (
            <button
              style={{
                ...styles.button(false),
                fontSize: 11,
                padding: "4px 10px",
              }}
              onClick={() => setExpanded(false)}
            >
              ✕
            </button>
          )}
        </div>
      </div>
      {tunnels.length === 0 ? (
        <div style={{ fontSize: 12, color: "#999" }}>
          {loc === "zh-CN"
            ? "没有活跃的隧道。使用上方向导创建。"
            : "No active tunnels. Use the wizard above to create one."}
        </div>
      ) : (
        <div>
          {tunnels.map((tunnel) => (
            <div
              key={tunnel.id}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                padding: "10px 12px",
                background: "#f8f9fa",
                borderRadius: 8,
                marginBottom: 6,
                fontSize: 13,
              }}
            >
              <span
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: 4,
                  background: "#4caf50",
                  flexShrink: 0,
                }}
              />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div
                  style={{
                    fontWeight: 500,
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  {tunnel.tunnelUrl || `localhost:${tunnel.localPort}`}
                </div>
                <div style={{ fontSize: 11, color: "#888" }}>
                  {tunnel.provider} · {loc === "zh-CN" ? "端口" : "port"}{" "}
                  {tunnel.localPort} ·{" "}
                  {new Date(tunnel.started).toLocaleTimeString()}
                </div>
              </div>
              <button
                style={{
                  padding: "4px 12px",
                  borderRadius: 6,
                  border: "1px solid #ef5350",
                  fontSize: 12,
                  color: "#ef5350",
                  background: "#fff",
                  cursor: "pointer",
                  flexShrink: 0,
                }}
                onClick={() => stopTunnel(tunnel.id)}
                disabled={loading}
              >
                🛑 {loc === "zh-CN" ? "关闭" : "Stop"}
              </button>
            </div>
          ))}
        </div>
      )}
      {message && (
        <div style={{ fontSize: 12, color: "#2e7d32", marginTop: 8 }}>
          {message}
        </div>
      )}
    </div>
  );
}

const _staticLocale = getLocale();
