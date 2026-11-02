import { randomUUID } from "node:crypto";
import { hashPassword, verifyPassword, type Role } from "@/lib/session";
import { repository } from "./index";
import { createPgDatabase, type SqlDatabase } from "./sql";

export interface Account {
  id: string;
  companyId: string;
  companyName: string;
  name: string;
  email: string;
  role: Role;
}

export interface SignUpInput { companyName: string; name: string; email: string; password: string }

interface StoredAccount extends Account { passwordHash: string }

interface AccountStore {
  findByEmail(email: string): Promise<StoredAccount | undefined>;
  insert(account: StoredAccount): Promise<void>;
}

/** Workspace sign-in accounts. Kept apart from the collections repository: credentials never enter the engine. */
export async function signUp(input: SignUpInput): Promise<Account> {
  const email = input.email.trim().toLowerCase();
  if (await store().findByEmail(email)) throw new AccountError("An account with this email already exists. Sign in instead.");
  const companyId = randomUUID();
  await repository.createCompany({ id: companyId, name: input.companyName.trim() });
  const account: StoredAccount = { id: randomUUID(), companyId, companyName: input.companyName.trim(), name: input.name.trim(), email, role: "admin", passwordHash: hashPassword(input.password) };
  await store().insert(account);
  return publicAccount(account);
}

export async function signIn(email: string, password: string): Promise<Account> {
  const account = await store().findByEmail(email.trim().toLowerCase());
  // Hash even when the email is unknown so response time does not reveal which emails exist.
  const valid = account ? verifyPassword(password, account.passwordHash) : (verifyPassword(password, DUMMY_HASH), false);
  if (!account || !valid) throw new AccountError("That email and password don't match.");
  // Demo mode keeps companies in memory; if the demo data was reset, give the account its empty company back.
  if (store() === memoryStore) await repository.createCompany({ id: account.companyId, name: account.companyName });
  return publicAccount(account);
}

export class AccountError extends Error {}

const DUMMY_HASH = hashPassword("kindlypay-timing-guard");
const publicAccount = ({ passwordHash: _hash, ...account }: StoredAccount): Account => account;

// ------------------------------------------------------------------- stores

declare global {
  var __kindlypayAccounts: Map<string, StoredAccount> | undefined;
  var __kindlypayDatabase: SqlDatabase | undefined;
}

/** Demo mode: accounts live in memory beside the in-memory demo data, and reset when the server restarts. */
const memoryStore: AccountStore = {
  async findByEmail(email) { return (globalThis.__kindlypayAccounts ??= new Map()).get(email); },
  async insert(account) { (globalThis.__kindlypayAccounts ??= new Map()).set(account.email, account); },
};

function postgresStore(): AccountStore {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is required for the postgres adapter");
  const db = (globalThis.__kindlypayDatabase ??= createPgDatabase(url));
  return {
    async findByEmail(email) {
      const [row] = await db.query<{ id: string; company_id: string; company_name: string; name: string; email: string; role: Role; password_hash: string }>(
        `select a.id, a.company_id, c.name as company_name, a.name, a.email, a.role, a.password_hash
           from public.accounts a join public.companies c on c.id = a.company_id where lower(a.email) = $1`, [email]);
      return row && { id: row.id, companyId: row.company_id, companyName: row.company_name, name: row.name, email: row.email, role: row.role, passwordHash: row.password_hash };
    },
    async insert(account) {
      await db.query("insert into public.accounts (id, company_id, name, email, password_hash, role) values ($1, $2, $3, $4, $5, $6)",
        [account.id, account.companyId, account.name, account.email, account.passwordHash, account.role]);
    },
  };
}

function store(): AccountStore {
  const adapter = process.env.KINDLYPAY_DATA_ADAPTER || "mock";
  return adapter === "mock" ? memoryStore : postgresStore();
}
