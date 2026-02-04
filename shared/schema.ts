import { pgTable, text, serial, integer, boolean, timestamp, jsonb } from "drizzle-orm/pg-core";
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
  details: jsonb("details").$type<{
    ciphers?: string[];
    certificate?: any;
    handshake?: any;
    vulnerabilities?: string[];
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
