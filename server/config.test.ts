import { describe, expect, it } from "vitest";

import { resolveServerConfig } from "./config";

describe("server config", () => {
  it("binds to all interfaces by default for LAN access", () => {
    const config = resolveServerConfig({});

    expect(config.host).toBe("0.0.0.0");
    expect(config.port).toBe(3001);
    expect(config.storagePath).toBeUndefined();
  });

  it("allows host, port, and storage path overrides", () => {
    const config = resolveServerConfig({
      HOST: "127.0.0.1",
      PORT: "4100",
      SCHEDULE_DATA_PATH: "/tmp/schedule.json"
    });

    expect(config.host).toBe("127.0.0.1");
    expect(config.port).toBe(4100);
    expect(config.storagePath).toBe("/tmp/schedule.json");
  });
});
