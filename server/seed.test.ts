import { describe, expect, it } from "vitest";
import { createSeedData } from "./seed";

describe("seed data", () => {
  it("does not persist an admin password in schedule data", () => {
    const data = createSeedData();

    expect("adminPassword" in data.settings).toBe(false);
  });
});
