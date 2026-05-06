import path from "path";
import fs from "fs/promises";
import Fastify, { FastifyInstance } from "fastify";

const PORT = Number(process.env.PORT ?? "3000");
const HISTORY_SIZE = Number(process.env.HISTORY_SIZE ?? "20");
const DATA_ROOT = process.env.DATA_DIR ?? path.join(process.cwd(), "data");

type Duplicati = {
  Data: {
    SizeOfAddedFiles:number,
    FilesWithError:number,
    SizeOfModifiedFiles:number,
    SizeOfExaminedFiles:number,
    SizeOfOpenedFiles:number,
    
    CompactResults: {
      UploadedFileCount:number,
      DownloadedFileCount:number,
      DownloadedFileSize:number,
      UploadedFileSize:number,
    },
    Duration:string,
    ParsedResult:string,

    BackendStatistics: {
      BytesUploaded:number,
      BytesDownloaded:number,
      FilesUploaded:number,
      FilesDownloaded:number,
      LastBackupDate:string,
    }
  },
  Extra:{
    OperationName:string,
    "backup-name":string,
  }
}

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

function parseBackupPayload(payload: unknown): {
    backupName: string;
    lastBackupDate: string;
    body: Duplicati;
} {
  const body = payload as Duplicati;
  const backupName = body?.Extra?.["backup-name"];
  const lastBackupDate = body?.Data?.BackendStatistics?.LastBackupDate;

  if (typeof backupName !== "string" || typeof lastBackupDate !== "string") {
    throw new Error("Missing backup name or LastBackupDate");
  }

  return { backupName, lastBackupDate, body };
}

const server: FastifyInstance = Fastify({ logger: true });

server.post("/backup", async (request, reply) => {
  try {
    const { backupName, lastBackupDate, body } = parseBackupPayload(request.body);
    const safeName = normalizeName(backupName);
    const safeDate = normalizeName(lastBackupDate);
    const backupDir = path.join(DATA_ROOT, safeName);

    await fs.mkdir(backupDir, { recursive: true });
    const filePath = path.join(backupDir, `${safeDate}.json`);
    await fs.writeFile(filePath, JSON.stringify(body), "utf8");
    await cleanupOldBackups(backupDir);

    return reply.code(204);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Invalid request";
    return reply.code(400).send({ error: message });
  }
});

server.get("/status", async (request, reply) => {
  const { name } = request.query as { name?: string };

  if (!name) {
    return reply.code(400).send({ error: "Missing name query parameter" });
  }

  const safeName = normalizeName(name);
  const latest = await getLatestBackup(safeName);
  if (!latest) {
    return reply.code(404).send({ error: "No backups found for this name" });
  }

  const content = await fs.readFile(latest, "utf8");
  return reply.code(200).header("Content-Type", "application/json").send(JSON.parse(content));
});

(async () => {
    await server.listen({ port: PORT, host: "0.0.0.0" });
})();
