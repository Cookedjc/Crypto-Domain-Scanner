import { db } from "./db";
import { scans, type InsertScan, type Scan } from "@shared/schema";
import { eq, desc } from "drizzle-orm";

export interface IStorage {
  createScan(scan: InsertScan): Promise<Scan>;
  getScans(): Promise<Scan[]>;
  getScan(id: number): Promise<Scan | undefined>;
  deleteScan(id: number): Promise<void>;
}

export class DatabaseStorage implements IStorage {
  async createScan(insertScan: InsertScan): Promise<Scan> {
    const [scan] = await db.insert(scans).values(insertScan).returning();
    return scan;
  }

  async getScans(): Promise<Scan[]> {
    return await db.select().from(scans).orderBy(desc(scans.createdAt));
  }

  async getScan(id: number): Promise<Scan | undefined> {
    const [scan] = await db.select().from(scans).where(eq(scans.id, id));
    return scan;
  }

  async deleteScan(id: number): Promise<void> {
    await db.delete(scans).where(eq(scans.id, id));
  }
}

export const storage = new DatabaseStorage();
