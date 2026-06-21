/**
 * Search Tool - search_text
 */
import { readFileSync, readdirSync, statSync, existsSync } from "fs";
import { join, relative, resolve } from "path";
import { ToolHandler, ToolContext } from "./registry.js";

export const searchTextHandler: ToolHandler = (
  args: Record<string, unknown>,
  ctx: ToolContext,
) => {
  const pattern = args.pattern as string;
  const path = (args.path as string) || ".";
  const includeHidden = !!args.includeHidden;
  const maxResults = (args.maxResults ?? 50) as number;
  const contextLines = (args.contextLines ?? 0) as number;
  const fixed = !!args.fixed;

  if (!pattern) {
    return {
      ok: false,
      error: {
        code: "MISSING_ARGUMENT",
        message: "pattern is required",
        category: "invalid_request",
        retryable: false,
      },
    };
  }

  const absBase = ctx.workspace.sanitize(path);
  if (!existsSync(absBase)) {
    return {
      ok: false,
      error: {
        code: "DIR_NOT_FOUND",
        message: `Directory not found: ${path}`,
        category: "not_found",
        retryable: false,
      },
    };
  }

  const results: Array<{ file: string; line: number; content: string }> = [];
  const excludeDirs = new Set([
    ".git",
    "node_modules",
    ".venv",
    "venv",
    "target",
    "dist",
    "build",
    "__pycache__",
  ]);

  function walk(dir: string) {
    if (results.length >= maxResults) return;
    let entries: string[];
    try {
      entries = readdirSync(dir);
    } catch {
      return;
    }
    for (const entry of entries) {
      if (!includeHidden && entry.startsWith(".")) continue;
      if (excludeDirs.has(entry)) continue;
      const fullPath = join(dir, entry);
      try {
        const stat = statSync(fullPath);
        if (stat.isDirectory()) {
          walk(fullPath);
        } else if (stat.isFile() && stat.size < 1024 * 1024) {
          // Skip binary files
          searchFile(fullPath);
          if (results.length >= maxResults) return;
        }
      } catch {
        /* ignore */
      }
    }
  }

  function searchFile(filePath: string) {
    try {
      const content = readFileSync(filePath, "utf-8");
      const lines = content.split("\n");
      const regex = fixed
        ? new RegExp(pattern.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
        : new RegExp(pattern, "m");

      for (let i = 0; i < lines.length; i++) {
        if (regex.test(lines[i])) {
          const relPath = relative(absBase, filePath);
          results.push({
            file: relPath,
            line: i + 1,
            content: lines[i].substring(0, 500),
          });
          if (results.length >= maxResults) return;
        }
      }
    } catch {
      /* skip files that can't be read as text */
    }
  }

  try {
    walk(absBase);
    return {
      ok: true,
      content: [{ type: "text", text: JSON.stringify(results, null, 2) }],
      diagnostics: [
        `Pattern: ${pattern}`,
        `Path: ${path}`,
        `Results: ${results.length}${results.length >= maxResults ? ` (max hit)` : ""}`,
      ],
    };
  } catch (e: unknown) {
    const err = e as Error;
    return {
      ok: false,
      error: {
        code: "SEARCH_ERROR",
        message: err.message,
        category: "internal",
        retryable: true,
      },
    };
  }
};

export const searchTool = {
  definition: {
    name: "search_text",
    description:
      "Search for a pattern (regex or fixed string) across files in the workspace.",
    inputSchema: {
      type: "object" as const,
      properties: {
        pattern: {
          type: "string",
          description: "Search pattern (regex by default)",
        },
        path: {
          type: "string",
          description: "Base directory to search",
          default: ".",
        },
        includeHidden: {
          type: "boolean",
          description: "Include hidden files/dirs",
          default: false,
        },
        maxResults: {
          type: "number",
          description: "Maximum number of results",
          default: 50,
        },
        contextLines: {
          type: "number",
          description:
            "Context lines around matches (not yet implemented in basic mode)",
          default: 0,
        },
        fixed: {
          type: "boolean",
          description: "Treat pattern as fixed string, not regex",
          default: false,
        },
      },
      required: ["pattern"],
    },
    annotations: {
      title: "search_text",
      readOnlyHint: true,
      tier: "P0" as const,
    },
  },
  handler: searchTextHandler,
};
