/**
 * Workspace Sandbox - Path security enforcement
 * Rejects: absolute paths, .. traversal, symlink escapes, NUL bytes
 */
import { realpathSync, existsSync, statSync } from "fs";
import { resolve, normalize, sep, join, relative } from "path";
import { homedir } from "os";

const DEFAULT_EXCLUDED_NAMES = new Set([
  ".git",
  ".reference",
  "node_modules",
  "target",
  "dist",
  "build",
  ".venv",
  "venv",
  ".tox",
  ".mypy_cache",
  ".pytest_cache",
  ".ruff_cache",
  "__pycache__",
]);

export interface WorkspaceConfig {
  root: string;
  allowDotGit?: boolean;
  excludedNames?: Set<string>;
}

export class Workspace {
  readonly root: string;
  readonly rootReal: string;
  private excludedNames: Set<string>;

  constructor(config: WorkspaceConfig) {
    // Resolve root to absolute path
    let rootPath = resolve(config.root);
    if (!existsSync(rootPath)) {
      throw new Error(`Workspace root does not exist: ${rootPath}`);
    }
    this.root = rootPath;
    // Try to get realpath, fallback to resolved path
    try {
      this.rootReal = realpathSync(rootPath);
    } catch {
      this.rootReal = rootPath;
    }
    this.excludedNames = config.excludedNames ?? DEFAULT_EXCLUDED_NAMES;
  }

  /** Sanitize a user-provided path relative to workspace root.
   * Returns the absolute safe path or throws an error. */
  sanitize(inputPath: string): string {
    // Reject NUL bytes
    if (inputPath.includes("\0")) {
      throw new WorkspaceError("Path contains NUL byte", "INVALID_PATH");
    }

    // Reject paths with env var references
    if (inputPath.includes("$")) {
      throw new WorkspaceError(
        "Path contains env var reference(s)",
        "INVALID_PATH",
      );
    }

    // Resolve relative to workspace root
    const resolved = resolve(this.root, inputPath);

    // Check it's within workspace
    if (
      !resolved.startsWith(this.rootReal) &&
      !resolved.startsWith(this.root)
    ) {
      throw new WorkspaceError(
        `Path escapes workspace: ${inputPath}`,
        "PATH_OUTSIDE_WORKSPACE",
      );
    }

    // Check for symlink escape
    try {
      if (existsSync(resolved)) {
        const real = realpathSync(resolved);
        if (!real.startsWith(this.rootReal)) {
          throw new WorkspaceError(
            `Symlink escape detected: ${inputPath}`,
            "SYMLINK_ESCAPE",
          );
        }
      }
    } catch (e) {
      if (e instanceof WorkspaceError) throw e;
      // realpath may fail for non-existent paths, that's ok
    }

    return resolved;
  }

  /**
   * Check if a resolved path refers to an excluded directory.
   */
  isExcluded(absPath: string): boolean {
    const parts = absPath.replace(this.rootReal, "").split(sep).filter(Boolean);
    return parts.some((p) => this.excludedNames.has(p));
  }

  /**
   * Validate a relative path for write operations.
   * Ensures parent directory exists and is within workspace.
   */
  validateWritePath(inputPath: string): string {
    const abs = this.sanitize(inputPath);
    const dir = resolve(abs, "..");

    if (!existsSync(dir)) {
      throw new WorkspaceError(
        `Parent directory does not exist: ${dir}`,
        "PARENT_NOT_FOUND",
      );
    }

    try {
      const dirReal = realpathSync(dir);
      if (!dirReal.startsWith(this.rootReal)) {
        throw new WorkspaceError(
          `Write target parent escapes workspace: ${inputPath}`,
          "PATH_OUTSIDE_WORKSPACE",
        );
      }
    } catch (e) {
      if (e instanceof WorkspaceError) throw e;
    }

    if (this.isExcluded(abs)) {
      throw new WorkspaceError(
        `Path is in an excluded directory: ${inputPath}`,
        "EXCLUDED_PATH",
      );
    }

    return abs;
  }

  /** Get relative path from workspace root */
  relative(absPath: string): string {
    try {
      return relative(this.rootReal, absPath);
    } catch {
      return absPath;
    }
  }

  /** Expand ~ to home directory then sanitize */
  expandHome(inputPath: string): string {
    if (inputPath.startsWith("~")) {
      return this.sanitize(inputPath.replace(/^~/, homedir()));
    }
    return this.sanitize(inputPath);
  }

  /** Change the workspace root at runtime */
  rebase(newRoot: string): void {
    const resolvedRoot = resolve(newRoot);
    if (!existsSync(resolvedRoot)) {
      throw new WorkspaceError(
        `New workspace root does not exist: ${resolvedRoot}`,
        "INVALID_PATH",
      );
    }
    (this as any).root = resolvedRoot;
    try {
      (this as any).rootReal = realpathSync(resolvedRoot);
    } catch {
      (this as any).rootReal = resolvedRoot;
    }
  }
}

export class WorkspaceError extends Error {
  code: string;
  constructor(message: string, code: string) {
    super(message);
    this.name = "WorkspaceError";
    this.code = code;
  }
}
