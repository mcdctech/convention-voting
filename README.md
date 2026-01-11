# MCDC Convention Voting System

A monorepo for the MCDC Convention Voting System, built with Express, PostgreSQL, and Vue.

## Quick Start

### Prerequisites

- Node.js 22.12.0 or higher ([install](https://nodejs.org/))
- PostgreSQL 14 or higher ([install](https://www.postgresql.org/download/))
- npm 10 or higher (included with Node.js)

### Installation

```bash
# Clone the repository
git clone <repository-url>
cd convention-voting

# Install all dependencies
npm install

# Create environment file
cp .env.example .env
# Edit .env with your database credentials

# Set up the database (see Database Setup section below)
npm run migrate             # Run migrations
```

### Development

```bash
# Start both server and client in development mode
npm run dev

# Or start them separately:
npm run dev:server  # Server runs on http://localhost:3000
npm run dev:client  # Client runs on http://localhost:5173
```

Visit [http://localhost:5173](http://localhost:5173) to see the application.

## Project Structure

This is a monorepo with three packages:

```
packages/
├── server/   # Express API with PostgreSQL
├── client/   # Vue 3 frontend
└── shared/   # Shared TypeScript types
```

### Server (`packages/server`)

Express-based REST API with:

- PostgreSQL database via TinyPg
- Raw SQL migrations
- Pino logging
- Vitest for testing

**Key directories:**

- `src/database/migrations/` - Database schema migrations
- `src/database/queries/` - TinyPg SQL query files
- `src/routes/` - API route handlers
- `src/database/` - Database connection and utilities

### Client (`packages/client`)

Vue 3 frontend with:

- Vite for fast builds
- TypeScript with strict mode
- Vitest + Vue Test Utils for testing

**Key directories:**

- `src/components/` - Vue components
- `src/assets/` - Static assets

### Shared (`packages/shared`)

TypeScript types shared between server and client:

- Common interfaces
- API response types
- Data transfer objects (DTOs)

## Common Commands

### Development

```bash
npm run dev              # Start both server and client
npm run dev:server       # Start server only
npm run dev:client       # Start client only
```

### Building

```bash
npm run build            # Build all packages
npm run build:server     # Build server only
npm run build:client     # Build client only
```

### Testing

```bash
npm run test             # Run all tests
npm run test:unit        # Run unit tests
npm run test:integration # Run integration tests
```

### Code Quality

```bash
npm run lint             # Check code with ESLint
npm run lint:fix         # Auto-fix ESLint issues
npm run format           # Format code with Prettier
npm run typecheck        # Check TypeScript types
```

### Database

```bash
npm run migrate          # Run database migrations
```

## Environment Variables

All environment variables are configured in a single `.env` file at the project root.

```bash
# Server configuration
PORT=3000
HOST=0.0.0.0

# PostgreSQL database
PGHOST=localhost
PGPORT=5432
PGUSER=convention_voting_user
PGPASSWORD=your_password_here
PGDATABASE=convention_voting

# CORS
CORS_ORIGIN=http://localhost:5173

# JWT configuration
JWT_SECRET=your-secret-key-change-in-production
JWT_EXPIRES_IN=24h

# API endpoint (for client)
VITE_API_URL=http://localhost:3000
```

## Database Setup

### Creating the Database and User

```bash
# Connect to PostgreSQL as superuser
psql -U postgres

# Create the application user
CREATE USER convention_voting_user WITH PASSWORD 'your_password_here';

# Create the database
CREATE DATABASE convention_voting OWNER convention_voting_user;

# Connect to the new database
\c convention_voting

# Grant schema privileges to the application user
GRANT ALL PRIVILEGES ON SCHEMA public TO convention_voting_user;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO convention_voting_user;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO convention_voting_user;

# Exit psql
\q
```

### Running Migrations

```bash
npm run migrate
```

Migrations are located in `packages/server/src/database/migrations/` and are executed in sequential order.

### Creating a New Migration

1. Create a new file in `packages/server/src/database/migrations/`
2. Name it with the next sequential number: `NNNN-description.sql`
3. Write your SQL statements
4. Run `npm run migrate` to test
5. Commit the migration file

Example:

```sql
-- 0002-create-votes.sql
CREATE TABLE votes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);
```

## Testing

This project uses a three-tier testing strategy:

### Unit Tests

Fast, isolated tests without external dependencies.

```bash
npm run test:unit
```

### Integration Tests

Tests that interact with the database and external services.

```bash
npm run test:integration
```

### Writing Tests

Place test files alongside the code they test:

- Unit tests: `*.test.ts` or `*.spec.ts`
- Integration tests: `*.integration.test.ts`

Example:

```typescript
import { describe, it, expect } from "vitest";

describe("MyFunction", () => {
	it("should do something", () => {
		expect(true).toBe(true);
	});
});
```

## Contributing

### Code Style

This project uses:

- **ESLint** for code linting
- **Prettier** for code formatting
- **TypeScript** in strict mode

Run these before committing:

```bash
npm run lint
npm run format
npm run typecheck
```

### Git Workflow

1. Create a feature branch from `main`
2. Make your changes
3. Run tests and linting
4. Commit with descriptive messages
5. Create a pull request

### Continuous Integration

GitHub Actions automatically runs:

- Linting
- Type checking
- Unit tests
- Integration tests
- Builds

All checks must pass before merging.

## Documentation

For detailed documentation, see:

- [AGENTS.md](./AGENTS.md) - Comprehensive project documentation
- Database README files in `packages/server/src/database/*/README.md`

## Tech Stack

- **Server**: Express, PostgreSQL, TinyPg, Pino
- **Client**: Vue 3, Vite, TypeScript
- **Testing**: Vitest, Vue Test Utils
- **Code Quality**: ESLint, Prettier, TypeScript
- **CI/CD**: GitHub Actions

## License

[License information]

## Support

For issues or questions:

- Create an issue in the repository
- Contact the development team
