import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { CLI_ERR } from "./cli-error-codes";
import {
  fetchApi,
  fetchApiMutate,
  fetchApiTrashMutate,
  fetchHealth,
} from "./api-client";
import { CliError } from "./output";

describe("api-client (mock fetch)", () => {
  const origFetch = globalThis.fetch;

  /** Bun's `fetch` type includes `preconnect`; narrow assignment for test doubles. */
  function setMockFetch(
    impl: (
      input: RequestInfo | URL,
      init?: RequestInit,
    ) => Promise<Response>,
  ): void {
    globalThis.fetch = impl as unknown as typeof globalThis.fetch;
  }

  beforeEach(() => {
    globalThis.fetch = origFetch;
  });

  afterEach(() => {
    globalThis.fetch = origFetch;
  });

  test("fetchApi returns parsed JSON on 200", async () => {
    setMockFetch(async (input: RequestInfo | URL) => {
      const url = typeof input === "string" ? input : (input as Request).url;
      expect(url).toBe("http://127.0.0.1:19991/api/boards");
      return new Response(JSON.stringify([{ id: 1, slug: "a" }]), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    });

    const data = await fetchApi<{ id: number; slug: string }[]>("/boards", {
      port: 19991,
    });
    expect(data).toEqual([{ id: 1, slug: "a" }]);
  });

  test("fetchApi maps 401 JSON error to unauthenticated exit 10", async () => {
    setMockFetch(async () =>
      new Response(
        JSON.stringify({ error: "Invalid token", code: "bad_token" }),
        {
          status: 401,
          headers: { "content-type": "application/json" },
        },
      ),
    );

    await expect(fetchApi("/x", { port: 19991 })).rejects.toMatchObject({
      name: "CliError",
      exitCode: 10,
      message: "Invalid token",
      details: expect.objectContaining({
        code: CLI_ERR.unauthenticated,
        serverCode: "bad_token",
      }),
    });
  });

  test("fetchApi maps 404 JSON error to CliError", async () => {
    setMockFetch(async () =>
      new Response(JSON.stringify({ error: "missing", code: "X" }), {
        status: 404,
        headers: { "content-type": "application/json" },
      }),
    );

    await expect(fetchApi("/nope", { port: 19992 })).rejects.toMatchObject({
      name: "CliError",
      exitCode: 3,
      message: "missing",
      details: expect.objectContaining({
        code: CLI_ERR.notFound,
        serverCode: "X",
      }),
    });
  });

  test("fetchApi maps non-JSON error body using status", async () => {
    setMockFetch(async () =>
      new Response("plain error", {
        status: 403,
        headers: { "content-type": "text/plain" },
      }),
    );

    await expect(fetchApi("/x", { port: 19993 })).rejects.toMatchObject({
      exitCode: 4,
      details: expect.objectContaining({ code: CLI_ERR.forbidden }),
    });
  });

  test("fetchApi: fetch throws AbortError → request_timeout exit 7", async () => {
    setMockFetch(async () => {
      const err = new Error("aborted");
      err.name = "AbortError";
      throw err;
    });

    await expect(fetchApi("/x", { port: 19994 })).rejects.toMatchObject({
      exitCode: 7,
      details: expect.objectContaining({
        code: CLI_ERR.requestTimeout,
        retryable: true,
      }),
    });
  });

  test("fetchApi: fetch throws other error → server_unreachable exit 6 + hint", async () => {
    setMockFetch(async () => {
      throw new Error("ECONNREFUSED");
    });

    try {
      await fetchApi("/x", { port: 19995 });
      expect.unreachable();
    } catch (e) {
      expect(e).toBeInstanceOf(CliError);
      const ce = e as CliError;
      expect(ce.exitCode).toBe(6);
      expect(ce.details?.code).toBe(CLI_ERR.serverUnreachable);
      expect(String(ce.details?.hint)).toContain("hirotm");
      expect(String(ce.details?.hint)).toContain("server");
      expect(ce.details?.retryable).toBe(true);
    }
  });

  test("fetchApiMutate returns undefined on 204", async () => {
    setMockFetch(async () => new Response(null, { status: 204 }));

    const out = await fetchApiMutate<undefined>(
      "/boards/1",
      { method: "DELETE" },
      { port: 19996 },
    );
    expect(out).toBeUndefined();
  });

  test("fetchApiMutate error path maps status", async () => {
    setMockFetch(async () =>
      new Response(JSON.stringify({ error: "nope" }), {
        status: 409,
        headers: { "content-type": "application/json" },
      }),
    );

    await expect(
      fetchApiMutate("/x", { method: "POST", body: {} }, { port: 19997 }),
    ).rejects.toMatchObject({
      exitCode: 5,
      details: expect.objectContaining({ code: CLI_ERR.conflict }),
    });
  });

  test("fetchApiTrashMutate success JSON", async () => {
    setMockFetch(async () =>
      new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );

    const body = await fetchApiTrashMutate<{ ok: boolean }>(
      "/trash/boards/1/restore",
      { method: "POST" },
      { port: 19998 },
    );
    expect(body).toEqual({ ok: true });
  });

  test("fetchApiTrashMutate error maps to CliError", async () => {
    setMockFetch(async () =>
      new Response(JSON.stringify({ error: "bad" }), {
        status: 400,
        headers: { "content-type": "application/json" },
      }),
    );

    await expect(
      fetchApiTrashMutate("/trash/x", { method: "POST" }, { port: 19999 }),
    ).rejects.toMatchObject({
      exitCode: 9,
      details: expect.objectContaining({ code: CLI_ERR.badRequest }),
    });
  });

  test("fetchHealth true when ok JSON", async () => {
    setMockFetch(async () =>
      new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );

    await expect(fetchHealth({ port: 20000 })).resolves.toBe(true);
  });

  test("fetchHealth false when not ok", async () => {
    setMockFetch(async () =>
      new Response(JSON.stringify({ ok: false }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );

    await expect(fetchHealth({ port: 20001 })).resolves.toBe(false);
  });

  test("fetchHealth false on fetch throw", async () => {
    setMockFetch(async () => {
      throw new Error("down");
    });

    await expect(fetchHealth({ port: 20002 })).resolves.toBe(false);
  });
});
