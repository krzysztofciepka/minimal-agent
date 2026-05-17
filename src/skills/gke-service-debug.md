# Skill: gke-service-debug

Debug a GCP-hosted GKE service: explain the error and identify the originating code.

## Input
A service name (Kubernetes workload / deployment name). If not given, ask the user.

## Step 1 — Resolve environment

Read these environment variables (use the `bash` tool, e.g. `printenv GKE_PROJECT`):
- `GKE_PROJECT`, `GKE_CLUSTER`, `GKE_LOCATION` (region or zone)
- `SERVICE_REPO_PATH` (local path to the service source repo; optional)
- MySQL: `MYSQL_DSN`, or `MYSQL_HOST`/`MYSQL_PORT`/`MYSQL_USER`/`MYSQL_PASSWORD`/`MYSQL_DATABASE` (optional)

For any required GKE value that is unset, ask the user with the `ask_user` tool. Do not guess.

## Step 2 — Establish cluster context

Call `gke_get_credentials` with the resolved `cluster`, `project`, `location`.
If it returns an error about a missing binary or auth, surface that to the user and stop.

## Step 3 — Assess workload health

- `kubectl_get` resource `deployments` (name = service) — check desired vs ready replicas.
- `kubectl_get` resource `pods` filtered by the service — look for `CrashLoopBackOff`,
  high restart counts, `Pending`, not-`Ready`.
- `kubectl_get` resource `services` (name = service) — confirm it exists and has endpoints.

## Step 4 — Inspect unhealthy pods

For each unhealthy pod:
- `kubectl_describe` resource `pod` — read Events (image pull errors, OOMKilled, probe failures).
- `kubectl_logs` for the pod; also with `previous: true` to capture the last crash.

## Step 5 — Query Cloud Logging

`gcloud_logging` with a filter scoped to the service at severity >= ERROR over a recent
window, e.g. filter:
`resource.type="k8s_container" resource.labels.container_name="<service>" severity>=ERROR`
freshness: `1h` (widen if empty).

## Step 6 — Map error to code (if logs are inconclusive)

If `SERVICE_REPO_PATH` is set, `grep` the observed error message / stack frame there to
locate the originating function/file. If unset, ask the user for the repo path or skip.

## Step 7 — MySQL context (only if still needed)

Resolve the MySQL connection (Step 1). Use the `bash` tool with the `mysql` client.
READ-ONLY: only `SELECT`, `SHOW`, `DESCRIBE`/`EXPLAIN`. Never `INSERT`/`UPDATE`/`DELETE`/DDL.
Discover schema first (`SHOW TABLES`, `DESCRIBE <table>`) before querying for error context.

## Output

A clear explanation of the error and the specific code location (file + symbol) that
originated it, with the evidence (log line / pod event) that supports the conclusion.
