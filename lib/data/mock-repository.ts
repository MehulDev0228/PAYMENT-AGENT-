import { defaultPolicy } from "@/lib/domain/policy";
import { CollectionsEngine } from "./engine";
import { createRepository, type KindlyPayRepository } from "./repository";
import { createSeedData, DEMO_NOW } from "./seed";

/** In-memory adapter over the synthetic seed. Demo mode evaluates every rule against a fixed business date so the dataset stays coherent. */
export function createMockRepository(): KindlyPayRepository {
  const engine = new CollectionsEngine(createSeedData(), DEMO_NOW);
  return createRepository(
    async (_companyId, _mode, fn) => fn(engine),
    async (companyId, filter) => engine.listAudit(companyId, filter),
    async (input) => {
      if (engine.data.companies.some((company) => company.id === input.id)) return;
      engine.data.companies.push({ id: input.id, name: input.name, currency: input.currency ?? "INR", timezone: input.timezone ?? "Asia/Kolkata", autonomyMode: "routine_automatic", createdAt: new Date().toISOString() });
      engine.data.policies.push(defaultPolicy(input.id));
    },
  );
}

// Bump when the repository shape changes so dev-server hot reloads do not keep a stale instance.
const INSTANCE_VERSION = 6;
declare global { var __kindlypayMockRepository: { version: number; repository: KindlyPayRepository } | undefined; }

export function sharedMockRepository(): KindlyPayRepository {
  const cached = globalThis.__kindlypayMockRepository;
  if (cached?.version === INSTANCE_VERSION) return cached.repository;
  const repository = createMockRepository();
  if (process.env.NODE_ENV !== "production") globalThis.__kindlypayMockRepository = { version: INSTANCE_VERSION, repository };
  return repository;
}
