/**
 * Seed: frozen preset course lists, sponsor + teacher accounts, and
 * (with --slots) the 15 intervention + 30 control claim slots.
 *
 *   npm run seed              # presets + staff accounts
 *   npm run seed -- --slots   # also generate the claim slots
 *
 * IMPORTANT: edit the preset lists below BEFORE first run. They are frozen
 * once data collection starts — changing them mid-study is a deliberate,
 * documented action (see README), never a casual edit.
 */
import "dotenv/config";
import bcrypt from "bcryptjs";
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { adminUsers, consent, coursePresets, slots } from "../src/db/schema";

const SECTIONS = {
  intervention: "AP Statistics",
  control: "Data Management",
} as const;

/** Frozen preset course lists. Edit before first seed; locked after. */
const PRESETS: Record<string, string[]> = {
  [SECTIONS.intervention]: [
    "AP Statistics",
    "AP Calculus",
    "AP Biology",
    "AP Chemistry",
    "AP Physics",
    "English",
    "History",
    "French",
    "Computer Science",
    "Economics",
    "Psychology",
    "Visual Arts",
  ],
  [SECTIONS.control]: [
    "Data Management",
    "Advanced Functions",
    "Calculus and Vectors",
    "English",
    "Biology",
    "Chemistry",
    "Physics",
    "Computer Science",
    "Business",
    "Kinesiology",
    "Geography",
    "Visual Arts",
  ],
};

const SLOT_COUNTS = { INTERVENTION: 15, CONTROL: 30 } as const;

const ADJECTIVES = [
  "amber", "brave", "calm", "cedar", "clear", "clever", "cool", "crisp", "dawn", "eager",
  "early", "ember", "faint", "fleet", "frost", "gentle", "glad", "golden", "grand", "happy",
  "hazel", "ivory", "jade", "jolly", "keen", "kind", "light", "lively", "lucid", "lunar",
  "maple", "mellow", "merry", "mild", "misty", "noble", "north", "olive", "opal", "patient",
  "pearl", "pine", "plaid", "proud", "quick", "quiet", "rapid", "river", "rosy", "round",
  "sage", "sharp", "silver", "sleek", "solar", "steady", "stone", "sunny", "swift", "tidy",
  "vivid", "warm", "wild", "wise",
];
const NOUNS = [
  "anchor", "aspen", "badger", "basin", "beacon", "beaver", "birch", "bloom", "breeze", "brook",
  "canoe", "canyon", "cliff", "cloud", "clover", "comet", "coral", "crane", "creek", "falcon",
  "fern", "finch", "flint", "forest", "fox", "glade", "grove", "harbor", "heron", "island",
  "kelp", "lagoon", "lark", "laurel", "lotus", "magpie", "marsh", "meadow", "mesa", "mole",
  "newt", "otter", "owl", "panda", "pebble", "perch", "plover", "quail", "raven", "reef",
  "ridge", "robin", "sable", "salmon", "sparrow", "spruce", "stork", "summit", "thrush", "tiger",
  "trout", "tulip", "viper", "walnut", "wren", "yarrow",
];

function code(): string {
  const pick = (arr: string[]) => arr[Math.floor(Math.random() * arr.length)];
  return `${pick(ADJECTIVES)}-${pick(NOUNS)}-${10 + Math.floor(Math.random() * 90)}`;
}

function token(): string {
  return Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString("base64url");
}

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");
  const pepper = process.env.APP_SECRET;
  if (!pepper) throw new Error("APP_SECRET is not set");

  const db = drizzle(postgres(url, { prepare: false }));
  const withSlots = process.argv.includes("--slots");

  // Preset course lists (frozen).
  for (const [section, names] of Object.entries(PRESETS)) {
    for (const courseName of names) {
      await db.insert(coursePresets).values({ classSection: section, courseName }).onConflictDoNothing();
    }
    console.log(`presets: ${section} (${names.length} courses)`);
  }

  // Staff accounts.
  const staff = [
    {
      email: (process.env.SEED_SPONSOR_EMAIL || "sponsor@example.com").toLowerCase(),
      password: process.env.SEED_SPONSOR_PASSWORD || "change-this-password",
      role: "SPONSOR" as const,
    },
    {
      email: (process.env.SEED_TEACHER_EMAIL || "teacher@example.com").toLowerCase(),
      password: process.env.SEED_TEACHER_PASSWORD || "change-this-password",
      role: "TEACHER" as const,
    },
  ];
  for (const s of staff) {
    const passwordHash = await bcrypt.hash(`${s.password}:${pepper}`, 10);
    await db
      .insert(adminUsers)
      .values({ email: s.email, passwordHash, role: s.role })
      .onConflictDoNothing();
    console.log(`${s.role.toLowerCase()}: ${s.email}`);
  }

  if (withSlots) {
    const entries = Object.entries(SLOT_COUNTS) as ["INTERVENTION" | "CONTROL", number][];
    for (const [arm, count] of entries) {
      const classSection = arm === "INTERVENTION" ? SECTIONS.intervention : SECTIONS.control;
      let created = 0;
      for (let i = 0; i < count; i++) {
        for (let attempt = 0; attempt < 5; attempt++) {
          try {
            const participantCode = code();
            await db.insert(slots).values({ participantCode, claimToken: token(), arm, classSection });
            await db.insert(consent).values({ participantCode }).onConflictDoNothing();
            created++;
            break;
          } catch {
            /* code collision, retry */
          }
        }
      }
      console.log(`slots: ${arm} ${created} created in "${classSection}"`);
    }
  }

  console.log("\nDone. Next: print claim strips at /admin/slots/print (sign in as sponsor).");
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
