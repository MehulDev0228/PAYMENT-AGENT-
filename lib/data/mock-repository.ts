import { CollectionsEngine } from "./engine";
import { createRepository, type AeraRepository } from "./repository";
import { createSeedData, DEMO_NOW } from "./seed";

/** In-memory adapter over the synthetic seed. Demo mode evaluates every rule against a fixed business date so the dataset stays coherent. */
export function createMockRepository(): AeraRepository {
  const engine = new CollectionsEngine(createSeedData(), DEMO_NOW);
  return createRepository(
    async (_companyId, _mode, fn) => fn(engine),
    async (companyId, filter) => engine.listAudit(companyId, filter),
  );
}

// Bump when the repository shape changes so dev-server hot reloads do not keep a stale instance.
const INSTANCE_VERSION = 4;
declare global { var __aeraMockRepository: { version: number; repository: AeraRepository } | undefined; }

export function sharedMockRepository(): AeraRepository {
  const cached = globalThis.__aeraMockRepository;
  if (cached?.version === INSTANCE_VERSION) return cached.repository;
  const repository = createMockRepository();
  if (process.env.NODE_ENV !== "production") globalThis.__aeraMockRepository = { version: INSTANCE_VERSION, repository };
  return repository;
}
