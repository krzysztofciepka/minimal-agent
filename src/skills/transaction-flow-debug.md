# Skill: transaction-flow-debug

Investigate a failed transaction by reading MySQL records and customer-interaction
progress, and identify the step where the flow stopped or failed.

## Input
A `transaction_id`. If not given, ask the user with the `ask_user` tool.

## Step 1 — Resolve MySQL connection

Read environment variables (use the `bash` tool, e.g. `printenv MYSQL_DSN`):
- `MYSQL_DSN` (preferred), or `MYSQL_HOST`, `MYSQL_PORT`, `MYSQL_USER`,
  `MYSQL_PASSWORD`, `MYSQL_DATABASE`.

For any required value that is unset, ask the user with `ask_user`. Do not guess.

## Step 2 — Read-only discipline

All queries run via the `bash` tool with the `mysql` client. ONLY `SELECT`, `SHOW`,
`DESCRIBE`/`EXPLAIN`. Never `INSERT`, `UPDATE`, `DELETE`, or DDL. Prefer
`mysql --batch --raw -e "<query>"`.

## Step 3 — Discover schema

`SHOW TABLES;` then `DESCRIBE` the tables that look like the transaction table and the
customer-interaction / progress / steps table(s). Table and column names are unknown —
infer them from the schema, do not assume.

## Step 4 — Fetch the transaction

`SELECT * FROM <transactions_table> WHERE <id_column> = '<transaction_id>';`
Note its status and timestamps.

## Step 5 — Fetch interaction progress

Find the rows linked to the transaction (via the transaction id or a foreign key) in the
customer-interaction / progress table(s). Order them by step index or timestamp.

## Step 6 — Reconstruct the flow

Walk the steps in order. Identify the first step that did not complete: a failed/aborted
status, a missing expected follow-on row, or a timestamp gap where the flow stalled.

## Output

Actionable findings: the specific step where the flow stopped or failed, its status and
timestamp, and the supporting rows. State the failure point explicitly.
