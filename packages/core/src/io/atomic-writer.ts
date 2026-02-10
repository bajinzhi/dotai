import fs from "fs-extra";
import path from "node:path";
import crypto from "node:crypto";

export interface AtomicFileWriter {
  write(targetPath: string, content: Buffer | string): Promise<void>;
  copy(sourcePath: string, targetPath: string): Promise<void>;
  ensureDir(dirPath: string): Promise<void>;
  hash(filePath: string): Promise<string>;
}

export class AtomicFileWriterImpl implements AtomicFileWriter {

  async write(targetPath: string, content: Buffer | string): Promise<void> {
    const tmpPath = `${targetPath}.tmp`;
    await fs.ensureDir(path.dirname(targetPath));
    await fs.writeFile(tmpPath, content);
    await fs.rename(tmpPath, targetPath);
  }

  async copy(sourcePath: string, targetPath: string): Promise<void> {
    const tmpPath = `${targetPath}.tmp`;
    await fs.ensureDir(path.dirname(targetPath));
    await fs.copyFile(sourcePath, tmpPath);
    await fs.rename(tmpPath, targetPath);
  }

  async ensureDir(dirPath: string): Promise<void> {
    await fs.ensureDir(dirPath);
  }

  async hash(filePath: string): Promise<string> {
    const content = await fs.readFile(filePath);
    return crypto.createHash("sha256").update(content).digest("hex");
  }
}
