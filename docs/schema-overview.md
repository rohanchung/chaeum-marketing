# Initial schema overview

The operating sheet queries `performance_records` and `expenses` by `metric_date` / `expense_date` and `channel_id`. It is deliberately a one-to-many model: a date-channel cell can hold multiple campaigns, contents, events, and expenses without losing detail.

## Core relationships

```text
workspace → channels, campaigns, contents, events
channel + date → performance records + expenses
lead → consultations → enrollment
lead → primary / assisted attribution to channel, campaign, content, or event
```

## Security model

Each authenticated user receives a workspace and owner membership when their Auth user is created. Every business table has `workspace_id`, RLS enabled, no access for anonymous users, and membership-based policies. Disable public sign-up in Supabase Auth before creating the permitted user.

## Applying the schema

The Supabase CLI is not installed in this environment. Apply `supabase/migrations/202609080001_initial_marketing_schema.sql` once in the Supabase SQL Editor, then record the migration in the project migration history. Once the CLI is available, use it for all subsequent migrations and schema verification.
