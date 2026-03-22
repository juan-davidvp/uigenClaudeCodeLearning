import { describe, test, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useAuth } from "@/hooks/use-auth";
import * as actions from "@/actions";
import * as anonTracker from "@/lib/anon-work-tracker";
import * as getProjectsModule from "@/actions/get-projects";
import * as createProjectModule from "@/actions/create-project";

const mockPush = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush }),
}));

vi.mock("@/actions", () => ({
  signIn: vi.fn(),
  signUp: vi.fn(),
}));

vi.mock("@/lib/anon-work-tracker", () => ({
  getAnonWorkData: vi.fn(),
  clearAnonWork: vi.fn(),
}));

vi.mock("@/actions/get-projects", () => ({
  getProjects: vi.fn(),
}));

vi.mock("@/actions/create-project", () => ({
  createProject: vi.fn(),
}));

const makeProject = (id: string) => ({
  id,
  name: "Test Project",
  createdAt: new Date(),
  updatedAt: new Date(),
});

describe("useAuth", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(anonTracker.getAnonWorkData).mockReturnValue(null);
    vi.mocked(getProjectsModule.getProjects).mockResolvedValue([]);
    vi.mocked(createProjectModule.createProject).mockResolvedValue(
      makeProject("new-project-id")
    );
  });

  test("isLoading starts as false", () => {
    const { result } = renderHook(() => useAuth());
    expect(result.current.isLoading).toBe(false);
  });

  describe("signIn", () => {
    test("returns the result from the action", async () => {
      vi.mocked(actions.signIn).mockResolvedValue({ success: true });
      vi.mocked(getProjectsModule.getProjects).mockResolvedValue([
        makeProject("proj-1"),
      ]);

      const { result } = renderHook(() => useAuth());
      let returnValue: any;

      await act(async () => {
        returnValue = await result.current.signIn("user@example.com", "pass");
      });

      expect(returnValue).toEqual({ success: true });
      expect(actions.signIn).toHaveBeenCalledWith("user@example.com", "pass");
    });

    test("isLoading is true during sign in and false after", async () => {
      let resolveSignIn: (v: any) => void;
      vi.mocked(actions.signIn).mockImplementation(
        () => new Promise((r) => { resolveSignIn = r; })
      );

      const { result } = renderHook(() => useAuth());

      let signInPromise: Promise<any>;
      act(() => {
        signInPromise = result.current.signIn("user@example.com", "pass");
      });

      expect(result.current.isLoading).toBe(true);

      await act(async () => {
        resolveSignIn!({ success: false, error: "Invalid credentials" });
        await signInPromise;
      });

      expect(result.current.isLoading).toBe(false);
    });

    test("isLoading resets to false when the action throws", async () => {
      vi.mocked(actions.signIn).mockRejectedValue(new Error("Network error"));

      const { result } = renderHook(() => useAuth());

      await act(async () => {
        await expect(
          result.current.signIn("user@example.com", "pass")
        ).rejects.toThrow("Network error");
      });

      expect(result.current.isLoading).toBe(false);
    });

    test("does not redirect when sign in fails", async () => {
      vi.mocked(actions.signIn).mockResolvedValue({
        success: false,
        error: "Invalid credentials",
      });

      const { result } = renderHook(() => useAuth());

      await act(async () => {
        await result.current.signIn("user@example.com", "wrong");
      });

      expect(mockPush).not.toHaveBeenCalled();
    });

    test("returns error result when sign in fails", async () => {
      vi.mocked(actions.signIn).mockResolvedValue({
        success: false,
        error: "Invalid credentials",
      });

      const { result } = renderHook(() => useAuth());
      let returnValue: any;

      await act(async () => {
        returnValue = await result.current.signIn("user@example.com", "wrong");
      });

      expect(returnValue).toEqual({
        success: false,
        error: "Invalid credentials",
      });
    });
  });

  describe("signUp", () => {
    test("returns the result from the action", async () => {
      vi.mocked(actions.signUp).mockResolvedValue({ success: true });
      vi.mocked(getProjectsModule.getProjects).mockResolvedValue([
        makeProject("proj-1"),
      ]);

      const { result } = renderHook(() => useAuth());
      let returnValue: any;

      await act(async () => {
        returnValue = await result.current.signUp("new@example.com", "pass123");
      });

      expect(returnValue).toEqual({ success: true });
      expect(actions.signUp).toHaveBeenCalledWith("new@example.com", "pass123");
    });

    test("isLoading is true during sign up and false after", async () => {
      let resolveSignUp: (v: any) => void;
      vi.mocked(actions.signUp).mockImplementation(
        () => new Promise((r) => { resolveSignUp = r; })
      );

      const { result } = renderHook(() => useAuth());

      let signUpPromise: Promise<any>;
      act(() => {
        signUpPromise = result.current.signUp("new@example.com", "pass123");
      });

      expect(result.current.isLoading).toBe(true);

      await act(async () => {
        resolveSignUp!({ success: false, error: "Email already registered" });
        await signUpPromise;
      });

      expect(result.current.isLoading).toBe(false);
    });

    test("isLoading resets to false when the action throws", async () => {
      vi.mocked(actions.signUp).mockRejectedValue(new Error("Server error"));

      const { result } = renderHook(() => useAuth());

      await act(async () => {
        await expect(
          result.current.signUp("new@example.com", "pass123")
        ).rejects.toThrow("Server error");
      });

      expect(result.current.isLoading).toBe(false);
    });

    test("does not redirect when sign up fails", async () => {
      vi.mocked(actions.signUp).mockResolvedValue({
        success: false,
        error: "Email already registered",
      });

      const { result } = renderHook(() => useAuth());

      await act(async () => {
        await result.current.signUp("existing@example.com", "pass123");
      });

      expect(mockPush).not.toHaveBeenCalled();
    });
  });

  describe("post-sign-in redirect logic", () => {
    beforeEach(() => {
      vi.mocked(actions.signIn).mockResolvedValue({ success: true });
      vi.mocked(actions.signUp).mockResolvedValue({ success: true });
    });

    test("creates project from anon work and redirects when messages exist", async () => {
      const anonData = {
        messages: [{ id: "1", role: "user", content: "Build me a button" }],
        fileSystemData: { "/Button.jsx": { type: "file", content: "..." } },
      };
      vi.mocked(anonTracker.getAnonWorkData).mockReturnValue(anonData);
      vi.mocked(createProjectModule.createProject).mockResolvedValue(
        makeProject("anon-proj-id")
      );

      const { result } = renderHook(() => useAuth());

      await act(async () => {
        await result.current.signIn("user@example.com", "pass");
      });

      expect(createProjectModule.createProject).toHaveBeenCalledWith(
        expect.objectContaining({
          messages: anonData.messages,
          data: anonData.fileSystemData,
        })
      );
      expect(anonTracker.clearAnonWork).toHaveBeenCalled();
      expect(mockPush).toHaveBeenCalledWith("/anon-proj-id");
      expect(getProjectsModule.getProjects).not.toHaveBeenCalled();
    });

    test("project name includes a timestamp when saving anon work", async () => {
      vi.mocked(anonTracker.getAnonWorkData).mockReturnValue({
        messages: [{ id: "1", role: "user", content: "Hello" }],
        fileSystemData: {},
      });
      vi.mocked(createProjectModule.createProject).mockResolvedValue(
        makeProject("anon-proj-id")
      );

      const { result } = renderHook(() => useAuth());

      await act(async () => {
        await result.current.signIn("user@example.com", "pass");
      });

      expect(createProjectModule.createProject).toHaveBeenCalledWith(
        expect.objectContaining({ name: expect.stringContaining("Design from") })
      );
    });

    test("ignores anon work when messages array is empty", async () => {
      vi.mocked(anonTracker.getAnonWorkData).mockReturnValue({
        messages: [],
        fileSystemData: { "/App.jsx": { type: "file" } },
      });
      vi.mocked(getProjectsModule.getProjects).mockResolvedValue([
        makeProject("existing-id"),
      ]);

      const { result } = renderHook(() => useAuth());

      await act(async () => {
        await result.current.signIn("user@example.com", "pass");
      });

      expect(anonTracker.clearAnonWork).not.toHaveBeenCalled();
      expect(mockPush).toHaveBeenCalledWith("/existing-id");
    });

    test("redirects to the most recent project when no anon work exists", async () => {
      vi.mocked(getProjectsModule.getProjects).mockResolvedValue([
        makeProject("recent-id"),
        makeProject("older-id"),
      ]);

      const { result } = renderHook(() => useAuth());

      await act(async () => {
        await result.current.signIn("user@example.com", "pass");
      });

      expect(mockPush).toHaveBeenCalledWith("/recent-id");
      expect(createProjectModule.createProject).not.toHaveBeenCalled();
    });

    test("creates a new blank project when no anon work and no existing projects", async () => {
      vi.mocked(getProjectsModule.getProjects).mockResolvedValue([]);
      vi.mocked(createProjectModule.createProject).mockResolvedValue(
        makeProject("brand-new-id")
      );

      const { result } = renderHook(() => useAuth());

      await act(async () => {
        await result.current.signIn("user@example.com", "pass");
      });

      expect(createProjectModule.createProject).toHaveBeenCalledWith(
        expect.objectContaining({ messages: [], data: {} })
      );
      expect(mockPush).toHaveBeenCalledWith("/brand-new-id");
    });

    test("anon work flow also works after sign up", async () => {
      const anonData = {
        messages: [{ id: "1", role: "user", content: "Hello" }],
        fileSystemData: {},
      };
      vi.mocked(anonTracker.getAnonWorkData).mockReturnValue(anonData);
      vi.mocked(createProjectModule.createProject).mockResolvedValue(
        makeProject("signup-anon-id")
      );

      const { result } = renderHook(() => useAuth());

      await act(async () => {
        await result.current.signUp("new@example.com", "pass123");
      });

      expect(anonTracker.clearAnonWork).toHaveBeenCalled();
      expect(mockPush).toHaveBeenCalledWith("/signup-anon-id");
    });

    test("existing projects flow also works after sign up", async () => {
      vi.mocked(getProjectsModule.getProjects).mockResolvedValue([
        makeProject("my-proj-id"),
      ]);

      const { result } = renderHook(() => useAuth());

      await act(async () => {
        await result.current.signUp("user@example.com", "pass123");
      });

      expect(mockPush).toHaveBeenCalledWith("/my-proj-id");
    });
  });
});
