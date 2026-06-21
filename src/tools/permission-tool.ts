/**
 * Request Permissions Tool
 */
import { ToolHandler, ToolContext } from "./registry.js";

export const requestPermissionsHandler: ToolHandler = (
  args: Record<string, unknown>,
  _ctx: ToolContext,
) => {
  const reason = args.reason as string;
  return {
    ok: true,
    content: [
      {
        type: "text",
        text: `Permission request received: ${reason || "(no reason given)"}`,
      },
    ],
    diagnostics: ["Permission request is informational in Node version"],
  };
};

export const requestPermissionsTool = {
  definition: {
    name: "request_permissions",
    description:
      "Request permission for an operation that may require user consent.",
    inputSchema: {
      type: "object" as const,
      properties: {
        reason: {
          type: "string",
          description: "Reason for the permission request",
        },
      },
      required: ["reason"],
    },
    annotations: {
      title: "request_permissions",
      tier: "P1" as const,
    },
  },
  handler: requestPermissionsHandler,
};
