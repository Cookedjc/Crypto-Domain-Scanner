import { db } from "./db";
import { 
  scans, cbomFiles, cbomComponents, 
  scriptVariables, scheduledScripts, scriptSchedules, scriptExecutions,
  type InsertScan, type Scan, 
  type CbomFile, type CbomComponent, type InsertCbomFile, type InsertCbomComponent,
  type ScriptVariable, type InsertScriptVariable,
  type ScheduledScript, type InsertScheduledScript,
  type ScriptSchedule, type InsertScriptSchedule,
  type ScriptExecution, type InsertScriptExecution
} from "@shared/schema";
import { eq, desc, and, inArray, lte, isNull, or } from "drizzle-orm";

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
  
  // Script Variables
  createVariable(variable: InsertScriptVariable): Promise<ScriptVariable>;
  getVariables(): Promise<ScriptVariable[]>;
  getVariable(id: number): Promise<ScriptVariable | undefined>;
  updateVariable(id: number, data: Partial<InsertScriptVariable>): Promise<ScriptVariable | undefined>;
  deleteVariable(id: number): Promise<void>;
  
  // Scheduled Scripts
  createScript(script: InsertScheduledScript): Promise<ScheduledScript>;
  getScripts(): Promise<ScheduledScript[]>;
  getScript(id: number): Promise<ScheduledScript | undefined>;
  updateScript(id: number, data: Partial<InsertScheduledScript>): Promise<ScheduledScript | undefined>;
  deleteScript(id: number): Promise<void>;
  
  // Script Schedules
  createSchedule(schedule: InsertScriptSchedule): Promise<ScriptSchedule>;
  getSchedules(): Promise<ScriptSchedule[]>;
  getSchedulesByScript(scriptId: number): Promise<ScriptSchedule[]>;
  getSchedule(id: number): Promise<ScriptSchedule | undefined>;
  updateSchedule(id: number, data: Partial<InsertScriptSchedule>): Promise<ScriptSchedule | undefined>;
  deleteSchedule(id: number): Promise<void>;
  getDueSchedules(now: Date): Promise<ScriptSchedule[]>;
  updateScheduleNextRun(id: number, nextRun: Date | null, lastRun?: Date): Promise<void>;
  
  // Script Executions
  createExecution(execution: InsertScriptExecution): Promise<ScriptExecution>;
  getExecutions(limit?: number): Promise<ScriptExecution[]>;
  getExecutionsByScript(scriptId: number, limit?: number): Promise<ScriptExecution[]>;
  updateExecution(id: number, data: Partial<InsertScriptExecution>): Promise<void>;
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

  // Script Variables
  async createVariable(variable: InsertScriptVariable): Promise<ScriptVariable> {
    const [created] = await db.insert(scriptVariables).values(variable).returning();
    return created;
  }

  async getVariables(): Promise<ScriptVariable[]> {
    return await db.select().from(scriptVariables).orderBy(desc(scriptVariables.createdAt));
  }

  async getVariable(id: number): Promise<ScriptVariable | undefined> {
    const [variable] = await db.select().from(scriptVariables).where(eq(scriptVariables.id, id));
    return variable;
  }

  async updateVariable(id: number, data: Partial<InsertScriptVariable>): Promise<ScriptVariable | undefined> {
    const [updated] = await db.update(scriptVariables)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(scriptVariables.id, id))
      .returning();
    return updated;
  }

  async deleteVariable(id: number): Promise<void> {
    await db.delete(scriptVariables).where(eq(scriptVariables.id, id));
  }

  // Scheduled Scripts
  async createScript(script: InsertScheduledScript): Promise<ScheduledScript> {
    const [created] = await db.insert(scheduledScripts).values(script).returning();
    return created;
  }

  async getScripts(): Promise<ScheduledScript[]> {
    return await db.select().from(scheduledScripts).orderBy(desc(scheduledScripts.createdAt));
  }

  async getScript(id: number): Promise<ScheduledScript | undefined> {
    const [script] = await db.select().from(scheduledScripts).where(eq(scheduledScripts.id, id));
    return script;
  }

  async updateScript(id: number, data: Partial<InsertScheduledScript>): Promise<ScheduledScript | undefined> {
    const [updated] = await db.update(scheduledScripts)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(scheduledScripts.id, id))
      .returning();
    return updated;
  }

  async deleteScript(id: number): Promise<void> {
    await db.delete(scriptSchedules).where(eq(scriptSchedules.scriptId, id));
    await db.delete(scriptExecutions).where(eq(scriptExecutions.scriptId, id));
    await db.delete(scheduledScripts).where(eq(scheduledScripts.id, id));
  }

  // Script Schedules
  async createSchedule(schedule: InsertScriptSchedule): Promise<ScriptSchedule> {
    const [created] = await db.insert(scriptSchedules).values(schedule).returning();
    return created;
  }

  async getSchedules(): Promise<ScriptSchedule[]> {
    return await db.select().from(scriptSchedules).orderBy(desc(scriptSchedules.createdAt));
  }

  async getSchedulesByScript(scriptId: number): Promise<ScriptSchedule[]> {
    return await db.select().from(scriptSchedules).where(eq(scriptSchedules.scriptId, scriptId));
  }

  async getSchedule(id: number): Promise<ScriptSchedule | undefined> {
    const [schedule] = await db.select().from(scriptSchedules).where(eq(scriptSchedules.id, id));
    return schedule;
  }

  async updateSchedule(id: number, data: Partial<InsertScriptSchedule>): Promise<ScriptSchedule | undefined> {
    const [updated] = await db.update(scriptSchedules)
      .set(data)
      .where(eq(scriptSchedules.id, id))
      .returning();
    return updated;
  }

  async deleteSchedule(id: number): Promise<void> {
    await db.delete(scriptSchedules).where(eq(scriptSchedules.id, id));
  }

  async getDueSchedules(now: Date): Promise<ScriptSchedule[]> {
    return await db.select().from(scriptSchedules)
      .where(and(
        eq(scriptSchedules.isEnabled, true),
        or(
          isNull(scriptSchedules.nextRun),
          lte(scriptSchedules.nextRun, now)
        )
      ));
  }

  async updateScheduleNextRun(id: number, nextRun: Date | null, lastRun?: Date): Promise<void> {
    const updateData: any = { nextRun };
    if (lastRun) updateData.lastRun = lastRun;
    await db.update(scriptSchedules).set(updateData).where(eq(scriptSchedules.id, id));
  }

  // Script Executions
  async createExecution(execution: InsertScriptExecution): Promise<ScriptExecution> {
    const [created] = await db.insert(scriptExecutions).values(execution).returning();
    return created;
  }

  async getExecutions(limit = 100): Promise<ScriptExecution[]> {
    return await db.select().from(scriptExecutions)
      .orderBy(desc(scriptExecutions.startedAt))
      .limit(limit);
  }

  async getExecutionsByScript(scriptId: number, limit = 50): Promise<ScriptExecution[]> {
    return await db.select().from(scriptExecutions)
      .where(eq(scriptExecutions.scriptId, scriptId))
      .orderBy(desc(scriptExecutions.startedAt))
      .limit(limit);
  }

  async updateExecution(id: number, data: Partial<InsertScriptExecution>): Promise<void> {
    await db.update(scriptExecutions).set(data).where(eq(scriptExecutions.id, id));
  }
}

export const storage = new DatabaseStorage();
