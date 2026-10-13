import { randomBytes, scrypt, timingSafeEqual } from "node:crypto";

const KEY_LENGTH = 32;
const COST = 16_384;
const BLOCK_SIZE = 8;
const PARALLELISM = 1;

function deriveKey(secret: string, salt: Buffer, cost: number, blockSize: number, parallelism: number): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(secret, salt, KEY_LENGTH, { N: cost, r: blockSize, p: parallelism, maxmem: 64 * 1024 * 1024 }, (error, key) => {
      if (error) reject(error);
      else resolve(key as Buffer);
    });
  });
}

export async function createCredentialHash(secret: string): Promise<string> {
  if (secret.length < 8) throw new Error("Credential must contain at least 8 characters");
  const salt = randomBytes(16);
  const key = await deriveKey(secret, salt, COST, BLOCK_SIZE, PARALLELISM);
  return ["scrypt", COST, BLOCK_SIZE, PARALLELISM, salt.toString("base64url"), key.toString("base64url")].join("$");
}

export async function verifyCredential(secret: string, encoded: string): Promise<boolean> {
  const [algorithm, costText, blockSizeText, parallelismText, saltText, keyText] = encoded.split("$");
  if (algorithm !== "scrypt" || !costText || !blockSizeText || !parallelismText || !saltText || !keyText) return false;
  const expected = Buffer.from(keyText, "base64url");
  if (expected.length !== KEY_LENGTH) return false;
  try {
    const actual = await deriveKey(secret, Buffer.from(saltText, "base64url"), Number(costText), Number(blockSizeText), Number(parallelismText));
    return timingSafeEqual(actual, expected);
  } catch {
    return false;
  }
}
