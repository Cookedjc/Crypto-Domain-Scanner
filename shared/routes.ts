import { z } from 'zod';
import { 
  scans, insertScanSchema, scanRequestSchema, cbomFiles, cbomComponents,
  scriptVariables, scheduledScripts, scriptSchedules, scriptExecutions,
  users, rolePermissions, authConfig, securityPolicies,
  createScriptSchema, createVariableSchema, createScheduleSchema,
  createUserSchema, updateUserSchema, updateRolePermissionSchema,
  createAuthConfigSchema, updateAuthConfigSchema,
  createSecurityPolicySchema, updateSecurityPolicySchema
} from './schema';

export const errorSchemas = {
  validation: z.object({
    message: z.string(),
    field: z.string().optional(),
  }),
  notFound: z.object({
    message: z.string(),
  }),
  internal: z.object({
    message: z.string(),
  }),
};

export const api = {
  scans: {
    list: {
      method: 'GET' as const,
      path: '/api/scans',
      responses: {
        200: z.array(z.custom<typeof scans.$inferSelect>()),
      },
    },
    get: {
      method: 'GET' as const,
      path: '/api/scans/:id',
      responses: {
        200: z.custom<typeof scans.$inferSelect>(),
        404: errorSchemas.notFound,
      },
    },
    create: {
      method: 'POST' as const,
      path: '/api/scans',
      input: scanRequestSchema,
      responses: {
        201: z.array(z.custom<typeof scans.$inferSelect>()), // Returns array of created scans (one per port/subdomain)
        400: errorSchemas.validation,
      },
    },
    delete: {
      method: 'DELETE' as const,
      path: '/api/scans/:id',
      responses: {
        204: z.void(),
        404: errorSchemas.notFound,
      },
    },
  },
};

export const cbomApi = {
  files: {
    list: {
      method: 'GET' as const,
      path: '/api/cbom/files',
      responses: {
        200: z.array(z.custom<typeof cbomFiles.$inferSelect>()),
      },
    },
    delete: {
      method: 'DELETE' as const,
      path: '/api/cbom/files/:id',
      responses: {
        204: z.void(),
        404: errorSchemas.notFound,
      },
    },
  },
  components: {
    list: {
      method: 'GET' as const,
      path: '/api/cbom/components',
      responses: {
        200: z.array(z.custom<typeof cbomComponents.$inferSelect>()),
      },
    },
    upload: {
      method: 'POST' as const,
      path: '/api/cbom/upload',
      responses: {
        201: z.object({
          file: z.custom<typeof cbomFiles.$inferSelect>(),
          componentsAdded: z.number(),
        }),
        400: errorSchemas.validation,
      },
    },
    deduplicate: {
      method: 'POST' as const,
      path: '/api/cbom/deduplicate',
      responses: {
        200: z.object({
          removed: z.number(),
          remaining: z.number(),
        }),
        400: errorSchemas.validation,
      },
    },
  },
};

// Scripts API
export const scriptsApi = {
  variables: {
    list: {
      method: 'GET' as const,
      path: '/api/scripts/variables',
      responses: {
        200: z.array(z.custom<typeof scriptVariables.$inferSelect>()),
      },
    },
    create: {
      method: 'POST' as const,
      path: '/api/scripts/variables',
      input: createVariableSchema,
      responses: {
        201: z.custom<typeof scriptVariables.$inferSelect>(),
        400: errorSchemas.validation,
      },
    },
    update: {
      method: 'PATCH' as const,
      path: '/api/scripts/variables/:id',
      responses: {
        200: z.custom<typeof scriptVariables.$inferSelect>(),
        404: errorSchemas.notFound,
      },
    },
    delete: {
      method: 'DELETE' as const,
      path: '/api/scripts/variables/:id',
      responses: {
        204: z.void(),
        404: errorSchemas.notFound,
      },
    },
  },
  scripts: {
    list: {
      method: 'GET' as const,
      path: '/api/scripts',
      responses: {
        200: z.array(z.custom<typeof scheduledScripts.$inferSelect>()),
      },
    },
    get: {
      method: 'GET' as const,
      path: '/api/scripts/:id',
      responses: {
        200: z.custom<typeof scheduledScripts.$inferSelect>(),
        404: errorSchemas.notFound,
      },
    },
    create: {
      method: 'POST' as const,
      path: '/api/scripts',
      input: createScriptSchema,
      responses: {
        201: z.custom<typeof scheduledScripts.$inferSelect>(),
        400: errorSchemas.validation,
      },
    },
    update: {
      method: 'PATCH' as const,
      path: '/api/scripts/:id',
      responses: {
        200: z.custom<typeof scheduledScripts.$inferSelect>(),
        404: errorSchemas.notFound,
      },
    },
    delete: {
      method: 'DELETE' as const,
      path: '/api/scripts/:id',
      responses: {
        204: z.void(),
        404: errorSchemas.notFound,
      },
    },
    execute: {
      method: 'POST' as const,
      path: '/api/scripts/:id/execute',
      responses: {
        200: z.custom<typeof scriptExecutions.$inferSelect>(),
        404: errorSchemas.notFound,
      },
    },
  },
  schedules: {
    list: {
      method: 'GET' as const,
      path: '/api/scripts/schedules',
      responses: {
        200: z.array(z.custom<typeof scriptSchedules.$inferSelect>()),
      },
    },
    listByScript: {
      method: 'GET' as const,
      path: '/api/scripts/:scriptId/schedules',
      responses: {
        200: z.array(z.custom<typeof scriptSchedules.$inferSelect>()),
      },
    },
    create: {
      method: 'POST' as const,
      path: '/api/scripts/schedules',
      input: createScheduleSchema,
      responses: {
        201: z.custom<typeof scriptSchedules.$inferSelect>(),
        400: errorSchemas.validation,
      },
    },
    update: {
      method: 'PATCH' as const,
      path: '/api/scripts/schedules/:id',
      responses: {
        200: z.custom<typeof scriptSchedules.$inferSelect>(),
        404: errorSchemas.notFound,
      },
    },
    delete: {
      method: 'DELETE' as const,
      path: '/api/scripts/schedules/:id',
      responses: {
        204: z.void(),
        404: errorSchemas.notFound,
      },
    },
  },
  executions: {
    list: {
      method: 'GET' as const,
      path: '/api/scripts/executions',
      responses: {
        200: z.array(z.custom<typeof scriptExecutions.$inferSelect>()),
      },
    },
    listByScript: {
      method: 'GET' as const,
      path: '/api/scripts/:scriptId/executions',
      responses: {
        200: z.array(z.custom<typeof scriptExecutions.$inferSelect>()),
      },
    },
  },
};

// Settings API - User Management, RBAC, and Auth Configuration
export const settingsApi = {
  users: {
    list: {
      method: 'GET' as const,
      path: '/api/settings/users',
      responses: {
        200: z.array(z.custom<typeof users.$inferSelect>()),
      },
    },
    get: {
      method: 'GET' as const,
      path: '/api/settings/users/:id',
      responses: {
        200: z.custom<typeof users.$inferSelect>(),
        404: errorSchemas.notFound,
      },
    },
    create: {
      method: 'POST' as const,
      path: '/api/settings/users',
      input: createUserSchema,
      responses: {
        201: z.custom<typeof users.$inferSelect>(),
        400: errorSchemas.validation,
      },
    },
    update: {
      method: 'PATCH' as const,
      path: '/api/settings/users/:id',
      input: updateUserSchema,
      responses: {
        200: z.custom<typeof users.$inferSelect>(),
        404: errorSchemas.notFound,
      },
    },
    delete: {
      method: 'DELETE' as const,
      path: '/api/settings/users/:id',
      responses: {
        204: z.void(),
        404: errorSchemas.notFound,
      },
    },
  },
  permissions: {
    list: {
      method: 'GET' as const,
      path: '/api/settings/permissions',
      responses: {
        200: z.array(z.custom<typeof rolePermissions.$inferSelect>()),
      },
    },
    update: {
      method: 'PUT' as const,
      path: '/api/settings/permissions',
      input: updateRolePermissionSchema,
      responses: {
        200: z.custom<typeof rolePermissions.$inferSelect>(),
        400: errorSchemas.validation,
      },
    },
    initialize: {
      method: 'POST' as const,
      path: '/api/settings/permissions/initialize',
      responses: {
        200: z.object({ message: z.string() }),
      },
    },
  },
  authConfig: {
    list: {
      method: 'GET' as const,
      path: '/api/settings/auth',
      responses: {
        200: z.array(z.custom<typeof authConfig.$inferSelect>()),
      },
    },
    get: {
      method: 'GET' as const,
      path: '/api/settings/auth/:id',
      responses: {
        200: z.custom<typeof authConfig.$inferSelect>(),
        404: errorSchemas.notFound,
      },
    },
    create: {
      method: 'POST' as const,
      path: '/api/settings/auth',
      input: createAuthConfigSchema,
      responses: {
        201: z.custom<typeof authConfig.$inferSelect>(),
        400: errorSchemas.validation,
      },
    },
    update: {
      method: 'PATCH' as const,
      path: '/api/settings/auth/:id',
      input: updateAuthConfigSchema,
      responses: {
        200: z.custom<typeof authConfig.$inferSelect>(),
        404: errorSchemas.notFound,
      },
    },
    delete: {
      method: 'DELETE' as const,
      path: '/api/settings/auth/:id',
      responses: {
        204: z.void(),
        404: errorSchemas.notFound,
      },
    },
  },
};

// Security Policies API
export const policiesApi = {
  policies: {
    list: {
      method: 'GET' as const,
      path: '/api/policies',
      responses: {
        200: z.array(z.custom<typeof securityPolicies.$inferSelect>()),
      },
    },
    get: {
      method: 'GET' as const,
      path: '/api/policies/:id',
      responses: {
        200: z.custom<typeof securityPolicies.$inferSelect>(),
        404: errorSchemas.notFound,
      },
    },
    create: {
      method: 'POST' as const,
      path: '/api/policies',
      input: createSecurityPolicySchema,
      responses: {
        201: z.custom<typeof securityPolicies.$inferSelect>(),
        400: errorSchemas.validation,
      },
    },
    update: {
      method: 'PATCH' as const,
      path: '/api/policies/:id',
      input: updateSecurityPolicySchema,
      responses: {
        200: z.custom<typeof securityPolicies.$inferSelect>(),
        404: errorSchemas.notFound,
      },
    },
    delete: {
      method: 'DELETE' as const,
      path: '/api/policies/:id',
      responses: {
        204: z.void(),
        404: errorSchemas.notFound,
      },
    },
    match: {
      method: 'POST' as const,
      path: '/api/policies/match',
      responses: {
        200: z.object({
          matched: z.number(),
          results: z.array(z.object({
            componentId: z.number(),
            componentName: z.string(),
            policyId: z.number(),
            policyName: z.string(),
            compliant: z.boolean(),
            violations: z.array(z.string()),
          })),
        }),
      },
    },
  },
};

export function buildUrl(path: string, params?: Record<string, string | number>): string {
  let url = path;
  if (params) {
    Object.entries(params).forEach(([key, value]) => {
      if (url.includes(`:${key}`)) {
        url = url.replace(`:${key}`, String(value));
      }
    });
  }
  return url;
}
