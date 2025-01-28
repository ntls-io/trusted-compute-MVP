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
        // Test database connection
        await prisma.$connect();
        console.log('✅ Database connection successful');

        // Count all tables
        const counts = await prisma.$transaction([
            prisma.pool.count(),
            prisma.user.count(),
            prisma.digitalRightToken.count(),
            prisma.dRTInstance.count(),
            prisma.enclaveMeasurement.count(),
        ]);

        console.log('\n📊 Database counts:');
        console.log('Pools:', counts[0]);
        console.log('Users:', counts[1]);
        console.log('DRT Types:', counts[2]);
        console.log('DRT Instances:', counts[3]);
        console.log('Enclave Measurements:', counts[4]);

        // Test relationships
        const poolWithRelations = await prisma.pool.findFirst({
            include: {
                drtInstances: {
                    include: {
                        drt: true,
                        owner: true,
                    },
                },
                enclaveMeasurement: true,
            },
        });

        if (poolWithRelations) {
            console.log('\n🔍 Sample pool with relations:');
            console.log('Pool Name:', poolWithRelations.name);
            console.log('Description:', poolWithRelations.description);
            console.log('DRT Instances:', poolWithRelations.drtInstances.length);
            poolWithRelations.drtInstances.forEach((instance, index) => {
                console.log(`  DRT Instance ${index + 1}:`);
                console.log('    Mint Address:', instance.mintAddress);
                console.log('    DRT Name:', instance.drt.name);
                console.log('    Owner Wallet:', instance.owner.walletAddress);
                console.log('    State:', instance.state);
                console.log('    Is Listed:', instance.isListed);
                if (instance.isListed) {
                    console.log('    Price:', instance.price);
                }
            });
            console.log('Enclave Measurement:', poolWithRelations.enclaveMeasurement ? 'Present' : 'Missing');
            if (poolWithRelations.enclaveMeasurement) {
                console.log('  MRENCLAVE:', poolWithRelations.enclaveMeasurement.mrenclave);
                console.log('  MRSIGNER:', poolWithRelations.enclaveMeasurement.mrsigner);
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
