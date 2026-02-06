import type { Express } from "express";
import type { Server } from "http";
import { storage } from "./storage";
import { api, cbomApi, scriptsApi, settingsApi, policiesApi, errorSchemas } from "@shared/routes";
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
  type CbomComponent, type SecurityPolicy
} from "@shared/schema";
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

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  
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

    // Execute script in background with output path
    executeScript(script.command, execution.id, script.outputPath);

    res.json(execution);
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
    const users = await storage.getUsers();
    res.json(users);
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
    
    const user = await storage.createUser(parsed.data);
    res.status(201).json(user);
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
    
    const user = await storage.updateUser(id, parsed.data);
    res.json(user);
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

  // Start scheduler
  startScheduler();

  return httpServer;
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
