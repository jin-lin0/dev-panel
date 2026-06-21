/**
 * Command Tools - exec_command, write_stdin, kill_session
 */
import { spawn, ChildProcess } from "child_process";
import { randomUUID } from "crypto";
import { ToolHandler, ToolContext } from "./registry.js";

interface ActiveSession {
  process: ChildProcess;
  started: Date;
  command: string;
  output: string;
  done: boolean;
}

const activeSessions: Map<string, ActiveSession> = new Map();
const OUTPUT_LIMIT = 1 * 1024 * 1024; // 1MB

export const execCommandHandler: ToolHandler = (
  args: Record<string, unknown>,
  ctx: ToolContext,
) => {
  const command = args.command as string;
  if (!command || !command.trim()) {
    return {
      ok: false,
      error: {
        code: "MISSING_ARGUMENT",
        message: "command is required",
        category: "invalid_request",
        retryable: false,
      },
    };
  }

  // Permission check
  const { allowed, reason } = ctx.runtime.permissions.check(command);
  if (!allowed) {
    return {
      ok: false,
      error: {
        code: "PERMISSION_DENIED",
        message: reason || "Command not allowed by policy",
        category: "security",
        retryable: false,
      },
    };
  }

  const cwd = ctx.workspace.root;
  const timeout = (args.timeout ?? 30000) as number;

  // Build environment
  const env: Record<string, string | undefined> = { ...process.env };
  // Filter sensitive env vars
  const rawEnv: Record<string, string> = {};
  for (const [k, v] of Object.entries(env)) {
    if (
      v !== undefined &&
      !["NODE_PATH", "NODE_OPTIONS", "BASH_ENV", "ENV"].includes(k)
    ) {
      rawEnv[k] = v;
    }
  }
  const filteredEnv = ctx.runtime.permissions.filterEnv(rawEnv);

  // Use shell for safe/trusted modes, direct exec for dangerous
  const useShell = args.shell !== false;

  const sessionId =
    (args.sessionId as string) || `cmd-${randomUUID().slice(0, 8)}`;

  return new Promise((resolve) => {
    const startTime = Date.now();
    let output = "";
    let errorOutput = "";
    let timedOut = false;
    let exitCode: number | null = null;
    let signal: string | null = null;

    const child = spawn(command, [], {
      cwd,
      env: filteredEnv,
      shell: useShell,
      stdio: ["pipe", "pipe", "pipe"],
      timeout,
    });

    const session: ActiveSession = {
      process: child,
      started: new Date(),
      command,
      output: "",
      done: false,
    };

    activeSessions.set(sessionId, session);

    // Timeout timer
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill("SIGTERM");
      // Give it a moment, then SIGKILL
      setTimeout(() => {
        try {
          child.kill("SIGKILL");
        } catch {
          /* ignore */
        }
      }, 2000);
    }, timeout);

    child.stdout?.on("data", (data: Buffer) => {
      const chunk = data.toString();
      if (output.length + errorOutput.length < OUTPUT_LIMIT) {
        output += chunk;
      }
    });

    child.stderr?.on("data", (data: Buffer) => {
      const chunk = data.toString();
      if (output.length + errorOutput.length < OUTPUT_LIMIT) {
        errorOutput += chunk;
      }
    });

    child.on("close", (code, sig) => {
      clearTimeout(timer);
      exitCode = code;
      signal = sig;
      session.done = true;
      session.output = output + errorOutput;
      activeSessions.delete(sessionId);

      const elapsed = Date.now() - startTime;
      const truncated = output.length + errorOutput.length >= OUTPUT_LIMIT;

      resolve({
        ok: true,
        content: [
          {
            type: "text",
            text:
              output + (errorOutput ? `\n--- stderr ---\n${errorOutput}` : ""),
          },
        ],
        diagnostics: [
          `Exit code: ${exitCode}`,
          `Elapsed: ${elapsed}ms`,
          timedOut ? "Timed out" : "",
          signal ? `Signal: ${signal}` : "",
          truncated ? "Output truncated (1MB limit)" : "",
          `Session: ${sessionId}`,
        ].filter(Boolean) as string[],
      });
    });

    child.on("error", (err) => {
      clearTimeout(timer);
      session.done = true;
      activeSessions.delete(sessionId);
      resolve({
        ok: false,
        error: {
          code: "EXEC_ERROR",
          message: err.message,
          category: "internal",
          retryable: true,
        },
      });
    });
  });
};

export const writeStdinHandler: ToolHandler = (
  args: Record<string, unknown>,
  _ctx: ToolContext,
) => {
  const sessionId = args.sessionId as string;
  const data = args.data as string;

  if (!sessionId) {
    return {
      ok: false,
      error: {
        code: "MISSING_ARGUMENT",
        message: "sessionId is required",
        category: "invalid_request",
        retryable: false,
      },
    };
  }
  if (data === undefined) {
    return {
      ok: false,
      error: {
        code: "MISSING_ARGUMENT",
        message: "data is required",
        category: "invalid_request",
        retryable: false,
      },
    };
  }

  const session = activeSessions.get(sessionId);
  if (!session || session.done) {
    return {
      ok: false,
      error: {
        code: "SESSION_NOT_FOUND",
        message: `Session not found or already ended: ${sessionId}`,
        category: "not_found",
        retryable: false,
      },
    };
  }

  try {
    session.process.stdin?.write(data);
    session.process.stdin?.end();
    return {
      ok: true,
      content: [
        {
          type: "text",
          text: `Wrote ${data.length} bytes to session ${sessionId}`,
        },
      ],
    };
  } catch (e: unknown) {
    const err = e as Error;
    return {
      ok: false,
      error: {
        code: "STDIN_ERROR",
        message: err.message,
        category: "internal",
        retryable: true,
      },
    };
  }
};

export const killSessionHandler: ToolHandler = (
  args: Record<string, unknown>,
  _ctx: ToolContext,
) => {
  const sessionId = args.sessionId as string;
  if (!sessionId) {
    return {
      ok: false,
      error: {
        code: "MISSING_ARGUMENT",
        message: "sessionId is required",
        category: "invalid_request",
        retryable: false,
      },
    };
  }

  const session = activeSessions.get(sessionId);
  if (!session || session.done) {
    return {
      ok: false,
      error: {
        code: "SESSION_NOT_FOUND",
        message: `Session not found: ${sessionId}`,
        category: "not_found",
        retryable: false,
      },
    };
  }

  try {
    session.process.kill("SIGTERM");
    setTimeout(() => {
      try {
        session.process.kill("SIGKILL");
      } catch {
        /* ignore */
      }
    }, 2000);
    return {
      ok: true,
      content: [{ type: "text", text: `Session ${sessionId} terminated` }],
    };
  } catch (e: unknown) {
    const err = e as Error;
    return {
      ok: false,
      error: {
        code: "KILL_ERROR",
        message: err.message,
        category: "internal",
        retryable: true,
      },
    };
  }
};

export const commandTools = [
  {
    definition: {
      name: "exec_command",
      description:
        "Execute a shell command within the workspace. Returns stdout, stderr, exit code, and timing.",
      inputSchema: {
        type: "object" as const,
        properties: {
          command: { type: "string", description: "Shell command to execute" },
          timeout: {
            type: "number",
            description: "Timeout in milliseconds",
            default: 30000,
          },
          sessionId: {
            type: "string",
            description: "Session identifier for long-running commands",
          },
          shell: {
            type: "boolean",
            description: "Use shell to execute",
            default: true,
          },
        },
        required: ["command"],
      },
      annotations: {
        title: "exec_command",
        destructiveHint: true,
        openWorldHint: true,
        tier: "P0" as const,
      },
    },
    handler: execCommandHandler,
  },
  {
    definition: {
      name: "write_stdin",
      description: "Write data to a running command session's standard input.",
      inputSchema: {
        type: "object" as const,
        properties: {
          sessionId: { type: "string", description: "Session identifier" },
          data: { type: "string", description: "Data to write to stdin" },
        },
        required: ["sessionId", "data"],
      },
      annotations: {
        title: "write_stdin",
        destructiveHint: true,
        tier: "P1" as const,
      },
    },
    handler: writeStdinHandler,
  },
  {
    definition: {
      name: "kill_session",
      description: "Terminate a running command session.",
      inputSchema: {
        type: "object" as const,
        properties: {
          sessionId: { type: "string", description: "Session identifier" },
        },
        required: ["sessionId"],
      },
      annotations: {
        title: "kill_session",
        destructiveHint: true,
        tier: "P1" as const,
      },
    },
    handler: killSessionHandler,
  },
];
