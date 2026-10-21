import { createHash, randomBytes } from "crypto";

const ADJECTIVES = [
  "amber", "brave", "calm", "cedar", "clear", "clever", "cool", "crisp",
  "dawn", "eager", "early", "ember", "faint", "fleet", "frost", "gentle",
  "glad", "golden", "grand", "happy", "hazel", "ivory", "jade", "jolly",
  "keen", "kind", "light", "lively", "lucid", "lunar", "maple", "mellow",
  "merry", "mild", "misty", "noble", "north", "olive", "opal", "patient",
  "pearl", "pine", "plaid", "proud", "quick", "quiet", "rapid", "river",
  "rosy", "round", "sage", "sharp", "silver", "sleek", "solar", "steady",
  "stone", "sunny", "swift", "tidy", "vivid", "warm", "wild", "wise",
];

const NOUNS = [
  "anchor", "aspen", "badger", "basin", "beacon", "beaver", "birch", "bloom",
  "breeze", "brook", "canoe", "canyon", "cliff", "cloud", "clover", "comet",
  "coral", "crane", "creek", "falcon", "fern", "finch", "flint", "forest",
  "fox", "glade", "grove", "harbor", "heron", "island", "kelp", "lagoon",
  "lark", "laurel", "lotus", "magpie", "marsh", "meadow", "mesa", "mole",
  "newt", "otter", "owl", "panda", "pebble", "perch", "plover", "quail",
  "raven", "reef", "ridge", "robin", "sable", "salmon", "sparrow", "spruce",
  "stork", "summit", "thrush", "tiger", "trout", "tulip", "viper", "walnut",
  "wren", "yarrow",
];

/** "calm-otter-42" — typable on a phone, no ambiguous characters in the number. */
export function generateParticipantCode(): string {
  const adj = ADJECTIVES[randomBytes(1)[0] % ADJECTIVES.length];
  const noun = NOUNS[randomBytes(1)[0] % NOUNS.length];
  const num = 10 + (randomBytes(1)[0] % 90);
  return `${adj}-${noun}-${num}`;
}

/** 256-bit URL-safe claim token. Rotatable; rotation invalidates old sessions. */
export function generateClaimToken(): string {
  return randomBytes(32).toString("base64url");
}

export function generateSessionId(): string {
  return randomBytes(32).toString("base64url");
}

const CONFIRM_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"; // no 0/O/1/I/L

/** "XKCD-7Q2M" style proof-of-completion code. */
export function generateConfirmationCode(): string {
  const bytes = randomBytes(8);
  let raw = "";
  for (let i = 0; i < 8; i++) raw += CONFIRM_ALPHABET[bytes[i] % CONFIRM_ALPHABET.length];
  return `${raw.slice(0, 4)}-${raw.slice(4)}`;
}

export function pepper(): string {
  const secret = process.env.APP_SECRET;
  if (!secret) throw new Error("APP_SECRET is not set");
  return secret;
}

/** Deterministic idempotency helper if needed elsewhere. */
export function stableHash(input: string): string {
  return createHash("sha256").update(input).digest("base64url");
}

/** Absolute claim URL for a slot — printed on strips and encoded in QRs. */
export function claimUrlFor(token: string): string {
  const base = (process.env.APP_BASE_URL || "http://localhost:3000").replace(/\/$/, "");
  return `${base}/claim/${token}`;
}
