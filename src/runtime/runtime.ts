/**
 * Runtime - Core execution engine that manages tools, sessions, and context
 */
import { ChildProcess } from "child_process";
import { ToolRegistry, ToolContext } from "../tools/registry.js";
import {
  ToolDefinition,
  ToolResponse,
  ContentItem,
  ServerCapabilities,
  InitializeResult,
  LoggingLevel,
} from "../mcp/types.js";
import { Workspace, WorkspaceConfig } from "./workspace.js";
import {
  PermissionChecker,
  PermissionConfig,
  PermissionMode,
  ShellEnvInherit,
} from "./permissions.js";

export interface RuntimeConfig {
  workspace: WorkspaceConfig;
  permissionMode?: PermissionMode;
  shellEnvInherit?: ShellEnvInherit;
  allowNetwork?: boolean;
  toolProfile?: ToolProfile;
  authMode?: "noauth" | "bearer" | "oauth";
  authToken?: string;
}

export type ToolProfile = "full" | "read-only" | "compat-readonly-all";

/** Active command session */
export interface CommandSession {
  process: ChildProcess | null;
  started: Date;
  command: string;
}

export class Runtime {
  readonly workspace: Workspace;
  readonly permissions: PermissionChecker;
  readonly tools: ToolRegistry;
  readonly config: RuntimeConfig;
  readonly profile: ToolProfile;

  private sessions: Map<string, CommandSession> = new Map();
  private loggingLevel: LoggingLevel = "info";
  private initialized = false;

  constructor(config: RuntimeConfig) {
    this.config = config;
    this.workspace = new Workspace(config.workspace);
    this.permissions = new PermissionChecker({
      mode: config.permissionMode ?? "safe",
      shellEnvInherit: config.shellEnvInherit ?? "core",
      allowNetwork: config.allowNetwork ?? false,
    });
    this.tools = new ToolRegistry();
    this.profile = config.toolProfile ?? "full";
  }

  /** Mark runtime as initialized */
  markInitialized(): void {
    this.initialized = true;
  }

  get isInitialized(): boolean {
    return this.initialized;
  }

  /** Create the tool context for handler invocation */
  createContext(sessionId?: string): ToolContext {
    return {
      workspace: this.workspace,
      runtime: this,
      sessionId,
    };
  }

  /** Get server info */
  getServerInfo(): { name: string; version: string } {
    return {
      name: "dev-panel",
      version: "0.1.0",
    };
  }

  /** Get capabilities */
  getCapabilities(): ServerCapabilities {
    return {
      tools: {},
      logging: {
        supportedLevels: [
          "debug",
          "info",
          "notice",
          "warning",
          "error",
          "critical",
          "alert",
          "emergency",
        ],
      },
    };
  }

  /** Handle MCP initialize */
  initialize(): InitializeResult {
    this.markInitialized();
    return {
      protocolVersion: "2025-06-18",
      capabilities: this.getCapabilities(),
      serverInfo: this.getServerInfo(),
    };
  }

  /** List available tools */
  listTools(): ToolDefinition[] {
    return this.tools.listDefinitions();
  }

  /** Call a tool */
  async callTool(
    name: string,
    args: Record<string, unknown>,
  ): Promise<ToolResponse> {
    return this.tools.call(name, args, this.createContext());
  }

  /** Switch workspace at runtime */
  setWorkspace(newRoot: string): void {
    this.workspace.rebase(newRoot);
  }

  /** Cancel a session */
  cancelSession(sessionId: string): void {
    const session = this.sessions.get(sessionId);
    if (session) {
      try {
        session.process?.kill?.("SIGTERM");
      } catch {
        // ignore
      }
      this.sessions.delete(sessionId);
    }
  }

  /** Register a session */
  registerSession(sessionId: string, session: CommandSession): void {
    this.sessions.set(sessionId, session);
  }

  /** Get a session */
  getSession(sessionId: string): CommandSession | undefined {
    return this.sessions.get(sessionId);
  }

  /** Remove a session */
  removeSession(sessionId: string): void {
    this.sessions.delete(sessionId);
  }

  /** Set logging level */
  setLoggingLevel(params: { level?: LoggingLevel }): void {
    if (params.level) {
      this.loggingLevel = params.level;
    }
  }
}
