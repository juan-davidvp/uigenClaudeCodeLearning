// @vitest-environment node
import { describe, test, expect, vi, beforeEach } from "vitest";
import { SignJWT } from "jose";

vi.mock("server-only", () => ({}));

const mockGet = vi.fn();
vi.mock("next/headers", () => ({
  cookies: vi.fn(() => Promise.resolve({ get: mockGet })),
}));

// Must import after mocks are set up
const { getSession } = await import("@/lib/auth");

const JWT_SECRET = Buffer.from("development-secret-key");

async function signToken(payload: object, expirationTime = "7d") {
  return new SignJWT({ ...payload })
    .setProtectedHeader({ alg: "HS256" })
    .setExpirationTime(expirationTime)
    .setIssuedAt()
    .sign(JWT_SECRET);
}

describe("getSession", () => {
  beforeEach(() => {
    mockGet.mockReset();
  });

  test("returns null when no auth cookie is present", async () => {
    mockGet.mockReturnValue(undefined);

    const session = await getSession();

    expect(session).toBeNull();
  });

  test("returns the session payload for a valid token", async () => {
    const payload = {
      userId: "user_123",
      email: "test@example.com",
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    };
    const token = await signToken(payload);
    mockGet.mockReturnValue({ value: token });

    const session = await getSession();

    expect(session).not.toBeNull();
    expect(session?.userId).toBe(payload.userId);
    expect(session?.email).toBe(payload.email);
  });

  test("returns null for an expired token", async () => {
    const token = await signToken(
      { userId: "user_123", email: "test@example.com" },
      "-1s"
    );
    mockGet.mockReturnValue({ value: token });

    const session = await getSession();

    expect(session).toBeNull();
  });

  test("returns null for a tampered token", async () => {
    const token = await signToken({ userId: "user_123", email: "test@example.com" });
    const tampered = token.slice(0, -5) + "XXXXX";
    mockGet.mockReturnValue({ value: tampered });

    const session = await getSession();

    expect(session).toBeNull();
  });
});
