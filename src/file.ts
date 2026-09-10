import { Readable } from 'node:stream';

/** A binary document returned by Chari Pay: QR PNG, RIB/poster PDF, CSV export. */
export interface ChariPayFile {
  data: Buffer;
  /** e.g. `application/pdf`, `image/png`, `text/csv`. */
  contentType: string;
  /** Parsed from `Content-Disposition` when the server sends one. */
  filename?: string;
  /** Convenience for `file.toStream().pipe(res)`. */
  toStream(): Readable;
}

export function makeFile(data: Buffer, contentType: string, filename?: string): ChariPayFile {
  return {
    data,
    contentType,
    filename,
    toStream: () => Readable.from(data),
  };
}

/** `attachment; filename="transactions.csv"` → `transactions.csv` */
export function parseFilename(disposition: string | null): string | undefined {
  if (!disposition) return undefined;
  const match = /filename\*?=(?:UTF-8'')?"?([^";]+)"?/i.exec(disposition);
  return match?.[1];
}
