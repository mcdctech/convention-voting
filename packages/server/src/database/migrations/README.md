# Database Migrations

This directory contains sequential SQL migration files that define the database schema.

## Naming Convention

Migration files follow the pattern: `NNNN-description.sql`

- `NNNN`: Four-digit sequential number (0001, 0002, etc.)
- `description`: Brief description of what the migration does

## Creating a New Migration

1. Determine the next sequential number
2. Create a new file with the appropriate name
3. Write your SQL statements
4. Test the migration locally
5. Commit the file

## Running Migrations

From the root of the monorepo:

```bash
npm run migrate
```

Or from the server package:

```bash
npm run migrate -w @mcdc-convention-voting/server
```

## Best Practices

- Each migration should be idempotent where possible
- Use transactions for complex migrations
- Add comments to explain non-obvious changes
- Test migrations on a copy of production data before deploying
- Never modify existing migration files after they've been deployed
