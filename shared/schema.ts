import { pgTable, text, serial, integer, boolean, timestamp, jsonb, varchar } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const scans = pgTable("scans", {
  id: serial("id").primaryKey(),
  domain: text("domain").notNull(),
  port: integer("port").default(443).notNull(),
  isSubdomain: boolean("is_subdomain").default(false),
  score: integer("score"),
  grade: text("grade"),
  pqcStatus: text("pqc_status"), // "Ready", "Partial", "Not Ready"
  cipherName: text("cipher_name"),
  protocolVersion: text("protocol_version"),
  keyExchange: text("key_exchange"),
  rawOutput: text("raw_output"),
  details: jsonb("details").$type<{
    ciphers?: string[];
    certificate?: any;
    handshake?: any;
    vulnerabilities?: string[];
    kem?: string;
    error?: string;
    command?: string;
  }>(),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertScanSchema = createInsertSchema(scans).omit({ 
  id: true, 
  createdAt: true,
  score: true,
  grade: true,
  pqcStatus: true,
  cipherName: true,
  protocolVersion: true,
  keyExchange: true,
  details: true 
});

export type Scan = typeof scans.$inferSelect;
export type InsertScan = z.infer<typeof insertScanSchema>;

// API Request types
export const scanRequestSchema = z.object({
  domain: z.string().min(1),
  ports: z.array(z.number()).default([443]),
  scanSubdomains: z.boolean().default(false),
});

export type ScanRequest = z.infer<typeof scanRequestSchema>;

// CBOM validation schemas
export const cbomUploadSchema = z.object({
  filename: z.string().min(1, "Filename is required"),
  data: z.any(),
});

export const cbomDeduplicateSchema = z.object({
  fields: z.array(z.enum(["name", "componentType", "version", "oid", "primitiveType", "algorithmMode"])).min(1, "At least one field is required"),
});

export type CbomUploadRequest = z.infer<typeof cbomUploadSchema>;
export type CbomDeduplicateRequest = z.infer<typeof cbomDeduplicateSchema>;

// CBOM (Cryptographic Bill of Materials) - CycloneDX format
export const cbomFiles = pgTable("cbom_files", {
  id: serial("id").primaryKey(),
  filename: text("filename").notNull(),
  uploadedAt: timestamp("uploaded_at").defaultNow(),
  componentCount: integer("component_count").default(0),
  metadata: jsonb("metadata").$type<{
    bomFormat?: string;
    specVersion?: string;
    serialNumber?: string;
    version?: number;
  }>(),
});

export const cbomComponents = pgTable("cbom_components", {
  id: serial("id").primaryKey(),
  fileId: integer("file_id").notNull(),
  bomRef: text("bom_ref"),
  componentType: text("component_type"),
  name: text("name").notNull(),
  version: text("version"),
  description: text("description"),
  algorithmMode: text("algorithm_mode"),
  padding: text("padding"),
  cryptoFunctions: text("crypto_functions").array(),
  oid: text("oid"),
  primitiveType: text("primitive_type"),
  parameterSetIdentifier: text("parameter_set_identifier"),
  curve: text("curve"),
  executionEnvironment: text("execution_environment"),
  implementationPlatform: text("implementation_platform"),
  certificationLevel: text("certification_level").array(),
  nistQuantumSecurityLevel: integer("nist_quantum_security_level"),
  rawData: jsonb("raw_data"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertCbomFileSchema = createInsertSchema(cbomFiles).omit({
  id: true,
  uploadedAt: true,
});

export const insertCbomComponentSchema = createInsertSchema(cbomComponents).omit({
  id: true,
  createdAt: true,
});

export type CbomFile = typeof cbomFiles.$inferSelect;
export type InsertCbomFile = {
  filename: string;
  componentCount?: number | null;
  metadata?: {
    bomFormat?: string;
    specVersion?: string;
    serialNumber?: string;
    version?: number;
  } | null;
};
export type CbomComponent = typeof cbomComponents.$inferSelect;
export type InsertCbomComponent = typeof cbomComponents.$inferInsert;
