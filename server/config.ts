export interface ServerConfig {
  host: string;
  port: number;
  storagePath?: string;
}

interface ServerEnv {
  HOST?: string;
  PORT?: string;
  SCHEDULE_DATA_PATH?: string;
}

export function resolveServerConfig(env: ServerEnv = process.env): ServerConfig {
  return {
    host: env.HOST?.trim() || "0.0.0.0",
    port: Number(env.PORT ?? 3001),
    storagePath: env.SCHEDULE_DATA_PATH
  };
}
