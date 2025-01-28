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
    // Clean up existing data
    await prisma.$transaction([
        prisma.dRTInstance.deleteMany(),
        prisma.digitalRightToken.deleteMany(),
        prisma.enclaveMeasurement.deleteMany(),
        prisma.pool.deleteMany(),
        prisma.user.deleteMany(),
    ]);

    // Create sample DRT types
    const appendDrt = await prisma.digitalRightToken.create({
        data: {
            id: 'APPEND_DATA_POOL',
            name: 'Append Data Pool',
            description:
                'Permits adding new data entries to existing pools while maintaining schema requirements',
            githubUrl: 'https://github.com/ntls-io/trusted-compute-MVP/blob/main/sgx-mvp/json-append/src/lib.rs',
            isActive: true,
            hash: null,
        },
    });

    const executeMedianWASMDrt = await prisma.digitalRightToken.create({
        data: {
            id: 'EXECUTE_MEDIAN_WASM',
            name: 'Execute Median WASM',
            description:
                'Enables running Rust WebAssembly-based median calculations on data pools',
            githubUrl: 'https://github.com/ntls-io/WASM-Binaries-MVP/blob/master/bin/get_median_wasm.wasm',
            isActive: true,
            hash: '728445d425153350b3e353cc96d29c16d5d81978ea3d7bad21f3d2b2dd76d813',
        },
    });

    const executeMedianPythonDrt = await prisma.digitalRightToken.create({
        data: {
            id: 'EXECUTE_MEDIAN_PYTHON',
            name: 'Execute Median Python',
            description:
                'Allows execution of Python-based median computations on data pools',
            githubUrl: 'https://github.com/ntls-io/Python-Scripts-MVP/blob/main/calculate_median.py',
            isActive: true,
            hash: 'bcda34f2af83a2dac745a5d86f18f4c4cd6cb4e61c76e0dec005a5fc9bc124f5',
        },
    });

    // Create test users
    const user1 = await prisma.user.create({
        data: {
            id: 'user_test1',
            walletAddress: '5FHwkrdxkjdkzj5ZRksdj5zkjdkZJDKzjkz',
        },
    });

    const user2 = await prisma.user.create({
        data: {
            id: 'user_test2',
            walletAddress: '5FHwkrdxkjdkzj5ZRksdj5zkjdkZJDKzjkx',
        },
    });

    // Create test pools
    const pool1 = await prisma.pool.create({
        data: {
            name: 'Weather Data Pool',
            description: 'Historical weather data for major cities',
            chainAddress: 'pool_weather_123',
            schemaDefinition: {
                type: 'object',
                properties: {
                    temperature: { type: 'number' },
                    humidity: { type: 'number' },
                    timestamp: { type: 'string' },
                },
            },
        },
    });

    const pool2 = await prisma.pool.create({
        data: {
            name: 'Market Data Pool',
            description: 'Financial market data feed',
            chainAddress: 'pool_market_456',
            schemaDefinition: {
                type: 'object',
                properties: {
                    price: { type: 'number' },
                    volume: { type: 'number' },
                    symbol: { type: 'string' },
                },
            },
        },
    });

    // Create DRT instances
    await prisma.dRTInstance.createMany({
        data: [
            {
                mintAddress: 'mint_append_123',
                drtId: appendDrt.id,
                poolId: pool1.id,
                ownerId: user1.id,
                state: 'active',
                isListed: false,
            },
            {
                mintAddress: 'mint_execute_wasm_456',
                drtId: executeMedianWASMDrt.id,
                poolId: pool1.id,
                ownerId: user1.id,
                state: 'active',
                isListed: true,
                price: 1.5,
            },
            {
                mintAddress: 'mint_append_789',
                drtId: appendDrt.id,
                poolId: pool2.id,
                ownerId: user2.id,
                state: 'active',
                isListed: true,
                price: 2.0,
            },
            {
                mintAddress: 'mint_execute_python_789',
                drtId: executeMedianPythonDrt.id,
                poolId: pool2.id,
                ownerId: user2.id,
                state: 'active',
                isListed: true,
                price: 2.5,
            },
        ],
    });

    // Create enclave measurements
    await prisma.enclaveMeasurement.createMany({
        data: [
            {
                poolId: pool1.id,
                mrenclave: 'mrenclave_123',
                mrsigner: 'mrsigner_123',
                isvProdId: 'isv_123',
                isvSvn: 'svn_1',
            },
            {
                poolId: pool2.id,
                mrenclave: 'mrenclave_456',
                mrsigner: 'mrsigner_456',
                isvProdId: 'isv_456',
                isvSvn: 'svn_1',
            },
        ],
    });

    console.log('🌱 Seed data created successfully');
}

main()
    .catch((e) => {
        console.error('❌ Seed error:', e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
