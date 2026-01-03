# Database Queries

This directory contains SQL query files for use with TinyPg.

## Usage

TinyPg loads SQL files from this directory and makes them available as methods on the database instance.

For example, a file named `get_user_by_id.sql` would be callable as:

```typescript
await db.queries.get_user_by_id({ id: userId });
```

## File Naming

- Use snake_case for file names
- Be descriptive and specific
- Group related queries in subdirectories if needed

## Query Parameters

Use TinyPg parameter syntax in your SQL files:

```sql
SELECT * FROM users WHERE id = :id
```

## Best Practices

- Keep queries focused and single-purpose
- Use meaningful parameter names
- Add comments to explain complex queries
- Consider creating indexes for frequently queried columns
