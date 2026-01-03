# Database Initialization Scripts

This directory contains SQL files that are executed on database initialization.

These scripts typically include:

- Helper functions
- Views
- Permissions
- Other database objects that need to be created on startup

Unlike migrations, these scripts run every time the application starts, so they should be idempotent (safe to run multiple times).

## Usage

Scripts are executed in alphabetical order. Use numbered prefixes to control execution order if needed.

Example:

- `001-helper-functions.sql`
- `002-create-views.sql`
