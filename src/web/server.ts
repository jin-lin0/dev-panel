/**
 * Web Server - Express server that serves both the Web Dashboard UI and MCP API
 */
import express from "express";
import cors from "cors";
import path from "path";
import { readdirSync, readFileSync, existsSync, statSync } from "fs";
import { resolve } from "path";
import { fileURLToPath } from "url";
import { spawn, execSync } from "child_process";
import { createHash, randomBytes } from "crypto";

// ===== Active tunnel tracking =====
const activeTunnels = new Map<
  string,
  {
    process: any;
    localPort: number;
    tunnelUrl: string;
    provider: string;
    started: Date;
    serverPid?: number;
  }
>();

// ===== Spawned MCP server processes (for cleanup on exit) =====
const spawnedServers: number[] = [];

import { createMCPRouter } from "../mcp/transport.js";
import { Runtime } from "../runtime/runtime.js";
import { OAuthServer } from "../auth/oauth.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FRONTEND_DIST = path.resolve(__dirname, "../../frontend/dist");

/** Known image MIME types */
const IMAGE_EXT_MAP: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".svg": "image/svg+xml",
  ".bmp": "image/bmp",
};

function getMimeType(ext: string): string {
  return IMAGE_EXT_MAP[ext] || "application/octet-stream";
}

export class WebServer {
  private app: express.Application;
  private runtime: Runtime;
  private port: number;
  private host: string;
  private oauth: OAuthServer | null = null;

  constructor(runtime: Runtime, port = 5173, host = "127.0.0.1") {
    this.runtime = runtime;
    this.port = port;
    this.host = host;
    this.app = express();
    // Trust proxy headers (needed for correct protocol/host behind cloudflared)
    this.app.set("trust proxy", true);

    // Initialize OAuth if configured
    if (runtime.config.authMode === "oauth") {
      this.oauth = new OAuthServer();
    }

    this.setupMiddleware();
    this.setupRoutes();
    this.setupStaticFiles();
  }

  private setupMiddleware(): void {
    this.app.use(cors());
    this.app.use(express.json({ limit: "50mb" }));
    this.app.use(express.urlencoded({ extended: true }));
  }

  private setupRoutes(): void {
    // MCP protocol endpoint (GET for discovery, POST for JSON-RPC)
    if (this.oauth) {
      // OAuth mode: GET /mcp with token → MCP info, without → OAuth discovery
      this.app.get("/mcp", (req, res) => {
        const auth = req.headers.authorization;
        if (
          auth?.startsWith("Bearer ") &&
          this.oauth!.isTokenValid(auth.slice(7))
        ) {
          // Valid token → return MCP server capability info
          res.json({
            jsonrpc: "2.0",
            id: null,
            result: {
              server: this.runtime.getServerInfo(),
              protocol: "2025-06-18",
            },
          });
        } else {
          // No valid token → return OAuth discovery
          const iss = this.oauth!.issuer;
          res.json({
            isProtected: true,
            mcp: `${iss}/mcp`,
            wellKnown: `${iss}/.well-known/oauth-authorization-server`,
          });
        }
      });
      this.app.post("/mcp", this.oauth.validateToken(), (req, res, next) => {
        next();
      });
    }
    this.app.use(createMCPRouter(this.runtime));

    // OAuth well-known + auth endpoints
    if (this.oauth) {
      this.app.get("/.well-known/oauth-authorization-server", (req, res) => {
        res.json(this.oauth!.getAuthorizationMetadata(req));
      });
      // Also serve at openid-configuration (ChatGPT checks both)
      this.app.get("/.well-known/openid-configuration", (req, res) => {
        const meta = this.oauth!.getAuthorizationMetadata(req);
        res.json(meta);
      });
      this.app.get("/.well-known/oauth-protected-resource", (req, res) => {
        res.json(this.oauth!.getProtectedResourceMetadata(req));
      });
      this.app.get("/authorize", (req, res) => {
        // Show a simple password prompt page for interactive auth
        const password = req.query.password as string;
        if (password) {
          if (this.oauth!.verifyPassword(password)) {
            this.oauth!.handleAuthorize(req, res);
          } else {
            res
              .status(401)
              .json({
                error: "invalid_password",
                error_description: "Password is incorrect",
              });
          }
        } else {
          // Return a simple HTML page asking for password
          // Preserve all query params as hidden inputs
          const hiddenFields = Object.entries(
            req.query as Record<string, string>,
          )
            .filter(([k]) => k !== "password")
            .map(
              ([k, v]) =>
                `<input type="hidden" name="${k}" value="${v.replace(/"/g, "&quot;")}">`,
            )
            .join("\n");
          res.send(`<!DOCTYPE html><html><head><title>dev-panel - OAuth</title><meta charset="utf-8"><style>
body{font-family:-apple-system,sans-serif;display:flex;justify-content:center;align-items:center;min-height:100vh;background:#f5f5f5}
.card{background:#fff;padding:40px;border-radius:12px;box-shadow:0 2px 8px rgba(0,0,0,0.1);max-width:400px;text-align:center}
h2{color:#333;margin-bottom:8px}input{padding:10px;border:1px solid #ddd;border-radius:8px;width:100%;font-size:14px;margin:12px 0}
button{padding:10px 24px;background:#1565c0;color:#fff;border:none;border-radius:8px;font-size:14px;cursor:pointer}
.error{color:#c62828;font-size:12px;margin-top:4px}</style></head><body>
<div class="card"><h2>dev-panel OAuth</h2><p style="color:#666;font-size:13px">Enter the OAuth password to authorize</p>
<form method="get" action="/authorize">
${hiddenFields}
<input type="password" name="password" placeholder="Password" autofocus>
<button type="submit">Authorize</button>
</form></div></body></html>`);
        }
      });
      this.app.post("/token", (req, res) => {
        console.error("[oauth] POST /token body:", JSON.stringify(req.body));
        this.oauth!.handleToken(req, res);
      });
    }

    // REST API for the frontend
    const apiRouter = express.Router();

    // List tools
    apiRouter.get("/tools", (_req, res) => {
      const tools = this.runtime.listTools();
      res.json({ tools });
    });

    // Call a tool
    apiRouter.post("/tools/:name", async (req, res) => {
      const { name } = req.params;
      const args = req.body.arguments ?? {};
      const result = await this.runtime.callTool(name, args);
      res.json(result);
    });

    // Server info
    apiRouter.get("/info", (_req, res) => {
      res.json({
        server: this.runtime.getServerInfo(),
        workspace: this.runtime.workspace.root,
        permissionMode: this.runtime.config.permissionMode ?? "safe",
        profile: this.runtime.profile,
        tools: this.runtime.listTools().length,
      });
    });

    // Switch workspace at runtime
    apiRouter.post("/workspace", (req, res) => {
      const { path: newPath } = req.body;
      if (!newPath) {
        return res.status(400).json({ ok: false, error: "path is required" });
      }
      try {
        this.runtime.setWorkspace(newPath);
        res.json({ ok: true, workspace: this.runtime.workspace.root });
      } catch (e: unknown) {
        const err = e as Error;
        res.status(400).json({ ok: false, error: err.message });
      }
    });

    // File browser
    apiRouter.get("/files", (req, res) => {
      const dir = (req.query.path as string) || ".";
      const showHidden = req.query.showHidden === "true";
      try {
        const absPath = this.runtime.workspace.sanitize(dir);
        const entries = readdirSync(absPath, { withFileTypes: true });
        const items = entries
          .filter((e: any) => showHidden || !e.name.startsWith("."))
          .map((e: any) => {
            const full = resolve(absPath, e.name);
            try {
              const s = statSync(full);
              return {
                name: e.name,
                type: e.isDirectory() ? "directory" : "file",
                size: s.size,
                modified: s.mtime.toISOString(),
              };
            } catch {
              return { name: e.name, type: "file", size: 0, modified: "" };
            }
          })
          .sort((a: any, b: any) => {
            if (a.type === "directory" && b.type !== "directory") return -1;
            if (a.type !== "directory" && b.type === "directory") return 1;
            return a.name.localeCompare(b.name);
          });
        res.json({ ok: true, path: dir, items });
      } catch (e: unknown) {
        const err = e as Error;
        res.status(400).json({ ok: false, error: err.message });
      }
    });

    // Read file
    apiRouter.get("/files/read", (req, res) => {
      const filePath = req.query.path as string;
      if (!filePath) {
        return res.status(400).json({ ok: false, error: "path is required" });
      }
      try {
        const absPath = this.runtime.workspace.sanitize(filePath);
        if (!existsSync(absPath)) {
          return res.status(404).json({ ok: false, error: "File not found" });
        }
        const ext = path.extname(absPath).toLowerCase();
        if (ext in IMAGE_EXT_MAP) {
          const data = readFileSync(absPath);
          const base64 = data.toString("base64");
          res.json({
            ok: true,
            content: base64,
            mime: IMAGE_EXT_MAP[ext],
            binary: true,
          });
        } else {
          const content = readFileSync(absPath, "utf-8");
          res.json({ ok: true, content, binary: false });
        }
      } catch (e: unknown) {
        const err = e as Error;
        res.status(400).json({ ok: false, error: err.message });
      }
    });

    // ===== Setup Wizard Routes =====

    // Check if cloudflared is installed
    apiRouter.get("/setup/check-cloudflared", (_req, res) => {
      try {
        execSync("cloudflared --version", { stdio: "ignore", timeout: 5000 });
        res.json({ installed: true });
      } catch {
        res.json({ installed: false });
      }
    });

    // Install cloudflared
    apiRouter.post("/setup/install-cloudflared", async (_req, res) => {
      try {
        // Check if already installed
        try {
          execSync("cloudflared --version", { stdio: "ignore" });
          return res.json({ ok: true, message: "Already installed" });
        } catch {
          /* not installed */
        }

        // Detect platform
        const os = process.platform;
        const arch = process.arch;
        let suffix = "";
        if (os === "darwin" && arch === "x64") suffix = "darwin-amd64";
        else if (os === "darwin" && arch === "arm64") suffix = "darwin-arm64";
        else if (os === "linux" && arch === "x64") suffix = "linux-amd64";
        else if (os === "linux" && arch === "arm64") suffix = "linux-arm64";
        else {
          return res.json({
            ok: false,
            error: `Unsupported platform: ${os} ${arch}`,
          });
        }

        // Try Homebrew first on macOS
        if (os === "darwin") {
          try {
            execSync("which brew", { stdio: "ignore" });
            execSync("brew install cloudflared", {
              stdio: "inherit",
              timeout: 60000,
            });
            return res.json({ ok: true, message: "Installed via Homebrew" });
          } catch {
            /* fall through to binary download */
          }
        }

        // Download binary
        const homeDir = process.env.HOME || "/tmp";
        const binDir = `${homeDir}/.local/bin`;
        const outputPath = `${binDir}/cloudflared`;

        execSync(`mkdir -p ${binDir}`, { stdio: "ignore" });
        execSync(
          `curl -fsSL "https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-${suffix}" -o "${outputPath}"`,
          { stdio: "inherit", timeout: 60000 },
        );
        execSync(`chmod +x "${outputPath}"`, { stdio: "ignore" });

        // Verify
        try {
          execSync(`"${outputPath}" --version`, { stdio: "ignore" });
        } catch {
          return res.json({
            ok: false,
            error: "Downloaded but verification failed",
          });
        }

        res.json({ ok: true, message: "Cloudflared installed successfully" });
      } catch (e: unknown) {
        const err = e as Error;
        res.json({ ok: false, error: err.message || "Install failed" });
      }
    });

    // Start MCP server + tunnel with given config
    apiRouter.post("/setup/start", async (req, res) => {
      try {
        const {
          workspace = ".",
          port = 8765,
          profile = "full",
          authMode = "oauth",
          bearerToken = "",
          oauthPassword = "",
          clientId,
          clientSecret,
          tunnelProvider = "cloudflared",
          autoInstall = true,
        } = req.body;

        // Resolve workspace
        const wsPath = resolve(this.runtime.workspace.root, workspace);
        if (!existsSync(wsPath)) {
          return res.json({
            ok: false,
            error: `Workspace does not exist: ${wsPath}`,
          });
        }

        // Generate tokens if needed
        const finalBearerToken =
          bearerToken ||
          (authMode === "bearer"
            ? execSync(
                "node -e \"console.log(require('crypto').randomBytes(32).toString('base64url').slice(0,43))\"",
              )
                .toString()
                .trim()
            : "");
        const finalOauthPassword =
          oauthPassword ||
          (authMode === "oauth"
            ? execSync(
                "node -e \"console.log(require('crypto').randomBytes(32).toString('base64url').slice(0,43))\"",
              )
                .toString()
                .trim()
            : "");

        // Build MCP server args
        const serverArgs = [
          "--workspace",
          wsPath,
          "--host",
          "127.0.0.1",
          "--port",
          String(port),
          "--tool-profile",
          profile,
          "--permission-mode",
          "trusted",
        ];

        if (authMode === "bearer") {
          serverArgs.push("--auth-token", finalBearerToken);
        } else if (authMode === "oauth") {
          serverArgs.push("--oauth-mode");
          // Set OAuth env vars
          process.env.CODING_TOOLS_MCP_OAUTH_PASSWORD = finalOauthPassword;
          if (clientId) process.env.CODING_TOOLS_MCP_OAUTH_CLIENT_ID = clientId;
          if (clientSecret)
            process.env.CODING_TOOLS_MCP_OAUTH_CLIENT_SECRET = clientSecret;
        }

        // Start MCP server in background
        const serverProcess = spawn("node", ["dist/index.js", ...serverArgs], {
          cwd: path.resolve(__dirname, "../.."),
          stdio: ["ignore", "pipe", "pipe"],
          detached: true,
          env: { ...process.env, PATH: process.env.PATH || "" },
        });

        serverProcess.stdout?.on("data", (d) =>
          process.stdout.write(`[mcp:${port}] ${d}`),
        );
        serverProcess.stderr?.on("data", (d) =>
          process.stderr.write(`[mcp:${port}] ${d}`),
        );
        serverProcess.unref();
        // Track the spawned server PID for cleanup
        if (serverProcess.pid) spawnedServers.push(serverProcess.pid);

        // Wait a bit for server to start
        await new Promise((r) => setTimeout(r, 2000));

        // Start tunnel if requested
        let tunnelUrl = "";
        if (tunnelProvider === "cloudflared") {
          // Ensure cloudflared is available
          let cfPath = "cloudflared";
          try {
            execSync(`${cfPath} --version`, { stdio: "ignore", timeout: 3000 });
          } catch {
            if (autoInstall) {
              // Try to install
              const installRes = await fetch(
                `http://localhost:${this.port}/api/setup/install-cloudflared`,
                { method: "POST" },
              );
              const installData = await installRes.json();
              if (!installData.ok) {
                return res.json({
                  ok: false,
                  error: `Could not install cloudflared: ${installData.error}. Please install it manually.`,
                });
              }
              cfPath = `${process.env.HOME}/.local/bin/cloudflared`;
            } else {
              return res.json({
                ok: false,
                error:
                  "cloudflared is not installed. Install it or disable the tunnel.",
              });
            }
          }

          // Start cloudflared tunnel in background and capture URL
          const tunnelProcess = spawn(
            cfPath,
            ["tunnel", "--url", `http://127.0.0.1:${port}`],
            {
              stdio: ["ignore", "pipe", "pipe"],
              detached: true,
            },
          );

          // Try to extract tunnel URL from output
          tunnelProcess.stdout?.on("data", (data: Buffer) => {
            const output = data.toString();
            const match = output.match(
              /https:\/\/[a-zA-Z0-9.-]+\.trycloudflare\.com/,
            );
            if (match) {
              tunnelUrl = match[0];
            }
          });

          tunnelProcess.stderr?.on("data", (data: Buffer) => {
            const output = data.toString();
            const match = output.match(
              /https:\/\/[a-zA-Z0-9.-]+\.trycloudflare\.com/,
            );
            if (match) {
              tunnelUrl = match[0];
            }
          });

          // Wait for tunnel URL (up to 10 seconds)
          for (let i = 0; i < 20; i++) {
            if (tunnelUrl) break;
            await new Promise((r) => setTimeout(r, 500));
          }

          // Detach the tunnel process
          tunnelProcess.unref();

          // Track the tunnel
          const tunnelId = createHash("sha256")
            .update(randomBytes(16))
            .digest("hex")
            .slice(0, 12);
          activeTunnels.set(tunnelId, {
            process: tunnelProcess,
            localPort: port,
            tunnelUrl,
            provider: tunnelProvider,
            started: new Date(),
            serverPid: serverProcess.pid,
          });
        }

        const baseUrl = tunnelUrl || `http://127.0.0.1:${port}`;

        const config = {
          serverUrl: baseUrl,
          tunnelUrl,
          mcpEndpoint: `${baseUrl}/mcp`,
          oauthIssuer: authMode === "oauth" ? baseUrl : undefined,
          oauthPassword: authMode === "oauth" ? finalOauthPassword : undefined,
          bearerToken: authMode === "bearer" ? finalBearerToken : undefined,
        };

        res.json({ ok: true, config });
      } catch (e: unknown) {
        const err = e as Error;
        res.json({ ok: false, error: err.message || "Setup failed" });
      }
    });

    // ===== Tunnel Management Routes =====

    // List active tunnels
    apiRouter.get("/tunnels", (_req, res) => {
      const list = Array.from(activeTunnels.entries()).map(([id, t]) => ({
        id,
        localPort: t.localPort,
        tunnelUrl: t.tunnelUrl,
        provider: t.provider,
        started: t.started.toISOString(),
        running: true,
      }));
      res.json({ tunnels: list });
    });

    // Stop a specific tunnel (also kills the associated MCP server)
    apiRouter.post("/tunnels/:id/stop", (req, res) => {
      const { id } = req.params;
      const tunnel = activeTunnels.get(id);
      if (!tunnel) {
        return res.json({ ok: false, error: `Tunnel not found: ${id}` });
      }
      try {
        // Kill cloudflared tunnel process
        tunnel.process.kill("SIGTERM");
        try {
          process.kill(-tunnel.process.pid, "SIGTERM");
        } catch {
          /* ignore */
        }
        setTimeout(() => {
          try {
            tunnel.process.kill("SIGKILL");
          } catch {
            /* ignore */
          }
        }, 3000);

        // Also kill the associated MCP server on the tunnelled port
        const pid = tunnel.serverPid;
        if (pid) {
          try {
            process.kill(pid, "SIGTERM");
          } catch {
            /* ignore */
          }
          setTimeout(() => {
            try {
              process.kill(pid, "SIGKILL");
            } catch {
              /* ignore */
            }
          }, 3000);
          const idx = spawnedServers.indexOf(pid);
          if (idx >= 0) spawnedServers.splice(idx, 1);
        }

        activeTunnels.delete(id);
        res.json({ ok: true, message: `Tunnel ${id} and server stopped` });
      } catch (e: unknown) {
        const err = e as Error;
        res.json({ ok: false, error: err.message });
      }
    });

    // Stop all tunnels (also kills associated MCP servers)
    apiRouter.post("/tunnels/stop-all", (_req, res) => {
      let count = 0;
      for (const [, tunnel] of activeTunnels) {
        try {
          tunnel.process.kill("SIGTERM");
          try {
            process.kill(-tunnel.process.pid, "SIGTERM");
          } catch {
            /* ignore */
          }
          if (tunnel.serverPid) {
            try {
              process.kill(tunnel.serverPid, "SIGTERM");
            } catch {
              /* ignore */
            }
          }
          count++;
        } catch {
          /* ignore */
        }
      }
      activeTunnels.clear();
      // Also clean up any orphaned spawned servers
      for (const pid of spawnedServers) {
        try {
          process.kill(pid, "SIGTERM");
        } catch {
          /* ignore */
        }
      }
      spawnedServers.length = 0;
      res.json({ ok: true, message: `${count} tunnel(s) and servers stopped` });
    });

    this.app.use("/api", apiRouter);

    // API 404 catch-all — return JSON, never HTML
    this.app.use("/api", (_req, res) => {
      res.status(404).json({ ok: false, error: "API endpoint not found" });
    });

    // Global error handler — always return JSON for API routes
    this.app.use((err: any, req: any, res: any, next: any) => {
      if (req.path.startsWith("/api")) {
        res
          .status(500)
          .json({ ok: false, error: err.message || "Internal server error" });
      } else {
        next(err);
      }
    });
  }

  private setupStaticFiles(): void {
    // Serve frontend static files
    this.app.use(express.static(FRONTEND_DIST, { index: "index.html" }));

    // Fallback to index.html for SPA routing
    this.app.get("*", (_req, res) => {
      res.sendFile(path.join(FRONTEND_DIST, "index.html"), (err) => {
        if (err) {
          res.status(200).json({
            message: "Web Dashboard server running. Frontend not built yet.",
            api: "/api",
            mcp: "/mcp",
          });
        }
      });
    });
  }

  start(): void {
    this.app.listen(this.port, this.host, () => {
      console.log(`Web Dashboard: http://${this.host}:${this.port}`);
      console.log(`MCP endpoint:  http://${this.host}:${this.port}/mcp`);
      console.log(`API endpoint:  http://${this.host}:${this.port}/api`);
    });

    // Cleanup: kill tunnels + spawned MCP servers on exit
    const cleanup = () => {
      for (const [, tunnel] of activeTunnels) {
        try {
          tunnel.process.kill("SIGTERM");
        } catch {
          /* ignore */
        }
        if (tunnel.serverPid) {
          try {
            process.kill(tunnel.serverPid, "SIGTERM");
          } catch {
            /* ignore */
          }
        }
      }
      for (const pid of spawnedServers) {
        try {
          process.kill(pid, "SIGTERM");
        } catch {
          /* ignore */
        }
      }
      activeTunnels.clear();
      spawnedServers.length = 0;
    };
    process.on("SIGINT", () => {
      cleanup();
      process.exit(0);
    });
    process.on("SIGTERM", () => {
      cleanup();
      process.exit(0);
    });
  }
}
