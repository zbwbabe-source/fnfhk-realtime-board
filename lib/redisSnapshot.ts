import { gzip, gunzip } from 'zlib';
import { promisify } from 'util';

const gzipAsync = promisify(gzip);
const gunzipAsync = promisify(gunzip);

/**
 * Compress object to base64 string using gzip
 * 
 * @param obj - Any JSON-serializable object
 * @returns Base64-encoded gzipped string
 */
export async function compressToB64(obj: any): Promise<string> {
  const json = JSON.stringify(obj);
  const buffer = Buffer.from(json, 'utf-8');
  const compressed = await gzipAsync(buffer);
  return compressed.toString('base64');
}

/**
 * Decompress base64 string to object using gunzip
 * 
 * @param b64 - Base64-encoded gzipped string
 * @returns Decompressed object
 */
export async function decompressFromB64<T = any>(b64: string): Promise<T> {
  const buffer = Buffer.from(b64, 'base64');
  const decompressed = await gunzipAsync(buffer);
  const json = decompressed.toString('utf-8');
  return JSON.parse(json);
}
