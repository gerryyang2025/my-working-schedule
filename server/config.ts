import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

export interface ServerConfig {
  host: string;
  port: number;
  storagePath?: string;
  adminPassword?: string;
}

interface ServerEnv {
  HOST?: string;
  PORT?: string;
  SCHEDULE_DATA_PATH?: string;
  SCHEDULE_ADMIN_PASSWORD?: string;
  SCHEDULE_CONFIG_PATH?: string;
}

interface ServerFileConfig {
  host?: unknown;
  port?: unknown;
  storagePath?: unknown;
  adminPassword?: unknown;
}

interface ResolveServerConfigOptions {
  defaultConfigPath?: string | null;
}

export const DEFAULT_SERVER_CONFIG_PATH = resolve(process.cwd(), "config/server.local.json");

function nonBlankString(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }

  const trimmedValue = value.trim();
  return trimmedValue.length > 0 ? trimmedValue : undefined;
}

function parsePort(value: unknown): number | undefined {
  if (value === undefined || value === null || value === "") {
    return undefined;
  }

  const port = Number(value);
  if (!Number.isInteger(port) || port <= 0 || port > 65535) {
    throw new Error("服务端端口配置不正确");
  }

  return port;
}

function readServerFileConfig(path: string, required: boolean): ServerFileConfig {
  if (!existsSync(path)) {
    if (required) {
      throw new Error(`服务端配置文件不存在: ${path}`);
    }
    return {};
  }

  const parsedConfig: unknown = JSON.parse(readFileSync(path, "utf8"));
  if (typeof parsedConfig !== "object" || parsedConfig === null || Array.isArray(parsedConfig)) {
    throw new Error("服务端配置文件结构不正确");
  }

  return parsedConfig;
}

export function resolveServerConfig(
  env: ServerEnv = process.env,
  options: ResolveServerConfigOptions = {}
): ServerConfig {
  const explicitConfigPath = nonBlankString(env.SCHEDULE_CONFIG_PATH);
  const defaultConfigPath = options.defaultConfigPath === undefined ? DEFAULT_SERVER_CONFIG_PATH : options.defaultConfigPath;
  const configPath = explicitConfigPath ?? defaultConfigPath;
  const fileConfig = configPath ? readServerFileConfig(configPath, Boolean(explicitConfigPath)) : {};

  return {
    host: nonBlankString(env.HOST) ?? nonBlankString(fileConfig.host) ?? "0.0.0.0",
    port: parsePort(env.PORT) ?? parsePort(fileConfig.port) ?? 3001,
    storagePath: nonBlankString(env.SCHEDULE_DATA_PATH) ?? nonBlankString(fileConfig.storagePath),
    adminPassword: nonBlankString(env.SCHEDULE_ADMIN_PASSWORD) ?? nonBlankString(fileConfig.adminPassword)
  };
}
