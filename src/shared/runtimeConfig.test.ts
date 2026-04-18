import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { CLI_ERR, CliError } from "../cli/types/errors";
import {
  readProfileConfig,
  resetRuntimeConfigSelectionForTests,
  resetRuntimeConfigWarningsForTests,
  resolveApiUrl,
  resolveProfileName,
  validateRuntimeConfigFile,
  writeDefaultProfileName,
} from "./runtimeConfig";

describe("validateRuntimeConfigFile", () => {
  test("server profile: rejects client api_url", () => {
    try {
      validateRuntimeConfigFile(
        {
          role: "server",
          port: 3001,
          data_dir: "/d",
          auth_dir: "/a",
          api_url: "http://x",
        },
        "/p/config.json",
      );
      expect.unreachable();
    } catch (e) {
      expect(e).toBeInstanceOf(CliError);
      expect((e as CliError).details?.code).toBe(CLI_ERR.invalidConfig);
    }
  });

  test("client profile: rejects server-only fields", () => {
    expect(() =>
      validateRuntimeConfigFile(
        {
          role: "client",
          api_url: "https://h.example/api",
          api_key: `tmk-${"a".repeat(64)}`,
          port: 1,
        },
        "/p/config.json",
      ),
    ).toThrow(CliError);
  });

  test("client profile: rejects malformed api_key (not tmk-<64 hex>)", () => {
    // Catches typo'd or truncated pastes during --setup-client at write time
    // instead of letting them surface later as auth_invalid_cli_key from the
    // server (issue #7 follow-up).
    try {
      validateRuntimeConfigFile(
        {
          role: "client",
          api_url: "https://h.example/api",
          api_key: "k",
        },
        "/p/config.json",
      );
      expect.unreachable();
    } catch (e) {
      expect(e).toBeInstanceOf(CliError);
      expect((e as CliError).details?.code).toBe(CLI_ERR.invalidConfig);
      expect((e as CliError).details?.fields).toContain("api_key");
    }
  });

  test("server profile: rejects malformed api_key (not tmk-<64 hex>)", () => {
    // Same shape rule applies to the local-CLI copy on a server profile
    // (design §2.6 — same value as on a client profile).
    try {
      validateRuntimeConfigFile(
        {
          role: "server",
          port: 3001,
          data_dir: "/d",
          auth_dir: "/a",
          api_key: "not-a-real-key",
        },
        "/p/config.json",
      );
      expect.unreachable();
    } catch (e) {
      expect(e).toBeInstanceOf(CliError);
      expect((e as CliError).details?.code).toBe(CLI_ERR.invalidConfig);
      expect((e as CliError).details?.fields).toEqual(["api_key"]);
    }
  });

  test("server profile: rejects require_cli_api_key false on non-loopback bind", () => {
    expect(() =>
      validateRuntimeConfigFile(
        {
          role: "server",
          port: 3001,
          data_dir: "/d",
          auth_dir: "/a",
          bind_address: "0.0.0.0",
          require_cli_api_key: false,
        },
        "/p/config.json",
      ),
    ).toThrow(CliError);
  });

  test("server profile: rejects omitted require_cli_api_key on non-loopback bind", () => {
    // Closes the foot-gun where bind_address is public but the operator
    // forgot to set require_cli_api_key. Runtime resolver derives `true`,
    // but the field MUST be explicit so the choice is auditable.
    try {
      validateRuntimeConfigFile(
        {
          role: "server",
          port: 3001,
          data_dir: "/d",
          auth_dir: "/a",
          bind_address: "0.0.0.0",
        },
        "/p/config.json",
      );
      expect.unreachable();
    } catch (e) {
      expect(e).toBeInstanceOf(CliError);
      expect((e as CliError).details?.code).toBe(CLI_ERR.invalidConfig);
      expect((e as CliError).details?.fields).toEqual(["require_cli_api_key"]);
    }
  });

  test("server profile: accepts non-loopback bind when require_cli_api_key is explicit true", () => {
    const c = validateRuntimeConfigFile(
      {
        role: "server",
        port: 3001,
        data_dir: "/d",
        auth_dir: "/a",
        bind_address: "0.0.0.0",
        require_cli_api_key: true,
        api_key: `tmk-${"a".repeat(64)}`,
      },
      "/p/config.json",
    );
    expect(c.bind_address).toBe("0.0.0.0");
    expect(c.require_cli_api_key).toBe(true);
  });

  test("server profile: rejects malformed bind_address (typo)", () => {
    // Catches operator typos at config-load time (e.g. `127.0.0..1`) instead
    // of letting them surface later as a Bun.serve listen failure.
    try {
      validateRuntimeConfigFile(
        {
          role: "server",
          port: 3001,
          data_dir: "/d",
          auth_dir: "/a",
          bind_address: "127.0.0..1",
        },
        "/p/config.json",
      );
      expect.unreachable();
    } catch (e) {
      expect(e).toBeInstanceOf(CliError);
      expect((e as CliError).details?.code).toBe(CLI_ERR.invalidConfig);
      expect((e as CliError).details?.fields).toContain("bind_address");
    }
  });

  test("server profile: accepts hostname bind_address (e.g. eth0.local)", () => {
    const c = validateRuntimeConfigFile(
      {
        role: "server",
        port: 3001,
        data_dir: "/d",
        auth_dir: "/a",
        bind_address: "eth0.local",
        require_cli_api_key: true,
        api_key: `tmk-${"a".repeat(64)}`,
      },
      "/p/config.json",
    );
    expect(c.bind_address).toBe("eth0.local");
  });

  test("server profile: accepts IPv6 wildcard bind_address", () => {
    const c = validateRuntimeConfigFile(
      {
        role: "server",
        port: 3001,
        data_dir: "/d",
        auth_dir: "/a",
        bind_address: "::",
        require_cli_api_key: true,
        api_key: `tmk-${"a".repeat(64)}`,
      },
      "/p/config.json",
    );
    expect(c.bind_address).toBe("::");
  });

  test("client profile: accepts valid absolute https URL", () => {
    const c = validateRuntimeConfigFile(
      {
        role: "client",
        api_url: "https://remote.example",
        api_key: `tmk-${"b".repeat(64)}`,
      },
      "/p/config.json",
    );
    expect(c.role).toBe("client");
    expect(c.api_url).toBe("https://remote.example");
  });
});

describe("resolveApiUrl", () => {
  test("server profile derives loopback URL from port", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "tm-rt-"));
    try {
      const profileDir = path.join(dir, ".taskmanager", "profiles", "default");
      mkdirSync(profileDir, { recursive: true });
      writeFileSync(
        path.join(profileDir, "config.json"),
        JSON.stringify({
          role: "server",
          port: 3044,
          data_dir: path.join(profileDir, "data"),
          auth_dir: path.join(profileDir, "auth"),
        }),
        "utf8",
      );
      const prevHome = process.env.HOME;
      process.env.HOME = dir;
      process.env.USERPROFILE = dir;
      expect(
        resolveApiUrl({ profile: "default", kind: "installed" }),
      ).toBe("http://127.0.0.1:3044");
      process.env.HOME = prevHome;
      process.env.USERPROFILE = prevHome;
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("client profile returns configured api_url (trimmed trailing slashes in caller)", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "tm-rt-"));
    try {
      const profileDir = path.join(dir, ".taskmanager", "profiles", "remote");
      mkdirSync(profileDir, { recursive: true });
      writeFileSync(
        path.join(profileDir, "config.json"),
        JSON.stringify({
          role: "client",
          api_url: "https://api.example.com/",
          api_key: `tmk-${"c".repeat(64)}`,
        }),
        "utf8",
      );
      const prevHome = process.env.HOME;
      process.env.HOME = dir;
      process.env.USERPROFILE = dir;
      expect(resolveApiUrl({ profile: "remote", kind: "installed" })).toBe(
        "https://api.example.com",
      );
      process.env.HOME = prevHome;
      process.env.USERPROFILE = prevHome;
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe("resolveProfileName + default pointer", () => {
  let prevHome: string | undefined;
  let tmpRoot: string;

  beforeEach(() => {
    resetRuntimeConfigSelectionForTests();
    tmpRoot = mkdtempSync(path.join(tmpdir(), "tm-prof-"));
    prevHome = process.env.HOME;
    process.env.HOME = tmpRoot;
    process.env.USERPROFILE = tmpRoot;
  });

  afterEach(() => {
    try {
      rmSync(tmpRoot, { recursive: true, force: true });
    } catch {
      /* ignore */
    }
    process.env.HOME = prevHome;
    process.env.USERPROFILE = prevHome;
  });

  test("top-level default_profile is used when argv profile is unset", () => {
    mkdirSync(path.join(tmpRoot, ".taskmanager", "profiles", "a"), {
      recursive: true,
    });
    mkdirSync(path.join(tmpRoot, ".taskmanager", "profiles", "b"), {
      recursive: true,
    });
    writeFileSync(
      path.join(tmpRoot, ".taskmanager", "profiles", "a", "config.json"),
      '{"role":"server","port":1,"data_dir":"/d","auth_dir":"/a"}',
      "utf8",
    );
    writeFileSync(
      path.join(tmpRoot, ".taskmanager", "profiles", "b", "config.json"),
      '{"role":"server","port":2,"data_dir":"/d","auth_dir":"/a"}',
      "utf8",
    );
    writeDefaultProfileName("b");
    expect(resolveProfileName({ kind: "installed" })).toBe("b");
  });

  test("multiple profiles without pointer throws invalid_config", () => {
    mkdirSync(path.join(tmpRoot, ".taskmanager", "profiles", "a"), {
      recursive: true,
    });
    mkdirSync(path.join(tmpRoot, ".taskmanager", "profiles", "b"), {
      recursive: true,
    });
    writeFileSync(
      path.join(tmpRoot, ".taskmanager", "profiles", "a", "config.json"),
      '{"role":"server","port":1,"data_dir":"/d","auth_dir":"/a"}',
      "utf8",
    );
    writeFileSync(
      path.join(tmpRoot, ".taskmanager", "profiles", "b", "config.json"),
      '{"role":"server","port":2,"data_dir":"/d","auth_dir":"/a"}',
      "utf8",
    );
    expect(() => resolveProfileName({ kind: "installed" })).toThrow(CliError);
  });
});

describe("validateRuntimeConfigFile warn dedup", () => {
  test("require_cli_api_key=true with missing api_key warns at most once per (path,message)", () => {
    resetRuntimeConfigWarningsForTests();
    const original = console.warn;
    let calls = 0;
    console.warn = () => {
      calls += 1;
    };
    try {
      const cfg = {
        role: "server" as const,
        port: 3001,
        data_dir: "/d",
        auth_dir: "/a",
        bind_address: "127.0.0.1",
        require_cli_api_key: true,
      };
      validateRuntimeConfigFile(cfg, "/p/config.json");
      validateRuntimeConfigFile(cfg, "/p/config.json");
      validateRuntimeConfigFile(cfg, "/p/config.json");
      expect(calls).toBe(1);
    } finally {
      console.warn = original;
      resetRuntimeConfigWarningsForTests();
    }
  });
});

describe("readProfileConfig", () => {
  test("invalid JSON throws invalidConfig", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "tm-rc-"));
    try {
      const profileDir = path.join(dir, ".taskmanager", "profiles", "default");
      mkdirSync(profileDir, { recursive: true });
      writeFileSync(path.join(profileDir, "config.json"), "{", "utf8");
      const prevHome = process.env.HOME;
      process.env.HOME = dir;
      process.env.USERPROFILE = dir;
      expect(() => readProfileConfig({ profile: "default" })).toThrow(
        CliError,
      );
      process.env.HOME = prevHome;
      process.env.USERPROFILE = prevHome;
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
