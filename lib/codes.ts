import { randomBytes } from "crypto";

const COLLECT_CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no 0/O/1/I

/** Short human-readable code a customer reads aloud at the express counter. */
export function generateCollectCode(length = 6): string {
  const bytes = randomBytes(length);
  let code = "";
  for (let i = 0; i < length; i++) {
    code += COLLECT_CODE_ALPHABET[bytes[i] % COLLECT_CODE_ALPHABET.length];
  }
  return code;
}
