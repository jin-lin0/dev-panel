/**
 * Image Tool - view_image
 */
import { readFileSync, existsSync, statSync } from "fs";
import { ToolHandler, ToolContext } from "./registry.js";

const SUPPORTED_EXTENSIONS = new Set([
  ".png",
  ".jpg",
  ".jpeg",
  ".gif",
  ".bmp",
  ".webp",
  ".svg",
]);
const MAX_DIMENSION = 2000;

export const viewImageHandler: ToolHandler = (
  args: Record<string, unknown>,
  ctx: ToolContext,
) => {
  const filePath = args.path as string;
  if (!filePath) {
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

  const absPath = ctx.workspace.sanitize(filePath);

  if (!existsSync(absPath)) {
    return {
      ok: false,
      error: {
        code: "FILE_NOT_FOUND",
        message: `File not found: ${filePath}`,
        category: "not_found",
        retryable: false,
      },
    };
  }

  const stat = statSync(absPath);
  if (stat.isDirectory()) {
    return {
      ok: false,
      error: {
        code: "IS_DIRECTORY",
        message: `Path is a directory: ${filePath}`,
        category: "invalid_request",
        retryable: false,
      },
    };
  }

  const ext = absPath.toLowerCase().slice(absPath.lastIndexOf("."));
  if (!SUPPORTED_EXTENSIONS.has(ext)) {
    return {
      ok: false,
      error: {
        code: "UNSUPPORTED_FORMAT",
        message: `Unsupported image format: ${ext}. Supported: ${Array.from(SUPPORTED_EXTENSIONS).join(", ")}`,
        category: "invalid_request",
        retryable: false,
      },
    };
  }

  try {
    const data = readFileSync(absPath);
    const base64 = data.toString("base64");
    const mimeType = ext === ".svg" ? "image/svg+xml" : `image/${ext.slice(1)}`;

    return {
      ok: true,
      content: [
        { type: "image" as const, data: base64, mimeType: mimeType as any },
      ],
    };
  } catch (e: unknown) {
    const err = e as Error;
    return {
      ok: false,
      error: {
        code: "READ_ERROR",
        message: err.message,
        category: "internal",
        retryable: true,
      },
    };
  }
};

export const imageTool = {
  definition: {
    name: "view_image",
    description:
      "View an image file from the workspace. Supports PNG, JPG, GIF, BMP, WEBP, SVG.",
    inputSchema: {
      type: "object" as const,
      properties: {
        path: { type: "string", description: "Path to the image file" },
      },
      required: ["path"],
    },
    annotations: {
      title: "view_image",
      readOnlyHint: true,
      tier: "P1" as const,
    },
  },
  handler: viewImageHandler,
};
