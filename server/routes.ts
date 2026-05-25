import type { Express, Request, Response, NextFunction } from "express";
import type { Server } from "http";
import { storage } from "./storage";
import { api, cbomApi, scriptsApi, settingsApi, policiesApi, reportsApi, outputDirectoriesApi, githubReposApi, errorSchemas } from "@shared/routes";
import { z } from "zod";
import tls from "tls";
import dns from "dns/promises";
import { exec, spawn } from "child_process";
import { promisify } from "util";
import { 
  cbomUploadSchema, cbomDeduplicateSchema, type InsertCbomComponent,
  createScriptSchema, updateScriptSchema, createVariableSchema, createScheduleSchema,
  createUserSchema, updateUserSchema, updateRolePermissionSchema,
  createAuthConfigSchema, updateAuthConfigSchema,
  createSecurityPolicySchema, updateSecurityPolicySchema,
  createReportSchema, updateReportSchema,
  createOutputDirectorySchema, updateOutputDirectorySchema,
  createGithubRepoSchema, updateGithubRepoSchema,
  generateKeySchema, insertAzureKvSchema,
  createQmiAssetSchema, updateQmiAssetSchema,
  loginSchema,
  type CbomComponent, type SecurityPolicy, type InsertQmiAsset
} from "@shared/schema";
import { parseSbom, parseSyslog, calculateQmiScore } from "./qmi-parser";
import crypto from "crypto";
import fs from "fs/promises";
import path from "path";

const execPromise = promisify(exec);

async function resolveSubdomains(domain: string): Promise<string[]> {
  // Simple check for common subdomains since we can't do full DNS enumeration easily
  const commonSubdomains = ['www', 'mail', 'api', 'blog', 'app', 'dev', 'staging'];
  const found: string[] = [];
  
  // Always include root
  found.push(domain);

  await Promise.all(commonSubdomains.map(async (sub) => {
    const hostname = `${sub}.${domain}`;
    try {
      await dns.lookup(hostname);
      found.push(hostname);
    } catch (e) {
      // Ignore not found
    }
  }));

  return Array.from(found);
}

async function performScan(host: string, port: number) {
  return new Promise<any>((resolve) => {
    const socket = tls.connect({
      host,
      port,
      rejectUnauthorized: false,
      servername: host,
    }, () => {
      const cipher = socket.getCipher();
      const cert = socket.getPeerCertificate();
      const protocol = socket.getProtocol();
      const ephemeral = (socket as any).getEphemeralKeyInfo?.(); 
      
      socket.end();
      resolve({ 
        cipher, 
        cert: cert ? {
          subject: cert.subject,
          issuer: cert.issuer,
          valid_from: cert.valid_from,
          valid_to: cert.valid_to,
          fingerprint: cert.fingerprint,
          serialNumber: cert.serialNumber
        } : null, 
        protocol,
        ephemeral
      });
    });

    socket.on('error', (err) => {
      resolve({ error: err.message });
    });

    // Enforce 5s timeout as requested
    socket.setTimeout(5000, () => {
      socket.destroy();
      resolve({ error: "Connection timed out" });
    });
  });
}

/**
 * Enhanced scan to collect Key Encapsulation Mechanism (KEM) info
 * using OpenSSL s_client directly for detailed protocol information.
 */
async function getKEMInfo(host: string, port: number): Promise<{ kem: string, raw: string, error?: string, command: string }> {
  // We use the command provided by the user to capture detailed negotiation info
  const command = `openssl s_client -connect ${host}:${port} -servername ${host} -msg </dev/null 2>&1`;
  try {
    // Execute the command and capture full output
    const { stdout } = await execPromise(command);
    
    if (stdout) {
      // Heuristic for ML-KEM or Hybrid
      const isHybrid = stdout.toLowerCase().includes("ml-kem") || 
                       stdout.toLowerCase().includes("x25519_kyber") ||
                       stdout.toLowerCase().includes("p256_kyber");
      
      // Look for the "Server Temp Key" or "Key exchange" line which usually has the KEM info
      const match = stdout.match(/(?:Key exchange|Key|Group|Server Temp Key):\s+(.+)/i);
      let kem = match && match[1] ? match[1].trim() : "Unknown";
      
      if (isHybrid) {
        kem = `Hybrid PQC (${kem})`;
      }

      return { kem, raw: stdout, command };
    }
  } catch (e: any) {
    return { kem: "Unknown", raw: e.stdout || e.stderr || e.message, error: e.message, command };
  }
  return { kem: "Unknown", raw: "", command };
}

function calculateScore(details: any): { score: number, grade: string, pqcStatus: string, explanation: string[] } {
  let score = 0;
  const explanation: string[] = [];
  let grade = "F";
  let pqcStatus = "Not Ready";

  if (details.error) {
    return { score: 0, grade: "F", pqcStatus: "Error", explanation: [`Scan failed: ${details.error}`] };
  }

  // Protocol Scoring
  if (details.protocol === "TLSv1.3") {
    score += 50; // Increased from 40
    explanation.push("Uses TLS 1.3 (+50)");
  } else if (details.protocol === "TLSv1.2") {
    score += 20;
    explanation.push("Uses TLS 1.2 (+20)");
  } else {
    score -= 50;
    explanation.push(`Weak protocol: ${details.protocol} (-50)`);
  }

  // Certificate Scoring (Trusted CA check)
  if (details.cert) {
    // Basic check for common trusted root keywords in issuer
    const issuer = JSON.stringify(details.cert.issuer || "").toLowerCase();
    const isTrusted = issuer.includes("digicert") || 
                      issuer.includes("globalsign") || 
                      issuer.includes("sectigo") || 
                      issuer.includes("let's encrypt") ||
                      issuer.includes("google") ||
                      issuer.includes("amazon") ||
                      issuer.includes("cloudflare");
    
    if (isTrusted) {
      score += 20;
      explanation.push("Certificate issued by a recognized Trusted CA (+20)");
    } else {
      score += 5;
      explanation.push("Certificate found but issuer not in preferred list (+5)");
    }
  }

  // Cipher Scoring
  const cipherName = details.cipher?.name || "";
  const cipherVersion = details.cipher?.version || "";

  if (cipherName.includes("GCM") || cipherName.includes("CHACHA20")) {
    score += 20;
    explanation.push("Uses strong authenticated encryption (GCM/ChaCha20) (+20)");
  } else if (cipherName.includes("CBC")) {
    score -= 10;
    explanation.push("Uses CBC mode which can be vulnerable (-10)");
  }

  // Key Exchange / Forward Secrecy
  if (cipherName.includes("ECDHE") || cipherName.includes("DHE")) {
    score += 20;
    explanation.push("Uses Forward Secrecy (ECDHE/DHE) (+20)");
    
    // Hybrid/ML-KEM Bonus
    const keyExchange = (details.kem || "").toLowerCase();
    if (keyExchange.includes("hybrid") || keyExchange.includes("ml-kem") || keyExchange.includes("kyber")) {
      score += 60; // Increased from 40
      explanation.push("Uses Post-Quantum Hybrid/ML-KEM Key Exchange (+60)");
      pqcStatus = "Ready";
    } else if (details.ephemeral) {
      if (details.ephemeral.type === 'ECDH' && ['X25519', 'P-256', 'P-384'].includes(details.ephemeral.name)) {
        pqcStatus = "Partial"; // Modern curves are better but not Quantum Safe
        explanation.push(`Curve: ${details.ephemeral.name}`);
      }
    }
  } else {
    score -= 20;
    explanation.push("No Forward Secrecy (RSA Key Exchange) (-20)");
  }

  // Grade assignment
  if (score >= 80) grade = "A";
  else if (score >= 60) grade = "B";
  else if (score >= 40) grade = "C";
  else if (score >= 20) grade = "D";
  else grade = "F";

  if (score < 0) score = 0;
  if (score > 100) score = 100;

  return { score, grade, pqcStatus, explanation };
}

function hashPassword(password: string): string {
  return crypto.createHash("sha256").update(password).digest("hex");
}

function sanitizeUser(user: any) {
  const { password, ...safe } = user;
  return safe;
}

function requireAuth(req: Request, res: Response, next: NextFunction) {
  if (!(req.session as any)?.userId) {
    return res.status(401).json({ message: "Authentication required" });
  }
  next();
}

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {

  app.use("/api", (req, res, next) => {
    const publicPaths = ["/auth/login", "/auth/logout", "/auth/me", "/auth/admin-emails"];
    if (publicPaths.includes(req.path)) {
      return next();
    }
    requireAuth(req, res, next);
  });

  // ==================== Authentication ====================

  app.get("/api/auth/admin-emails", async (_req, res) => {
    const allUsers = await storage.getUsers();
    const adminEmails = allUsers
      .filter(u => u.userType === "admin" && u.isActive)
      .map(u => u.email.toLowerCase());
    res.json(adminEmails);
  });

  app.post("/api/auth/login", async (req, res) => {
    try {
      const { email, password } = loginSchema.parse(req.body);
      const user = await storage.getUserByEmail(email);
      if (!user) {
        return res.status(401).json({ message: "Invalid email or password" });
      }
      if (!user.isActive) {
        return res.status(401).json({ message: "Account is disabled" });
      }
      const isAdmin = user.userType === "admin";
      if (!isAdmin) {
        if (!password) {
          return res.status(401).json({ message: "Password is required" });
        }
        const hashed = hashPassword(password);
        if (user.password && user.password !== hashed) {
          return res.status(401).json({ message: "Invalid email or password" });
        }
        if (!user.password) {
          await storage.updateUser(user.id, { password: hashed } as any);
        }
      }
      req.session.userId = user.id;
      await storage.updateUser(user.id, { lastLogin: new Date() } as any);
      res.json(sanitizeUser(user));
    } catch (err: any) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: err.errors[0].message });
      }
      res.status(400).json({ message: err.message || "Login failed" });
    }
  });

  app.post("/api/auth/logout", (req, res) => {
    req.session.destroy((err) => {
      if (err) {
        return res.status(500).json({ message: "Failed to logout" });
      }
      res.json({ message: "Logged out" });
    });
  });

  app.get("/api/auth/me", async (req, res) => {
    if (!req.session.userId) {
      return res.status(401).json({ message: "Not authenticated" });
    }
    const user = await storage.getUser(req.session.userId);
    if (!user || !user.isActive) {
      req.session.destroy(() => {});
      return res.status(401).json({ message: "Not authenticated" });
    }
    res.json(sanitizeUser(user));
  });

  app.post("/api/auth/switch", async (req, res) => {
    try {
      const { email, password } = loginSchema.parse(req.body);
      const user = await storage.getUserByEmail(email);
      if (!user) {
        return res.status(401).json({ message: "Invalid email or password" });
      }
      if (!user.isActive) {
        return res.status(401).json({ message: "Account is disabled" });
      }
      const isAdmin = user.userType === "admin";
      if (!isAdmin) {
        if (!password) {
          return res.status(401).json({ message: "Password is required" });
        }
        const hashed = hashPassword(password);
        if (user.password && user.password !== hashed) {
          return res.status(401).json({ message: "Invalid email or password" });
        }
        if (!user.password) {
          await storage.updateUser(user.id, { password: hashed } as any);
        }
      }
      req.session.userId = user.id;
      await storage.updateUser(user.id, { lastLogin: new Date() } as any);
      res.json(sanitizeUser(user));
    } catch (err: any) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: err.errors[0].message });
      }
      res.status(400).json({ message: err.message || "Switch failed" });
    }
  });

  app.get("/api/auth/users", async (_req, res) => {
    const allUsers = await storage.getUsers();
    res.json(allUsers.filter(u => u.isActive).map(sanitizeUser));
  });

  app.get(api.scans.list.path, async (req, res) => {
    const scans = await storage.getScans();
    res.json(scans);
  });

  app.get(api.scans.get.path, async (req, res) => {
    const scan = await storage.getScan(Number(req.params.id));
    if (!scan) {
      return res.status(404).json({ message: "Scan not found" });
    }
    res.json(scan);
  });

  app.delete(api.scans.delete.path, async (req, res) => {
    const id = Number(req.params.id);
    const scan = await storage.getScan(id);
    if (!scan) {
      return res.status(404).json({ message: "Scan not found" });
    }
    await storage.deleteScan(id);
    res.status(204).end();
  });

  app.post(api.scans.create.path, async (req, res) => {
    try {
      const input = api.scans.create.input.parse(req.body);
      
      let targets = [input.domain];
      if (input.scanSubdomains) {
        const subs = await resolveSubdomains(input.domain);
        targets = subs;
      }

      const results = [];

      for (const host of targets) {
        for (const port of input.ports) {
          const rawData = await performScan(host, port);
          const kemData = await getKEMInfo(host, port);
          const analysis = calculateScore(rawData);

          const scanRecord = await storage.createScan({
            domain: host,
            port: port,
            isSubdomain: host !== input.domain,
            score: analysis.score,
            grade: analysis.grade,
            pqcStatus: analysis.pqcStatus,
            cipherName: rawData.cipher?.name || "Unknown",
            protocolVersion: rawData.protocol || "Unknown",
            keyExchange: kemData.kem !== "Unknown" ? kemData.kem : (rawData.ephemeral?.name || "Unknown"),
            rawOutput: kemData.raw,
            details: {
              ...rawData,
              explanation: analysis.explanation,
              kem: kemData.kem,
              error: kemData.error,
              command: kemData.command
            }
          } as any);
          results.push(scanRecord);
        }
      }

      res.status(201).json(results);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({
          message: err.errors[0].message,
          field: err.errors[0].path.join('.'),
        });
      }
      console.error("Scan error:", err);
      res.status(500).json({ message: "Internal server error during scan" });
    }
  });

  // CBOM Routes
  app.get(cbomApi.files.list.path, async (req, res) => {
    const files = await storage.getCbomFiles();
    res.json(files);
  });

  app.delete(cbomApi.files.delete.path, async (req, res) => {
    const id = Number(req.params.id);
    const file = await storage.getCbomFile(id);
    if (!file) {
      return res.status(404).json({ message: "CBOM file not found" });
    }
    await storage.deleteCbomFile(id);
    res.status(204).end();
  });

  app.get(cbomApi.components.list.path, async (req, res) => {
    const components = await storage.getCbomComponents();
    res.json(components);
  });

  app.post(cbomApi.components.upload.path, async (req, res) => {
    try {
      const input = cbomUploadSchema.parse(req.body);
      const { filename, data } = input;

      // Parse CycloneDX JSON
      let parsed: any;
      try {
        parsed = typeof data === 'string' ? JSON.parse(data) : data;
      } catch (e) {
        return res.status(400).json({ message: "Invalid JSON format" });
      }

      // Create file record
      const fileRecord = await storage.createCbomFile({
        filename,
        componentCount: 0,
        metadata: {
          bomFormat: parsed.bomFormat,
          specVersion: parsed.specVersion,
          serialNumber: parsed.serialNumber,
          version: parsed.version,
        },
      });

      // Extract components from CycloneDX format
      const components: InsertCbomComponent[] = [];
      const rawComponents = parsed.components || [];

      for (const comp of rawComponents) {
        const cryptoProps = comp.cryptoProperties || {};
        const assetType = cryptoProps.assetType;
        
        components.push({
          fileId: fileRecord.id,
          bomRef: comp["bom-ref"],
          componentType: assetType || comp.type,
          name: comp.name || "Unknown",
          version: comp.version,
          description: comp.description,
          algorithmMode: cryptoProps.algorithmProperties?.mode,
          padding: cryptoProps.algorithmProperties?.padding,
          cryptoFunctions: cryptoProps.algorithmProperties?.cryptoFunctions,
          oid: cryptoProps.oid,
          primitiveType: cryptoProps.algorithmProperties?.primitive,
          parameterSetIdentifier: cryptoProps.algorithmProperties?.parameterSetIdentifier,
          curve: cryptoProps.algorithmProperties?.curve,
          executionEnvironment: cryptoProps.algorithmProperties?.executionEnvironment,
          implementationPlatform: cryptoProps.algorithmProperties?.implementationPlatform,
          certificationLevel: cryptoProps.algorithmProperties?.certificationLevel,
          nistQuantumSecurityLevel: cryptoProps.algorithmProperties?.nistQuantumSecurityLevel,
          rawData: comp,
        });
      }

      const createdComponents = await storage.createCbomComponents(components);
      await storage.updateCbomFileCount(fileRecord.id, createdComponents.length);

      res.status(201).json({
        file: { ...fileRecord, componentCount: createdComponents.length },
        componentsAdded: createdComponents.length,
      });
    } catch (err) {
      console.error("CBOM upload error:", err);
      res.status(500).json({ message: "Failed to process CBOM file" });
    }
  });

  app.post(cbomApi.components.deduplicate.path, async (req, res) => {
    try {
      const input = cbomDeduplicateSchema.parse(req.body);
      const { fields } = input;

      const allComponents = await storage.getCbomComponents();
      const seen = new Map<string, number>();
      const duplicateIds: number[] = [];

      for (const comp of allComponents) {
        const key = fields.map((f: string) => {
          const value = (comp as any)[f];
          return value !== null && value !== undefined ? String(value) : "";
        }).join("|");

        if (seen.has(key)) {
          duplicateIds.push(comp.id);
        } else {
          seen.set(key, comp.id);
        }
      }

      await storage.deleteCbomComponentsByIds(duplicateIds);

      // Update file counts
      const files = await storage.getCbomFiles();
      for (const file of files) {
        const remaining = await storage.getCbomComponentsByFile(file.id);
        await storage.updateCbomFileCount(file.id, remaining.length);
      }

      res.json({
        removed: duplicateIds.length,
        remaining: allComponents.length - duplicateIds.length,
      });
    } catch (err) {
      console.error("Deduplication error:", err);
      res.status(500).json({ message: "Failed to deduplicate components" });
    }
  });

  // === Script Variables Routes ===
  app.get(scriptsApi.variables.list.path, async (req, res) => {
    const variables = await storage.getVariables();
    // Mask secret values in response
    const masked = variables.map(v => ({
      ...v,
      value: v.isSecret ? "********" : v.value
    }));
    res.json(masked);
  });

  app.post(scriptsApi.variables.create.path, async (req, res) => {
    try {
      const input = createVariableSchema.parse(req.body);
      const variable = await storage.createVariable(input);
      res.status(201).json({
        ...variable,
        value: variable.isSecret ? "********" : variable.value
      });
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: err.errors[0].message });
      }
      res.status(500).json({ message: "Failed to create variable" });
    }
  });

  app.patch(scriptsApi.variables.update.path, async (req, res) => {
    const id = Number(req.params.id);
    const existing = await storage.getVariable(id);
    if (!existing) {
      return res.status(404).json({ message: "Variable not found" });
    }
    const updated = await storage.updateVariable(id, req.body);
    res.json({
      ...updated,
      value: updated?.isSecret ? "********" : updated?.value
    });
  });

  app.delete(scriptsApi.variables.delete.path, async (req, res) => {
    const id = Number(req.params.id);
    const existing = await storage.getVariable(id);
    if (!existing) {
      return res.status(404).json({ message: "Variable not found" });
    }
    await storage.deleteVariable(id);
    res.status(204).end();
  });

  // === Script Schedules Routes (BEFORE :id routes to avoid matching issues) ===
  app.get(scriptsApi.schedules.list.path, async (req, res) => {
    const schedules = await storage.getSchedules();
    res.json(schedules);
  });

  // === Script Executions Routes (BEFORE :id routes to avoid matching issues) ===
  app.get(scriptsApi.executions.list.path, async (req, res) => {
    const limit = req.query.limit ? Number(req.query.limit) : 100;
    const executions = await storage.getExecutions(limit);
    res.json(executions);
  });

  // === Scheduled Scripts Routes ===
  
  // List directories for output path selector (BEFORE :id routes)
  // Restricted to project directory for security
  const PROJECT_ROOT = process.cwd();
  
  app.get("/api/scripts/directories", async (req, res) => {
    try {
      let requestedPath = req.query.path as string || '.';
      
      // Resolve to absolute path and ensure it's within project root
      const absolutePath = path.resolve(PROJECT_ROOT, requestedPath);
      
      // Security: Block directory traversal outside project root
      if (!absolutePath.startsWith(PROJECT_ROOT)) {
        return res.json({ currentPath: '.', directories: [], canGoUp: false });
      }
      
      // Convert back to relative path for display
      const relativePath = path.relative(PROJECT_ROOT, absolutePath) || '.';
      
      const entries = await fs.readdir(absolutePath, { withFileTypes: true });
      const directories = entries
        .filter(entry => entry.isDirectory() && !entry.name.startsWith('.') && entry.name !== 'node_modules')
        .map(entry => ({
          name: entry.name,
          path: relativePath === '.' ? entry.name : path.join(relativePath, entry.name),
        }));
      
      res.json({ 
        currentPath: relativePath,
        directories,
        canGoUp: relativePath !== '.',
      });
    } catch (err) {
      res.json({ currentPath: '.', directories: [], canGoUp: false });
    }
  });
  
  app.get(scriptsApi.scripts.list.path, async (req, res) => {
    const scripts = await storage.getScripts();
    res.json(scripts);
  });

  app.get(scriptsApi.scripts.get.path, async (req, res) => {
    const script = await storage.getScript(Number(req.params.id));
    if (!script) {
      return res.status(404).json({ message: "Script not found" });
    }
    res.json(script);
  });

  app.post(scriptsApi.scripts.create.path, async (req, res) => {
    try {
      const input = createScriptSchema.parse(req.body);
      const script = await storage.createScript(input);
      res.status(201).json(script);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: err.errors[0].message });
      }
      res.status(500).json({ message: "Failed to create script" });
    }
  });

  app.patch(scriptsApi.scripts.update.path, async (req, res) => {
    try {
      const id = Number(req.params.id);
      const existing = await storage.getScript(id);
      if (!existing) {
        return res.status(404).json({ message: "Script not found" });
      }
      const input = updateScriptSchema.parse(req.body);
      const updated = await storage.updateScript(id, input);
      res.json(updated);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: err.errors[0].message });
      }
      res.status(500).json({ message: "Failed to update script" });
    }
  });

  // Test script (run immediately and return result)
  app.post("/api/scripts/:id/test", async (req, res) => {
    const id = Number(req.params.id);
    const script = await storage.getScript(id);
    if (!script) {
      return res.status(404).json({ message: "Script not found" });
    }

    try {
      // Get all variables to substitute into command
      const variables = await storage.getVariables();
      let processedCommand = script.command;
      
      // Replace ${VAR_NAME} patterns with actual values
      for (const variable of variables) {
        const pattern = new RegExp(`\\$\\{${variable.name}\\}`, 'g');
        processedCommand = processedCommand.replace(pattern, variable.value);
      }

      const { stdout, stderr } = await execPromise(processedCommand, {
        timeout: 60000, // 1 minute timeout for test
        maxBuffer: 5 * 1024 * 1024, // 5MB buffer
      });

      res.json({
        success: true,
        output: stdout,
        errorOutput: stderr || null,
        exitCode: 0,
      });
    } catch (err: any) {
      res.json({
        success: false,
        output: err.stdout || null,
        errorOutput: err.stderr || err.message,
        exitCode: err.code || 1,
      });
    }
  });

  app.delete(scriptsApi.scripts.delete.path, async (req, res) => {
    const id = Number(req.params.id);
    const existing = await storage.getScript(id);
    if (!existing) {
      return res.status(404).json({ message: "Script not found" });
    }
    await storage.deleteScript(id);
    res.status(204).end();
  });

  // Execute script manually
  app.post(scriptsApi.scripts.execute.path, async (req, res) => {
    const id = Number(req.params.id);
    const script = await storage.getScript(id);
    if (!script) {
      return res.status(404).json({ message: "Script not found" });
    }

    // Create execution record
    const execution = await storage.createExecution({
      scriptId: id,
      status: "running",
      triggeredBy: "manual",
    });

    if ((script as any).scriptType === "rfc5424") {
      // Execute RFC 5424 ingestion in background
      ingestRfc5424File(script.command, script.name)
        .then(async (result) => {
          await storage.updateExecution(execution.id, {
            status: "success",
            output: result.summary,
            exitCode: 0,
            completedAt: new Date(),
          });
        })
        .catch(async (err) => {
          await storage.updateExecution(execution.id, {
            status: "failed",
            errorOutput: err.message,
            exitCode: 1,
            completedAt: new Date(),
          });
        });
    } else {
      // Execute bash script in background
      executeScript(script.command, execution.id, script.outputPath);
    }

    res.json(execution);
  });

  // Ingest RFC 5424 syslog file (preview/synchronous)
  app.post("/api/scripts/:id/ingest", async (req, res) => {
    const id = Number(req.params.id);
    const script = await storage.getScript(id);
    if (!script) return res.status(404).json({ message: "Script not found" });
    if ((script as any).scriptType !== "rfc5424") {
      return res.status(400).json({ message: "Script is not of type rfc5424" });
    }
    try {
      const result = await ingestRfc5424File(script.command, script.name);
      res.json(result);
    } catch (err: any) {
      res.status(500).json({ message: err.message || "Ingestion failed" });
    }
  });

  // Upload a local RFC 5424 file into the server working directory
  app.post("/api/scripts/upload-rfc5424", requireAuth, async (req, res) => {
    const { fileName, fileContent } = req.body;
    if (!fileName || !fileContent) {
      return res.status(400).json({ message: "fileName and fileContent are required" });
    }
    try {
      const uploadDir = "/tmp/cipherguard-uploads";
      await fs.mkdir(uploadDir, { recursive: true });
      const safeName = path.basename(fileName).replace(/[^a-zA-Z0-9._\-]/g, "_");
      const dest = path.join(uploadDir, `${Date.now()}_${safeName}`);
      const buf = Buffer.from(fileContent, "base64");
      await fs.writeFile(dest, buf);
      res.json({ serverPath: dest, fileName: safeName, sizeBytes: buf.length });
    } catch (err: any) {
      res.status(500).json({ message: err.message || "Upload failed" });
    }
  });

  // Parse RFC 5424 content (no DB save - preview only)
  app.post("/api/scripts/preview-rfc5424", async (req, res) => {
    const { filePath } = req.body;
    if (!filePath) return res.status(400).json({ message: "filePath is required" });
    try {
      const content = await fs.readFile(filePath, "utf-8");
      const lines = content.split("\n").filter(l => l.trim());
      const records = [];
      for (const line of lines) {
        const parsed = parseRfc5424Line(line.trim());
        if (parsed && parsed.structuredData["cbom@32473"]) {
          const cbom = parsed.structuredData["cbom@32473"];
          const gw = parsed.structuredData["gateway@32473"] || {};
          records.push({
            msgId: parsed.msgId,
            timestamp: parsed.timestamp,
            assetName: cbom.asset_name,
            cipherSuite: cbom.crypto_cipher_suite,
            protocol: cbom.crypto_protocol,
            protocolVersion: cbom.crypto_protocol_version,
            keyExchange: cbom.crypto_key_exchange,
            zone: gw.zone,
            message: parsed.message,
            risk: assessCryptoRisk(
              cbom.crypto_cipher_suite || "",
              cbom.crypto_protocol_version || "",
              cbom.crypto_key_exchange || "",
              cbom.crypto_certificate_signature_algorithm || ""
            ),
          });
        }
      }
      res.json({ totalLines: lines.length, cbomRecords: records.length, preview: records });
    } catch (err: any) {
      res.status(500).json({ message: err.message || "Failed to read file" });
    }
  });

  // === Script Schedules Routes (continued) ===
  app.get(scriptsApi.schedules.listByScript.path, async (req, res) => {
    const scriptId = Number(req.params.scriptId);
    const schedules = await storage.getSchedulesByScript(scriptId);
    res.json(schedules);
  });

  app.post(scriptsApi.schedules.create.path, async (req, res) => {
    try {
      const input = createScheduleSchema.parse(req.body);
      
      // Verify script exists
      const script = await storage.getScript(input.scriptId);
      if (!script) {
        return res.status(400).json({ message: "Script not found" });
      }

      const schedule = await storage.createSchedule(input);
      
      // Calculate and set next run time
      const nextRun = calculateNextRun(schedule);
      if (nextRun) {
        await storage.updateScheduleNextRun(schedule.id, nextRun);
      }
      
      const updated = await storage.getSchedule(schedule.id);
      res.status(201).json(updated);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: err.errors[0].message });
      }
      res.status(500).json({ message: "Failed to create schedule" });
    }
  });

  app.patch(scriptsApi.schedules.update.path, async (req, res) => {
    const id = Number(req.params.id);
    const existing = await storage.getSchedule(id);
    if (!existing) {
      return res.status(404).json({ message: "Schedule not found" });
    }
    const updated = await storage.updateSchedule(id, req.body);
    
    // Recalculate next run if schedule was updated
    if (updated) {
      const nextRun = calculateNextRun(updated);
      if (nextRun) {
        await storage.updateScheduleNextRun(id, nextRun);
      }
    }
    
    const final = await storage.getSchedule(id);
    res.json(final);
  });

  app.delete(scriptsApi.schedules.delete.path, async (req, res) => {
    const id = Number(req.params.id);
    const existing = await storage.getSchedule(id);
    if (!existing) {
      return res.status(404).json({ message: "Schedule not found" });
    }
    await storage.deleteSchedule(id);
    res.status(204).end();
  });

  // === Script Executions Routes (continued) ===
  app.get(scriptsApi.executions.listByScript.path, async (req, res) => {
    const scriptId = Number(req.params.scriptId);
    const limit = req.query.limit ? Number(req.query.limit) : 50;
    const executions = await storage.getExecutionsByScript(scriptId, limit);
    res.json(executions);
  });

  // === Settings API Routes ===
  
  // Initialize default permissions on startup
  storage.initializeDefaultPermissions().catch(console.error);
  
  // User Management Routes
  app.get(settingsApi.users.list.path, async (req, res) => {
    const allUsers = await storage.getUsers();
    res.json(allUsers.map(sanitizeUser));
  });

  app.get(settingsApi.users.get.path, async (req, res) => {
    const id = Number(req.params.id);
    const user = await storage.getUser(id);
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }
    res.json(user);
  });

  app.post(settingsApi.users.create.path, async (req, res) => {
    const parsed = createUserSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ message: parsed.error.errors[0].message });
    }
    
    const existing = await storage.getUserByEmail(parsed.data.email);
    if (existing) {
      return res.status(400).json({ message: "Email already exists" });
    }
    
    const userData = { ...parsed.data };
    if (userData.password) {
      userData.password = hashPassword(userData.password);
    }
    const user = await storage.createUser(userData);
    res.status(201).json(sanitizeUser(user));
  });

  app.patch(settingsApi.users.update.path, async (req, res) => {
    const id = Number(req.params.id);
    const parsed = updateUserSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ message: parsed.error.errors[0].message });
    }
    
    const existing = await storage.getUser(id);
    if (!existing) {
      return res.status(404).json({ message: "User not found" });
    }
    
    if (parsed.data.email && parsed.data.email !== existing.email) {
      const emailExists = await storage.getUserByEmail(parsed.data.email);
      if (emailExists) {
        return res.status(400).json({ message: "Email already exists" });
      }
    }
    
    const updateData = { ...parsed.data };
    if (updateData.password) {
      updateData.password = hashPassword(updateData.password);
    }
    const user = await storage.updateUser(id, updateData);
    res.json(sanitizeUser(user));
  });

  app.delete(settingsApi.users.delete.path, async (req, res) => {
    const id = Number(req.params.id);
    const existing = await storage.getUser(id);
    if (!existing) {
      return res.status(404).json({ message: "User not found" });
    }
    await storage.deleteUser(id);
    res.status(204).end();
  });

  // Role Permissions Routes
  app.get(settingsApi.permissions.list.path, async (req, res) => {
    const permissions = await storage.getRolePermissions();
    res.json(permissions);
  });

  app.put(settingsApi.permissions.update.path, async (req, res) => {
    const parsed = updateRolePermissionSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ message: parsed.error.errors[0].message });
    }
    
    const permission = await storage.upsertRolePermission(parsed.data);
    res.json(permission);
  });

  app.post(settingsApi.permissions.initialize.path, async (req, res) => {
    await storage.initializeDefaultPermissions();
    res.json({ message: "Default permissions initialized" });
  });

  // Auth Configuration Routes
  app.get(settingsApi.authConfig.list.path, async (req, res) => {
    const configs = await storage.getAuthConfigs();
    res.json(configs);
  });

  app.get(settingsApi.authConfig.get.path, async (req, res) => {
    const id = Number(req.params.id);
    const config = await storage.getAuthConfig(id);
    if (!config) {
      return res.status(404).json({ message: "Auth configuration not found" });
    }
    res.json(config);
  });

  app.post(settingsApi.authConfig.create.path, async (req, res) => {
    const parsed = createAuthConfigSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ message: parsed.error.errors[0].message });
    }
    
    const config = await storage.createAuthConfig(parsed.data);
    res.status(201).json(config);
  });

  app.patch(settingsApi.authConfig.update.path, async (req, res) => {
    const id = Number(req.params.id);
    const parsed = updateAuthConfigSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ message: parsed.error.errors[0].message });
    }
    
    const existing = await storage.getAuthConfig(id);
    if (!existing) {
      return res.status(404).json({ message: "Auth configuration not found" });
    }
    
    const config = await storage.updateAuthConfig(id, parsed.data);
    res.json(config);
  });

  app.delete(settingsApi.authConfig.delete.path, async (req, res) => {
    const id = Number(req.params.id);
    const existing = await storage.getAuthConfig(id);
    if (!existing) {
      return res.status(404).json({ message: "Auth configuration not found" });
    }
    await storage.deleteAuthConfig(id);
    res.status(204).end();
  });

  // === Security Policies Routes ===
  app.get(policiesApi.policies.list.path, async (req, res) => {
    const policies = await storage.getSecurityPolicies();
    res.json(policies);
  });

  app.get(policiesApi.policies.get.path, async (req, res) => {
    const id = Number(req.params.id);
    const policy = await storage.getSecurityPolicy(id);
    if (!policy) {
      return res.status(404).json({ message: "Policy not found" });
    }
    res.json(policy);
  });

  app.post(policiesApi.policies.create.path, async (req, res) => {
    const parsed = createSecurityPolicySchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ message: parsed.error.errors[0].message });
    }
    const policy = await storage.createSecurityPolicy(parsed.data);
    res.status(201).json(policy);
  });

  app.patch(policiesApi.policies.update.path, async (req, res) => {
    const id = Number(req.params.id);
    const parsed = updateSecurityPolicySchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ message: parsed.error.errors[0].message });
    }
    const existing = await storage.getSecurityPolicy(id);
    if (!existing) {
      return res.status(404).json({ message: "Policy not found" });
    }
    const policy = await storage.updateSecurityPolicy(id, parsed.data);
    res.json(policy);
  });

  app.delete(policiesApi.policies.delete.path, async (req, res) => {
    const id = Number(req.params.id);
    const existing = await storage.getSecurityPolicy(id);
    if (!existing) {
      return res.status(404).json({ message: "Policy not found" });
    }
    await storage.deleteSecurityPolicy(id);
    res.status(204).end();
  });

  app.post(policiesApi.policies.match.path, async (req, res) => {
    try {
      const policies = await storage.getSecurityPolicies();
      const activePolicies = policies.filter(p => p.status === "active");
      const components = await storage.getCbomComponents();

      const results: Array<{
        componentId: number;
        componentName: string;
        policyId: number;
        policyName: string;
        compliant: boolean;
        violations: string[];
      }> = [];

      for (const component of components) {
        for (const policy of activePolicies) {
          const matchResult = matchComponentToPolicy(component, policy);
          if (matchResult.matched) {
            results.push({
              componentId: component.id,
              componentName: component.name,
              policyId: policy.id,
              policyName: policy.name,
              compliant: matchResult.violations.length === 0,
              violations: matchResult.violations,
            });
          }
        }
      }

      res.json({
        matched: results.length,
        results,
      });
    } catch (err) {
      console.error("Policy matching error:", err);
      res.status(500).json({ message: "Failed to match policies" });
    }
  });

  // ==================== Reports ====================
  app.get(reportsApi.reports.dashboard.path, async (req, res) => {
    try {
      const allComponents = await storage.getCbomComponents();
      const files = await storage.getCbomFiles();
      const policies = await storage.getSecurityPolicies();
      const activePolicies = policies.filter(p => p.status === "active");

      const filterTypes = req.query.componentType ? String(req.query.componentType).split(",") : [];
      const filterLevels = req.query.quantumLevel ? String(req.query.quantumLevel).split(",").map(Number) : [];
      const filterFileIds = req.query.fileId ? String(req.query.fileId).split(",").map(Number) : [];
      const filterCompliance = req.query.complianceStatus ? String(req.query.complianceStatus) : "";

      let components = allComponents;
      if (filterTypes.length > 0) {
        components = components.filter(c => filterTypes.includes(c.componentType || "Unknown"));
      }
      if (filterLevels.length > 0) {
        components = components.filter(c => {
          if (filterLevels.includes(-1) && c.nistQuantumSecurityLevel == null) return true;
          return c.nistQuantumSecurityLevel != null && filterLevels.includes(c.nistQuantumSecurityLevel);
        });
      }
      if (filterFileIds.length > 0) {
        components = components.filter(c => filterFileIds.includes(c.fileId));
      }

      const byType: Record<string, number> = {};
      const byQuantumLevel: Record<string, number> = {};
      const algorithmMap: Record<string, { name: string; type: string; mode: string; quantumLevel: number | null; count: number }> = {};
      const cryptoFunctionDist: Record<string, number> = {};
      const typeByLevel: Record<string, Record<string, number>> = {};
      const perFile: Record<number, { fileId: number; filename: string; total: number; pqcReady: number; pqcNotReady: number }> = {};
      let pqcReady = 0;
      let pqcNotReady = 0;

      for (const c of components) {
        const t = c.componentType || "Unknown";
        byType[t] = (byType[t] || 0) + 1;

        const ql = c.nistQuantumSecurityLevel;
        const qlLabel = ql != null ? `Level ${ql}` : "Not Assessed";
        byQuantumLevel[qlLabel] = (byQuantumLevel[qlLabel] || 0) + 1;

        if (ql != null && ql >= 3) pqcReady++;
        else pqcNotReady++;

        const algoKey = `${c.name}|${c.componentType || ""}|${c.algorithmMode || ""}`;
        if (!algorithmMap[algoKey]) {
          algorithmMap[algoKey] = {
            name: c.name,
            type: c.componentType || "Unknown",
            mode: c.algorithmMode || "N/A",
            quantumLevel: c.nistQuantumSecurityLevel,
            count: 0,
          };
        }
        algorithmMap[algoKey].count++;

        if (c.cryptoFunctions && Array.isArray(c.cryptoFunctions)) {
          for (const fn of c.cryptoFunctions) {
            cryptoFunctionDist[fn] = (cryptoFunctionDist[fn] || 0) + 1;
          }
        }

        if (!typeByLevel[t]) typeByLevel[t] = {};
        typeByLevel[t][qlLabel] = (typeByLevel[t][qlLabel] || 0) + 1;

        const file = files.find(f => f.id === c.fileId);
        if (!perFile[c.fileId]) {
          perFile[c.fileId] = { fileId: c.fileId, filename: file?.filename || `File ${c.fileId}`, total: 0, pqcReady: 0, pqcNotReady: 0 };
        }
        perFile[c.fileId].total++;
        if (ql != null && ql >= 3) perFile[c.fileId].pqcReady++;
        else perFile[c.fileId].pqcNotReady++;
      }

      const complianceResults: Array<{
        componentId: number;
        componentName: string;
        componentType: string;
        policyId: number;
        policyName: string;
        compliant: boolean;
        violations: string[];
        quantumLevel: number | null;
      }> = [];

      for (const component of components) {
        for (const policy of activePolicies) {
          const matchResult = matchComponentToPolicy(component, policy);
          if (matchResult.matched) {
            complianceResults.push({
              componentId: component.id,
              componentName: component.name,
              componentType: component.componentType || "Unknown",
              policyId: policy.id,
              policyName: policy.name,
              compliant: matchResult.violations.length === 0,
              violations: matchResult.violations,
              quantumLevel: component.nistQuantumSecurityLevel,
            });
          }
        }
      }

      let filteredCompliance = complianceResults;
      if (filterCompliance === "compliant") {
        filteredCompliance = complianceResults.filter(r => r.compliant);
      } else if (filterCompliance === "violation") {
        filteredCompliance = complianceResults.filter(r => !r.compliant);
      }

      const compliantCount = complianceResults.filter(r => r.compliant).length;
      const violationCount = complianceResults.filter(r => !r.compliant).length;

      const allTypes = Array.from(new Set(allComponents.map(c => c.componentType || "Unknown"))).sort();
      const allLevels = Array.from(new Set(allComponents.map(c => c.nistQuantumSecurityLevel))).sort((a, b) => (a ?? -1) - (b ?? -1));

      const radarDimensions = [
        { dimension: "PQC Coverage", value: components.length > 0 ? Math.round((pqcReady / components.length) * 100) : 0 },
        { dimension: "Policy Compliance", value: complianceResults.length > 0 ? Math.round((compliantCount / complianceResults.length) * 100) : 100 },
        { dimension: "Algorithm Diversity", value: Math.min(Object.keys(algorithmMap).length * 20, 100) },
        { dimension: "File Coverage", value: Math.min(files.length * 25, 100) },
        { dimension: "Type Coverage", value: Math.min(Object.keys(byType).length * 20, 100) },
        { dimension: "Security Depth", value: components.length > 0 ? Math.min(Math.round((components.filter(c => (c.nistQuantumSecurityLevel ?? 0) >= 1).length / components.length) * 100), 100) : 0 },
      ];

      const typeByLevelData = Object.entries(typeByLevel).map(([type, levels]) => ({
        type,
        ...levels,
      }));

      res.json({
        cbom: {
          totalComponents: components.length,
          totalFiles: files.length,
          unfilteredTotal: allComponents.length,
          byType: Object.entries(byType).map(([type, count]) => ({ type, count })),
          byQuantumLevel: Object.entries(byQuantumLevel).map(([level, count]) => ({ level, count })),
          pqcReady,
          pqcNotReady,
          algorithms: Object.values(algorithmMap),
          cryptoFunctions: Object.entries(cryptoFunctionDist).map(([fn, count]) => ({ name: fn, count })).sort((a, b) => b.count - a.count),
          typeByLevel: typeByLevelData,
          perFile: Object.values(perFile),
          radarDimensions,
        },
        compliance: {
          totalMatches: complianceResults.length,
          compliant: compliantCount,
          violations: violationCount,
          complianceRate: complianceResults.length > 0 ? Math.round((compliantCount / complianceResults.length) * 100) : 100,
          activePolicies: activePolicies.length,
          totalPolicies: policies.length,
          results: filteredCompliance,
        },
        filters: {
          availableTypes: allTypes,
          availableLevels: allLevels,
          availableFiles: files.map(f => ({ id: f.id, filename: f.filename })),
        },
        meta: {
          generatedAt: new Date().toISOString(),
          activeFilters: {
            componentType: filterTypes,
            quantumLevel: filterLevels,
            fileId: filterFileIds,
            complianceStatus: filterCompliance,
          },
        },
      });
    } catch (err) {
      console.error("Dashboard data error:", err);
      res.status(500).json({ message: "Failed to load dashboard data" });
    }
  });

  app.get(reportsApi.reports.list.path, async (req, res) => {
    const allReports = await storage.getReports();
    res.json(allReports);
  });

  app.get(reportsApi.reports.get.path, async (req, res) => {
    const report = await storage.getReport(Number(req.params.id));
    if (!report) return res.status(404).json({ message: "Report not found" });
    res.json(report);
  });

  app.post(reportsApi.reports.create.path, async (req, res) => {
    const parsed = createReportSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: parsed.error.message });
    const report = await storage.createReport(parsed.data);
    res.status(201).json(report);
  });

  app.patch(reportsApi.reports.update.path, async (req, res) => {
    const parsed = updateReportSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: parsed.error.message });
    const updated = await storage.updateReport(Number(req.params.id), parsed.data);
    if (!updated) return res.status(404).json({ message: "Report not found" });
    res.json(updated);
  });

  app.delete(reportsApi.reports.delete.path, async (req, res) => {
    await storage.deleteReport(Number(req.params.id));
    res.status(204).send();
  });

  // Output Directories
  app.get(outputDirectoriesApi.directories.list.path, async (req, res) => {
    const dirs = await storage.getOutputDirectories();
    res.json(dirs);
  });

  app.post(outputDirectoriesApi.directories.create.path, async (req, res) => {
    const parsed = createOutputDirectorySchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: parsed.error.message });
    const dir = await storage.createOutputDirectory(parsed.data);
    res.status(201).json(dir);
  });

  app.patch(outputDirectoriesApi.directories.update.path, async (req, res) => {
    const parsed = updateOutputDirectorySchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: parsed.error.message });
    const updated = await storage.updateOutputDirectory(Number(req.params.id), parsed.data);
    if (!updated) return res.status(404).json({ message: "Output directory not found" });
    res.json(updated);
  });

  app.delete(outputDirectoriesApi.directories.delete.path, async (req, res) => {
    await storage.deleteOutputDirectory(Number(req.params.id));
    res.status(204).send();
  });

  app.post(outputDirectoriesApi.directories.scan.path, async (req, res) => {
    try {
      const dirs = await storage.getOutputDirectories();
      const enabledDirs = dirs.filter(d => d.enabled);
      const results: any[] = [];
      let totalFiles = 0;

      for (const dir of enabledDirs) {
        try {
          const dirPath = path.resolve(dir.path);
          const stat = await fs.stat(dirPath);
          if (!stat.isDirectory()) continue;

          const entries = await fs.readdir(dirPath, { withFileTypes: true });
          const fileInfos: any[] = [];

          for (const entry of entries) {
            if (!entry.isFile()) continue;
            const fullPath = path.join(dirPath, entry.name);
            const fileStat = await fs.stat(fullPath);
            fileInfos.push({
              filename: entry.name,
              fullPath,
              size: fileStat.size,
              modifiedAt: fileStat.mtime.toISOString(),
              isJson: entry.name.endsWith('.json'),
            });
          }

          totalFiles += fileInfos.length;
          await storage.updateOutputDirectoryLastScanned(dir.id);

          results.push({
            directoryId: dir.id,
            directoryLabel: dir.label,
            directoryPath: dir.path,
            files: fileInfos,
          });
        } catch (err) {
          results.push({
            directoryId: dir.id,
            directoryLabel: dir.label,
            directoryPath: dir.path,
            files: [],
          });
        }
      }

      res.json({ directories: results, totalFiles });
    } catch (err) {
      res.status(500).json({ message: "Failed to scan directories" });
    }
  });

  app.get('/api/filesystem/browse', async (req, res) => {
    try {
      const browsePath = typeof req.query.path === 'string' ? req.query.path : '/';
      const resolvedPath = path.resolve(browsePath);

      const ALLOWED_ROOTS = [
        '/tmp',
        '/home',
        '/mnt',
        '/media',
        '/net',
        '/Volumes',
        '/run/media',
        process.env.HOME || '/home',
      ];

      const dirs = await storage.getOutputDirectories();
      const configuredPaths = dirs.map(d => path.resolve(d.path));
      const allAllowed = [...ALLOWED_ROOTS, ...configuredPaths];

      const isWithinAllowed = allAllowed.some(allowed => {
        const resolvedAllowed = path.resolve(allowed);
        return resolvedPath === resolvedAllowed ||
               resolvedPath.startsWith(resolvedAllowed + '/');
      });

      const entries: Array<{
        name: string;
        path: string;
        type: 'directory' | 'drive' | 'mount' | 'file';
        accessible: boolean;
      }> = [];

      if (resolvedPath === '/') {
        const topLevelSet = new Set<string>();
        for (const allowed of allAllowed) {
          const resolved = path.resolve(allowed);
          const parts = resolved.split('/').filter(Boolean);
          if (parts.length > 0) {
            topLevelSet.add(parts[0]);
          }
        }
        const topLevelDirs = Array.from(topLevelSet);

        for (const dirName of topLevelDirs) {
          const dirPath = '/' + dirName;
          let accessible = true;
          try {
            await fs.access(dirPath);
          } catch {
            accessible = false;
          }
          const isMountDir = ['mnt', 'media', 'net', 'Volumes'].includes(dirName);
          entries.push({
            name: dirName,
            path: dirPath,
            type: isMountDir ? 'mount' : 'directory',
            accessible,
          });
        }
      } else if (!isWithinAllowed) {
        const isAncestorOfAllowed = allAllowed.some(allowed => {
          const resolvedAllowed = path.resolve(allowed);
          return resolvedAllowed.startsWith(resolvedPath + '/');
        });

        if (!isAncestorOfAllowed) {
          return res.status(403).json({ message: "Access to this path is restricted" });
        }

        try {
          const dirEntries = await fs.readdir(resolvedPath, { withFileTypes: true });

          for (const entry of dirEntries) {
            if (entry.name.startsWith('.')) continue;
            const entryPath = path.join(resolvedPath, entry.name);

            const isRelevant = allAllowed.some(allowed => {
              const resolvedAllowed = path.resolve(allowed);
              return resolvedAllowed === entryPath ||
                     resolvedAllowed.startsWith(entryPath + '/') ||
                     entryPath.startsWith(resolvedAllowed + '/');
            });
            if (!isRelevant) continue;

            let isDir = false;
            let accessible = true;
            try {
              if (entry.isDirectory()) {
                isDir = true;
              } else if (entry.isSymbolicLink()) {
                const stat = await fs.stat(entryPath);
                isDir = stat.isDirectory();
              }
            } catch {
              accessible = false;
              isDir = entry.isDirectory();
            }

            if (isDir) {
              entries.push({
                name: entry.name,
                path: entryPath,
                type: 'directory',
                accessible,
              });
            }
          }
        } catch {
          return res.json({
            currentPath: resolvedPath,
            parentPath: path.dirname(resolvedPath) !== resolvedPath ? path.dirname(resolvedPath) : null,
            entries: [],
            error: 'Cannot read directory. Check permissions.',
          });
        }
      } else {
        try {
          const dirEntries = await fs.readdir(resolvedPath, { withFileTypes: true });

          for (const entry of dirEntries) {
            if (entry.name.startsWith('.')) continue;

            const entryPath = path.join(resolvedPath, entry.name);
            let isDir = false;
            let accessible = true;

            try {
              if (entry.isDirectory()) {
                isDir = true;
              } else if (entry.isSymbolicLink()) {
                const stat = await fs.stat(entryPath);
                isDir = stat.isDirectory();
              }
            } catch {
              accessible = false;
              isDir = entry.isDirectory();
            }

            if (isDir) {
              const isMountPoint = resolvedPath === '/mnt' || resolvedPath === '/media' ||
                resolvedPath === '/net' || resolvedPath === '/Volumes' ||
                resolvedPath === '/run/media';
              entries.push({
                name: entry.name,
                path: entryPath,
                type: isMountPoint ? 'mount' : 'directory',
                accessible,
              });
            }
          }
        } catch {
          return res.json({
            currentPath: resolvedPath,
            parentPath: path.dirname(resolvedPath) !== resolvedPath ? path.dirname(resolvedPath) : null,
            entries: [],
            error: 'Cannot read directory. Check permissions.',
          });
        }
      }

      entries.sort((a, b) => {
        if (a.type === 'mount' && b.type !== 'mount') return -1;
        if (a.type !== 'mount' && b.type === 'mount') return 1;
        return a.name.localeCompare(b.name);
      });

      const quickAccess: Array<{ name: string; path: string; type: string }> = [];
      const checkDirs = [
        { name: 'Root (/)', path: '/' },
        { name: 'Home', path: process.env.HOME || '/home' },
        { name: 'Temp', path: '/tmp' },
        { name: 'Mounts', path: '/mnt' },
        { name: 'Media', path: '/media' },
        { name: 'Network', path: '/net' },
      ];

      for (const dir of checkDirs) {
        try {
          await fs.access(dir.path);
          quickAccess.push({ name: dir.name, path: dir.path, type: 'quick' });
        } catch {
          // skip inaccessible
        }
      }

      for (const cfgDir of dirs) {
        const cfgPath = path.resolve(cfgDir.path);
        if (!quickAccess.some(qa => qa.path === cfgPath)) {
          try {
            await fs.access(cfgPath);
            quickAccess.push({ name: cfgDir.label, path: cfgPath, type: 'configured' });
          } catch {
            // skip inaccessible
          }
        }
      }

      res.json({
        currentPath: resolvedPath,
        parentPath: path.dirname(resolvedPath) !== resolvedPath ? path.dirname(resolvedPath) : null,
        entries,
        quickAccess,
      });
    } catch (err) {
      res.status(500).json({ message: "Failed to browse filesystem" });
    }
  });

  app.post('/api/cbom/directories/import', async (req, res) => {
    try {
      const { fullPath, filename } = req.body;
      if (!fullPath || !filename) {
        return res.status(400).json({ message: "fullPath and filename are required" });
      }

      const resolvedPath = path.resolve(fullPath);

      const dirs = await storage.getOutputDirectories();
      const enabledDirs = dirs.filter(d => d.enabled);
      const isWithinConfiguredDir = enabledDirs.some(d => {
        const dirPath = path.resolve(d.path);
        return resolvedPath.startsWith(dirPath + path.sep) || resolvedPath === dirPath;
      });

      if (!isWithinConfiguredDir) {
        return res.status(403).json({ message: "File path is not within a configured, enabled directory" });
      }

      const content = await fs.readFile(resolvedPath, 'utf-8');
      const parsed = JSON.parse(content);

      const metadata: any = {};
      if (parsed.bomFormat) metadata.bomFormat = parsed.bomFormat;
      if (parsed.specVersion) metadata.specVersion = parsed.specVersion;
      if (parsed.serialNumber) metadata.serialNumber = parsed.serialNumber;
      if (parsed.version !== undefined) metadata.version = parsed.version;
      if (parsed.metadata?.component?.name) metadata.componentName = parsed.metadata.component.name;

      const file = await storage.createCbomFile({
        filename,
        componentCount: 0,
        metadata,
      });

      let componentsAdded = 0;
      const components: any[] = parsed.components || [];
      
      const componentBatch: InsertCbomComponent[] = [];
      for (const comp of components) {
        const cryptoProps = comp.cryptoProperties || {};
        const assetType = cryptoProps.assetType;

        componentBatch.push({
          fileId: file.id,
          bomRef: comp["bom-ref"],
          componentType: assetType || comp.type,
          name: comp.name || "Unknown",
          version: comp.version,
          description: comp.description,
          algorithmMode: cryptoProps.algorithmProperties?.mode,
          padding: cryptoProps.algorithmProperties?.padding,
          cryptoFunctions: cryptoProps.algorithmProperties?.cryptoFunctions,
          oid: cryptoProps.oid,
          primitiveType: cryptoProps.algorithmProperties?.primitive,
          parameterSetIdentifier: cryptoProps.algorithmProperties?.parameterSetIdentifier,
          curve: cryptoProps.algorithmProperties?.curve,
          executionEnvironment: cryptoProps.algorithmProperties?.executionEnvironment,
          implementationPlatform: cryptoProps.algorithmProperties?.implementationPlatform,
          certificationLevel: cryptoProps.algorithmProperties?.certificationLevel,
          nistQuantumSecurityLevel: cryptoProps.algorithmProperties?.nistQuantumSecurityLevel,
          rawData: comp,
        });
      }

      const createdComponents = await storage.createCbomComponents(componentBatch);
      componentsAdded = createdComponents.length;

      await storage.updateCbomFileCount(file.id, componentsAdded);

      res.status(201).json({ file, componentsAdded });
    } catch (err: any) {
      res.status(400).json({ message: err.message || "Failed to import file" });
    }
  });

  // ==================== GitHub Repos ====================

  const sanitizeGithubRepo = (repo: any) => {
    const { password, ...safe } = repo;
    return { ...safe, hasAuth: !!(repo.username && repo.password) };
  };

  app.get(githubReposApi.repos.list.path, async (_req, res) => {
    const repos = await storage.getGithubRepos();
    res.json(repos.map(sanitizeGithubRepo));
  });

  app.get(githubReposApi.repos.get.path, async (req, res) => {
    const id = parseInt(req.params.id);
    const repo = await storage.getGithubRepo(id);
    if (!repo) return res.status(404).json({ message: "Repository not found" });
    res.json(sanitizeGithubRepo(repo));
  });

  app.post(githubReposApi.repos.create.path, async (req, res) => {
    try {
      const data = createGithubRepoSchema.parse(req.body);
      const repo = await storage.createGithubRepo(data);
      res.status(201).json(sanitizeGithubRepo(repo));
    } catch (err: any) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: err.errors[0].message });
      }
      res.status(400).json({ message: err.message || "Failed to create repository" });
    }
  });

  app.patch(githubReposApi.repos.update.path, async (req, res) => {
    const id = parseInt(req.params.id);
    try {
      const data = updateGithubRepoSchema.parse(req.body);
      const updated = await storage.updateGithubRepo(id, data);
      if (!updated) return res.status(404).json({ message: "Repository not found" });
      res.json(sanitizeGithubRepo(updated));
    } catch (err: any) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ message: err.errors[0].message });
      }
      res.status(400).json({ message: err.message || "Failed to update repository" });
    }
  });

  app.delete(githubReposApi.repos.delete.path, async (req, res) => {
    const id = parseInt(req.params.id);
    const repo = await storage.getGithubRepo(id);
    if (!repo) return res.status(404).json({ message: "Repository not found" });
    await storage.deleteGithubRepo(id);
    res.status(204).send();
  });

  app.post(githubReposApi.repos.scan.path, async (req, res) => {
    const id = parseInt(req.params.id);
    const repo = await storage.getGithubRepo(id);
    if (!repo) return res.status(404).json({ message: "Repository not found" });

    await storage.updateGithubRepo(id, { status: "scanning" } as any);

    scanGithubRepo(id, repo.repoUrl, repo.branch || "main", repo.username || undefined, repo.password || undefined);

    const updated = await storage.getGithubRepo(id);
    res.json(sanitizeGithubRepo(updated));
  });

  // Key Manager routes
  keyRoutes(app);

  // Start scheduler
  startScheduler();

  return httpServer;
}

const CRYPTO_PATTERNS: Array<{ pattern: RegExp; algorithm: string; type: string; pqcReady: boolean; severity: string }> = [
  { pattern: /\b(MD5|md5)\b/g, algorithm: "MD5", type: "hash", pqcReady: false, severity: "critical" },
  { pattern: /\b(SHA-?1|sha1)\b/g, algorithm: "SHA-1", type: "hash", pqcReady: false, severity: "high" },
  { pattern: /\b(SHA-?256|sha256|SHA-?384|sha384|SHA-?512|sha512)\b/g, algorithm: "SHA-2", type: "hash", pqcReady: true, severity: "info" },
  { pattern: /\b(SHA-?3|sha3|SHAKE128|SHAKE256)\b/g, algorithm: "SHA-3", type: "hash", pqcReady: true, severity: "info" },
  { pattern: /\b(DES|3DES|TripleDES|triple-des)\b/gi, algorithm: "DES/3DES", type: "cipher", pqcReady: false, severity: "critical" },
  { pattern: /\b(AES-?128|AES-?256|AES-?GCM|aes)\b/gi, algorithm: "AES", type: "cipher", pqcReady: true, severity: "info" },
  { pattern: /\b(Blowfish|blowfish|BLOWFISH)\b/g, algorithm: "Blowfish", type: "cipher", pqcReady: false, severity: "high" },
  { pattern: /\b(RC4|rc4|arcfour)\b/gi, algorithm: "RC4", type: "cipher", pqcReady: false, severity: "critical" },
  { pattern: /\b(ChaCha20|chacha20|CHACHA20)\b/g, algorithm: "ChaCha20", type: "cipher", pqcReady: true, severity: "info" },
  { pattern: /\b(RSA|rsa)\b/g, algorithm: "RSA", type: "key-exchange", pqcReady: false, severity: "medium" },
  { pattern: /\b(ECDSA|ecdsa|ECDH|ecdh)\b/g, algorithm: "ECC", type: "key-exchange", pqcReady: false, severity: "medium" },
  { pattern: /\b(DSA|dsa)\b/g, algorithm: "DSA", type: "signature", pqcReady: false, severity: "high" },
  { pattern: /\b(Ed25519|ed25519|Ed448|ed448)\b/g, algorithm: "EdDSA", type: "signature", pqcReady: false, severity: "medium" },
  { pattern: /\b(Diffie-?Hellman|DH|diffie_hellman)\b/gi, algorithm: "Diffie-Hellman", type: "key-exchange", pqcReady: false, severity: "medium" },
  { pattern: /\b(ML-KEM|MLKEM|Kyber|kyber|CRYSTALS-Kyber)\b/gi, algorithm: "ML-KEM (Kyber)", type: "kem", pqcReady: true, severity: "info" },
  { pattern: /\b(ML-DSA|MLDSA|Dilithium|dilithium|CRYSTALS-Dilithium)\b/gi, algorithm: "ML-DSA (Dilithium)", type: "signature", pqcReady: true, severity: "info" },
  { pattern: /\b(SPHINCS|sphincs|SLH-DSA|SLHDSA)\b/gi, algorithm: "SLH-DSA (SPHINCS+)", type: "signature", pqcReady: true, severity: "info" },
  { pattern: /\b(FALCON|falcon|FN-DSA)\b/gi, algorithm: "FN-DSA (FALCON)", type: "signature", pqcReady: true, severity: "info" },
  { pattern: /\b(HMAC|hmac)\b/g, algorithm: "HMAC", type: "mac", pqcReady: true, severity: "info" },
  { pattern: /\b(PBKDF2|pbkdf2|bcrypt|scrypt|argon2)\b/gi, algorithm: "KDF", type: "kdf", pqcReady: true, severity: "info" },
  { pattern: /\b(TLS\s*1\.[0-1]|SSLv[23])\b/gi, algorithm: "Legacy TLS/SSL", type: "protocol", pqcReady: false, severity: "critical" },
  { pattern: /\b(TLS\s*1\.[23])\b/gi, algorithm: "Modern TLS", type: "protocol", pqcReady: false, severity: "info" },
];

async function scanGithubRepo(repoId: number, repoUrl: string, branch: string, username?: string, password?: string) {
  try {
    const parsedUrl = new URL(repoUrl);
    const [owner, repo] = parsedUrl.pathname.replace(/^\//, '').replace(/\.git$/, '').split('/');

    if (!owner || !repo) {
      await storage.updateGithubRepo(repoId, {
        status: "failed",
        lastScanAt: new Date(),
        scanResults: { error: "Invalid repository URL. Expected format: https://github.com/owner/repo" },
      } as any);
      return;
    }

    const headers: Record<string, string> = {
      'Accept': 'application/vnd.github.v3+json',
      'User-Agent': 'CipherGuard-Scanner',
    };

    if (username && password) {
      headers['Authorization'] = 'Basic ' + Buffer.from(`${username}:${password}`).toString('base64');
    }

    const apiBase = `https://api.github.com/repos/${owner}/${repo}`;

    const treeRes = await fetch(`${apiBase}/git/trees/${branch}?recursive=1`, { headers });

    if (!treeRes.ok) {
      const errText = await treeRes.text();
      await storage.updateGithubRepo(repoId, {
        status: "failed",
        lastScanAt: new Date(),
        scanResults: { error: `GitHub API error (${treeRes.status}): ${errText}` },
      } as any);
      return;
    }

    const treeData = await treeRes.json() as any;
    const allFiles = (treeData.tree || []).filter((f: any) => f.type === 'blob');

    const codeExtensions = ['.js', '.ts', '.jsx', '.tsx', '.py', '.java', '.go', '.rs', '.c', '.cpp', '.h', '.hpp', '.cs', '.rb', '.php', '.swift', '.kt', '.scala', '.yml', '.yaml', '.json', '.toml', '.xml', '.conf', '.cfg', '.ini', '.env', '.sh', '.bash', '.ps1', '.tf', '.hcl'];
    const codeFiles = allFiles.filter((f: any) => {
      const ext = path.extname(f.path).toLowerCase();
      return codeExtensions.includes(ext);
    });

    const findings: Array<{ file: string; line?: number; algorithm: string; type: string; severity: string; pqcReady: boolean }> = [];
    const filesToScan = codeFiles.slice(0, 100);

    for (const file of filesToScan) {
      try {
        const contentRes = await fetch(`${apiBase}/contents/${file.path}?ref=${branch}`, { headers });
        if (!contentRes.ok) continue;

        const contentData = await contentRes.json() as any;
        if (contentData.encoding !== 'base64' || !contentData.content) continue;

        const content = Buffer.from(contentData.content, 'base64').toString('utf-8');
        const lines = content.split('\n');

        for (let lineNum = 0; lineNum < lines.length; lineNum++) {
          const line = lines[lineNum];
          for (const cp of CRYPTO_PATTERNS) {
            cp.pattern.lastIndex = 0;
            if (cp.pattern.test(line)) {
              const alreadyFound = findings.some(f => f.file === file.path && f.algorithm === cp.algorithm);
              if (!alreadyFound) {
                findings.push({
                  file: file.path,
                  line: lineNum + 1,
                  algorithm: cp.algorithm,
                  type: cp.type,
                  severity: cp.severity,
                  pqcReady: cp.pqcReady,
                });
              }
            }
          }
        }
      } catch {
        // skip file on error
      }
    }

    await storage.updateGithubRepo(repoId, {
      status: "completed",
      lastScanAt: new Date(),
      scanResults: {
        totalFiles: allFiles.length,
        cryptoFiles: new Set(findings.map(f => f.file)).size,
        findings,
      },
    } as any);
  } catch (err: any) {
    await storage.updateGithubRepo(repoId, {
      status: "failed",
      lastScanAt: new Date(),
      scanResults: { error: err.message || "Unknown error during scan" },
    } as any);
  }
}

function matchComponentToPolicy(
  component: CbomComponent,
  policy: SecurityPolicy
): { matched: boolean; violations: string[] } {
  const violations: string[] = [];
  const compName = (component.name || "").toUpperCase();
  const compType = (component.componentType || "").toLowerCase();

  const assetTypeMatches: Record<string, string[]> = {
    mobile_devices: ["mobile", "android", "ios", "device"],
    removable_media: ["usb", "removable", "portable", "external"],
    servers_storage: ["server", "storage", "database", "algorithm", "library"],
    email: ["email", "smtp", "imap", "mail", "s/mime"],
    wireless_networks: ["wireless", "wifi", "wpa", "wep", "802.11"],
    data_in_transit: ["tls", "ssl", "transport", "vpn", "ipsec", "https", "algorithm"],
    backup_media: ["backup", "archive", "tape"],
    databases: ["database", "db", "sql", "nosql", "algorithm"],
    cloud_services: ["cloud", "saas", "paas", "iaas"],
    iot_devices: ["iot", "sensor", "embedded", "scada"],
    custom: [],
  };

  const categoryKeywords = assetTypeMatches[policy.assetCategory] || [];
  const isRelevant = categoryKeywords.length === 0 || categoryKeywords.some(kw =>
    compName.toLowerCase().includes(kw) || compType.includes(kw)
  );

  if (!isRelevant) {
    return { matched: false, violations: [] };
  }

  if (policy.allowedAlgorithms && policy.allowedAlgorithms.length > 0) {
    const allowed = policy.allowedAlgorithms.some(alg =>
      compName.includes(alg.toUpperCase())
    );
    if (!allowed && compType === "algorithm") {
      violations.push(`Algorithm "${component.name}" is not in the allowed list: ${policy.allowedAlgorithms.join(", ")}`);
    }
  }

  if (policy.prohibitedAlgorithms && policy.prohibitedAlgorithms.length > 0) {
    const prohibited = policy.prohibitedAlgorithms.find(alg =>
      compName.includes(alg.toUpperCase())
    );
    if (prohibited) {
      violations.push(`Algorithm "${component.name}" matches prohibited algorithm: ${prohibited}`);
    }
  }

  if (policy.minimumKeySize && component.nistQuantumSecurityLevel !== null) {
    const impliedKeySize = (component.nistQuantumSecurityLevel || 0) * 64;
    if (impliedKeySize < policy.minimumKeySize) {
      violations.push(`Key size (estimated ${impliedKeySize}-bit from NIST Level ${component.nistQuantumSecurityLevel}) is below minimum ${policy.minimumKeySize}-bit`);
    }
  }

  if (policy.minimumNistLevel && policy.minimumNistLevel > 0) {
    const compLevel = component.nistQuantumSecurityLevel || 0;
    if (compLevel < policy.minimumNistLevel && compType === "algorithm") {
      violations.push(`NIST Quantum Security Level ${compLevel} is below required minimum Level ${policy.minimumNistLevel}`);
    }
  }

  if (policy.pqcRequired) {
    const pqcAlgorithms = ["ML-KEM", "KYBER", "ML-DSA", "DILITHIUM", "SPHINCS", "FALCON", "XMSS", "LMS"];
    const isPqc = pqcAlgorithms.some(alg => compName.includes(alg));
    const isSymmetric = ["AES", "SHA", "HMAC", "CHACHA", "BLAKE"].some(alg => compName.includes(alg));

    if (!isPqc && !isSymmetric && compType === "algorithm") {
      violations.push(`Post-quantum cryptography is required but "${component.name}" is not a PQC algorithm`);
    }
  }

  return { matched: true, violations };
}

// ==================== RFC 5424 Parser ====================

interface Rfc5424Record {
  priority: number;
  version: number;
  timestamp: string;
  hostname: string;
  appName: string;
  procId: string;
  msgId: string;
  structuredData: Record<string, Record<string, string>>;
  message: string;
}

function parseRfc5424Line(line: string): Rfc5424Record | null {
  const match = line.match(/^<(\d+)>(\d+) (\S+) (\S+) (\S+) (\S+) (\S+) ((?:\[.*?\])*|-) (.*)$/s);
  if (!match) return null;

  const [, pri, ver, ts, host, app, pid, msgid, sdRaw, msg] = match;
  const structuredData: Record<string, Record<string, string>> = {};

  // Parse all [SDID key="val" ...] blocks
  const sdBlockRegex = /\[([^\s\]]+)((?:\s+[^\s=]+="[^"]*")*)\]/g;
  let sdMatch: RegExpExecArray | null;
  while ((sdMatch = sdBlockRegex.exec(sdRaw)) !== null) {
    const sdId = sdMatch[1];
    const params: Record<string, string> = {};
    const paramRegex = /([^\s=]+)="([^"]*)"/g;
    let paramMatch: RegExpExecArray | null;
    while ((paramMatch = paramRegex.exec(sdMatch[2])) !== null) {
      params[paramMatch[1]] = paramMatch[2];
    }
    structuredData[sdId] = params;
  }

  return {
    priority: Number(pri),
    version: Number(ver),
    timestamp: ts,
    hostname: host,
    appName: app,
    procId: pid,
    msgId: msgid,
    structuredData,
    message: msg,
  };
}

function assessCryptoRisk(cipher: string, protocol: string, keyExchange: string, sigAlg: string): string {
  const weak = ["3DES", "RC4", "DES", "SHA1", "MD5", "sha1With", "TLS_RSA_WITH_3DES"];
  const legacy = ["TLS_RSA_WITH_AES", "TLS 1.0", "TLS_RSA"];
  if (weak.some(w => cipher.includes(w) || sigAlg.includes(w) || protocol.includes(w) || cipher.toUpperCase().includes(w.toUpperCase()))) return "high";
  if (legacy.some(l => cipher.includes(l) || keyExchange === "RSA") || protocol === "1.0" || protocol === "1.1") return "high";
  if (protocol === "1.2" || keyExchange === "ECDHE" || keyExchange === "RSA") return "medium";
  return "low";
}

async function ingestRfc5424File(filePath: string, scriptName: string): Promise<{
  cbomFileId: number;
  recordsProcessed: number;
  servicesFound: number;
  cbomJson: any;
  summary: string;
}> {
  const content = await fs.readFile(filePath, "utf-8");
  const lines = content.split("\n").filter(l => l.trim());

  const records: Rfc5424Record[] = [];
  for (const line of lines) {
    const parsed = parseRfc5424Line(line.trim());
    if (parsed) records.push(parsed);
  }

  // Filter lines with cbom@32473 structured data
  const cbomRecords = records.filter(r => r.structuredData["cbom@32473"]);

  // Determine tenant from first gateway record
  const firstGw = records.find(r => r.structuredData["gateway@32473"]);
  const tenant = firstGw?.structuredData["gateway@32473"]?.tenant || "unknown";

  // Build CycloneDX 1.7 services array
  const services: any[] = [];
  for (const rec of cbomRecords) {
    const cbom = rec.structuredData["cbom@32473"];
    const gw = rec.structuredData["gateway@32473"] || {};

    const assetName = cbom.asset_name || rec.appName;
    const protocol = cbom.crypto_protocol || "unknown";
    const protocolVersion = cbom.crypto_protocol_version || "";
    const cipherSuite = cbom.crypto_cipher_suite || "";
    const keyExchange = cbom.crypto_key_exchange || "";
    const authentication = cbom.crypto_authentication || "";
    const sigAlg = cbom.crypto_certificate_signature_algorithm || "";
    const bomRef = cbom.asset_bom_ref || `urn:cbom:service:${assetName}`;
    const risk = assessCryptoRisk(cipherSuite, protocolVersion, keyExchange, sigAlg);

    const properties: any[] = [
      { name: "cbom:asset:type", value: cbom.cyclonedx_component_type || "service" },
      { name: "cbom:crypto:protocol", value: protocol },
      { name: "cbom:crypto:protocolVersion", value: protocolVersion },
      { name: "cbom:crypto:cipherSuite", value: cipherSuite },
      { name: "cbom:crypto:keyExchange", value: keyExchange },
      { name: "cbom:crypto:authentication", value: authentication },
      { name: "cbom:crypto:certificate:signatureAlgorithm", value: sigAlg },
      { name: "cbom:crypto:materialState", value: "active" },
      { name: "cbom:crypto:observationSource", value: "gateway-telemetry" },
      { name: "cbom:telemetry:gatewayApp", value: rec.appName },
      { name: "cbom:telemetry:gatewayPid", value: rec.procId },
      { name: "cbom:telemetry:gatewayMsgId", value: rec.msgId },
      { name: "cbom:telemetry:zone", value: gw.zone || "" },
      { name: "cbom:telemetry:srcIp", value: gw.src_ip || "" },
      { name: "cbom:telemetry:dstIp", value: gw.dst_ip || "" },
      { name: "cbom:telemetry:dstPort", value: gw.dst_port || "" },
      { name: "cbom:telemetry:eventMessage", value: rec.message },
      { name: "cbom:risk:rating", value: risk },
      { name: "cbom:parser:sourceFormat", value: "RFC5424" },
      { name: "cbom:parser:sdid", value: "cbom@32473" },
    ];

    const dstIp = gw.dst_ip || "";
    const dstPort = gw.dst_port || "443";
    services.push({
      "bom-ref": bomRef,
      group: tenant,
      name: assetName,
      version: `observed-${rec.timestamp.split("T")[0]}`,
      provider: { name: tenant },
      endpoints: dstIp ? [`${dstIp}:${dstPort}`] : [],
      authenticated: true,
      "x-trust-boundary": true,
      properties,
    });
  }

  const serialNumber = `urn:uuid:${crypto.randomUUID()}`;
  const nowIso = new Date().toISOString();
  const cbomJson: any = {
    $schema: "http://cyclonedx.org/schema/bom-1.7.schema.json",
    bomFormat: "CycloneDX",
    specVersion: "1.7",
    serialNumber,
    version: 1,
    metadata: {
      timestamp: nowIso,
      lifecycles: [{ phase: "operations" }],
      tools: {
        components: [{
          type: "application",
          name: "CipherGuard RFC5424 Ingestion",
          version: "1.0.0",
        }],
      },
      component: {
        type: "platform",
        name: scriptName,
        version: new Date().toISOString().split("T")[0],
        description: `CycloneDX 1.7 CBOM derived from RFC 5424 syslog ingestion. Source: ${filePath}`,
      },
      properties: [
        { name: "cbom:profile", value: "log-ingestion" },
        { name: "cbom:source:type", value: "syslog" },
        { name: "cbom:source:format", value: "RFC5424" },
        { name: "cbom:source:file", value: filePath },
        { name: "cbom:tenant", value: tenant },
      ],
    },
    services,
  };

  // Save to CBOM Manager
  const filename = `rfc5424-${scriptName.replace(/\s+/g, "-").toLowerCase()}-${Date.now()}.json`;
  const cbomFile = await storage.createCbomFile({
    filename,
    componentCount: services.length,
    metadata: {
      bomFormat: "CycloneDX",
      specVersion: "1.7",
      serialNumber,
      version: 1,
    },
  });

  // Save each service as a CBOM component
  for (const svc of services) {
    const cbom = cbomRecords.find(r => (r.structuredData["cbom@32473"]?.asset_bom_ref || `urn:cbom:service:${r.structuredData["cbom@32473"]?.asset_name}`) === svc["bom-ref"]);
    const cbomData = cbom?.structuredData["cbom@32473"] || {};
    const risk = svc.properties.find((p: any) => p.name === "cbom:risk:rating")?.value || "low";

    // Map risk to nistQuantumSecurityLevel proxy (for display purposes)
    const riskToLevel: Record<string, number> = { low: 3, medium: 2, high: 1 };

    await storage.createCbomComponent({
      fileId: cbomFile.id,
      bomRef: svc["bom-ref"],
      componentType: "service",
      name: svc.name,
      version: svc.version,
      description: cbomData.crypto_cipher_suite ? `${cbomData.crypto_protocol || ""} ${cbomData.crypto_protocol_version || ""} - ${cbomData.crypto_cipher_suite || ""}`.trim() : svc.name,
      algorithmMode: cbomData.crypto_cipher_suite || null,
      primitiveType: cbomData.crypto_protocol || null,
      parameterSetIdentifier: cbomData.crypto_key_exchange || null,
      curve: cbomData.crypto_key_exchange?.includes("25519") ? "X25519" : cbomData.crypto_key_exchange?.includes("ECDH") ? "P-256" : null,
      nistQuantumSecurityLevel: riskToLevel[risk] || null,
      rawData: svc,
    });
  }

  const riskCounts = { high: 0, medium: 0, low: 0 };
  for (const svc of services) {
    const risk = (svc.properties.find((p: any) => p.name === "cbom:risk:rating")?.value || "low") as keyof typeof riskCounts;
    if (riskCounts[risk] !== undefined) riskCounts[risk]++;
  }

  const summary = [
    `RFC 5424 ingestion complete.`,
    `Records processed: ${records.length}`,
    `Services extracted: ${services.length}`,
    `Risk: ${riskCounts.high} high, ${riskCounts.medium} medium, ${riskCounts.low} low`,
    `CBOM saved as: ${filename} (ID: ${cbomFile.id})`,
    `Tenant: ${tenant}`,
  ].join("\n");

  return { cbomFileId: cbomFile.id, recordsProcessed: records.length, servicesFound: services.length, cbomJson, summary };
}

// Helper function to execute a script command
async function executeScript(command: string, executionId: number, outputPath?: string | null) {
  try {
    // Get all variables to substitute into command
    const variables = await storage.getVariables();
    let processedCommand = command;
    
    // Replace ${VAR_NAME} patterns with actual values
    for (const variable of variables) {
      const pattern = new RegExp(`\\$\\{${variable.name}\\}`, 'g');
      processedCommand = processedCommand.replace(pattern, variable.value);
    }

    const { stdout, stderr } = await execPromise(processedCommand, {
      timeout: 300000, // 5 minute timeout
      maxBuffer: 10 * 1024 * 1024, // 10MB buffer
    });

    // Write output to file if outputPath is specified
    if (outputPath && stdout) {
      try {
        // Create directory if it doesn't exist
        await fs.mkdir(outputPath, { recursive: true });
        
        // Create filename with timestamp
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const filename = path.join(outputPath, `script_output_${executionId}_${timestamp}.txt`);
        await fs.writeFile(filename, stdout, 'utf-8');
      } catch (writeErr) {
        console.error('Failed to write output to file:', writeErr);
      }
    }

    await storage.updateExecution(executionId, {
      status: "success",
      output: stdout,
      errorOutput: stderr || null,
      exitCode: 0,
      completedAt: new Date(),
    });
  } catch (err: any) {
    await storage.updateExecution(executionId, {
      status: err.killed ? "timeout" : "failed",
      output: err.stdout || null,
      errorOutput: err.stderr || err.message,
      exitCode: err.code || 1,
      completedAt: new Date(),
    });
  }
}

// Calculate next run time for a schedule
function calculateNextRun(schedule: any): Date | null {
  if (!schedule.isEnabled) return null;
  
  const now = new Date();
  const times = schedule.times || [];
  
  if (schedule.scheduleType === "daily" || schedule.scheduleType === "specific_times") {
    // Find next time today or tomorrow
    for (const timeStr of times) {
      const [hours, minutes] = timeStr.split(':').map(Number);
      const candidate = new Date(now);
      candidate.setHours(hours, minutes, 0, 0);
      
      if (candidate > now) {
        return candidate;
      }
    }
    
    // Try tomorrow
    if (times.length > 0) {
      const [hours, minutes] = times[0].split(':').map(Number);
      const tomorrow = new Date(now);
      tomorrow.setDate(tomorrow.getDate() + 1);
      tomorrow.setHours(hours, minutes, 0, 0);
      return tomorrow;
    }
  } else if (schedule.scheduleType === "specific_date") {
    const specificDates = schedule.specificDates || [];
    for (const dateStr of specificDates) {
      const candidate = new Date(dateStr);
      if (times.length > 0) {
        const [hours, minutes] = times[0].split(':').map(Number);
        candidate.setHours(hours, minutes, 0, 0);
      }
      if (candidate > now) {
        return candidate;
      }
    }
  } else if (schedule.scheduleType === "days_of_week") {
    const daysOfWeek = schedule.daysOfWeek || [];
    
    for (let dayOffset = 0; dayOffset < 7; dayOffset++) {
      const candidate = new Date(now);
      candidate.setDate(candidate.getDate() + dayOffset);
      const dayOfWeek = candidate.getDay();
      
      if (daysOfWeek.includes(dayOfWeek)) {
        for (const timeStr of times) {
          const [hours, minutes] = timeStr.split(':').map(Number);
          candidate.setHours(hours, minutes, 0, 0);
          
          if (candidate > now) {
            return candidate;
          }
        }
      }
    }
  }
  
  return null;
}

// ============================================================
// Key Manager Routes
// ============================================================

const _SESSION_SECRET = process.env.SESSION_SECRET || "cipherguard-fallback-dev-secret-32c";
const KMS_MASTER_KEY = crypto.scryptSync(_SESSION_SECRET, "cipherguard-kms-v1", 32);

function encryptPrivateKey(keyMaterial: Buffer | Uint8Array): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", KMS_MASTER_KEY, iv);
  const enc = Buffer.concat([cipher.update(Buffer.from(keyMaterial)), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString("hex")}:${tag.toString("hex")}:${enc.toString("hex")}`;
}

async function doGenerateKey(algorithm: string): Promise<{
  publicKey: string | null;
  privateKeyEncrypted: string;
  keyType: string;
  keyLength: number | null;
  nistQuantumSecurityLevel: number | null;
  isPqc: boolean;
}> {
  let publicKey: string | null = null;
  let privateKeyEncrypted = "";
  let keyType = "keypair";
  let keyLength: number | null = null;
  let nistLevel: number | null = null;
  let isPqc = false;

  if (algorithm === "AES-256-GCM") {
    const key = crypto.generateKeySync("aes", { length: 256 });
    privateKeyEncrypted = encryptPrivateKey(key.export() as Buffer);
    keyType = "symmetric"; keyLength = 256;
  } else if (algorithm === "AES-128-GCM") {
    const key = crypto.generateKeySync("aes", { length: 128 });
    privateKeyEncrypted = encryptPrivateKey(key.export() as Buffer);
    keyType = "symmetric"; keyLength = 128;
  } else if (algorithm === "RSA-2048") {
    const { publicKey: pub, privateKey: priv } = crypto.generateKeyPairSync("rsa", {
      modulusLength: 2048,
      publicKeyEncoding: { type: "spki", format: "pem" },
      privateKeyEncoding: { type: "pkcs8", format: "pem" },
    });
    publicKey = pub; privateKeyEncrypted = encryptPrivateKey(Buffer.from(priv, "utf8")); keyLength = 2048;
  } else if (algorithm === "RSA-4096") {
    const { publicKey: pub, privateKey: priv } = crypto.generateKeyPairSync("rsa", {
      modulusLength: 4096,
      publicKeyEncoding: { type: "spki", format: "pem" },
      privateKeyEncoding: { type: "pkcs8", format: "pem" },
    });
    publicKey = pub; privateKeyEncrypted = encryptPrivateKey(Buffer.from(priv, "utf8")); keyLength = 4096;
  } else if (algorithm === "ECDH-P256") {
    const { publicKey: pub, privateKey: priv } = crypto.generateKeyPairSync("ec", {
      namedCurve: "P-256",
      publicKeyEncoding: { type: "spki", format: "pem" },
      privateKeyEncoding: { type: "pkcs8", format: "pem" },
    });
    publicKey = pub; privateKeyEncrypted = encryptPrivateKey(Buffer.from(priv, "utf8")); keyLength = 256;
  } else if (algorithm === "ECDH-P384") {
    const { publicKey: pub, privateKey: priv } = crypto.generateKeyPairSync("ec", {
      namedCurve: "P-384",
      publicKeyEncoding: { type: "spki", format: "pem" },
      privateKeyEncoding: { type: "pkcs8", format: "pem" },
    });
    publicKey = pub; privateKeyEncrypted = encryptPrivateKey(Buffer.from(priv, "utf8")); keyLength = 384;
  } else if (algorithm === "Ed25519") {
    const { publicKey: pub, privateKey: priv } = crypto.generateKeyPairSync("ed25519", {
      publicKeyEncoding: { type: "spki", format: "pem" },
      privateKeyEncoding: { type: "pkcs8", format: "pem" },
    });
    publicKey = pub; privateKeyEncrypted = encryptPrivateKey(Buffer.from(priv, "utf8")); keyLength = 256;
  } else if (algorithm === "ML-KEM-768") {
    const { mlkem768 } = await import("@noble/post-quantum/ml-kem");
    const kp = mlkem768.keygen();
    publicKey = Buffer.from(kp.publicKey).toString("base64");
    privateKeyEncrypted = encryptPrivateKey(Buffer.from(kp.secretKey));
    isPqc = true; nistLevel = 3; keyLength = 768;
  } else if (algorithm === "ML-KEM-1024") {
    const { mlkem1024 } = await import("@noble/post-quantum/ml-kem");
    const kp = mlkem1024.keygen();
    publicKey = Buffer.from(kp.publicKey).toString("base64");
    privateKeyEncrypted = encryptPrivateKey(Buffer.from(kp.secretKey));
    isPqc = true; nistLevel = 5; keyLength = 1024;
  } else if (algorithm === "ML-DSA-65") {
    const { mldsa65 } = await import("@noble/post-quantum/ml-dsa");
    const kp = mldsa65.keygen();
    publicKey = Buffer.from(kp.publicKey).toString("base64");
    privateKeyEncrypted = encryptPrivateKey(Buffer.from(kp.secretKey));
    isPqc = true; nistLevel = 3; keyLength = 1952;
  } else if (algorithm === "ML-DSA-87") {
    const { mldsa87 } = await import("@noble/post-quantum/ml-dsa");
    const kp = mldsa87.keygen();
    publicKey = Buffer.from(kp.publicKey).toString("base64");
    privateKeyEncrypted = encryptPrivateKey(Buffer.from(kp.secretKey));
    isPqc = true; nistLevel = 5; keyLength = 2592;
  } else if (algorithm === "SLH-DSA-SHA2-128s") {
    const { slh_dsa_sha2_128s } = await import("@noble/post-quantum/slh-dsa");
    const kp = slh_dsa_sha2_128s.keygen();
    publicKey = Buffer.from(kp.publicKey).toString("base64");
    privateKeyEncrypted = encryptPrivateKey(Buffer.from(kp.secretKey));
    isPqc = true; nistLevel = 1; keyLength = 64;
  } else {
    throw new Error(`Unknown algorithm: ${algorithm}`);
  }

  return { publicKey, privateKeyEncrypted, keyType, keyLength, nistQuantumSecurityLevel: nistLevel, isPqc };
}

function keyRoutes(app: Express) {
  // List keys (strip private key material)
  app.get("/api/keys", requireAuth, async (req, res) => {
    try {
      const keys = await storage.getCryptoKeys();
      const safe = keys.map(({ privateKeyEncrypted, ...k }) => k);
      res.json(safe);
    } catch {
      res.status(500).json({ message: "Failed to fetch keys" });
    }
  });

  // Generate new key
  app.post("/api/keys/generate", requireAuth, async (req, res) => {
    try {
      const parsed = generateKeySchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ message: parsed.error.errors[0]?.message });

      const { name, algorithm, purpose, expiresAt, tags } = parsed.data;
      const generated = await doGenerateKey(algorithm);

      const key = await storage.createCryptoKey({
        name,
        algorithm,
        purpose,
        keyType: generated.keyType,
        status: "pre-active",
        publicKey: generated.publicKey,
        privateKeyEncrypted: generated.privateKeyEncrypted,
        keyLength: generated.keyLength,
        isPqc: generated.isPqc,
        nistQuantumSecurityLevel: generated.nistQuantumSecurityLevel,
        expiresAt: expiresAt ? new Date(expiresAt) : null,
        tags: tags || [],
        createdBy: (req.session as any)?.userId ?? null,
      } as any);

      await storage.createKeyAuditEntry({
        keyId: key.id,
        keyName: key.name,
        action: "generated",
        performedBy: (req.session as any)?.userId ?? null,
        performedByEmail: (req.session as any)?.userEmail ?? null,
        details: { algorithm, purpose, isPqc: generated.isPqc, nistLevel: generated.nistQuantumSecurityLevel },
      });

      const { privateKeyEncrypted: _enc, ...safeKey } = key;
      res.status(201).json(safeKey);
    } catch (err: any) {
      console.error("Key generation error:", err);
      res.status(500).json({ message: err.message || "Key generation failed" });
    }
  });

  // Activate
  app.patch("/api/keys/:id/activate", requireAuth, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const key = await storage.getCryptoKey(id);
      if (!key) return res.status(404).json({ message: "Key not found" });
      const updated = await storage.updateCryptoKey(id, { status: "active", activatedAt: new Date() } as any);
      await storage.createKeyAuditEntry({ keyId: id, keyName: key.name, action: "activated",
        performedBy: (req.session as any)?.userId ?? null, performedByEmail: (req.session as any)?.userEmail ?? null,
        details: { previousStatus: key.status } });
      const { privateKeyEncrypted: _, ...safe } = updated!;
      res.json(safe);
    } catch { res.status(500).json({ message: "Failed to activate key" }); }
  });

  // Suspend
  app.patch("/api/keys/:id/suspend", requireAuth, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const key = await storage.getCryptoKey(id);
      if (!key) return res.status(404).json({ message: "Key not found" });
      const updated = await storage.updateCryptoKey(id, { status: "suspended" } as any);
      await storage.createKeyAuditEntry({ keyId: id, keyName: key.name, action: "suspended",
        performedBy: (req.session as any)?.userId ?? null, performedByEmail: (req.session as any)?.userEmail ?? null,
        details: { previousStatus: key.status } });
      const { privateKeyEncrypted: _, ...safe } = updated!;
      res.json(safe);
    } catch { res.status(500).json({ message: "Failed to suspend key" }); }
  });

  // Revoke
  app.patch("/api/keys/:id/revoke", requireAuth, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const key = await storage.getCryptoKey(id);
      if (!key) return res.status(404).json({ message: "Key not found" });
      const updated = await storage.updateCryptoKey(id, { status: "deactivated", revokedAt: new Date() } as any);
      await storage.createKeyAuditEntry({ keyId: id, keyName: key.name, action: "revoked",
        performedBy: (req.session as any)?.userId ?? null, performedByEmail: (req.session as any)?.userEmail ?? null,
        details: { previousStatus: key.status } });
      const { privateKeyEncrypted: _, ...safe } = updated!;
      res.json(safe);
    } catch { res.status(500).json({ message: "Failed to revoke key" }); }
  });

  // Destroy (wipe key material)
  app.delete("/api/keys/:id/destroy", requireAuth, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const key = await storage.getCryptoKey(id);
      if (!key) return res.status(404).json({ message: "Key not found" });
      await storage.updateCryptoKey(id, { status: "destroyed", privateKeyEncrypted: null,
        publicKey: null, destroyedAt: new Date() } as any);
      await storage.createKeyAuditEntry({ keyId: id, keyName: key.name, action: "destroyed",
        performedBy: (req.session as any)?.userId ?? null, performedByEmail: (req.session as any)?.userEmail ?? null,
        details: { algorithm: key.algorithm, keyMaterialDeleted: true } });
      res.status(204).end();
    } catch { res.status(500).json({ message: "Failed to destroy key" }); }
  });

  // Export public key
  app.get("/api/keys/:id/export-public", requireAuth, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const key = await storage.getCryptoKey(id);
      if (!key) return res.status(404).json({ message: "Key not found" });
      if (!key.publicKey) return res.status(400).json({ message: "No public key available" });
      await storage.createKeyAuditEntry({ keyId: id, keyName: key.name, action: "exported",
        performedBy: (req.session as any)?.userId ?? null, performedByEmail: (req.session as any)?.userEmail ?? null,
        details: { format: "public-only" } });
      res.json({ publicKey: key.publicKey, algorithm: key.algorithm, name: key.name });
    } catch { res.status(500).json({ message: "Failed to export public key" }); }
  });

  // Audit log
  app.get("/api/keys/audit", requireAuth, async (req, res) => {
    try {
      const keyId = req.query.keyId ? parseInt(req.query.keyId as string) : undefined;
      const log = await storage.getKeyAuditLog(keyId);
      res.json(log);
    } catch { res.status(500).json({ message: "Failed to fetch audit log" }); }
  });

  // ---- Azure Key Vault ----
  function extractVaultName(vaultUrl: string): string {
    const match = vaultUrl.match(/https?:\/\/([^.]+)\.vault\.azure\.net/i);
    if (!match) throw new Error("Invalid vault URL. Expected: https://<name>.vault.azure.net");
    return match[1];
  }

  app.get("/api/keys/azure/connections", requireAuth, async (req, res) => {
    try { res.json(await storage.getAzureKvConnections()); }
    catch { res.status(500).json({ message: "Failed to fetch connections" }); }
  });

  app.post("/api/keys/azure/connections", requireAuth, async (req, res) => {
    try {
      const parsed = insertAzureKvSchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ message: parsed.error.errors[0]?.message });
      const conn = await storage.createAzureKvConnection(parsed.data as any);
      res.status(201).json(conn);
    } catch { res.status(500).json({ message: "Failed to create connection" }); }
  });

  app.delete("/api/keys/azure/connections/:id", requireAuth, async (req, res) => {
    try {
      await storage.deleteAzureKvConnection(parseInt(req.params.id));
      res.status(204).end();
    } catch { res.status(500).json({ message: "Failed to delete connection" }); }
  });

  app.post("/api/keys/azure/connections/:id/test", requireAuth, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const conn = await storage.getAzureKvConnection(id);
      if (!conn) return res.status(404).json({ message: "Connection not found" });
      const vaultName = extractVaultName(conn.vaultUrl);
      const env: any = { ...process.env };
      if (conn.tenantId) env.AZURE_TENANT_ID = conn.tenantId;
      if (conn.clientId) env.AZURE_CLIENT_ID = conn.clientId;
      try {
        await execPromise(`az keyvault show --name "${vaultName}" --query "name" -o tsv`, { env });
        await storage.updateAzureKvConnection(id, { status: "connected", lastTestAt: new Date(), lastError: null } as any);
        res.json({ status: "connected", vaultName });
      } catch (cliErr: any) {
        const errMsg = (cliErr.stderr || cliErr.message || "Azure CLI error").substring(0, 300);
        await storage.updateAzureKvConnection(id, { status: "error", lastTestAt: new Date(), lastError: errMsg } as any);
        res.status(400).json({ message: errMsg });
      }
    } catch (err: any) { res.status(500).json({ message: err.message || "Test failed" }); }
  });

  app.get("/api/keys/azure/connections/:id/keys", requireAuth, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const conn = await storage.getAzureKvConnection(id);
      if (!conn) return res.status(404).json({ message: "Connection not found" });
      const vaultName = extractVaultName(conn.vaultUrl);
      const env: any = { ...process.env };
      if (conn.tenantId) env.AZURE_TENANT_ID = conn.tenantId;
      if (conn.clientId) env.AZURE_CLIENT_ID = conn.clientId;
      const result = await execPromise(`az keyvault key list --vault-name "${vaultName}" -o json`, { env });
      const raw: any[] = JSON.parse(result.stdout || "[]");
      const keys = raw.map((k: any) => ({
        name: k.name || (k.kid ? k.kid.split("/").pop() : "unknown"),
        keyType: k.keyType || k.key_type || null,
        enabled: k.attributes?.enabled ?? true,
        expires: k.attributes?.expires ?? null,
        created: k.attributes?.created ?? null,
        id: k.kid,
      }));
      res.json(keys);
    } catch (err: any) { res.status(500).json({ message: err.message || "Failed to list keys" }); }
  });

  app.post("/api/keys/azure/connections/:id/import-to-cbom", requireAuth, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const conn = await storage.getAzureKvConnection(id);
      if (!conn) return res.status(404).json({ message: "Connection not found" });
      const { keyName } = req.body;
      if (!keyName) return res.status(400).json({ message: "keyName required" });
      await storage.createKeyAuditEntry({
        keyId: null, keyName: `[Azure] ${keyName}`, action: "azure-imported",
        performedBy: (req.session as any)?.userId ?? null,
        performedByEmail: (req.session as any)?.userEmail ?? null,
        details: { vaultUrl: conn.vaultUrl, keyName, vaultName: conn.name },
      });
      res.json({ success: true, keyName, vault: conn.name });
    } catch { res.status(500).json({ message: "Failed to import key" }); }
  });

  // ── QMI (Quantum Migration Index) routes ────────────────────────────────────

  /** Helper: compute and format QMI score from factor values */
  function computeQmiScore(C: number, T: number, B: number, D: number, F: number): string {
    return calculateQmiScore(C, T, B, D, F).toFixed(4);
  }

  // List all assets with their QMI scores
  app.get("/api/qmi/assets", requireAuth, async (_req, res) => {
    try {
      const assets = await storage.getQmiAssets();
      res.json(assets);
    } catch (err: any) {
      res.status(500).json({ message: err.message || "Failed to fetch QMI assets" });
    }
  });

  // List all uploads (for the upload history panel)
  app.get("/api/qmi/uploads", requireAuth, async (_req, res) => {
    try {
      const uploads = await storage.getQmiUploads();
      res.json(uploads);
    } catch (err: any) {
      res.status(500).json({ message: err.message || "Failed to fetch QMI uploads" });
    }
  });

  // Manually create a single asset
  app.post("/api/qmi/assets", requireAuth, async (req, res) => {
    try {
      const data = createQmiAssetSchema.parse(req.body);
      const qmiScore = computeQmiScore(
        data.migrationCapacity!, data.timeRemaining!,
        data.migrationBurden!, data.dependencyDepth!, data.fragility!
      );
      const asset = await storage.createQmiAsset({ ...data, qmiScore } as InsertQmiAsset);
      res.status(201).json(asset);
    } catch (err: any) {
      if (err.name === "ZodError") return res.status(400).json({ message: err.errors });
      res.status(500).json({ message: err.message || "Failed to create QMI asset" });
    }
  });

  // Update an asset (enrich business context or adjust QMI factors)
  app.put("/api/qmi/assets/:id", requireAuth, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const existing = await storage.getQmiAsset(id);
      if (!existing) return res.status(404).json({ message: "Asset not found" });

      const data = updateQmiAssetSchema.parse(req.body);
      // Recompute score using merged factor values
      const C = data.migrationCapacity ?? existing.migrationCapacity ?? 5;
      const T = data.timeRemaining ?? existing.timeRemaining ?? 5;
      const B = data.migrationBurden ?? existing.migrationBurden ?? 5;
      const D = data.dependencyDepth ?? existing.dependencyDepth ?? 3;
      const F = data.fragility ?? existing.fragility ?? 3;
      const qmiScore = computeQmiScore(C, T, B, D, F);
      const updated = await storage.updateQmiAsset(id, { ...data, qmiScore } as Partial<InsertQmiAsset>);
      res.json(updated);
    } catch (err: any) {
      if (err.name === "ZodError") return res.status(400).json({ message: err.errors });
      res.status(500).json({ message: err.message || "Failed to update QMI asset" });
    }
  });

  // Delete an asset
  app.delete("/api/qmi/assets/:id", requireAuth, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      await storage.deleteQmiAsset(id);
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ message: err.message || "Failed to delete QMI asset" });
    }
  });

  /**
   * Upload a CycloneDX SBOM JSON file.
   * Body: multipart or JSON { filename: string, content: string (raw JSON text) }
   */
  app.post("/api/qmi/upload/sbom", requireAuth, async (req, res) => {
    try {
      const { filename, content } = req.body as { filename: string; content: string };
      if (!filename || !content) return res.status(400).json({ message: "filename and content required" });

      let parsed: Record<string, any>;
      try {
        parsed = JSON.parse(content);
      } catch {
        return res.status(400).json({ message: "Invalid JSON — could not parse SBOM file" });
      }

      const extracted = parseSbom(parsed);
      if (extracted.length === 0) {
        return res.status(422).json({ message: "No cryptographic assets found in SBOM" });
      }

      // Record the upload
      const upload = await storage.createQmiUpload({
        filename,
        uploadType: "sbom",
        assetsFound: extracted.length,
      });

      // Compute initial QMI scores and insert all extracted assets
      const toInsert: InsertQmiAsset[] = extracted.map(a => ({
        ...a,
        uploadId: upload.id,
        source: "sbom" as const,
        name: a.name ?? "Unknown",
        assetType: a.assetType ?? "other",
        migrationCapacity: a.migrationCapacity ?? 5,
        timeRemaining: a.timeRemaining ?? 5,
        migrationBurden: a.migrationBurden ?? 5,
        dependencyDepth: a.dependencyDepth ?? 3,
        fragility: a.fragility ?? 3,
        qmiScore: computeQmiScore(
          a.migrationCapacity ?? 5, a.timeRemaining ?? 5,
          a.migrationBurden ?? 5, a.dependencyDepth ?? 3, a.fragility ?? 3
        ),
      }));

      const assets = await storage.createQmiAssets(toInsert);
      res.status(201).json({ upload, assets, count: assets.length });
    } catch (err: any) {
      res.status(500).json({ message: err.message || "SBOM upload failed" });
    }
  });

  /**
   * Upload a syslog file for crypto asset discovery.
   * Body: { filename: string, content: string (plain text syslog) }
   */
  app.post("/api/qmi/upload/syslog", requireAuth, async (req, res) => {
    try {
      const { filename, content } = req.body as { filename: string; content: string };
      if (!filename || !content) return res.status(400).json({ message: "filename and content required" });

      const extracted = parseSyslog(content);
      if (extracted.length === 0) {
        return res.status(422).json({ message: "No cryptographic events found in syslog" });
      }

      const upload = await storage.createQmiUpload({
        filename,
        uploadType: "syslog",
        assetsFound: extracted.length,
      });

      const toInsert: InsertQmiAsset[] = extracted.map(a => ({
        ...a,
        uploadId: upload.id,
        source: "syslog" as const,
        name: a.name ?? "Unknown",
        assetType: a.assetType ?? "other",
        migrationCapacity: a.migrationCapacity ?? 5,
        timeRemaining: a.timeRemaining ?? 5,
        migrationBurden: a.migrationBurden ?? 5,
        dependencyDepth: a.dependencyDepth ?? 3,
        fragility: a.fragility ?? 3,
        qmiScore: computeQmiScore(
          a.migrationCapacity ?? 5, a.timeRemaining ?? 5,
          a.migrationBurden ?? 5, a.dependencyDepth ?? 3, a.fragility ?? 3
        ),
      }));

      const assets = await storage.createQmiAssets(toInsert);
      res.status(201).json({ upload, assets, count: assets.length });
    } catch (err: any) {
      res.status(500).json({ message: err.message || "Syslog upload failed" });
    }
  });

  // ── Policy Asset Type Templates ────────────────────────────────────────────
  app.get("/api/policy-asset-types", requireAuth, async (_req, res) => {
    const rows = await storage.getPolicyAssetTypes();
    res.json(rows);
  });

  app.get("/api/policy-asset-types/:id", requireAuth, async (req, res) => {
    const row = await storage.getPolicyAssetType(Number(req.params.id));
    if (!row) return res.status(404).json({ message: "Not found" });
    res.json(row);
  });

  app.post("/api/policy-asset-types", requireAuth, async (req, res) => {
    try {
      const { createPolicyAssetTypeSchema } = await import("@shared/schema");
      const data = createPolicyAssetTypeSchema.parse(req.body);
      const row = await storage.createPolicyAssetType(data as any);
      res.status(201).json(row);
    } catch (err: any) {
      if (err?.code === "23505") {
        return res.status(409).json({ message: "An asset type with this name, type, and domain already exists." });
      }
      res.status(400).json({ message: err.message || "Validation failed" });
    }
  });

  app.put("/api/policy-asset-types/:id", requireAuth, async (req, res) => {
    try {
      const { updatePolicyAssetTypeSchema } = await import("@shared/schema");
      const data = updatePolicyAssetTypeSchema.parse(req.body);
      const row = await storage.updatePolicyAssetType(Number(req.params.id), data as any);
      if (!row) return res.status(404).json({ message: "Not found" });
      res.json(row);
    } catch (err: any) {
      if (err?.code === "23505") {
        return res.status(409).json({ message: "An asset type with this name, type, and domain already exists." });
      }
      res.status(400).json({ message: err.message || "Validation failed" });
    }
  });

  app.delete("/api/policy-asset-types/:id", requireAuth, async (req, res) => {
    await storage.deletePolicyAssetType(Number(req.params.id));
    res.status(204).end();
  });

  // Import QMI assets from an existing CBOM Manager file
  app.post("/api/qmi/import-from-cbom", requireAuth, async (req, res) => {
    try {
      const { cbomFileId } = req.body as { cbomFileId: number };
      if (!cbomFileId || isNaN(Number(cbomFileId))) {
        return res.status(400).json({ message: "cbomFileId is required" });
      }

      const cbomFile = await storage.getCbomFile(Number(cbomFileId));
      if (!cbomFile) return res.status(404).json({ message: "CBOM file not found" });

      const components = await storage.getCbomComponentsByFile(Number(cbomFileId));
      if (components.length === 0) {
        return res.status(422).json({ message: "No components found in this CBOM file" });
      }

      // Map CBOM componentType → QMI assetType
      const mapAssetType = (ct: string | null | undefined): string => {
        if (!ct) return "other";
        const l = ct.toLowerCase();
        if (l.includes("tls") || l.includes("protocol")) return "tls";
        if (l.includes("cert")) return "certificate";
        if (l.includes("ssh")) return "ssh";
        if (l.includes("vpn")) return "vpn";
        if (l.includes("hsm")) return "hsm";
        if (l.includes("kms") || l.includes("key-management")) return "kms";
        if (l.includes("app") || l.includes("library") || l.includes("service")) return "application";
        return "other";
      };

      // Derive algorithm string from available CBOM fields
      const deriveAlgorithm = (c: typeof components[0]): string => {
        const parts: string[] = [];
        if (c.name) parts.push(c.name);
        if (c.algorithmMode) parts.push(c.algorithmMode.toUpperCase());
        if (c.primitiveType && c.primitiveType !== c.name) parts.push(`(${c.primitiveType})`);
        return parts.join(" / ").slice(0, 120);
      };

      const upload = await storage.createQmiUpload({
        filename: `CBOM: ${cbomFile.filename}`,
        uploadType: "sbom",
        assetsFound: components.length,
      });

      const toInsert: InsertQmiAsset[] = components.map(c => ({
        uploadId: upload.id,
        source: "sbom" as const,
        name: c.name,
        assetType: mapAssetType(c.componentType),
        algorithm: deriveAlgorithm(c) || undefined,
        sourceRef: c.bomRef || undefined,
        migrationCapacity: 5,
        timeRemaining: 5,
        migrationBurden: 5,
        dependencyDepth: 3,
        fragility: 3,
        qmiScore: computeQmiScore(5, 5, 5, 3, 3),
      }));

      const assets = await storage.createQmiAssets(toInsert);
      res.status(201).json({ upload, assets, count: assets.length });
    } catch (err: any) {
      res.status(500).json({ message: err.message || "CBOM import failed" });
    }
  });
}

// Scheduler that runs every minute to check for due scripts
let schedulerInterval: NodeJS.Timeout | null = null;

function startScheduler() {
  if (schedulerInterval) return;
  
  console.log("Script scheduler started");
  
  schedulerInterval = setInterval(async () => {
    try {
      const now = new Date();
      const dueSchedules = await storage.getDueSchedules(now);
      
      for (const schedule of dueSchedules) {
        const script = await storage.getScript(schedule.scriptId);
        if (!script || !script.isEnabled) continue;
        
        // Create execution record
        const execution = await storage.createExecution({
          scriptId: schedule.scriptId,
          scheduleId: schedule.id,
          status: "running",
          triggeredBy: "scheduler",
        });
        
        // Execute script with output path
        executeScript(script.command, execution.id, script.outputPath);
        
        // Update schedule with next run time
        const nextRun = calculateNextRun(schedule);
        await storage.updateScheduleNextRun(schedule.id, nextRun, now);
      }
    } catch (err) {
      console.error("Scheduler error:", err);
    }
  }, 60000); // Check every minute
}
