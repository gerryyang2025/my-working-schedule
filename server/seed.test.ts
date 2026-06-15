import { afterEach, describe, expect, it } from "vitest";
import { DEFAULT_ADMIN_PASSWORD, createSeedData } from "./seed";

const ADMIN_PASSWORD_ENV = "SCHEDULE_ADMIN_PASSWORD";
const originalAdminPasswordEnv = process.env[ADMIN_PASSWORD_ENV];

afterEach(() => {
  if (originalAdminPasswordEnv === undefined) {
    delete process.env[ADMIN_PASSWORD_ENV];
  } else {
    process.env[ADMIN_PASSWORD_ENV] = originalAdminPasswordEnv;
  }
});

describe("seed data", () => {
  it.each(["", "   "])("ignores blank admin password env value %j", (envValue) => {
    process.env[ADMIN_PASSWORD_ENV] = envValue;

    const data = createSeedData();

    expect(data.settings.adminPassword).toBe(DEFAULT_ADMIN_PASSWORD);
  });

  it("uses a non-empty admin password env override", () => {
    process.env[ADMIN_PASSWORD_ENV] = "override-password";

    const data = createSeedData();

    expect(data.settings.adminPassword).toBe("override-password");
  });

  it("uses the default admin password when env is unset", () => {
    delete process.env[ADMIN_PASSWORD_ENV];

    const data = createSeedData();

    expect(data.settings.adminPassword).toBe(DEFAULT_ADMIN_PASSWORD);
  });
});
