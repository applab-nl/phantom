import { strictEqual } from "node:assert";
import { describe, it } from "vitest";
import {
  computeZellijSocketDir,
  getZellijMaxSessionNameLength,
} from "./zellij.ts";

describe("computeZellijSocketDir", () => {
  it("uses ZELLIJ_SOCKET_DIR override when set", () => {
    const dir = computeZellijSocketDir({
      platform: "linux",
      tmpDir: "/tmp",
      uid: 1000,
      socketDirOverride: "/custom/sock",
    });
    strictEqual(dir, "/custom/sock/contract_version_1");
  });

  it("uses XDG_RUNTIME_DIR on Linux when no override", () => {
    const dir = computeZellijSocketDir({
      platform: "linux",
      tmpDir: "/tmp",
      uid: 1000,
      xdgRuntimeDir: "/run/user/1000",
    });
    strictEqual(dir, "/run/user/1000/zellij/contract_version_1");
  });

  it("ignores XDG_RUNTIME_DIR on macOS and falls back to tmpdir", () => {
    const dir = computeZellijSocketDir({
      platform: "darwin",
      tmpDir: "/tmp",
      uid: 501,
      xdgRuntimeDir: "/run/user/501",
    });
    strictEqual(dir, "/tmp/zellij-501/contract_version_1");
  });

  it("falls back to tmpdir+uid on Linux when XDG_RUNTIME_DIR is missing", () => {
    const dir = computeZellijSocketDir({
      platform: "linux",
      tmpDir: "/tmp",
      uid: 1000,
    });
    strictEqual(dir, "/tmp/zellij-1000/contract_version_1");
  });
});

describe("getZellijMaxSessionNameLength", () => {
  it("matches the empirically-observed 24 char cap on a typical macOS TMPDIR", () => {
    const max = getZellijMaxSessionNameLength({
      platform: "darwin",
      tmpDir: "/var/folders/mh/rpkh2yvx02sd_jh4g9qc52bm0000gn/T",
      uid: 501,
    });
    strictEqual(max, 24);
  });

  it("gives a much larger cap on Linux with /tmp", () => {
    const max = getZellijMaxSessionNameLength({
      platform: "linux",
      tmpDir: "/tmp",
      uid: 1000,
    });
    // 108 - len("/tmp/zellij-1000/contract_version_1") - 2 = 108 - 35 - 2 = 71
    strictEqual(max, 71);
  });

  it("clamps to zero when the socket prefix exceeds the platform limit", () => {
    const max = getZellijMaxSessionNameLength({
      platform: "darwin",
      tmpDir: "/x".repeat(60),
      uid: 501,
    });
    strictEqual(max, 0);
  });

  it("respects the ZELLIJ_SOCKET_DIR override", () => {
    const max = getZellijMaxSessionNameLength({
      platform: "linux",
      tmpDir: "/tmp",
      uid: 1000,
      socketDirOverride: "/run/zellij",
    });
    // 108 - len("/run/zellij/contract_version_1") - 2 = 108 - 30 - 2 = 76
    strictEqual(max, 76);
  });
});
