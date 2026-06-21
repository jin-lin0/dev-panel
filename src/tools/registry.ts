/**
 * Tool Registry - Tool definition and handler management
 */
import { ToolDefinition, ToolResponse } from "../mcp/types.js";
import { Workspace } from "../runtime/workspace.js";
import { Runtime } from "../runtime/runtime.js";

/** Tool handler function signature */
export type ToolHandler = (
  args: Record<string, unknown>,
  ctx: ToolContext,
) => ToolResponse | Promise<ToolResponse>;

/** Context passed to every tool handler */
export interface ToolContext {
  workspace: Workspace;
  runtime: Runtime;
  sessionId?: string;
}

/** Registered tool entry */
export interface ToolEntry {
  definition: ToolDefinition;
  handler: ToolHandler;
}

export class ToolRegistry {
  private tools: Map<string, ToolEntry> = new Map();

  /** Register a tool */
  register(
    name: string,
    definition: ToolDefinition,
    handler: ToolHandler,
  ): void {
    if (this.tools.has(name)) {
      throw new Error(`Tool already registered: ${name}`);
    }
    this.tools.set(name, { definition: { ...definition, name }, handler });
  }

  /** Get tool by name */
  get(name: string): ToolEntry | undefined {
    return this.tools.get(name);
  }

  /** List all tool definitions */
  listDefinitions(): ToolDefinition[] {
    return Array.from(this.tools.values()).map((e) => e.definition);
  }

  /** Call a tool by name */
  async call(
    name: string,
    args: Record<string, unknown>,
    ctx: ToolContext,
  ): Promise<ToolResponse> {
    const entry = this.tools.get(name);
    if (!entry) {
      return {
        ok: false,
        error: {
          code: "TOOL_NOT_FOUND",
          message: `Unknown tool: ${name}`,
          category: "invalid_request",
          retryable: false,
        },
      };
    }
    try {
      // Validate required args
      const required = entry.definition.inputSchema.required ?? [];
      for (const key of required) {
        if (!(key in args) || args[key] === undefined || args[key] === null) {
          return {
            ok: false,
            error: {
              code: "MISSING_ARGUMENT",
              message: `Missing required argument: ${key}`,
              category: "invalid_request",
              retryable: false,
            },
          };
        }
      }
      const result = await entry.handler(args, ctx);
      return result;
    } catch (e: unknown) {
      const err = e as Error;
      return {
        ok: false,
        error: {
          code: "INTERNAL_ERROR",
          message: err.message || "Unknown error",
          category: "internal",
          retryable: true,
        },
      };
    }
  }
}
