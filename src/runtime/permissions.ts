/**
 * Permission System - Controls exec_command behavior
 */
export type PermissionMode = "safe" | "trusted" | "dangerous";
export type ShellEnvInherit = "none" | "core" | "full";

export interface PermissionConfig {
  mode: PermissionMode;
  shellEnvInherit: ShellEnvInherit;
  allowNetwork: boolean;
}

/** Commands that look like they access the network */
const NETWORK_COMMANDS = [
  "curl",
  "wget",
  "nc",
  "ncat",
  "netcat",
  "telnet",
  "ssh",
  "scp",
  "sftp",
  "ftp",
  "rsync",
  "aria2c",
  "httpie",
  "http",
  "xh",
  "wget2",
  "axel",
];

/** Commands that look destructive */
const DESTRUCTIVE_COMMANDS = [
  "rm",
  "rmdir",
  "dd",
  "mkfs",
  "mkfs.ext",
  "fdisk",
  "parted",
  "format",
  "mv",
  "chmod",
  "chown",
  "sudo",
  "doas",
  "pkexec",
];

/** Shell expansion patterns */
const SHELL_EXPAND_RE = /[$`(|;&]/;

/** Inline script interpreters */
const INLINE_SCRIPT_RE =
  /(python|ruby|perl|node|bash|sh|zsh|fish)\s+(-[cde]\s+)/;

export class PermissionChecker {
  private config: PermissionConfig;

  constructor(config: PermissionConfig) {
    this.config = config;
  }

  /**
   * Check a command against permissions. Returns null if allowed,
   * or an error object if blocked.
   */
  check(command: string): { allowed: boolean; reason?: string } {
    if (this.config.mode === "dangerous") {
      return { allowed: true };
    }

    const firstToken = this.getCommandToken(command);

    // Network check
    if (!this.config.allowNetwork && this.config.mode === "safe") {
      if (NETWORK_COMMANDS.includes(firstToken)) {
        return {
          allowed: false,
          reason: `Network access blocked: '${firstToken}' is not allowed in safe mode`,
        };
      }
    }

    // Destructive command check
    if (DESTRUCTIVE_COMMANDS.includes(firstToken)) {
      return {
        allowed: false,
        reason: `Destructive command blocked: '${firstToken}' requires trusted mode`,
      };
    }

    // Shell expansion check (safe mode)
    if (this.config.mode === "safe") {
      if (SHELL_EXPAND_RE.test(command)) {
        return {
          allowed: false,
          reason:
            "Shell expansion characters ($, `, |, (, ;, &) not allowed in safe mode",
        };
      }
    }

    // Inline script check (safe mode)
    if (this.config.mode === "safe") {
      if (INLINE_SCRIPT_RE.test(command)) {
        return {
          allowed: false,
          reason:
            "Inline script execution (-c/-e flags) not allowed in safe mode",
        };
      }
    }

    return { allowed: true };
  }

  /** Filter environment variables based on policy */
  filterEnv(
    env: Record<string, string> | undefined,
  ): Record<string, string> | undefined {
    if (!env) return env;
    if (this.config.shellEnvInherit === "none") return {};

    const SENSITIVE_ENV_RE =
      /(token|secret|credential|api[_-]?key|password|passwd|private)/i;
    const RISKY_ENV_NAMES = new Set([
      "BASH_ENV",
      "ENV",
      "LD_PRELOAD",
      "LD_LIBRARY_PATH",
      "DYLD_INSERT_LIBRARIES",
      "PYTHONPATH",
      "PYTHONSTARTUP",
      "NODE_OPTIONS",
      "PERL5LIB",
      "PERL5OPT",
      "RUBYOPT",
      "RUBYLIB",
    ]);

    const filtered: Record<string, string> = {};
    for (const [key, value] of Object.entries(env)) {
      // Skip risky env names
      if (RISKY_ENV_NAMES.has(key)) continue;
      // Skip sensitive-looking values
      if (SENSITIVE_ENV_RE.test(key)) continue;
      if (SENSITIVE_ENV_RE.test(value)) continue;
      filtered[key] = value;
    }
    return filtered;
  }

  private getCommandToken(command: string): string {
    // Extract the first word after trimming
    // Handle sudo/doas prefix
    let trimmed = command.trim();
    if (trimmed.startsWith("sudo ") || trimmed.startsWith("doas ")) {
      trimmed = trimmed.split(/\s+/).slice(1).join(" ");
    }
    return trimmed.split(/\s+/)[0] || "";
  }
}
