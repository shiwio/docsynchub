#!/usr/bin/env node
import { Command } from "commander";
import { serve } from "./server/http.js";

const program = new Command();

program
  .name("docsynchub")
  .description("Sync product documents into Git repositories as Markdown.")
  .version("1.0.0");

program
  .command("serve")
  .description("Start the DocSyncHub web UI server")
  .option("--host <host>", "Host to bind", process.env.DOCSYNCHUB_HOST ?? "0.0.0.0")
  .option("--port <port>", "Port to bind", process.env.DOCSYNCHUB_PORT ?? "8080")
  .option("--database-url <url>", "PostgreSQL connection string", process.env.DATABASE_URL ?? "postgresql://docsynchub:docsynchub@localhost:5432/docsynchub")
  .option("--env-file <path>", "Path to .env file", ".env")
  .action(async (options: { host: string; port: string; databaseUrl: string; envFile: string }) => {
    const port = Number.parseInt(options.port, 10);
    if (!Number.isInteger(port) || port < 1 || port > 65535) {
      console.error(`Invalid port: ${options.port}`);
      process.exitCode = 1;
      return;
    }
    try {
      await serve({ host: options.host, port, databaseUrl: options.databaseUrl, envFile: options.envFile });
    } catch (error) {
      console.error(error instanceof Error ? error.message : error);
      process.exitCode = 1;
    }
  });

program.parseAsync();
