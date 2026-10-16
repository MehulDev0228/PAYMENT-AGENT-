import { defaultPolicy } from "@/lib/domain/policy";
import type { AuditEvent, Company, CollectionPolicyStep, DataSet } from "@/lib/domain/types";
import { CollectionsEngine } from "./engine";
import { createRepository, type AeraRepository, type AuditFilter } from "./repository";
import type { SqlClient, SqlDatabase } from "./sql";

/**
 * PostgreSQL / Supabase adapter.
 *
 * Every call loads the company's working set in one round trip and runs the shared
 * CollectionsEngine on it, so database and demo behave identically. Writes take a
 * per-company advisory lock, then persist only the rows the engine changed plus the
 * new audit events, all in one transaction: a failed step leaves no partial state.
 *
 * Audit history is never loaded into memory; it is append-only and queried directly.
 * The app connects with a server-side role, so tenant isolation is enforced here by
 * scoping every statement to company_id (RLS still protects direct client access).
 */

type Kind = "ts" | "json";
interface TableSpec { table: string; key: Exclude<keyof DataSet, "companies" | "users" | "policies">; columns: Array<[column: string, kind?: Kind]> }

const TABLES: TableSpec[] = [
  { table: "customers", key: "customers", columns: [["id"], ["company_id"], ["customer_code"], ["name"], ["email"], ["phone"], ["region"], ["account_manager"], ["status"], ["created_at", "ts"]] },
  { table: "invoices", key: "invoices", columns: [["id"], ["company_id"], ["customer_id"], ["invoice_number"], ["invoice_date"], ["due_date"], ["amount"], ["currency"], ["amount_paid"], ["amount_outstanding"], ["status"], ["source"], ["created_at", "ts"], ["updated_at", "ts"]] },
  { table: "payments", key: "payments", columns: [["id"], ["company_id"], ["invoice_id"], ["customer_id"], ["payment_reference"], ["amount"], ["payment_date"], ["source"], ["match_status"], ["match_notes"], ["created_at", "ts"]] },
  { table: "collection_cases", key: "cases", columns: [["id"], ["company_id"], ["invoice_id"], ["customer_id"], ["status"], ["priority"], ["days_overdue"], ["next_action"], ["next_action_at", "ts"], ["assigned_to"], ["created_at", "ts"], ["updated_at", "ts"]] },
  { table: "collection_actions", key: "actions", columns: [["id"], ["company_id"], ["collection_case_id"], ["invoice_id"], ["customer_id"], ["action_type"], ["channel"], ["message"], ["reason"], ["data_snapshot", "json"], ["scheduled_at", "ts"], ["executed_at", "ts"], ["status"], ["created_by"], ["approved_by"], ["created_at", "ts"]] },
  { table: "payment_promises", key: "promises", columns: [["id"], ["company_id"], ["invoice_id"], ["customer_id"], ["promised_amount"], ["promised_date"], ["source_message_id"], ["status"], ["created_at", "ts"], ["updated_at", "ts"]] },
  { table: "communication_messages", key: "communications", columns: [["id"], ["company_id"], ["customer_id"], ["invoice_id"], ["collection_case_id"], ["channel"], ["direction"], ["external_message_id"], ["subject"], ["body"], ["received_at", "ts"], ["processed_at", "ts"]] },
];

const AUDIT: TableSpec = { table: "audit_events", key: "auditEvents", columns: [["id"], ["company_id"], ["actor_type"], ["actor_id"], ["event_type"], ["entity_type"], ["entity_id"], ["reason"], ["data_snapshot", "json"], ["created_at", "ts"]] };

const camel = (column: string) => column.replace(/_([a-z])/g, (_, letter: string) => letter.toUpperCase());

function fromRow(spec: TableSpec, row: Record<string, unknown>): Record<string, unknown> {
  const item: Record<string, unknown> = {};
  for (const [column, kind] of spec.columns) {
    const value = row[column];
    if (value === null || value === undefined) continue;
    item[camel(column)] = kind === "ts" ? new Date(value as string).toISOString() : value;
  }
  return item;
}

function toRow(spec: TableSpec, item: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(spec.columns.map(([column]) => [column, item[camel(column)] ?? null]));
}

const LOAD_SQL = `
select
  (select row_to_json(c) from public.companies c where c.id = $1) as company,
  ${TABLES.map((spec) => `(select coalesce(json_agg(t), '[]'::json) from public.${spec.table} t where t.company_id = $1) as ${spec.table}`).join(",\n  ")},
  (select coalesce(json_agg(s order by s.days_overdue), '[]'::json) from public.collection_policy_steps s
     where s.policy_id = (select p.id from public.collection_policies p where p.company_id = $1 and p.is_active order by p.created_at limit 1)) as policy_steps`;

async function loadDataSet(client: SqlClient, companyId: string): Promise<{ data: DataSet; company: Company }> {
  const [row] = await client.query<Record<string, unknown>>(LOAD_SQL, [companyId]);
  const companyRow = row?.company as Record<string, unknown> | null;
  if (!companyRow) throw new Error(`Company ${companyId} not found`);
  const company: Company = {
    id: String(companyRow.id), name: String(companyRow.name), currency: String(companyRow.currency), timezone: String(companyRow.timezone),
    autonomyMode: companyRow.autonomy_mode as Company["autonomyMode"], createdAt: new Date(companyRow.created_at as string).toISOString(),
  };
  const steps = (row.policy_steps as Array<Record<string, unknown>>).map((step): CollectionPolicyStep => ({
    id: String(step.step_key), daysOverdue: Number(step.days_overdue), action: step.action as CollectionPolicyStep["action"], tone: step.tone as CollectionPolicyStep["tone"],
    requiresHumanApproval: Boolean(step.requires_human_approval), ...(step.escalation_level ? { escalationLevel: step.escalation_level as CollectionPolicyStep["escalationLevel"] } : {}),
  }));
  const data = {
    companies: [company], users: [], auditEvents: [],
    policies: [steps.length ? { companyId, steps } : defaultPolicy(companyId)],
  } as unknown as DataSet;
  for (const spec of TABLES) {
    (data as unknown as Record<string, unknown>)[spec.key] = (row[spec.table] as Array<Record<string, unknown>>).map((item) => fromRow(spec, item));
  }
  return { data, company };
}

function fingerprint(data: DataSet): Map<string, string> {
  const prints = new Map<string, string>();
  for (const spec of TABLES) {
    for (const item of data[spec.key] as unknown as Array<{ id: string }>) prints.set(`${spec.table}:${item.id}`, JSON.stringify(item));
  }
  return prints;
}

async function upsert(client: SqlClient, spec: TableSpec, items: Array<Record<string, unknown>>, mode: "upsert" | "insert") {
  if (!items.length) return;
  const columns = spec.columns.map(([column]) => column);
  const conflict = mode === "upsert"
    ? `on conflict (id) do update set ${columns.filter((column) => column !== "id" && column !== "company_id").map((column) => `${column} = excluded.${column}`).join(", ")}`
    : "";
  await client.query(
    `insert into public.${spec.table} (${columns.join(", ")})
     select ${columns.join(", ")} from json_populate_recordset(null::public.${spec.table}, $1::json) ${conflict}`,
    [JSON.stringify(items.map((item) => toRow(spec, item)))],
  );
}

/** Persists rows the engine added or changed (tables in foreign-key order), then the new audit events. */
async function persist(client: SqlClient, data: DataSet, before: Map<string, string>) {
  for (const spec of TABLES) {
    const changed = (data[spec.key] as unknown as Array<{ id: string } & Record<string, unknown>>).filter((item) => before.get(`${spec.table}:${item.id}`) !== JSON.stringify(item));
    await upsert(client, spec, changed, "upsert");
  }
  await upsert(client, AUDIT, data.auditEvents as unknown as Array<Record<string, unknown>>, "insert");
}

/** Writes every row of a working set (customers through audit events). Used to load an initial dataset. */
export async function writeDataSet(client: SqlClient, data: DataSet) {
  await persist(client, data, new Map());
}

/** The company's current calendar date, pinned to midday UTC: the engine's rules are date-granular. */
export function businessNow(timezone: string, at = new Date()): Date {
  const date = new Intl.DateTimeFormat("en-CA", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit" }).format(at);
  return new Date(`${date}T12:00:00.000Z`);
}

export interface PostgresRepositoryOptions {
  /** Overrides the business clock (tests, back-dated replays). Defaults to today in the company's timezone. */
  now?: (company: Company) => Date;
  /**
   * How long a loaded working set may serve further reads, so one page's several queries share a single load.
   * Writes always reload under the lock and clear this process's cache. Default 1500 ms; 0 disables.
   */
  readCacheMs?: number;
}

export function createPostgresRepository(db: SqlDatabase, options: PostgresRepositoryOptions = {}): AeraRepository {
  const clock = options.now ?? ((company: Company) => businessNow(company.timezone));
  const readCacheMs = options.readCacheMs ?? 1500;
  const reads = new Map<string, { at: number; load: ReturnType<typeof loadDataSet> }>();

  const loadForRead = (companyId: string) => {
    const cached = reads.get(companyId);
    if (cached && Date.now() - cached.at < readCacheMs) return cached.load;
    const load = loadDataSet(db, companyId);
    if (readCacheMs > 0) {
      reads.set(companyId, { at: Date.now(), load });
      load.catch(() => reads.delete(companyId));
    }
    return load;
  };

  const listAudit = async (companyId: string, filter: AuditFilter = {}): Promise<AuditEvent[]> => {
    const [row] = await db.query<{ rows: Array<Record<string, unknown>> }>(
      `select coalesce(json_agg(t), '[]'::json) as rows from (
         select * from public.audit_events
         where company_id = $1 and ($2::text is null or entity_id = $2) and ($3::text is null or entity_type = $3)
         order by created_at desc limit $4) t`,
      [companyId, filter.entityId ?? null, filter.entityType ?? null, filter.limit ?? 100],
    );
    return row.rows.map((item) => fromRow(AUDIT, item) as unknown as AuditEvent);
  };

  return createRepository(async (companyId, mode, fn) => {
    if (mode === "read") {
      const { data, company } = await loadForRead(companyId);
      return fn(new CollectionsEngine(data, clock(company)));
    }
    reads.delete(companyId);
    const result = await db.transaction(async (tx) => {
      // Serialise writers per company so concurrent imports or monitors cannot apply the same payment twice.
      await tx.query("select pg_advisory_xact_lock(hashtextextended($1, 0))", [`aera:${companyId}`]);
      const { data, company } = await loadDataSet(tx, companyId);
      const before = fingerprint(data);
      const result = fn(new CollectionsEngine(data, clock(company)));
      await persist(tx, data, before);
      return result;
    });
    reads.delete(companyId);
    return result;
  }, listAudit);
}
