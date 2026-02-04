import type { Express } from "express";
import type { Server } from "http";
import { storage } from "./storage";
import { api, errorSchemas } from "@shared/routes";
import { z } from "zod";
import tls from "tls";
import dns from "dns/promises";
import { exec } from "child_process";
import { promisify } from "util";

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

  return httpServer;
}
