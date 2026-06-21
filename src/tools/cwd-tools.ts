/**
 * CWD Tools - get_default_cwd, set_default_cwd
 */
import { ToolHandler, ToolContext } from "./registry.js";

let defaultCwd: string | null = null;

export const getDefaultCwdHandler: ToolHandler = (_args, ctx: ToolContext) => {
  const cwd = defaultCwd || ctx.workspace.root;
  return {
    ok: true,
    content: [{ type: "text", text: cwd }],
    diagnostics: [`Default CWD: ${cwd}`],
  };
};

export const setDefaultCwdHandler: ToolHandler = (args, ctx: ToolContext) => {
  const path = args.path as string;
  if (!path) {
    return {
      ok: false,
      error: {
        code: "MISSING_ARGUMENT",
        message: "path is required",
        category: "invalid_request",
        retryable: false,
      },
    };
  }
  try {
    const absPath = ctx.workspace.sanitize(path);
    defaultCwd = absPath;
    return {
      ok: true,
      content: [{ type: "text", text: `Default CWD set to: ${absPath}` }],
    };
  } catch (e: unknown) {
    const err = e as Error;
    return {
      ok: false,
      error: {
        code: "INVALID_PATH",
        message: err.message,
        category: "invalid_request",
        retryable: false,
      },
    };
  }
};

export const getDefaultCwdTool = {
  definition: {
    name: "get_default_cwd",
    description: "Get the default working directory for subsequent tool calls.",
    inputSchema: { type: "object" as const, properties: {} },
    annotations: {
      title: "get_default_cwd",
      readOnlyHint: true,
      tier: "P0" as const,
    },
  },
  handler: getDefaultCwdHandler,
};

export const setDefaultCwdTool = {
  definition: {
    name: "set_default_cwd",
    description: "Set the default working directory for subsequent tool calls.",
    inputSchema: {
      type: "object" as const,
      properties: {
        path: { type: "string", description: "Directory path" },
      },
      required: ["path"],
    },
    annotations: { title: "set_default_cwd", tier: "P0" as const },
  },
  handler: setDefaultCwdHandler,
};
