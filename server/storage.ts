import { db } from "./db";
import { 
  scans, cbomFiles, cbomComponents, 
  scriptVariables, scheduledScripts, scriptSchedules, scriptExecutions,
  users, rolePermissions, authConfig, securityPolicies,
  type InsertScan, type Scan, 
  type CbomFile, type CbomComponent, type InsertCbomFile, type InsertCbomComponent,
  type ScriptVariable, type InsertScriptVariable,
  type ScheduledScript, type InsertScheduledScript,
  type ScriptSchedule, type InsertScriptSchedule,
  type ScriptExecution, type InsertScriptExecution,
  type User, type InsertUser,
  type RolePermission, type InsertRolePermission,
  type AuthConfig, type InsertAuthConfig,
  type SecurityPolicy, type InsertSecurityPolicy,
  USER_TYPES, MENU_ITEMS
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
  
  // User Management
  createUser(user: InsertUser): Promise<User>;
  getUsers(): Promise<User[]>;
  getUser(id: number): Promise<User | undefined>;
  getUserByEmail(email: string): Promise<User | undefined>;
  updateUser(id: number, data: Partial<InsertUser>): Promise<User | undefined>;
  deleteUser(id: number): Promise<void>;
  
  // Role Permissions (RBAC)
  getRolePermissions(): Promise<RolePermission[]>;
  getRolePermissionsByType(userType: string): Promise<RolePermission[]>;
  upsertRolePermission(permission: InsertRolePermission): Promise<RolePermission>;
  initializeDefaultPermissions(): Promise<void>;
  
  // Auth Configuration
  createAuthConfig(config: InsertAuthConfig): Promise<AuthConfig>;
  getAuthConfigs(): Promise<AuthConfig[]>;
  getAuthConfig(id: number): Promise<AuthConfig | undefined>;
  updateAuthConfig(id: number, data: Partial<InsertAuthConfig>): Promise<AuthConfig | undefined>;
  deleteAuthConfig(id: number): Promise<void>;
  getDefaultAuthConfig(): Promise<AuthConfig | undefined>;

  // Security Policies
  createSecurityPolicy(policy: InsertSecurityPolicy): Promise<SecurityPolicy>;
  getSecurityPolicies(): Promise<SecurityPolicy[]>;
  getSecurityPolicy(id: number): Promise<SecurityPolicy | undefined>;
  updateSecurityPolicy(id: number, data: Partial<InsertSecurityPolicy>): Promise<SecurityPolicy | undefined>;
  deleteSecurityPolicy(id: number): Promise<void>;
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

  // User Management
  async createUser(user: InsertUser): Promise<User> {
    const [created] = await db.insert(users).values(user).returning();
    return created;
  }

  async getUsers(): Promise<User[]> {
    return await db.select().from(users).orderBy(desc(users.createdAt));
  }

  async getUser(id: number): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user;
  }

  async getUserByEmail(email: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.email, email));
    return user;
  }

  async updateUser(id: number, data: Partial<InsertUser>): Promise<User | undefined> {
    const [updated] = await db.update(users)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(users.id, id))
      .returning();
    return updated;
  }

  async deleteUser(id: number): Promise<void> {
    await db.delete(users).where(eq(users.id, id));
  }

  // Role Permissions (RBAC)
  async getRolePermissions(): Promise<RolePermission[]> {
    return await db.select().from(rolePermissions);
  }

  async getRolePermissionsByType(userType: string): Promise<RolePermission[]> {
    return await db.select().from(rolePermissions).where(eq(rolePermissions.userType, userType));
  }

  async upsertRolePermission(permission: InsertRolePermission): Promise<RolePermission> {
    const existing = await db.select().from(rolePermissions)
      .where(and(
        eq(rolePermissions.userType, permission.userType),
        eq(rolePermissions.menuItem, permission.menuItem)
      ));
    
    if (existing.length > 0) {
      const [updated] = await db.update(rolePermissions)
        .set({ ...permission, updatedAt: new Date() })
        .where(eq(rolePermissions.id, existing[0].id))
        .returning();
      return updated;
    } else {
      const [created] = await db.insert(rolePermissions).values(permission).returning();
      return created;
    }
  }

  async initializeDefaultPermissions(): Promise<void> {
    const existing = await this.getRolePermissions();
    if (existing.length > 0) return;

    const defaultPermissions: InsertRolePermission[] = [];
    
    for (const userType of USER_TYPES) {
      for (const menuItem of MENU_ITEMS) {
        let canView = true;
        let canEdit = false;
        let canDelete = false;
        
        if (userType === 'admin') {
          canEdit = true;
          canDelete = true;
        } else if (userType === 'superuser') {
          canEdit = true;
          canDelete = true;
          if (menuItem === 'settings') {
            canEdit = false;
            canDelete = false;
          }
        } else if (userType === 'user') {
          canEdit = menuItem !== 'settings';
          canDelete = false;
        } else if (userType === 'viewer') {
          canView = menuItem !== 'settings';
          canEdit = false;
          canDelete = false;
        }
        
        defaultPermissions.push({
          userType,
          menuItem,
          canView,
          canEdit,
          canDelete,
        });
      }
    }
    
    await db.insert(rolePermissions).values(defaultPermissions);
  }

  // Auth Configuration
  async createAuthConfig(config: InsertAuthConfig): Promise<AuthConfig> {
    if (config.isDefault) {
      await db.update(authConfig).set({ isDefault: false });
    }
    const [created] = await db.insert(authConfig).values(config).returning();
    return created;
  }

  async getAuthConfigs(): Promise<AuthConfig[]> {
    return await db.select().from(authConfig).orderBy(desc(authConfig.createdAt));
  }

  async getAuthConfig(id: number): Promise<AuthConfig | undefined> {
    const [config] = await db.select().from(authConfig).where(eq(authConfig.id, id));
    return config;
  }

  async updateAuthConfig(id: number, data: Partial<InsertAuthConfig>): Promise<AuthConfig | undefined> {
    if (data.isDefault) {
      await db.update(authConfig).set({ isDefault: false });
    }
    const [updated] = await db.update(authConfig)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(authConfig.id, id))
      .returning();
    return updated;
  }

  async deleteAuthConfig(id: number): Promise<void> {
    await db.delete(authConfig).where(eq(authConfig.id, id));
  }

  async getDefaultAuthConfig(): Promise<AuthConfig | undefined> {
    const [config] = await db.select().from(authConfig).where(eq(authConfig.isDefault, true));
    return config;
  }

  // Security Policies
  async createSecurityPolicy(policy: InsertSecurityPolicy): Promise<SecurityPolicy> {
    const [created] = await db.insert(securityPolicies).values(policy).returning();
    return created;
  }

  async getSecurityPolicies(): Promise<SecurityPolicy[]> {
    return await db.select().from(securityPolicies).orderBy(desc(securityPolicies.createdAt));
  }

  async getSecurityPolicy(id: number): Promise<SecurityPolicy | undefined> {
    const [policy] = await db.select().from(securityPolicies).where(eq(securityPolicies.id, id));
    return policy;
  }

  async updateSecurityPolicy(id: number, data: Partial<InsertSecurityPolicy>): Promise<SecurityPolicy | undefined> {
    const [updated] = await db.update(securityPolicies)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(securityPolicies.id, id))
      .returning();
    return updated;
  }

  async deleteSecurityPolicy(id: number): Promise<void> {
    await db.delete(securityPolicies).where(eq(securityPolicies.id, id));
  }
}

export const storage = new DatabaseStorage();
