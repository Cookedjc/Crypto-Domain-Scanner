/**
 * QMI Parser — extracts crypto assets from CycloneDX SBOM JSON and syslog files.
 * Each parser returns an array of partial QmiAsset records ready for database insertion.
 */

import type { InsertQmiAsset } from "@shared/schema";

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Infer the asset type from an algorithm/name string */
function inferAssetType(name: string, primitive?: string): InsertQmiAsset["assetType"] {
  const n = (name + " " + (primitive ?? "")).toLowerCase();
  if (n.includes("cert") || n.includes("x509") || n.includes("x.509")) return "certificate";
  if (n.includes("tls") || n.includes("ssl")) return "tls";
  if (n.includes("ssh")) return "ssh";
  if (n.includes("vpn") || n.includes("ipsec") || n.includes("ikev")) return "vpn";
  if (n.includes("hsm") || n.includes("pkcs11") || n.includes("pkcs#11")) return "hsm";
  if (n.includes("kms") || n.includes("key management")) return "kms";
  return "other";
}

/** Build a readable algorithm string from name + optional parameter (e.g. "RSA-2048") */
function buildAlgorithm(name: string, paramSetId?: string): string {
  if (!paramSetId) return name;
  // Avoid double-appending if the size is already in the name
  if (name.includes(paramSetId)) return name;
  return `${name}-${paramSetId}`;
}

/** Compute QMI = (C × T) / (B × D × F) — returns 0 when denominator is zero */
export function calculateQmiScore(C: number, T: number, B: number, D: number, F: number): number {
  if (B <= 0 || D <= 0 || F <= 0) return 0;
  return (C * T) / (B * D * F);
}

// ─── CycloneDX SBOM JSON parser ───────────────────────────────────────────────

interface CycloneDxComponent {
  type?: string;
  name?: string;
  version?: string;
  bom_ref?: string;
  "bom-ref"?: string;
  cryptoProperties?: {
    assetType?: string;
    algorithmProperties?: {
      primitive?: string;
      parameterSetIdentifier?: string;
      executionEnvironment?: string;
      implementationPlatform?: string;
    };
    certificateProperties?: {
      subjectName?: string;
      issuerName?: string;
      algorithm?: string;
    };
    protocolProperties?: {
      type?: string;
      version?: string;
      cipherSuites?: Array<{ name?: string; algorithms?: string[] }>;
    };
    relatedCryptoMaterialProperties?: {
      type?: string;
      size?: number;
      algorithm?: string;
    };
  };
  // Non-CycloneDX-crypto components may still have useful fields
  description?: string;
  purl?: string;
}

/**
 * Parse a CycloneDX BOM JSON object and return QMI asset records.
 * Handles both cryptographic-asset typed components and generic components
 * with crypto-relevant names.
 */
export function parseSbom(json: Record<string, any>): Partial<InsertQmiAsset>[] {
  const results: Partial<InsertQmiAsset>[] = [];

  // Support both top-level components array and metadata.component.components
  const components: CycloneDxComponent[] = [
    ...(Array.isArray(json.components) ? json.components : []),
    ...(Array.isArray(json.metadata?.component?.components) ? json.metadata.component.components : []),
  ];

  for (const comp of components) {
    const name = comp.name ?? "Unknown";
    const isCryptoAsset = comp.type === "cryptographic-asset";
    const cp = comp.cryptoProperties;

    if (!isCryptoAsset && !cp) {
      // Skip non-crypto components unless name looks cryptographic
      const nameLower = name.toLowerCase();
      const cryptoKeywords = ["rsa", "aes", "ecdsa", "ecdh", "ed25519", "sha", "tls", "ssl", "pgp", "gpg", "pkcs"];
      if (!cryptoKeywords.some(k => nameLower.includes(k))) continue;
    }

    let assetType: InsertQmiAsset["assetType"] = "other";
    let algorithm: string | undefined;
    let sourceRef: string | undefined;

    if (cp) {
      const cdxType = cp.assetType ?? "";
      const algProps = cp.algorithmProperties;
      const certProps = cp.certificateProperties;
      const protoProps = cp.protocolProperties;

      if (cdxType === "certificate" || certProps) {
        assetType = "certificate";
        algorithm = certProps?.algorithm ?? name;
        sourceRef = certProps?.subjectName ?? name;
      } else if (cdxType === "protocol" || protoProps) {
        const protoType = (protoProps?.type ?? "").toLowerCase();
        if (protoType.includes("tls") || protoType.includes("ssl")) assetType = "tls";
        else if (protoType.includes("ssh")) assetType = "ssh";
        else assetType = "tls";
        algorithm = protoProps?.type ?? name;
        // Include cipher suites as source reference if present
        const ciphers = protoProps?.cipherSuites?.map(c => c.name).filter(Boolean);
        sourceRef = ciphers?.length ? ciphers.join(", ") : name;
      } else if (cdxType === "algorithm" || algProps) {
        assetType = inferAssetType(name, algProps?.primitive);
        algorithm = buildAlgorithm(name, algProps?.parameterSetIdentifier);
        sourceRef = algProps?.executionEnvironment ?? undefined;
      } else if (cdxType === "related-crypto-material" || cp.relatedCryptoMaterialProperties) {
        const rcp = cp.relatedCryptoMaterialProperties;
        assetType = "other";
        algorithm = rcp?.algorithm ?? name;
        sourceRef = rcp?.type ?? undefined;
      } else {
        assetType = inferAssetType(name);
        algorithm = name;
      }
    } else {
      assetType = inferAssetType(name);
      algorithm = name;
      sourceRef = comp.purl ?? comp.description ?? undefined;
    }

    results.push({
      source: "sbom",
      name,
      assetType,
      algorithm,
      sourceRef,
      // Default QMI factors — users enrich these after import
      migrationCapacity: 5,
      timeRemaining: 5,
      migrationBurden: 5,
      dependencyDepth: 3,
      fragility: 3,
    });
  }

  return results;
}

// ─── Syslog parser ────────────────────────────────────────────────────────────

// Regex patterns to match cryptographic keywords in syslog lines
const SYSLOG_PATTERNS: Array<{
  type: InsertQmiAsset["assetType"];
  pattern: RegExp;
}> = [
  // SSH key exchange / host key
  { type: "ssh",        pattern: /\bsshd?\b|\bopenssh\b|\bkex\s+algorithm\b/i },
  // TLS/SSL handshakes and cipher suites
  { type: "tls",        pattern: /\btls[_\s]|ssl[_\s]|\bcipher\b.*(?:AES|RSA|ECDH|DHE|GCM|CBC)|\bhandshake\b/i },
  // Certificates (x509, certificate renewal, expiry)
  { type: "certificate",pattern: /\bcertificate?\b|\bx\.?509\b|\bcert\s+expir|\bOCSP\b|\bCA\b.*(?:sign|issue|renew)/i },
  // VPN and IPsec
  { type: "vpn",        pattern: /\bvpn\b|\bipsec\b|\bikev[12]\b|\bopenvpn\b|\bwireguard\b/i },
  // HSM / PKCS#11
  { type: "hsm",        pattern: /\bhsm\b|\bpkcs.?11\b|\btoken\s+\w+\s+(?:slot|label)\b/i },
  // KMS / key management
  { type: "kms",        pattern: /\bkms\b|\bkey.?management\b|\bsecretsmanager\b|\bvault\b.*key/i },
];

// Regexes to extract the algorithm name from a syslog line
const ALGORITHM_REGEXES = [
  // Common cipher suite patterns
  /cipher[=:\s]+([A-Z][A-Z0-9_\-]{3,40})/i,
  /using\s+(?:cipher\s+)?([A-Z][A-Z0-9_\-]{3,40})/i,
  // Key type/algorithm after "key" keyword
  /(?:host.?key|pub.?key|key.?type)\s*[=:\s]+([A-Za-z][A-Za-z0-9_\-]{2,30})/i,
  // TLS version
  /(TLSv\d+(?:\.\d+)?)/i,
  // Named algorithms
  /((?:RSA|ECDSA|ECDH|Ed25519|AES|3DES|DES|RC4|SHA\d*|MD5|DHE|ECDHE|ML-KEM|ML-DSA|FALCON|KYBER|DILITHIUM)[-\w]*)/,
];

/** Extract a service/process name from a standard syslog line */
function extractService(line: string): string | undefined {
  // Standard syslog format: "Month DD HH:MM:SS hostname process[pid]: message"
  const m = line.match(/^\w{3}\s+\d+\s+[\d:]+\s+\S+\s+(\S+?)(?:\[\d+\])?:/);
  return m?.[1]?.replace(/\[\d+\]$/, "");
}

/** Extract an algorithm string from a syslog line */
function extractAlgorithm(line: string): string | undefined {
  for (const re of ALGORITHM_REGEXES) {
    const m = line.match(re);
    if (m?.[1]) return m[1];
  }
  return undefined;
}

/**
 * Parse a syslog text string and return QMI asset records.
 * Deduplicates by (service + assetType + algorithm).
 */
export function parseSyslog(text: string): Partial<InsertQmiAsset>[] {
  const seen = new Set<string>();
  const results: Partial<InsertQmiAsset>[] = [];

  const lines = text.split("\n");
  for (const line of lines) {
    if (!line.trim()) continue;

    for (const { type, pattern } of SYSLOG_PATTERNS) {
      if (!pattern.test(line)) continue;

      const service = extractService(line) ?? "unknown";
      const algorithm = extractAlgorithm(line);
      const key = `${service}:${type}:${algorithm ?? ""}`;

      if (seen.has(key)) break; // Skip duplicates
      seen.add(key);

      const name = algorithm
        ? `${service} (${algorithm})`
        : `${service} [${type.toUpperCase()}]`;

      results.push({
        source: "syslog",
        name,
        assetType: type,
        algorithm: algorithm ?? undefined,
        sourceRef: service,
        migrationCapacity: 5,
        timeRemaining: 5,
        migrationBurden: 5,
        dependencyDepth: 3,
        fragility: 3,
      });
      break; // Only one type per line
    }
  }

  return results;
}
