import { describe, it, expect, afterEach } from "vitest";
import fs from "fs-extra";
import path from "node:path";
import os from "node:os";
import { AtomicFileWriterImpl } from "../src/io/atomic-writer.js";

const TEST_DIR = path.join(os.tmpdir(), "dotai-test-atomic-writer");

afterEach(async () => {
  await fs.remove(TEST_DIR);
});

describe("AtomicFileWriterImpl", () => {
  const writer = new AtomicFileWriterImpl();

  it("should write content atomically", async () => {
    const filePath = path.join(TEST_DIR, "test.txt");
    await writer.write(filePath, "hello world");

    const content = await fs.readFile(filePath, "utf-8");
    expect(content).toBe("hello world");
  });

  it("should not leave tmp file after write", async () => {
    const filePath = path.join(TEST_DIR, "test2.txt");
    await writer.write(filePath, "content");

    const tmpPath = `${filePath}.tmp`;
    expect(await fs.pathExists(tmpPath)).toBe(false);
    expect(await fs.pathExists(filePath)).toBe(true);
  });

  it("should copy file atomically", async () => {
    const srcPath = path.join(TEST_DIR, "source.txt");
    const destPath = path.join(TEST_DIR, "dest.txt");

    await fs.ensureDir(TEST_DIR);
    await fs.writeFile(srcPath, "source content");
    await writer.copy(srcPath, destPath);

    const content = await fs.readFile(destPath, "utf-8");
    expect(content).toBe("source content");
  });

  it("should ensure directory exists", async () => {
    const dirPath = path.join(TEST_DIR, "nested", "dir");
    await writer.ensureDir(dirPath);

    expect(await fs.pathExists(dirPath)).toBe(true);
  });

  it("should compute SHA-256 hash", async () => {
    const filePath = path.join(TEST_DIR, "hash.txt");
    await fs.ensureDir(TEST_DIR);
    await fs.writeFile(filePath, "test");

    const hash = await writer.hash(filePath);
    expect(hash).toMatch(/^[a-f0-9]{64}$/);
    // SHA-256 of "test" is well-known
    expect(hash).toBe("9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08");
  });

  it("should create parent directories when writing", async () => {
    const filePath = path.join(TEST_DIR, "deep", "nested", "file.txt");
    await writer.write(filePath, "deep content");

    expect(await fs.pathExists(filePath)).toBe(true);
    const content = await fs.readFile(filePath, "utf-8");
    expect(content).toBe("deep content");
  });
});
