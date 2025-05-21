/**
 * Nautilus Trusted Compute
 * Copyright (C) 2025 Nautilus
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

import { PrismaClient, RoleName } from '@prisma/client'; // Make sure RoleName is imported
import dotenv from 'dotenv';
dotenv.config();

const prisma = new PrismaClient();

async function main() {
  console.log(`🌱 Starting seed process...`);

  // --- Section 1: Optional Full Clean-up for Sample/Transactional Data ---
  // This is useful if you run `npx prisma db seed` directly for a fresh set of sample data.
  // If `npx prisma db reset` is used, it handles schema and data wiping before seeding.
  // For production-like seeds or just updating reference data, you might disable parts of this.
  console.log('🧹 Cleaning up existing sample/transactional data (order matters for FK constraints)...');
  await prisma.$transaction([
    prisma.userRole.deleteMany(),        // Depends on User and Role
    prisma.dRTInstance.deleteMany(),     // Depends on User, Pool, DigitalRightToken
    prisma.poolAllowedDRT.deleteMany(),  // Depends on Pool, DigitalRightToken
    prisma.enclaveMeasurement.deleteMany(),// Depends on Pool
    prisma.pool.deleteMany(),            // Depends on User
    prisma.user.deleteMany(),            // Base user data for samples
    // Note: We are NOT deleting DigitalRightToken or Role here by default,
    // as we'll use upsert for them, making them managed reference data.
  ]);
  console.log('✅ Sample/transactional data cleaned.');

  // --- Section 2: Seed Reference Data (Idempotent using upsert) ---
  // This ensures essential lookup data (Roles, DRT Types) is present and up-to-date.

  console.log('🔑 Seeding Roles...');
  const rolesToCreate = [
    { name: RoleName.DATA_PROVIDER, description: "User who provides data to pools." }, // Optional: add descriptions
    { name: RoleName.DATA_ANALYST, description: "User who analyzes data in pools." },
    { name: RoleName.CODE_PROVIDER, description: "User who provides computation code for DRTs." },
  ];
  for (const roleData of rolesToCreate) {
    const role = await prisma.role.upsert({
      where: { name: roleData.name },
      update: { description: roleData.description }, // Update description if it changes
      create: { name: roleData.name, description: roleData.description },
    });
    console.log(`Upserted role: ${role.name} (ID: ${role.id})`);
  }
  console.log('✅ Roles seeded.');

  console.log('🏷️ Seeding Digital Right Tokens (DRTs)...');
  const drtsToUpsert = [
    {
      id: 'APPEND_DATA_POOL',
      name: 'Append Data Pool',
      description: 'Allows adding new data entries while maintaining schema integrity.',
      githubUrl: 'https://github.com/ntls-io/trusted-compute-MVP/blob/main/sgx-mvp/json-append/src/lib.rs',
      isActive: true,
      hash: null,
    },
    {
      id: 'EXECUTE_MEDIAN_WASM',
      name: 'Execute Median WASM',
      description: 'Runs Rust WebAssembly-based median calculations.',
      githubUrl: 'https://github.com/ntls-io/WASM-Binaries-MVP/blob/master/bin/get_median_wasm.wasm',
      isActive: true,
      hash: '728445d425153350b3e353cc96d29c16d5d81978ea3d7bad21f3d2b2dd76d813',
    },
    {
      id: 'EXECUTE_MEDIAN_PYTHON',
      name: 'Execute Median Python',
      description: 'Runs Python-based median computations on data pools.',
      githubUrl: 'https://github.com/ntls-io/Python-Scripts-MVP/blob/main/calculate_median.py',
      isActive: true,
      hash: 'c648a5eefbd58c1fe95c48a53ceb7f0957ee1c5842f043710a41b21123e170d7',
    },
    {
      id: 'OWNERSHIP_TOKEN',
      name: 'Ownership Token',
      description: 'Represents ownership in a data pool, received upon redeeming an append DRT.',
      githubUrl: null,
      hash: null,
      isActive: false,
    },
  ];

  for (const drtData of drtsToUpsert) {
    const drt = await prisma.digitalRightToken.upsert({
      where: { id: drtData.id },
      update: { // Define what fields to update if the DRT already exists
        name: drtData.name,
        description: drtData.description,
        githubUrl: drtData.githubUrl,
        isActive: drtData.isActive,
        hash: drtData.hash,
      },
      create: drtData, // Full data for creation
    });
    console.log(`Upserted DRT: ${drt.name} (ID: ${drt.id})`);
  }
  console.log('✅ DRT Types seeded.');

  // --- Section 3: Seed Sample Data (Users, Pools, etc.) ---
  // This is where you'd uncomment and adapt your sample data creation.
  // These will be created fresh if the clean-up section runs.

  // console.log('👤 Creating sample users...');
  // const user1Data = {
  //   id: process.env.CLERK_ID_ALICE || 'user_test_alice', // Use actual Clerk User ID for testing if possible
  //   clerkId: process.env.CLERK_ID_ALICE || 'user_test_alice',
  //   walletAddress: '5FHneW46xGXgs5mUiveU4sbTyGBzmstUspZC92UhjJM694ty',
  // };
  // const user1 = await prisma.user.upsert({ // Using upsert for users allows re-running seed
  //   where: { id: user1Data.id },
  //   update: { walletAddress: user1Data.walletAddress }, // Example update
  //   create: user1Data,
  // });
  // console.log(`Upserted sample user: ${user1.id}`);

  // // ... (user2, user3, user4 creation using upsert similarly)

  // // Example: Assigning roles to sample user1
  // if (user1) {
  //   const dataProviderRole = await prisma.role.findUnique({ where: { name: RoleName.DATA_PROVIDER }});
  //   const codeProviderRole = await prisma.role.findUnique({ where: { name: RoleName.CODE_PROVIDER }});

  //   if (dataProviderRole) {
  //     await prisma.userRole.upsert({
  //       where: { userId_roleId: { userId: user1.id, roleId: dataProviderRole.id } },
  //       update: {},
  //       create: { userId: user1.id, roleId: dataProviderRole.id },
  //     });
  //   }
  //   if (codeProviderRole) {
  //      await prisma.userRole.upsert({
  //       where: { userId_roleId: { userId: user1.id, roleId: codeProviderRole.id } },
  //       update: {},
  //       create: { userId: user1.id, roleId: codeProviderRole.id },
  //     });
  //   }
  //   console.log(`Upserted roles for ${user1.id}`);
  // }
  // console.log('✅ Sample users and roles assigned.');


  // console.log('🏦 Creating sample pools...');
  // // Your pool creation logic... ensure ownerId maps to the sample users created above
  // // const marketAnalysisPool = await prisma.pool.upsert({ where: { chainAddress: '7nYuwdHqwrxbr5CKqRqZY6ZduuB3ZSLJsBz8RPKkqvCp'}, update: {...}, create: { name: 'Market Analysis Pool', ownerId: user1.id, chainAddress: '...', ... }});
  // console.log('✅ Sample pools created.');

  // // ... (PoolAllowedDRT, EnclaveMeasurement, DRTInstance creation for sample data) ...
  // // For these, if they are purely sample, deleting and createMany might be simpler than individual upserts unless you need to update specific instances.

  console.log('🎉 Seed data fully processed!');
}

main()
  .catch((e) => {
    console.error('❌ Seed error:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });