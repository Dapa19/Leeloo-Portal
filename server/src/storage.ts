import { mkdir, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

export interface StorageProvider {
  save(data: Buffer, extension: string): Promise<string>;
  absolutePath(key: string): string;
  remove(key: string): Promise<void>;
}

export class LocalStorage implements StorageProvider {
  private root = path.resolve(process.env.UPLOAD_DIR ?? './uploads');
  async save(data: Buffer, extension: string) {
    await mkdir(this.root, { recursive: true });
    const key = `${randomUUID()}.${extension}`;
    await writeFile(this.absolutePath(key), data, { flag: 'wx', mode: 0o600 });
    return key;
  }
  absolutePath(key: string) {
    if (path.basename(key) !== key) throw new Error('Invalid storage key');
    return path.join(this.root, key);
  }
  async remove(key: string) { await unlink(this.absolutePath(key)).catch(() => undefined); }
}

export const storage: StorageProvider = new LocalStorage();
