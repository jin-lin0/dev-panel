/**
 * OAuth 2.1 Authorization Server
 *
 * Implements a minimal OAuth 2.1 Authorization Code flow for MCP.
 * - Password-based client authentication
 * - Any non-empty client_id accepted
 * - Simple PKCE support
 *
 * Endpoints:
 *   GET  /.well-known/oauth-authorization-server  — metadata
 *   GET  /.well-known/oauth-protected-resource    — resource metadata
 *   GET  /authorize                                — authorization endpoint
 *   POST /token                                    — token endpoint
 *   GET  /mcp (when auth'd)                        — protected resource
 */
import express from "express";
import { createHash, randomBytes, timingSafeEqual } from "crypto";

export interface OAuthConfig {
  password: string;
  clientId?: string;
  clientSecret?: string;
  issuerBaseUrl: string; // derived from request URL or env
}

interface AuthCode {
  clientId: string;
  redirectUri?: string;
  codeChallenge?: string;
  expiresAt: number;
}

interface AccessToken {
  clientId: string;
  scope: string;
  expiresAt: number;
}

export class OAuthServer {
  private config: OAuthConfig;
  private authCodes = new Map<string, AuthCode>();
  private accessTokens = new Map<string, AccessToken>();
  private derivedIssuer: string;

  constructor(config: Partial<OAuthConfig> = {}) {
    this.config = {
      password: process.env.CODING_TOOLS_MCP_OAUTH_PASSWORD || "",
      clientId: process.env.CODING_TOOLS_MCP_OAUTH_CLIENT_ID || undefined,
      clientSecret:
        process.env.CODING_TOOLS_MCP_OAUTH_CLIENT_SECRET || undefined,
      issuerBaseUrl: process.env.CODING_TOOLS_MCP_SERVER_URL || "",
      ...config,
    };
    this.derivedIssuer = this.config.issuerBaseUrl;

    // Periodically clean expired tokens
    setInterval(() => this.cleanExpired(), 60_000);
  }

  get issuer(): string {
    return this.derivedIssuer || "http://127.0.0.1:8765";
  }

  /** Call this once the server knows its URL (e.g., from a tunnel request) */
  setIssuer(url: string): void {
    this.derivedIssuer = url.replace(/\/+$/, "");
    if (!this.config.issuerBaseUrl) {
      this.config.issuerBaseUrl = this.derivedIssuer;
    }
  }

  /** Derive issuer from a request (use the host from the request) */
  deriveIssuer(req: express.Request): string {
    const host = req.headers["host"] || "127.0.0.1:8765";
    const proto = req.headers["x-forwarded-proto"] || req.protocol || "http";
    const url = `${proto}://${host}`;
    this.setIssuer(url);
    return this.issuer;
  }

  // ----- Well-known endpoints -----

  getAuthorizationMetadata(req: express.Request) {
    const iss = this.config.issuerBaseUrl || this.deriveIssuer(req);
    return {
      issuer: iss,
      authorization_endpoint: `${iss}/authorize`,
      token_endpoint: `${iss}/token`,
      registration_endpoint: `${iss}/register`,
      scopes_supported: ["mcp", "openid", "offline_access"],
      response_types_supported: ["code"],
      response_modes_supported: ["query"],
      grant_types_supported: ["authorization_code", "refresh_token"],
      token_endpoint_auth_methods_supported: ["none"],
      code_challenge_methods_supported: ["S256"],
    };
  }

  getProtectedResourceMetadata(req: express.Request) {
    const iss = this.config.issuerBaseUrl || this.deriveIssuer(req);
    return {
      resource: `${iss}/mcp`,
      authorization_servers: [iss],
      bearer_methods_supported: ["header"],
    };
  }

  // ----- Authorization endpoint -----

  handleAuthorize(req: express.Request, res: express.Response): void {
    const {
      client_id,
      redirect_uri,
      code_challenge,
      code_challenge_method,
      state,
    } = req.query;

    if (!client_id || typeof client_id !== "string" || !client_id.trim()) {
      res
        .status(400)
        .json({
          error: "invalid_request",
          error_description: "client_id is required",
        });
      return;
    }

    // Validate code_challenge if provided
    if (code_challenge && code_challenge_method !== "S256") {
      res
        .status(400)
        .json({
          error: "invalid_request",
          error_description: "only S256 code_challenge_method is supported",
        });
      return;
    }

    // Generate authorization code
    const code = randomBytes(32).toString("hex");
    console.error(
      "[oauth] authorize: issuing code",
      code.slice(0, 12) + "...",
      "for client",
      client_id,
      "challenge",
      (code_challenge as string)?.slice(0, 20) + "...",
    );
    this.authCodes.set(code, {
      clientId: client_id as string,
      redirectUri: redirect_uri as string | undefined,
      codeChallenge: code_challenge as string | undefined,
      expiresAt: Date.now() + 5 * 60 * 1000, // 5 minutes
    });

    // Redirect back with code
    if (redirect_uri) {
      const url = new URL(redirect_uri as string);
      url.searchParams.set("code", code);
      if (state) url.searchParams.set("state", state as string);
      res.redirect(url.toString());
    } else {
      // No redirect URI — return code directly (for programmatic clients)
      res.json({ code, ...(state && { state }) });
    }
  }

  // ----- Token endpoint -----

  handleToken(req: express.Request, res: express.Response): void {
    const {
      grant_type,
      code,
      client_id,
      client_secret,
      code_verifier,
      redirect_uri,
      refresh_token,
    } = req.body;

    try {
      if (grant_type === "authorization_code") {
        this.handleAuthCodeGrant(res, {
          code,
          client_id,
          client_secret,
          code_verifier,
          redirect_uri,
        });
      } else if (grant_type === "refresh_token") {
        this.handleRefreshGrant(res, { refresh_token, client_id });
      } else {
        res.status(400).json({ error: "unsupported_grant_type" });
      }
    } catch (e: any) {
      res
        .status(400)
        .json({ error: "invalid_grant", error_description: e.message });
    }
  }

  private handleAuthCodeGrant(
    res: express.Response,
    params: {
      code?: string;
      client_id?: string;
      client_secret?: string;
      code_verifier?: string;
      redirect_uri?: string;
    },
  ): void {
    console.error(
      "[oauth] handleAuthCodeGrant:",
      JSON.stringify({
        code: params.code?.slice(0, 12) + "...",
        client_id: params.client_id,
        has_verifier: !!params.code_verifier,
        has_redirect: !!params.redirect_uri,
      }),
    );

    if (!params.code || !params.client_id) {
      throw new Error("code and client_id are required");
    }

    const authCode = this.authCodes.get(params.code);
    if (!authCode || authCode.expiresAt < Date.now()) {
      console.error(
        "[oauth] auth code NOT found. Available codes:",
        Array.from(this.authCodes.keys()).map((c) => c.slice(0, 12) + "..."),
      );
      throw new Error("invalid or expired authorization code");
    }

    console.error("[oauth] auth code found:", {
      clientId: authCode.clientId,
      hasChallenge: !!authCode.codeChallenge,
      challenge: authCode.codeChallenge?.slice(0, 20) + "...",
    });

    // Validate redirect_uri matches what was used in authorize (OAuth spec requirement)
    if (
      authCode.redirectUri &&
      params.redirect_uri &&
      authCode.redirectUri !== params.redirect_uri
    ) {
      console.error("[oauth] redirect_uri mismatch:", {
        stored: authCode.redirectUri,
        received: params.redirect_uri,
      });
      throw new Error("redirect_uri mismatch");
    }

    // Validate code_verifier if code_challenge was provided
    if (authCode.codeChallenge && params.code_verifier) {
      const expectedChallenge = createHash("sha256")
        .update(params.code_verifier)
        .digest("base64url");
      console.error("[oauth] PKCE:", {
        expected: expectedChallenge.slice(0, 20) + "...",
        stored: authCode.codeChallenge.slice(0, 20) + "...",
        match: expectedChallenge === authCode.codeChallenge,
      });
      if (expectedChallenge !== authCode.codeChallenge) {
        throw new Error("invalid code_verifier");
      }
    }

    console.error("[oauth] SUCCESS: issuing token for", params.client_id);

    // Clean up used auth code
    this.authCodes.delete(params.code);

    // Issue access token
    const token = this.issueToken(params.client_id);
    const refreshToken = randomBytes(48).toString("base64url");
    // Store refresh token for later use
    this.accessTokens.set(refreshToken, {
      clientId: params.client_id,
      scope: "mcp",
      expiresAt: Date.now() + 30 * 24 * 3600 * 1000, // 30 days
    });
    res.json({
      access_token: token,
      token_type: "Bearer",
      expires_in: 3600,
      refresh_token: refreshToken,
      scope: "mcp",
    });
  }

  private handleRefreshGrant(
    res: express.Response,
    params: {
      refresh_token?: string;
      client_id?: string;
    },
  ): void {
    if (!params.refresh_token) {
      throw new Error("refresh_token is required");
    }

    const existing = this.accessTokens.get(params.refresh_token);
    if (!existing || existing.expiresAt < Date.now()) {
      throw new Error("invalid or expired refresh token");
    }

    // Revoke old token
    this.accessTokens.delete(params.refresh_token);

    // Issue new token
    const token = this.issueToken(existing.clientId);
    res.json({
      access_token: token,
      token_type: "Bearer",
      expires_in: 3600,
      scope: "mcp",
    });
  }

  private issueToken(clientId: string): string {
    const token = randomBytes(48).toString("base64url");
    this.accessTokens.set(token, {
      clientId,
      scope: "mcp",
      expiresAt: Date.now() + 3600 * 1000, // 1 hour
    });
    return token;
  }

  // ----- Token validation (middleware) -----

  /** Check if a Bearer token is valid */
  isTokenValid(token: string): boolean {
    const stored = this.accessTokens.get(token);
    return !!(stored && stored.expiresAt > Date.now());
  }

  /** Express middleware: validate Bearer token from Authorization header */
  validateToken() {
    return (
      req: express.Request,
      res: express.Response,
      next: express.NextFunction,
    ): void => {
      const authHeader = req.headers.authorization;
      if (!authHeader || !authHeader.startsWith("Bearer ")) {
        res
          .status(401)
          .json({
            error: "Unauthorized",
            error_description: "Missing or invalid Authorization header",
          });
        return;
      }

      const token = authHeader.slice(7);
      const stored = this.accessTokens.get(token);
      if (!stored || stored.expiresAt < Date.now()) {
        res
          .status(401)
          .json({
            error: "Unauthorized",
            error_description: "Invalid or expired token",
          });
        return;
      }

      next();
    };
  }

  /** Password verification for initial auth */
  verifyPassword(password: string): boolean {
    if (!this.config.password) return true; // no password set = accept all
    try {
      const bufA = Buffer.from(password);
      const bufB = Buffer.from(this.config.password);
      return bufA.length === bufB.length && timingSafeEqual(bufA, bufB);
    } catch {
      return false;
    }
  }

  /** Check if a password is configured */
  get isPasswordSet(): boolean {
    return !!this.config.password;
  }

  // ----- Cleanup -----

  private cleanExpired(): void {
    const now = Date.now();
    for (const [code, data] of this.authCodes) {
      if (data.expiresAt < now) this.authCodes.delete(code);
    }
    for (const [token, data] of this.accessTokens) {
      if (data.expiresAt < now) this.accessTokens.delete(token);
    }
  }
}
