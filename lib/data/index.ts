import { mockRepository } from "./mock-repository";

// V1 runs locally with deterministic synthetic data. The adapter boundary allows
// Supabase/PostgreSQL to replace this repository without changing API or UI code.
export const repository = mockRepository;
