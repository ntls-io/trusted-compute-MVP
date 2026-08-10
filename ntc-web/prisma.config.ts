/**
 * Nautilus Trusted Compute
 * Copyright (C) 2026 Relational Network
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as published
 * by the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU Affero General Public License for more details.
 *
 * You should have received a copy of the GNU Affero General Public License
 * along with this program.  If not, see <https://www.gnu.org/licenses/>.
 */

// Replaces the `prisma` key in package.json, which Prisma 6 deprecates and
// Prisma 7 removes. Every CLI invocation used to print a warning about it.
//
// Declaring a config file turns OFF Prisma's implicit .env loading, so the
// import below restores it. Vercel injects DATABASE_URL into the environment
// directly and does not need it; a local `prisma db push` or `db seed` reading
// .env.local does. dotenv does not overwrite variables that are already set,
// so the deployed environment still wins.
import { config as loadEnv } from "dotenv";
import path from "node:path";
import { defineConfig } from "prisma/config";

loadEnv({ path: ".env.local", quiet: true });
loadEnv({ quiet: true });

export default defineConfig({
  schema: path.join("prisma", "schema.prisma"),
  migrations: {
    // `prisma db seed` runs this. tsconfig.seed.json compiles the seed under
    // CommonJS, which the Next tsconfig does not.
    seed: "tsx --tsconfig tsconfig.seed.json prisma/seed.ts",
  },
});
