/** API client for backend communication */

const API_BASE = "/api";

export interface ToolInfo {
  name: string;
  description: string;
  inputSchema: {
    type: string;
    properties?: Record<string, any>;
    required?: string[];
  };
  annotations?: {
    title?: string;
    readOnlyHint?: boolean;
    destructiveHint?: boolean;
    tier?: string;
  };
}

export interface ServerInfo {
  server: { name: string; version: string };
  workspace: string;
  permissionMode: string;
  profile: string;
  tools: number;
}

export interface ToolResult {
  ok: boolean;
  content?: Array<{
    type: string;
    text?: string;
    data?: string;
    mimeType?: string;
  }>;
  error?: {
    code: string;
    message: string;
    category?: string;
    retryable?: boolean;
  };
  diagnostics?: string[];
}

export interface DirEntry {
  name: string;
  type: "file" | "directory";
  size: number;
  modified: string;
}

export interface FileListResult {
  ok: boolean;
  path: string;
  items: DirEntry[];
  error?: string;
}

export interface FileReadResult {
  ok: boolean;
  content: string;
  mime?: string;
  binary?: boolean;
  error?: string;
}

export async function fetchTools(): Promise<ToolInfo[]> {
  const res = await fetch(`${API_BASE}/tools`);
  const data = await res.json();
  return data.tools;
}

export async function fetchServerInfo(): Promise<ServerInfo> {
  const res = await fetch(`${API_BASE}/info`);
  return res.json();
}

export async function callTool(
  name: string,
  args: Record<string, any>,
): Promise<ToolResult> {
  const res = await fetch(`${API_BASE}/tools/${name}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ arguments: args }),
  });
  return res.json();
}

export async function listFiles(
  path: string,
  showHidden = false,
): Promise<FileListResult> {
  const res = await fetch(
    `${API_BASE}/files?path=${encodeURIComponent(path)}&showHidden=${showHidden}`,
  );
  return res.json();
}

export async function readFile(path: string): Promise<FileReadResult> {
  const res = await fetch(
    `${API_BASE}/files/read?path=${encodeURIComponent(path)}`,
  );
  return res.json();
}
