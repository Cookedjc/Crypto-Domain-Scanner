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

// Script Variables - stored credentials/tokens that can be used by scripts
export const scriptVariables = pgTable("script_variables", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  value: text("value").notNull(),
  description: text("description"),
  isSecret: boolean("is_secret").default(true),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Scheduled Scripts - bash commands or CLI scripts
export const scheduledScripts = pgTable("scheduled_scripts", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  description: text("description"),
  command: text("command").notNull(),
  outputPath: text("output_path"), // Directory path to write script results
  isEnabled: boolean("is_enabled").default(true),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Script Schedules - when scripts should run
export const scriptSchedules = pgTable("script_schedules", {
  id: serial("id").primaryKey(),
  scriptId: integer("script_id").notNull(),
  scheduleType: text("schedule_type").notNull(), // "daily", "specific_times", "specific_date"
  times: text("times").array(), // Array of times in HH:MM format (24-hour)
  specificDates: text("specific_dates").array(), // Array of dates in YYYY-MM-DD format
  daysOfWeek: integer("days_of_week").array(), // 0-6 for Sunday-Saturday
  isEnabled: boolean("is_enabled").default(true),
  lastRun: timestamp("last_run"),
  nextRun: timestamp("next_run"),
  createdAt: timestamp("created_at").defaultNow(),
});

// Script Executions - execution history/logs
export const scriptExecutions = pgTable("script_executions", {
  id: serial("id").primaryKey(),
  scriptId: integer("script_id").notNull(),
  scheduleId: integer("schedule_id"),
  status: text("status").notNull(), // "running", "success", "failed", "timeout"
  startedAt: timestamp("started_at").defaultNow(),
  completedAt: timestamp("completed_at"),
  output: text("output"),
  errorOutput: text("error_output"),
  exitCode: integer("exit_code"),
  triggeredBy: text("triggered_by").default("scheduler"), // "scheduler", "manual"
});

// Insert schemas
export const insertScriptVariableSchema = createInsertSchema(scriptVariables).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertScheduledScriptSchema = createInsertSchema(scheduledScripts).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertScriptScheduleSchema = createInsertSchema(scriptSchedules).omit({
  id: true,
  createdAt: true,
  lastRun: true,
  nextRun: true,
});

export const insertScriptExecutionSchema = createInsertSchema(scriptExecutions).omit({
  id: true,
  startedAt: true,
});

// Types
export type ScriptVariable = typeof scriptVariables.$inferSelect;
export type InsertScriptVariable = typeof scriptVariables.$inferInsert;
export type ScheduledScript = typeof scheduledScripts.$inferSelect;
export type InsertScheduledScript = typeof scheduledScripts.$inferInsert;
export type ScriptSchedule = typeof scriptSchedules.$inferSelect;
export type InsertScriptSchedule = typeof scriptSchedules.$inferInsert;
export type ScriptExecution = typeof scriptExecutions.$inferSelect;
export type InsertScriptExecution = typeof scriptExecutions.$inferInsert;

// API validation schemas
export const createScriptSchema = z.object({
  name: z.string().min(1, "Script name is required"),
  description: z.string().optional(),
  command: z.string().min(1, "Command is required"),
  outputPath: z.string().optional(),
  isEnabled: z.boolean().default(true),
});

export const updateScriptSchema = z.object({
  name: z.string().min(1, "Script name is required").optional(),
  description: z.string().optional(),
  command: z.string().min(1, "Command is required").optional(),
  outputPath: z.string().nullable().optional(),
  isEnabled: z.boolean().optional(),
});

export const createVariableSchema = z.object({
  name: z.string().min(1, "Variable name is required").regex(/^[A-Z_][A-Z0-9_]*$/i, "Variable name must be alphanumeric with underscores"),
  value: z.string().min(1, "Value is required"),
  description: z.string().optional(),
  isSecret: z.boolean().default(true),
});

export const createScheduleSchema = z.object({
  scriptId: z.number(),
  scheduleType: z.enum(["daily", "specific_times", "specific_date", "days_of_week"]),
  times: z.array(z.string().regex(/^([01]\d|2[0-3]):([0-5]\d)$/, "Time must be in HH:MM format")).optional(),
  specificDates: z.array(z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be in YYYY-MM-DD format")).optional(),
  daysOfWeek: z.array(z.number().min(0).max(6)).optional(),
  isEnabled: z.boolean().default(true),
});

export type CreateScriptRequest = z.infer<typeof createScriptSchema>;
export type CreateVariableRequest = z.infer<typeof createVariableSchema>;
export type CreateScheduleRequest = z.infer<typeof createScheduleSchema>;
