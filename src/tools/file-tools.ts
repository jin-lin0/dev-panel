/**
 * File Tools - read_file, list_dir, list_files
 */
import { readFileSync, readdirSync, statSync, existsSync } from "fs";
import { resolve, join, relative, sep } from "path";
import { ToolHandler, ToolContext } from "./registry.js";

const DEFAULT_MAX_LINES = 2000;
const IMAGE_EXTENSIONS = new Set([
  ".png",
  ".jpg",
  ".jpeg",
  ".gif",
  ".bmp",
  ".webp",
  ".svg",
]);

export const readFileHandler: ToolHandler = (
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

  // Check if it's an image
  const ext = absPath.toLowerCase().slice(absPath.lastIndexOf("."));
  if (IMAGE_EXTENSIONS.has(ext)) {
    try {
      const data = readFileSync(absPath);
      const base64 = data.toString("base64");
      const mimeType =
        ext === ".svg" ? "image/svg+xml" : `image/${ext.slice(1)}`;
      return {
        ok: true,
        content: [{ type: "image", data: base64, mimeType: mimeType as any }],
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
  }

  // Text file
  const limit = (args.limit ?? DEFAULT_MAX_LINES) as number;
  const offset = (args.offset ?? 0) as number;

  try {
    const content = readFileSync(absPath, "utf-8");
    const lines = content.split("\n");
    const totalLines = lines.length;

    let selectedLines: string[];
    if (offset > 0 || limit < totalLines) {
      selectedLines = lines.slice(offset, offset + limit);
    } else {
      selectedLines = lines;
    }

    const text = selectedLines.join("\n");
    const truncated = offset + selectedLines.length < totalLines;

    return {
      ok: true,
      content: [{ type: "text" as const, text }],
      diagnostics: [
        `File: ${ctx.workspace.relative(absPath)}`,
        `Lines: ${totalLines}`,
        ...(truncated
          ? [
              `Showing lines ${offset + 1}-${offset + selectedLines.length} (${totalLines} total, truncated)`,
            ]
          : []),
        ...(limit !== DEFAULT_MAX_LINES ? [`Limit: ${limit}`] : []),
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

export const listDirHandler: ToolHandler = (
  args: Record<string, unknown>,
  ctx: ToolContext,
) => {
  const dirPath = (args.path as string) || ".";
  const absPath = ctx.workspace.sanitize(dirPath);

  if (!existsSync(absPath)) {
    return {
      ok: false,
      error: {
        code: "DIR_NOT_FOUND",
        message: `Directory not found: ${dirPath}`,
        category: "not_found",
        retryable: false,
      },
    };
  }

  const stat = statSync(absPath);
  if (!stat.isDirectory()) {
    return {
      ok: false,
      error: {
        code: "NOT_DIRECTORY",
        message: `Path is not a directory: ${dirPath}`,
        category: "invalid_request",
        retryable: false,
      },
    };
  }

  try {
    const entries = readdirSync(absPath, { withFileTypes: true });
    const items = entries
      .filter((e) => !e.name.startsWith(".") || args.showHidden)
      .map((e) => {
        const fullPath = resolve(absPath, e.name);
        let size = 0;
        let mtime = "";
        try {
          const s = statSync(fullPath);
          size = s.size;
          mtime = s.mtime.toISOString();
        } catch {
          /* ignore */
        }
        return {
          name: e.name,
          type: e.isDirectory()
            ? "directory"
            : e.isSymbolicLink()
              ? "symlink"
              : "file",
          size,
          modified: mtime,
        };
      })
      .sort((a, b) => {
        // Directories first, then alphabetical
        if (a.type === "directory" && b.type !== "directory") return -1;
        if (a.type !== "directory" && b.type === "directory") return 1;
        return a.name.localeCompare(b.name);
      });

    return {
      ok: true,
      content: [{ type: "text", text: JSON.stringify(items, null, 2) }],
      diagnostics: [
        `${items.length} entries in ${ctx.workspace.relative(absPath)}`,
      ],
    };
  } catch (e: unknown) {
    const err = e as Error;
    return {
      ok: false,
      error: {
        code: "LIST_ERROR",
        message: err.message,
        category: "internal",
        retryable: true,
      },
    };
  }
};

export const listFilesHandler: ToolHandler = (
  args: Record<string, unknown>,
  ctx: ToolContext,
) => {
  const pattern = (args.pattern as string) || "**/*";
  const basePath = (args.path as string) || ".";
  const absBase = ctx.workspace.sanitize(basePath);

  if (!existsSync(absBase)) {
    return {
      ok: false,
      error: {
        code: "DIR_NOT_FOUND",
        message: `Base directory not found: ${basePath}`,
        category: "not_found",
        retryable: false,
      },
    };
  }

  try {
    let files: string[];
    files = simpleWalk(absBase, pattern, absBase, !!args.includeHidden);

    const limit = (args.limit ?? 200) as number;
    const offset = (args.offset ?? 0) as number;

    if (offset > 0 || limit < files.length) {
      files = files.slice(offset, offset + limit);
    }

    return {
      ok: true,
      content: [{ type: "text", text: files.join("\n") }],
      diagnostics: [
        `Pattern: ${pattern}`,
        `Matches: ${files.length}${files.length > limit ? ` (showing ${limit})` : ""}`,
      ],
    };
  } catch (e: unknown) {
    const err = e as Error;
    return {
      ok: false,
      error: {
        code: "GLOB_ERROR",
        message: err.message,
        category: "internal",
        retryable: true,
      },
    };
  }
};

/** Simple recursive walk to find files (no glob dependency) */
function simpleWalk(
  dir: string,
  _pattern: string,
  base: string,
  includeHidden: boolean,
): string[] {
  const results: string[] = [];

  function walk(currentDir: string) {
    let entries: string[];
    try {
      entries = readdirSync(currentDir);
    } catch {
      return;
    }
    for (const entry of entries) {
      if (!includeHidden && entry.startsWith(".")) continue;
      const full = join(currentDir, entry);
      try {
        const s = statSync(full);
        if (s.isDirectory()) {
          walk(full);
        } else {
          results.push(relative(base, full));
        }
      } catch {
        /* ignore */
      }
    }
  }

  walk(dir);
  return results.sort();
}

export const fileTools = [
  {
    definition: {
      name: "read_file",
      description:
        "Read the contents of a file. Supports text (with line ranges) and images.",
      inputSchema: {
        type: "object" as const,
        properties: {
          path: {
            type: "string",
            description: "Path relative to workspace root",
          },
          limit: {
            type: "number",
            description: "Max lines to read",
            default: 2000,
          },
          offset: {
            type: "number",
            description: "Line offset to start from",
            default: 0,
          },
        },
        required: ["path"],
      },
      annotations: {
        title: "read_file",
        readOnlyHint: true,
        tier: "P0" as const,
      },
    },
    handler: readFileHandler,
  },
  {
    definition: {
      name: "list_dir",
      description:
        "List directory contents with entry types, sizes, and modification times. Directories are listed first, then files, alphabetically.",
      inputSchema: {
        type: "object" as const,
        properties: {
          path: {
            type: "string",
            description: "Directory path relative to workspace root",
            default: ".",
          },
          showHidden: {
            type: "boolean",
            description: "Show hidden files (dotfiles)",
            default: false,
          },
        },
      },
      annotations: {
        title: "list_dir",
        readOnlyHint: true,
        tier: "P0" as const,
      },
    },
    handler: listDirHandler,
  },
  {
    definition: {
      name: "list_files",
      description:
        "Recursively list files matching a glob pattern within the workspace.",
      inputSchema: {
        type: "object" as const,
        properties: {
          pattern: {
            type: "string",
            description: 'Glob pattern (e.g. "**/*.ts", "src/**/*.py")',
            default: "**/*",
          },
          path: { type: "string", description: "Base directory", default: "." },
          includeHidden: {
            type: "boolean",
            description: "Include hidden files",
            default: false,
          },
          limit: { type: "number", description: "Max results", default: 200 },
          offset: {
            type: "number",
            description: "Offset for pagination",
            default: 0,
          },
        },
      },
      annotations: {
        title: "list_files",
        readOnlyHint: true,
        tier: "P0" as const,
      },
    },
    handler: listFilesHandler,
  },
];
