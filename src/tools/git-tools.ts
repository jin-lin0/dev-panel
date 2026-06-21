/**
 * Git Tools - git_status, git_diff, git_log, git_show, git_blame
 */
import { execSync, spawn } from "child_process";
import { existsSync } from "fs";
import { join } from "path";
import { ToolHandler, ToolContext } from "./registry.js";

/** Execute git command in workspace and return output */
function git(args: string[], ctx: ToolContext, timeout = 15000): string {
  try {
    const output = execSync(`git ${args.join(" ")}`, {
      cwd: ctx.workspace.root,
      encoding: "utf-8",
      timeout,
      maxBuffer: 10 * 1024 * 1024,
    });
    return output.trim();
  } catch (e: unknown) {
    const err = e as any;
    if (err.stderr) throw new Error(err.stderr.trim());
    if (err.stdout) throw new Error(err.stdout.trim());
    throw new Error(`git ${args[0]} failed: ${err.message}`);
  }
}

/** Check if workspace is a git repo */
function isGitRepo(ctx: ToolContext): boolean {
  return existsSync(join(ctx.workspace.root, ".git"));
}

export const gitStatusHandler: ToolHandler = (_args, ctx: ToolContext) => {
  if (!isGitRepo(ctx)) {
    return {
      ok: false,
      error: {
        code: "NOT_A_REPO",
        message: "Workspace is not a git repository",
        category: "invalid_request",
        retryable: false,
      },
    };
  }
  try {
    const output = git(["status"], ctx);
    const branch = git(["rev-parse", "--abbrev-ref", "HEAD"], ctx);
    const hash = git(["rev-parse", "HEAD"], ctx);

    let files: Array<{ status: string; path: string }> = [];
    try {
      const statusShort = git(["status", "--porcelain"], ctx);
      files = statusShort
        .split("\n")
        .filter(Boolean)
        .map((line) => ({
          status: line.substring(0, 2).trim(),
          path: line.substring(3),
        }));
    } catch {
      /* ignore */
    }

    return {
      ok: true,
      content: [{ type: "text", text: output }],
      diagnostics: [
        `Branch: ${branch}`,
        `Commit: ${hash}`,
        `Modified/Untracked: ${files.length}`,
      ],
    };
  } catch (e: unknown) {
    const err = e as Error;
    return {
      ok: false,
      error: {
        code: "GIT_ERROR",
        message: err.message,
        category: "internal",
        retryable: true,
      },
    };
  }
};

export const gitDiffHandler: ToolHandler = (args, ctx: ToolContext) => {
  if (!isGitRepo(ctx)) {
    return {
      ok: false,
      error: {
        code: "NOT_A_REPO",
        message: "Workspace is not a git repository",
        category: "invalid_request",
        retryable: false,
      },
    };
  }
  try {
    const target = (args.target as string) || "HEAD";
    const pathSpec = (args.path as string) || "";
    const cmd = ["diff", target, "--", pathSpec].filter(Boolean);
    const output = git(cmd, ctx);

    return {
      ok: true,
      content: [{ type: "text", text: output || "(no differences)" }],
    };
  } catch (e: unknown) {
    const err = e as Error;
    return {
      ok: false,
      error: {
        code: "GIT_ERROR",
        message: err.message,
        category: "internal",
        retryable: true,
      },
    };
  }
};

export const gitLogHandler: ToolHandler = (args, ctx: ToolContext) => {
  if (!isGitRepo(ctx)) {
    return {
      ok: false,
      error: {
        code: "NOT_A_REPO",
        message: "Workspace is not a git repository",
        category: "invalid_request",
        retryable: false,
      },
    };
  }
  try {
    const maxCount = (args.maxCount ?? 10) as number;
    const pathSpec = (args.path as string) || "";
    const format = (args.format as string) || "%h %ai %s";
    const cmd = [
      "log",
      `--max-count=${maxCount}`,
      `--format=${format}`,
      pathSpec && "--",
      pathSpec,
    ].filter(Boolean);
    const output = git(cmd, ctx);

    return {
      ok: true,
      content: [{ type: "text", text: output || "(no commits)" }],
      diagnostics: [
        `Last ${maxCount} commits${pathSpec ? ` for ${pathSpec}` : ""}`,
      ],
    };
  } catch (e: unknown) {
    const err = e as Error;
    return {
      ok: false,
      error: {
        code: "GIT_ERROR",
        message: err.message,
        category: "internal",
        retryable: true,
      },
    };
  }
};

export const gitShowHandler: ToolHandler = (args, ctx: ToolContext) => {
  if (!isGitRepo(ctx)) {
    return {
      ok: false,
      error: {
        code: "NOT_A_REPO",
        message: "Workspace is not a git repository",
        category: "invalid_request",
        retryable: false,
      },
    };
  }
  try {
    const revision = (args.revision as string) || "HEAD";
    const output = git(["show", revision], ctx, 30000);

    return {
      ok: true,
      content: [{ type: "text", text: output }],
      diagnostics: [`Revision: ${revision}`],
    };
  } catch (e: unknown) {
    const err = e as Error;
    return {
      ok: false,
      error: {
        code: "GIT_ERROR",
        message: err.message,
        category: "internal",
        retryable: true,
      },
    };
  }
};

export const gitBlameHandler: ToolHandler = (args, ctx: ToolContext) => {
  if (!isGitRepo(ctx)) {
    return {
      ok: false,
      error: {
        code: "NOT_A_REPO",
        message: "Workspace is not a git repository",
        category: "invalid_request",
        retryable: false,
      },
    };
  }
  try {
    const filePath = args.path as string;
    if (!filePath) {
      return {
        ok: false,
        error: {
          code: "MISSING_ARGUMENT",
          message: "path is required for blame",
          category: "invalid_request",
          retryable: false,
        },
      };
    }
    // Validate path
    ctx.workspace.sanitize(filePath);
    const output = git(["blame", filePath], ctx);

    return {
      ok: true,
      content: [{ type: "text", text: output }],
      diagnostics: [`File: ${filePath}`],
    };
  } catch (e: unknown) {
    const err = e as Error;
    return {
      ok: false,
      error: {
        code: "GIT_ERROR",
        message: err.message,
        category: "internal",
        retryable: true,
      },
    };
  }
};

export const gitTools = [
  {
    definition: {
      name: "git_status",
      description:
        "Show git working tree status (branch, commit, modified/untracked files).",
      inputSchema: { type: "object" as const, properties: {} },
      annotations: {
        title: "git_status",
        readOnlyHint: true,
        tier: "P0" as const,
      },
    },
    handler: gitStatusHandler,
  },
  {
    definition: {
      name: "git_diff",
      description: "Show git diff against a target (default: HEAD).",
      inputSchema: {
        type: "object" as const,
        properties: {
          target: {
            type: "string",
            description: "Git ref to diff against",
            default: "HEAD",
          },
          path: { type: "string", description: "Path filter" },
        },
      },
      annotations: {
        title: "git_diff",
        readOnlyHint: true,
        tier: "P0" as const,
      },
    },
    handler: gitDiffHandler,
  },
  {
    definition: {
      name: "git_log",
      description: "Show git commit log.",
      inputSchema: {
        type: "object" as const,
        properties: {
          maxCount: {
            type: "number",
            description: "Max commits to show",
            default: 10,
          },
          path: { type: "string", description: "Path filter" },
          format: {
            type: "string",
            description: "Custom format string",
            default: "%h %ai %s",
          },
        },
      },
      annotations: {
        title: "git_log",
        readOnlyHint: true,
        tier: "P0" as const,
      },
    },
    handler: gitLogHandler,
  },
  {
    definition: {
      name: "git_show",
      description: "Show git object (commit, tag, etc.) with diff.",
      inputSchema: {
        type: "object" as const,
        properties: {
          revision: {
            type: "string",
            description: "Revision to show",
            default: "HEAD",
          },
        },
      },
      annotations: {
        title: "git_show",
        readOnlyHint: true,
        tier: "P1" as const,
      },
    },
    handler: gitShowHandler,
  },
  {
    definition: {
      name: "git_blame",
      description: "Show git blame for a file (who last modified each line).",
      inputSchema: {
        type: "object" as const,
        properties: {
          path: { type: "string", description: "File path" },
        },
        required: ["path"],
      },
      annotations: {
        title: "git_blame",
        readOnlyHint: true,
        tier: "P1" as const,
      },
    },
    handler: gitBlameHandler,
  },
];
