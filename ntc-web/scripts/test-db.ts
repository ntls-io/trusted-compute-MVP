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

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
    try {
        // ✅ Test database connection
        await prisma.$connect();
        console.log('✅ Database connection successful');

        // 📊 Count all tables
        const [
            poolCount,
            userCount,
            drtTypeCount,
            drtInstanceCount,
            enclaveCount,
            allowedDrtCount,
        ] = await prisma.$transaction([
            prisma.pool.count(),
            prisma.user.count(),
            prisma.digitalRightToken.count(),
            prisma.dRTInstance.count(),
            prisma.enclaveMeasurement.count(),
            prisma.poolAllowedDRT.count(),
        ]);

        console.log('\n📊 Database counts:');
        console.log(`Pools: ${poolCount}`);
        console.log(`Users: ${userCount}`);
        console.log(`DRT Types: ${drtTypeCount}`);
        console.log(`DRT Instances: ${drtInstanceCount}`);
        console.log(`Enclave Measurements: ${enclaveCount}`);
        console.log(`Pool Allowed DRTs: ${allowedDrtCount}`);

        // 🔍 Validate Unique Constraints
        console.log('\n🔍 Validating Unique Constraints:');

        const duplicateWallet = await prisma.user.groupBy({
            by: ['walletAddress'],
            _count: { walletAddress: true },
            having: { walletAddress: { _count: { gt: 1 } } },
        });
        console.log(duplicateWallet.length
            ? '❌ Duplicate Wallet Addresses Found!'
            : '✅ Wallet Address Uniqueness Valid');

        const duplicateClerkIds = await prisma.user.groupBy({
            by: ['clerkId'],
            _count: { clerkId: true },
            having: { clerkId: { _count: { gt: 1 } } },
        });
        console.log(duplicateClerkIds.length
            ? '❌ Duplicate Clerk IDs Found!'
            : '✅ Clerk ID Uniqueness Valid');

        const duplicateChain = await prisma.pool.groupBy({
            by: ['chainAddress'],
            _count: { chainAddress: true },
            having: { chainAddress: { _count: { gt: 1 } } },
        });
        console.log(duplicateChain.length
            ? '❌ Duplicate Chain Addresses Found!'
            : '✅ Chain Address Uniqueness Valid');

        const duplicateMint = await prisma.dRTInstance.groupBy({
            by: ['mintAddress'],
            _count: { mintAddress: true },
            having: { mintAddress: { _count: { gt: 1 } } },
        });
        console.log(duplicateMint.length
            ? '❌ Duplicate Mint Addresses Found!'
            : '✅ Mint Address Uniqueness Valid');

        // 🔗 Validate Referential Integrity
        console.log('\n🔗 Validating Referential Integrity:');

        const orphanDrtInstances = await prisma.dRTInstance.findMany({
            where: {
                OR: [
                    {
                        drtId: {
                            notIn: (await prisma.digitalRightToken.findMany({ select: { id: true } })).map(drt => drt.id),
                        },
                    },
                    {
                        poolId: {
                            notIn: (await prisma.pool.findMany({ select: { id: true } })).map(pool => pool.id),
                        },
                    },
                    {
                        ownerId: {
                            notIn: (await prisma.user.findMany({ select: { id: true } })).map(user => user.id),
                        },
                    },
                ],
            },
        });

        console.log(orphanDrtInstances.length
            ? `❌ Orphan DRT Instances Found: ${orphanDrtInstances.length}`
            : '✅ No Orphan DRT Instances');

        // 🏗 Validate Pool-DRT Relationships
        console.log('\n🏗 Validating Pool-DRT Relationships:');
        const allPoolDrts = await prisma.poolAllowedDRT.findMany({
            include: { pool: true, drt: true },
        });

        if (allPoolDrts.length) {
            allPoolDrts.forEach((entry, index) => {
                console.log(`  ${index + 1}. Pool "${entry.pool.name}" allows DRT "${entry.drt.name}"`);
            });
        } else {
            console.log('⚠️ No Pool-DRT relationships found');
        }

        // 🏠 Validate Sample Pool and Its Relationships
        const poolWithRelations = await prisma.pool.findFirst({
            include: {
                drtInstances: { include: { drt: true, owner: true } },
                enclaveMeasurement: true,
            },
        });

        if (poolWithRelations) {
            console.log('\n🔍 Sample Pool Relationships:');
            console.log(`Pool Name: ${poolWithRelations.name}`);
            console.log(`Description: ${poolWithRelations.description}`);
            console.log(`DRT Instances: ${poolWithRelations.drtInstances.length}`);

            poolWithRelations.drtInstances.forEach((instance, index) => {
                console.log(`  DRT Instance ${index + 1}:`);
                console.log(`    Mint Address: ${instance.mintAddress}`);
                console.log(`    DRT Name: ${instance.drt.name}`);
                console.log(`    Owner Wallet: ${instance.owner.walletAddress}`);
                console.log(`    State: ${instance.state}`);
                console.log(`    Is Listed: ${instance.isListed}`);
                if (instance.isListed) console.log(`    Price: ${instance.price}`);
            });

            console.log(`Enclave Measurement: ${poolWithRelations.enclaveMeasurement ? 'Present' : 'Missing'}`);
            if (poolWithRelations.enclaveMeasurement) {
                console.log(`  MRENCLAVE: ${poolWithRelations.enclaveMeasurement.mrenclave}`);
                console.log(`  MRSIGNER: ${poolWithRelations.enclaveMeasurement.mrsigner}`);
            }
        } else {
            console.log('\n⚠️ No pools found');
        }
    } catch (error) {
        console.error('❌ Test failed:', error);
        throw error;
    }
}

main()
    .catch((e) => {
        console.error(e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
