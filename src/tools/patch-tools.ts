/**
 * Patch Tool - apply_patch
 * Applies structured changes (add, replace, remove, move) to files.
 */
import {
  readFileSync,
  writeFileSync,
  renameSync,
  unlinkSync,
  existsSync,
  statSync,
} from "fs";
import { ToolHandler, ToolContext } from "./registry.js";

interface PatchHunk {
  oldStart: number;
  oldLines?: string[];
  newStart: number;
  newLines?: string[];
}

interface FilePatch {
  type: "add" | "replace" | "remove" | "move";
  path: string;
  oldPath?: string;
  hunks?: PatchHunk[];
  content?: string;
}

interface PatchRequest {
  patches: FilePatch[];
  skipMissingFiles?: boolean;
  skipWhitespaceCheck?: boolean;
}

export const applyPatchHandler: ToolHandler = (
  args: Record<string, unknown>,
  ctx: ToolContext,
) => {
  const request = args as unknown as PatchRequest;

  if (
    !request.patches ||
    !Array.isArray(request.patches) ||
    request.patches.length === 0
  ) {
    return {
      ok: false,
      error: {
        code: "MISSING_ARGUMENT",
        message: "patches array is required",
        category: "invalid_request",
        retryable: false,
      },
    };
  }

  const diagnostics: string[] = [];
  const errors: string[] = [];

  for (let i = 0; i < request.patches.length; i++) {
    const patch = request.patches[i];
    try {
      switch (patch.type) {
        case "add":
          applyAdd(patch, ctx, request.skipMissingFiles);
          diagnostics.push(`[${i}] Added: ${patch.path}`);
          break;
        case "replace":
          applyReplace(
            patch,
            ctx,
            request.skipWhitespaceCheck,
            request.skipMissingFiles,
          );
          diagnostics.push(`[${i}] Replaced: ${patch.path}`);
          break;
        case "remove":
          applyRemove(patch, ctx, request.skipMissingFiles);
          diagnostics.push(`[${i}] Removed: ${patch.path}`);
          break;
        case "move":
          applyMove(patch, ctx, request.skipMissingFiles);
          diagnostics.push(`[${i}] Moved: ${patch.oldPath} -> ${patch.path}`);
          break;
        default:
          errors.push(`[${i}] Unknown patch type: ${(patch as any).type}`);
      }
    } catch (e: unknown) {
      const err = e as Error;
      errors.push(`[${i}] ${patch.type}:${patch.path} - ${err.message}`);
    }
  }

  if (errors.length > 0) {
    return {
      ok: false,
      content: [
        {
          type: "text",
          text: `Completed with errors:\n${errors.join("\n")}\n\nSuccesses:\n${diagnostics.join("\n")}`,
        },
      ],
      error: {
        code: "PATCH_ERRORS",
        message: `${errors.length} of ${request.patches.length} patches failed`,
        category: "partial_failure",
        retryable: false,
        details: { errors, successes: diagnostics },
      },
      diagnostics,
    };
  }

  return {
    ok: true,
    content: [
      {
        type: "text",
        text: `All ${request.patches.length} patches applied successfully.\n${diagnostics.join("\n")}`,
      },
    ],
    diagnostics,
  };
};

function applyAdd(patch: FilePatch, ctx: ToolContext, skipMissing?: boolean) {
  const absPath = ctx.workspace.validateWritePath(patch.path);

  // Check if file already exists
  if (existsSync(absPath)) {
    if (skipMissing) return;
    throw new Error(`File already exists: ${patch.path}`);
  }

  const content = patch.hunks
    ? patch.hunks
        .map((h) => h.newLines?.join("\n"))
        .filter(Boolean)
        .join("\n")
    : (patch.content ?? "");

  writeFileSync(absPath, content, "utf-8");
}

function applyReplace(
  patch: FilePatch,
  ctx: ToolContext,
  skipWhitespace?: boolean,
  skipMissing?: boolean,
) {
  const absPath = ctx.workspace.validateWritePath(patch.path);

  if (!existsSync(absPath)) {
    if (skipMissing) return;
    throw new Error(`File not found: ${patch.path}`);
  }

  const stat = statSync(absPath);
  if (stat.isDirectory()) {
    throw new Error(`Path is a directory: ${patch.path}`);
  }

  const content = readFileSync(absPath, "utf-8");
  const lines = content.split("\n");

  if (patch.hunks && patch.hunks.length > 0) {
    // Apply hunks in reverse order to preserve line numbers
    const sortedHunks = [...patch.hunks].sort(
      (a, b) => b.oldStart - a.oldStart,
    );

    for (const hunk of sortedHunks) {
      const oldStart = hunk.oldStart - 1; // Convert to 0-indexed
      const oldLines = hunk.oldLines ?? [];

      // Line-by-line verification
      if (!skipWhitespace) {
        let allMismatch = true;
        for (let j = 0; j < oldLines.length; j++) {
          const expected = oldLines[j];
          const actual = lines[oldStart + j];
          if (expected === actual) {
            allMismatch = false;
          }
        }
        if (allMismatch && oldLines.length > 0) {
          throw new Error(
            `Hunk at line ${hunk.oldStart} does not match file content.\n` +
              `  Expected: ${oldLines[0]}\n` +
              `  Actual: ${lines[oldStart] || "(end of file)"}`,
          );
        }
      }

      // Replace the lines
      const newLines = hunk.newLines ?? [];
      lines.splice(oldStart, oldLines.length, ...newLines);
    }
  } else if (patch.content !== undefined) {
    // Direct content replacement
    return writeFileSync(absPath, patch.content, "utf-8");
  }

  writeFileSync(absPath, lines.join("\n"), "utf-8");
}

function applyRemove(
  patch: FilePatch,
  ctx: ToolContext,
  skipMissing?: boolean,
) {
  const absPath = ctx.workspace.validateWritePath(patch.path);

  if (!existsSync(absPath)) {
    if (skipMissing) return;
    throw new Error(`File not found: ${patch.path}`);
  }

  unlinkSync(absPath);
}

function applyMove(patch: FilePatch, ctx: ToolContext, skipMissing?: boolean) {
  if (!patch.oldPath) {
    throw new Error("oldPath is required for move operation");
  }

  const oldAbs = ctx.workspace.validateWritePath(patch.oldPath);
  const newAbs = ctx.workspace.validateWritePath(patch.path);

  if (!existsSync(oldAbs)) {
    if (skipMissing) return;
    throw new Error(`Source not found: ${patch.oldPath}`);
  }

  if (existsSync(newAbs)) {
    throw new Error(`Target already exists: ${patch.path}`);
  }

  renameSync(oldAbs, newAbs);
}

export const patchTool = {
  definition: {
    name: "apply_patch",
    description:
      "Add, replace, remove, or move files in the workspace using structured patches.",
    inputSchema: {
      type: "object" as const,
      properties: {
        patches: {
          type: "array" as const,
          items: {
            type: "object" as const,
            properties: {
              type: {
                type: "string",
                enum: ["add", "replace", "remove", "move"],
              },
              path: { type: "string", description: "Target file path" },
              oldPath: {
                type: "string",
                description: "Source file path (for move)",
              },
              content: {
                type: "string",
                description: "Full file content (for add/replace)",
              },
              hunks: {
                type: "array" as const,
                items: {
                  type: "object" as const,
                  properties: {
                    oldStart: { type: "number" },
                    oldLines: { type: "array", items: { type: "string" } },
                    newStart: { type: "number" },
                    newLines: { type: "array", items: { type: "string" } },
                  },
                },
              },
            },
            required: ["type", "path"],
          },
        },
        skipMissingFiles: { type: "boolean", default: false },
        skipWhitespaceCheck: { type: "boolean", default: false },
      },
      required: ["patches"],
    },
    annotations: {
      title: "apply_patch",
      destructiveHint: true,
      idempotentHint: true,
      tier: "P0" as const,
    },
  },
  handler: applyPatchHandler,
};
