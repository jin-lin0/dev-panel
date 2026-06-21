/**
 * dev-panel - Main Entry Point
 *
 * Web Dashboard with built-in MCP tools for local development.
 * Supports both Web UI + MCP dual mode and stdio-only mode.
 */

import { Runtime, RuntimeConfig } from "./runtime/runtime.js";
import { WebServer } from "./web/server.js";
import { registerAllTools } from "./tools/index.js";
import { handleStdio } from "./mcp/transport.js";

interface CLIOptions {
  workspace?: string;
  port?: number;
  host?: string;
  stdio?: boolean;
  oauthMode?: boolean;
  authToken?: string;
  permissionMode?: "safe" | "trusted" | "dangerous";
  allowNetwork?: boolean;
  profile?: "full" | "read-only" | "compat-readonly-all";
}

function parseArgs(): CLIOptions {
  const args = process.argv.slice(2);
  const options: CLIOptions = {};

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case "--workspace":
      case "-w":
        options.workspace = args[++i];
        break;
      case "--port":
      case "-p":
        options.port = parseInt(args[++i], 10);
        break;
      case "--host":
        options.host = args[++i];
        break;
      case "--stdio":
        options.stdio = true;
        break;
      case "--oauth-mode":
        options.oauthMode = true;
        break;
      case "--auth-token":
        options.authToken = args[++i];
        break;
      case "--permission-mode":
        options.permissionMode = args[++i] as any;
        break;
      case "--allow-network":
        options.allowNetwork = true;
        break;
      case "--profile":
        options.profile = args[++i] as any;
        break;
      case "--help":
      case "-h":
        console.log(`
dev-panel - Web Dashboard with built-in MCP tools

Usage:
  node dist/index.js [options]

  Or for development:
  npm run dev [-- [options]]
  npm start [-- [options]]

Options:
  --workspace, -w <path>    Workspace root directory (default: cwd)
  --port, -p <number>       Web server port (default: 5173)
  --host <address>          Bind address (default: 127.0.0.1)
  --stdio                   Run in stdio MCP mode (for AI client integration)
  --permission-mode <mode>  Permission mode: safe, trusted, dangerous (default: safe)
  --allow-network           Allow network commands in safe mode
  --profile <profile>       Tool profile: full, read-only, compat-readonly-all
  --help, -h                Show this help

  Without --stdio: starts Web Dashboard + MCP dual-mode server.
  With --stdio: runs as stdio MCP server for direct AI client integration.
`);
        process.exit(0);
    }
  }

  return options;
}

async function main() {
  const opts = parseArgs();

  const config: RuntimeConfig = {
    workspace: {
      root: opts.workspace || process.cwd(),
    },
    permissionMode: opts.permissionMode,
    allowNetwork: opts.allowNetwork,
    toolProfile: opts.profile,
    authMode: opts.oauthMode ? "oauth" : opts.authToken ? "bearer" : "noauth",
    authToken: opts.authToken,
  };

  try {
    const runtime = new Runtime(config);
    registerAllTools(runtime);

    if (opts.stdio) {
      console.error("dev-panel: stdio mode");
      console.error(`Workspace: ${runtime.workspace.root}`);
      handleStdio(runtime);
    } else {
      const host = opts.host || "127.0.0.1";
      const port = opts.port || 5173;

      console.error("dev-panel: running on port " + port);
      console.error(`Workspace: ${runtime.workspace.root}`);

      const server = new WebServer(runtime, port, host);
      server.start();

      console.error("Press Ctrl+C to stop");
    }
  } catch (e: unknown) {
    const err = e as Error;
    console.error("Failed to start:", err.message);
    process.exit(1);
  }
}

main().catch(console.error);
