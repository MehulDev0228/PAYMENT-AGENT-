import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

// The sign-up server action against a stubbed Supabase client: the workspace is created only for a
// genuinely new sign-in, never for an email Supabase already knows.
const state = vi.hoisted(() => {
  Object.assign(process.env, { NEXT_PUBLIC_SUPABASE_URL: "https://example.supabase.co", NEXT_PUBLIC_SUPABASE_ANON_KEY: "anon-key", KINDLYPAY_DATA_ADAPTER: "postgres" });
  return { signUp: vi.fn(), createWorkspace: vi.fn(async (): Promise<"created" | "exists"> => "created") };
});
afterAll(() => {
  for (const key of ["NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_ANON_KEY", "KINDLYPAY_DATA_ADAPTER"]) delete process.env[key];
});

vi.mock("next/headers", () => ({ headers: async () => new Headers({ origin: "https://app.example" }) }));
vi.mock("@/lib/auth/supabase", () => ({ createSupabaseServerClient: async () => ({ auth: { signUp: state.signUp } }), verifiedSessionUser: async () => null }));
vi.mock("@/lib/auth/workspace", () => ({ createWorkspaceForUser: state.createWorkspace }));
vi.mock("@/lib/data", () => ({ repository: { createCompany: vi.fn() }, sqlDatabase: () => ({}) }));

const { signUpAction } = await import("@/app/(auth)/actions");

const form = (fields: Record<string, string>) => { const data = new FormData(); for (const [key, value] of Object.entries(fields)) data.set(key, value); return data; };
const valid = { companyName: "CityBond Traders", name: "Asha Rao", email: "Owner@CityBond.test", password: "a-long-password" };
const NEW_USER = { id: "33333333-3333-4333-8333-333333333333", identities: [{ id: "identity" }] };

beforeEach(() => { vi.clearAllMocks(); state.createWorkspace.mockResolvedValue("created"); });

describe("sign-up", () => {
  it("creates the workspace for a new sign-in and asks to confirm the email", async () => {
    state.signUp.mockResolvedValue({ data: { user: NEW_USER, session: null }, error: null });
    const result = await signUpAction({}, form(valid));
    expect(state.signUp).toHaveBeenCalledWith(expect.objectContaining({ email: "owner@citybond.test", options: expect.objectContaining({ emailRedirectTo: "https://app.example/auth/confirm?next=%2Fdashboard%3Fwelcome%3D1" }) }));
    expect(state.createWorkspace).toHaveBeenCalledWith(expect.anything(), expect.any(Function), { userId: NEW_USER.id, email: "owner@citybond.test", name: "Asha Rao", companyName: "CityBond Traders" });
    expect(result.notice).toMatch(/confirmation link/);
  });

  it("goes straight to the new workspace when Supabase does not ask for email confirmation", async () => {
    state.signUp.mockResolvedValue({ data: { user: NEW_USER, session: { access_token: "token" } }, error: null });
    // Next's redirect() throws a control-flow error that carries the target URL.
    const redirected = await signUpAction({}, form({ ...valid, email: "someone@gmail.com" })).then(() => null, (error: { digest?: string }) => error.digest);
    expect(redirected).toContain("/dashboard?welcome=1");
    expect(state.createWorkspace).toHaveBeenCalledWith(expect.anything(), expect.any(Function), expect.objectContaining({ email: "someone@gmail.com" }));
  });

  it("does nothing for an email that is already registered", async () => {
    // Supabase answers with an identity-less user instead of an error, so emails cannot be probed.
    state.signUp.mockResolvedValue({ data: { user: { ...NEW_USER, identities: [] }, session: null }, error: null });
    expect((await signUpAction({}, form(valid))).error).toMatch(/already exists/);
    expect(state.createWorkspace).not.toHaveBeenCalled();
  });

  it("refuses when the account already has a workspace", async () => {
    state.signUp.mockResolvedValue({ data: { user: NEW_USER, session: null }, error: null });
    state.createWorkspace.mockResolvedValue("exists");
    expect((await signUpAction({}, form(valid))).error).toMatch(/already exists/);
  });

  it("validates the form before calling Supabase", async () => {
    expect((await signUpAction({}, form({ ...valid, password: "short" }))).error).toMatch(/8 characters/);
    expect(state.signUp).not.toHaveBeenCalled();
  });
});
