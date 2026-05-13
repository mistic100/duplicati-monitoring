import fs from "fs/promises";
import path from "path";

const PORT = Number(process.env.PORT ?? "3000");
const HISTORY_SIZE = Number(process.env.HISTORY_SIZE ?? "20");
const DATA_ROOT = process.env.DATA_DIR ?? path.join(process.cwd(), "data");

type Duplicati = {
  Status: "Success" | "Warning" | "Error" | "Late" | "Missing";
  Data: {
    ParsedResult: "Success" | "Warning" | "Error";
    Duration: string;
    EndTime: string;
  } | null;
  Extra: {
    "backup-name": string;
  };
};

function normalizeName(name: string): string {
  return name.trim()
    .replace(/[^a-zA-Z0-9_-]/g, "-")
    .replace(/-+/, '-');
}

async function cleanupOldBackups(backupDir: string): Promise<void> {
  const files = await fs.readdir(backupDir);
  const backups = files
    .filter((file) => file.toLowerCase().endsWith(".json"))
    .sort((a, b) => a.localeCompare(b));

  while (backups.length > HISTORY_SIZE) {
    const oldest = backups.shift();
    if (oldest) {
      await fs.unlink(path.join(backupDir, oldest));
    }
  }
}

async function getLatestBackup(name: string): Promise<string | null> {
  const backupDir = path.join(DATA_ROOT, name);
  try {
    const files = await fs.readdir(backupDir);
    const backups = files
      .filter((file) => file.toLowerCase().endsWith(".json"))
      .sort((a, b) => a.localeCompare(b));

    if (backups.length === 0) {
      return null;
    }

    return path.join(backupDir, backups[backups.length - 1]);
  } catch {
    return null;
  }
}

async function handleBackupRequest(req: Request): Promise<Response> {
  const body = await req.json() as Duplicati;

  const safeName = normalizeName(body.Extra["backup-name"]);
  const safeDate = normalizeName(body.Data!.EndTime);
  const backupDir = path.join(DATA_ROOT, safeName);

  await fs.mkdir(backupDir, { recursive: true });
  const filePath = path.join(backupDir, `${safeDate}.json`);
  await fs.writeFile(filePath, JSON.stringify(body), "utf8");
  await cleanupOldBackups(backupDir);

  return Response.json({ ok: true });
}

async function handleStatusRequest(req: Request): Promise<Response> {
  const url = new URL(req.url);

  const name = url.searchParams.get("name");
  const maxAge = url.searchParams.get("maxAge");

  if (!name) {
    return Response.json({ error: "Missing name query parameter" }, 400);
  }

  const safeName = normalizeName(name);
  const latest = await getLatestBackup(safeName);
  if (!latest) {
    return Response.json({
      Status: "Missing",
      Data: null,
      Extra: {
        "backup-name": name,
      },
    } satisfies Duplicati);
  }

  const content = JSON.parse(await fs.readFile(latest, "utf8")) as Duplicati;

  content.Status = content.Data!.ParsedResult;

  if (maxAge) {
    const delta = Date.now() - Date.parse(content.Data!.EndTime);
    if (delta > parseInt(maxAge, 10) * 3600 * 1000) {
      content.Status = "Late";
    }
  }

  return Response.json(content);
}

const server = Bun.serve({
  port: PORT,
  async fetch(req): Promise<Response> {
    console.log(`${req.method} ${req.url}`);
    
    const url = new URL(req.url);

    try {
      if (req.method === "POST" && url.pathname === "/backup") {
        return handleBackupRequest(req);
      }

      if (req.method === "GET" && url.pathname === "/status") {
        return handleStatusRequest(req);
      }

      return Response.json({ error: "Not found" }, 404);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Invalid request";
      return Response.json({ error: message }, 400);
    }
  },
});

console.log(`Listening on ${server.url}`);
