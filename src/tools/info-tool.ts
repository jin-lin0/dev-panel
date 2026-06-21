/**
 * Server Info Tool
 */
import { readFileSync, existsSync } from "fs";
import { join } from "path";
import { ToolHandler, ToolContext } from "./registry.js";

export const serverInfoHandler: ToolHandler = (_args, ctx: ToolContext) => {
  const info = {
    server: ctx.runtime.getServerInfo(),
    workspace: ctx.workspace.root,
    workspaceReal: ctx.workspace.rootReal,
    permissionMode: ctx.runtime.config.permissionMode ?? "safe",
    toolProfile: ctx.runtime.profile,
    nodeVersion: process.version,
    platform: process.platform,
    arch: process.arch,
    cwd: process.cwd(),
    pid: process.pid,
    uptime: process.uptime(),
  };

  return {
    ok: true,
    content: [{ type: "text", text: JSON.stringify(info, null, 2) }],
  };
};

export const infoTool = {
  definition: {
    name: "server_info",
    description:
      "Get server metadata including version, workspace, permissions, platform info, and tool profile.",
    inputSchema: {
      type: "object" as const,
      properties: {},
    },
    annotations: {
      title: "server_info",
      readOnlyHint: true,
      tier: "P0" as const,
    },
  },
  handler: serverInfoHandler,
};
