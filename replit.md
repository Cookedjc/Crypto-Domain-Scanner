# CipherGuard - PQC Security Analysis Platform

## Overview

CipherGuard is a Post-Quantum Cryptography (PQC) security analysis platform that scans domains and endpoints to evaluate their cryptographic configurations. The application performs TLS/SSL security scans, analyzes cipher suites, certificates, and key exchange mechanisms, then generates security scores and PQC readiness assessments.

The platform enables users to scan domains across multiple ports, optionally enumerate common subdomains, and view detailed reports on cryptographic posture including protocol versions, cipher strength, and quantum-resistance status.

### CBOM Manager
The platform includes a Cryptographic Bill of Materials (CBOM) Manager that allows teams to upload and analyze CycloneDX JSON format files. Features include:
- Drag-and-drop file upload
- Sortable and filterable component tables
- Deduplication based on selected fields

### Scripts Manager
A comprehensive script scheduling system for automating REST API calls and CLI commands:
- **Scripts**: Create bash commands or CLI scripts for REST API calls to third-party applications
- **Variables**: Store tokenized access credentials (API keys, tokens) securely with ${VAR_NAME} substitution
- **Schedules**: Configure scripts to run on a 24-hour clock, specific days of week, or specific dates
- **Execution History**: View logs and results from script executions

### Settings
A comprehensive settings page with three tabs:
- **User Management**: Create, edit, and delete users with email, display name, and user type (admin, superuser, user, viewer)
- **Authentication Configuration**: Configure OIDC/OAuth providers including Azure AD, Google, Okta, and custom providers with client credentials and redirect URIs
- **RBAC Controls**: Role-based access control matrix with View/Edit/Delete permissions per user type and menu item; Admin permissions are locked and cannot be modified

### Reports
A free-form report creation system for security assessments:
- Create, edit, save, and delete reports with title, content, and status (draft/final/archived)
- Insert CBOM component summaries and detailed tables directly into reports
- Insert security policy summaries
- Run and insert live policy compliance matching results showing violations and compliant components
- Export reports as text files and copy to clipboard
- Reports are stored in the database for persistence

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
│       ├── pages/        # Route page components (dashboard, cbom, scripts)
│       └── lib/          # Utilities and query client config
├── server/           # Express backend
│   ├── index.ts      # Server entry point
│   ├── routes.ts     # API route handlers + scheduler
│   ├── storage.ts    # Database access layer
│   └── db.ts         # Database connection
├── shared/           # Shared code between client/server
│   ├── schema.ts     # Drizzle schema definitions
│   └── routes.ts     # API contract types
└── migrations/       # Drizzle migration files
```

### Database Tables
- `scans`: TLS/SSL scan results
- `cbom_files`, `cbom_components`: CBOM file and component storage
- `scheduled_scripts`: Script definitions (name, command, enabled status)
- `script_variables`: Stored credentials/tokens for script substitution
- `script_schedules`: Schedule configurations (times, days, dates)
- `script_executions`: Execution history and logs
- `users`: User accounts with email, display name, and user type
- `role_permissions`: RBAC permission matrix for menu access control
- `auth_config`: OIDC/OAuth provider configurations
- `security_policies`: Cryptographic control policies (IS-22/ISO 27001 Annex A 8.24)
- `reports`: Free-form security assessment reports with CBOM/policy data insertion

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