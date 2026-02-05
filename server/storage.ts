import { db } from "./db";
import { scans, cbomFiles, cbomComponents, type InsertScan, type Scan, type CbomFile, type CbomComponent, type InsertCbomFile, type InsertCbomComponent } from "@shared/schema";
import { eq, desc, and, inArray } from "drizzle-orm";

export interface IStorage {
  createScan(scan: InsertScan): Promise<Scan>;
  getScans(): Promise<Scan[]>;
  getScan(id: number): Promise<Scan | undefined>;
  deleteScan(id: number): Promise<void>;
  
  createCbomFile(file: InsertCbomFile): Promise<CbomFile>;
  getCbomFiles(): Promise<CbomFile[]>;
  getCbomFile(id: number): Promise<CbomFile | undefined>;
  deleteCbomFile(id: number): Promise<void>;
  updateCbomFileCount(id: number, count: number): Promise<void>;
  
  createCbomComponents(components: InsertCbomComponent[]): Promise<CbomComponent[]>;
  getCbomComponents(): Promise<CbomComponent[]>;
  getCbomComponentsByFile(fileId: number): Promise<CbomComponent[]>;
  deleteCbomComponentsByFile(fileId: number): Promise<void>;
  deleteCbomComponentsByIds(ids: number[]): Promise<void>;
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

  async createCbomFile(file: InsertCbomFile): Promise<CbomFile> {
    const [created] = await db.insert(cbomFiles).values([file]).returning();
    return created;
  }

  async getCbomFiles(): Promise<CbomFile[]> {
    return await db.select().from(cbomFiles).orderBy(desc(cbomFiles.uploadedAt));
  }

  async getCbomFile(id: number): Promise<CbomFile | undefined> {
    const [file] = await db.select().from(cbomFiles).where(eq(cbomFiles.id, id));
    return file;
  }

  async deleteCbomFile(id: number): Promise<void> {
    await db.delete(cbomComponents).where(eq(cbomComponents.fileId, id));
    await db.delete(cbomFiles).where(eq(cbomFiles.id, id));
  }

  async updateCbomFileCount(id: number, count: number): Promise<void> {
    await db.update(cbomFiles).set({ componentCount: count }).where(eq(cbomFiles.id, id));
  }

  async createCbomComponents(components: InsertCbomComponent[]): Promise<CbomComponent[]> {
    if (components.length === 0) return [];
    return await db.insert(cbomComponents).values(components).returning();
  }

  async getCbomComponents(): Promise<CbomComponent[]> {
    return await db.select().from(cbomComponents).orderBy(desc(cbomComponents.createdAt));
  }

  async getCbomComponentsByFile(fileId: number): Promise<CbomComponent[]> {
    return await db.select().from(cbomComponents).where(eq(cbomComponents.fileId, fileId));
  }

  async deleteCbomComponentsByFile(fileId: number): Promise<void> {
    await db.delete(cbomComponents).where(eq(cbomComponents.fileId, fileId));
  }

  async deleteCbomComponentsByIds(ids: number[]): Promise<void> {
    if (ids.length === 0) return;
    await db.delete(cbomComponents).where(inArray(cbomComponents.id, ids));
  }
}

export const storage = new DatabaseStorage();
