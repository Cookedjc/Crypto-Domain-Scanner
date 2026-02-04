# CipherGuard - PQC Security Analysis Platform

## Overview

CipherGuard is a Post-Quantum Cryptography (PQC) security analysis platform that scans domains and endpoints to evaluate their cryptographic configurations. The application performs TLS/SSL security scans, analyzes cipher suites, certificates, and key exchange mechanisms, then generates security scores and PQC readiness assessments.

The platform enables users to scan domains across multiple ports, optionally enumerate common subdomains, and view detailed reports on cryptographic posture including protocol versions, cipher strength, and quantum-resistance status.

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend Architecture
- **Framework**: React 18 with TypeScript
- **Routing**: Wouter (lightweight client-side routing)
- **State Management**: TanStack Query (React Query) for server state with polling support for scan status updates
- **Styling**: Tailwind CSS with CSS variables for theming (cyber/terminal dark theme)
- **UI Components**: shadcn/ui component library built on Radix UI primitives
- **Animations**: Framer Motion for smooth transitions and scanning state animations
- **Charts**: Recharts for security score visualizations (radar charts)
- **Build Tool**: Vite with React plugin

### Backend Architecture
- **Runtime**: Node.js with Express 5
- **Language**: TypeScript (ESM modules)
- **API Design**: RESTful endpoints under `/api/*` prefix
- **TLS Scanning**: Native Node.js `tls` module for certificate and cipher analysis
- **DNS Resolution**: Node.js `dns/promises` for subdomain enumeration

### Data Storage
- **Database**: PostgreSQL via `pg` driver
- **ORM**: Drizzle ORM with Zod integration for schema validation
- **Schema Location**: `shared/schema.ts` (shared between client and server)
- **Migrations**: Drizzle Kit for schema push (`db:push` command)

### Project Structure
```
├── client/           # React frontend application
│   └── src/
│       ├── components/   # UI components (shadcn + custom)
│       ├── hooks/        # React Query hooks for API calls
│       ├── pages/        # Route page components
│       └── lib/          # Utilities and query client config
├── server/           # Express backend
│   ├── index.ts      # Server entry point
│   ├── routes.ts     # API route handlers
│   ├── storage.ts    # Database access layer
│   └── db.ts         # Database connection
├── shared/           # Shared code between client/server
│   ├── schema.ts     # Drizzle schema definitions
│   └── routes.ts     # API contract types
└── migrations/       # Drizzle migration files
```

### API Contract Pattern
The `shared/routes.ts` file defines typed API contracts using Zod schemas, ensuring type safety between frontend and backend. This includes request/response schemas and URL builders.

### Development vs Production
- **Development**: Vite dev server with HMR, served through Express middleware
- **Production**: Vite builds static assets to `dist/public`, esbuild bundles server code

## External Dependencies

### Database
- **PostgreSQL**: Primary data store, connection via `DATABASE_URL` environment variable
- **connect-pg-simple**: Session storage (available but session auth not fully implemented)

### Third-Party Libraries
- **Drizzle ORM**: Database queries and schema management
- **Zod**: Runtime type validation for API inputs/outputs
- **date-fns**: Date formatting for scan timestamps
- **Framer Motion**: UI animations
- **Recharts**: Data visualization charts

### Replit-Specific Integrations
- **@replit/vite-plugin-runtime-error-modal**: Error overlay in development
- **@replit/vite-plugin-cartographer**: Development tooling
- **@replit/vite-plugin-dev-banner**: Development environment indicator

### Font Resources
- Google Fonts: Inter (sans), Space Grotesk (display), JetBrains Mono (monospace)