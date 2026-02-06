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

// ==================== User Management & RBAC ====================

// User Types/Roles
export const USER_TYPES = ["admin", "superuser", "user", "viewer"] as const;
export type UserType = typeof USER_TYPES[number];

// Menu items that can be controlled via RBAC
export const MENU_ITEMS = ["dashboard", "scans", "cbom", "scripts", "settings"] as const;
export type MenuItem = typeof MENU_ITEMS[number];

// Users table
export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  email: text("email").notNull().unique(),
  displayName: text("display_name").notNull(),
  userType: text("user_type").notNull().default("user"), // admin, superuser, user, viewer
  isActive: boolean("is_active").default(true),
  lastLogin: timestamp("last_login"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
  createdBy: integer("created_by"), // Reference to admin who created this user
});

// Role permissions - defines which menu items each role can access
export const rolePermissions = pgTable("role_permissions", {
  id: serial("id").primaryKey(),
  userType: text("user_type").notNull(), // admin, superuser, user, viewer
  menuItem: text("menu_item").notNull(), // dashboard, scans, cbom, scripts, settings
  canView: boolean("can_view").default(false),
  canEdit: boolean("can_edit").default(false),
  canDelete: boolean("can_delete").default(false),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Auth Configuration - OIDC/OAuth settings
export const authConfig = pgTable("auth_config", {
  id: serial("id").primaryKey(),
  provider: text("provider").notNull(), // "oidc", "oauth2", "azure", "google", "okta"
  displayName: text("display_name").notNull(),
  clientId: text("client_id").notNull(),
  clientSecret: text("client_secret"), // Stored encrypted
  issuerUrl: text("issuer_url"), // For OIDC
  authorizationUrl: text("authorization_url"), // For OAuth2
  tokenUrl: text("token_url"),
  userInfoUrl: text("user_info_url"),
  scopes: text("scopes").default("openid profile email"),
  redirectUri: text("redirect_uri"),
  isEnabled: boolean("is_enabled").default(false),
  isDefault: boolean("is_default").default(false),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Insert schemas for User Management
export const insertUserSchema = createInsertSchema(users).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  lastLogin: true,
});

export const insertRolePermissionSchema = createInsertSchema(rolePermissions).omit({
  id: true,
  updatedAt: true,
});

export const insertAuthConfigSchema = createInsertSchema(authConfig).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

// Types
export type User = typeof users.$inferSelect;
export type InsertUser = z.infer<typeof insertUserSchema>;
export type RolePermission = typeof rolePermissions.$inferSelect;
export type InsertRolePermission = z.infer<typeof insertRolePermissionSchema>;
export type AuthConfig = typeof authConfig.$inferSelect;
export type InsertAuthConfig = z.infer<typeof insertAuthConfigSchema>;

// API validation schemas for Settings
export const createUserSchema = z.object({
  email: z.string().email("Valid email is required"),
  displayName: z.string().min(1, "Display name is required"),
  userType: z.enum(USER_TYPES).default("user"),
  isActive: z.boolean().default(true),
});

export const updateUserSchema = z.object({
  email: z.string().email("Valid email is required").optional(),
  displayName: z.string().min(1, "Display name is required").optional(),
  userType: z.enum(USER_TYPES).optional(),
  isActive: z.boolean().optional(),
});

export const updateRolePermissionSchema = z.object({
  userType: z.enum(USER_TYPES),
  menuItem: z.enum(MENU_ITEMS),
  canView: z.boolean(),
  canEdit: z.boolean(),
  canDelete: z.boolean(),
});

export const createAuthConfigSchema = z.object({
  provider: z.enum(["oidc", "oauth2", "azure", "google", "okta"]),
  displayName: z.string().min(1, "Display name is required"),
  clientId: z.string().min(1, "Client ID is required"),
  clientSecret: z.string().optional(),
  issuerUrl: z.string().url().optional().or(z.literal("")),
  authorizationUrl: z.string().url().optional().or(z.literal("")),
  tokenUrl: z.string().url().optional().or(z.literal("")),
  userInfoUrl: z.string().url().optional().or(z.literal("")),
  scopes: z.string().default("openid profile email"),
  redirectUri: z.string().url().optional().or(z.literal("")),
  isEnabled: z.boolean().default(false),
  isDefault: z.boolean().default(false),
});

export const updateAuthConfigSchema = createAuthConfigSchema.partial();

export type CreateUserRequest = z.infer<typeof createUserSchema>;
export type UpdateUserRequest = z.infer<typeof updateUserSchema>;
export type UpdateRolePermissionRequest = z.infer<typeof updateRolePermissionSchema>;
export type CreateAuthConfigRequest = z.infer<typeof createAuthConfigSchema>;
export type UpdateAuthConfigRequest = z.infer<typeof updateAuthConfigSchema>;

// ==================== Security Policies ====================

export const ASSET_CATEGORIES = [
  "mobile_devices",
  "removable_media",
  "servers_storage",
  "email",
  "wireless_networks",
  "data_in_transit",
  "backup_media",
  "databases",
  "cloud_services",
  "iot_devices",
  "custom",
] as const;
export type AssetCategory = typeof ASSET_CATEGORIES[number];

export const DATA_CLASSIFICATIONS = [
  "confidential",
  "internal",
  "public",
] as const;
export type DataClassification = typeof DATA_CLASSIFICATIONS[number];

export const POLICY_STATUSES = ["active", "draft", "disabled"] as const;
export type PolicyStatus = typeof POLICY_STATUSES[number];

export const ASSET_CATEGORY_LABELS: Record<AssetCategory, string> = {
  mobile_devices: "Mobile Devices",
  removable_media: "Removable Media",
  servers_storage: "Servers & Storage",
  email: "Email",
  wireless_networks: "Wireless Networks",
  data_in_transit: "Data in Transit",
  backup_media: "Backup Media",
  databases: "Databases",
  cloud_services: "Cloud Services",
  iot_devices: "IoT Devices",
  custom: "Custom",
};

export const DATA_CLASSIFICATION_LABELS: Record<DataClassification, string> = {
  confidential: "Confidential / Restricted",
  internal: "Internal / Protected",
  public: "Public",
};

export const securityPolicies = pgTable("security_policies", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  description: text("description"),
  assetCategory: text("asset_category").notNull(),
  dataClassification: text("data_classification").notNull(),
  allowedAlgorithms: text("allowed_algorithms").array(),
  prohibitedAlgorithms: text("prohibited_algorithms").array(),
  minimumKeySize: integer("minimum_key_size"),
  requiredProtocols: text("required_protocols").array(),
  keyManagementPolicy: text("key_management_policy"),
  encryptionAtRest: boolean("encryption_at_rest").default(false),
  encryptionInTransit: boolean("encryption_in_transit").default(false),
  pqcRequired: boolean("pqc_required").default(false),
  minimumNistLevel: integer("minimum_nist_level"),
  status: text("status").notNull().default("draft"),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertSecurityPolicySchema = createInsertSchema(securityPolicies).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type SecurityPolicy = typeof securityPolicies.$inferSelect;
export type InsertSecurityPolicy = typeof securityPolicies.$inferInsert;

export const createSecurityPolicySchema = z.object({
  name: z.string().min(1, "Policy name is required"),
  description: z.string().optional(),
  assetCategory: z.enum(ASSET_CATEGORIES),
  dataClassification: z.enum(DATA_CLASSIFICATIONS),
  allowedAlgorithms: z.array(z.string()).optional(),
  prohibitedAlgorithms: z.array(z.string()).optional(),
  minimumKeySize: z.number().min(0).optional().nullable(),
  requiredProtocols: z.array(z.string()).optional(),
  keyManagementPolicy: z.string().optional(),
  encryptionAtRest: z.boolean().default(false),
  encryptionInTransit: z.boolean().default(false),
  pqcRequired: z.boolean().default(false),
  minimumNistLevel: z.number().min(0).max(5).optional().nullable(),
  status: z.enum(POLICY_STATUSES).default("draft"),
  notes: z.string().optional(),
});

export const updateSecurityPolicySchema = createSecurityPolicySchema.partial();

export type CreateSecurityPolicyRequest = z.infer<typeof createSecurityPolicySchema>;
export type UpdateSecurityPolicyRequest = z.infer<typeof updateSecurityPolicySchema>;
