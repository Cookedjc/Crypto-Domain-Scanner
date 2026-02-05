import { z } from 'zod';
import { scans, insertScanSchema, scanRequestSchema, cbomFiles, cbomComponents } from './schema';

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
