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
import dotenv from 'dotenv';
dotenv.config();

const prisma = new PrismaClient();

async function main() {
    // 🧹 Clean up existing data
    await prisma.$transaction([
        prisma.dRTInstance.deleteMany(),
        prisma.poolAllowedDRT.deleteMany(),
        prisma.digitalRightToken.deleteMany(),
        prisma.enclaveMeasurement.deleteMany(),
        prisma.pool.deleteMany(),
        prisma.user.deleteMany(),
    ]);
    console.log('✅ Database cleaned');

    // 👤 Create users with Clerk authentication
    const user1 = await prisma.user.create({
        data: {
            id: 'user_alice',
            clerkId: process.env.CLERK_ID_ALICE || 'clerk_123456789_alice',
            walletAddress: '5FHneW46xGXgs5mUiveU4sbTyGBzmstUspZC92UhjJM694ty',
        },
    });

    const user2 = await prisma.user.create({
        data: {
            id: 'user_bob',
            clerkId: process.env.CLERK_ID_BOB || 'clerk_987654321_bob',
            walletAddress: '5GrwvaEF5zXb26Fz9rcQpDWS57CtERHpNehXCPcNoHGKutQY',
        },
    });

    const user3 = await prisma.user.create({
        data: {
            id: 'user_charlie',
            clerkId: process.env.CLERK_ID_CHARLIE || 'clerk_567890123_charlie',
            walletAddress: '5FLSigC9HGRKVhB9FiEo4Y3koPsNmBmLJbpXg2mp1hXcS59Y',
        },
    });

    const user4 = await prisma.user.create({
        data: {
            id: 'user_david',
            clerkId: process.env.CLERK_ID_DAVID || 'user_2riTXLKwxmEVB0AhqCXbdD91Xid',
            walletAddress: '5GHneW46xGXgs5mUiveU4sbTyGBzmstUspZC92UhjJM694dz',
        },
    });

    console.log('✅ Users created with Clerk IDs');

    // 🏷️ Create DRT types
    const appendDrt = await prisma.digitalRightToken.create({
        data: {
            id: 'APPEND_DATA_POOL',
            name: 'Append Data Pool',
            description: 'Allows adding new data entries while maintaining schema integrity',
            githubUrl: 'https://github.com/ntls-io/trusted-compute-MVP/blob/main/sgx-mvp/json-append/src/lib.rs',
            isActive: true,
        },
    });

    const executeMedianWASMDrt = await prisma.digitalRightToken.create({
        data: {
            id: 'EXECUTE_MEDIAN_WASM',
            name: 'Execute Median WASM',
            description: 'Runs Rust WebAssembly-based median calculations',
            githubUrl: 'https://github.com/ntls-io/WASM-Binaries-MVP/blob/master/bin/get_median_wasm.wasm',
            isActive: true,
            hash: 'c5e34826d42766363286055750373441545bc601df37fab07231bca4324db319',
        },
    });

    const executeMedianPythonDrt = await prisma.digitalRightToken.create({
        data: {
            id: 'EXECUTE_MEDIAN_PYTHON',
            name: 'Execute Median Python',
            description: 'Runs Python-based median computations on data pools',
            githubUrl: 'https://github.com/ntls-io/Python-Scripts-MVP/blob/main/calculate_median.py',
            isActive: true,
            hash: 'fa22db710373cbf7c6bfa26e6e9d40e261cfd1f5adc38db6599bfe764e9180dd',
        },
    });

    console.log('✅ DRT Types created');

    // 🏦 Create pools with schema definitions
    const marketAnalysisPool = await prisma.pool.create({
        data: {
            name: 'Market Analysis Pool',
            description: 'Contains market trend data from 2023-2024',
            chainAddress: '7nYuwdHqwrxbr5CKqRqZY6ZduuB3ZSLJsBz8RPKkqvCp',
            ownerId: user1.id,
            schemaDefinition: {
                "$schema": "http://json-schema.org/draft-07/schema#",
                "type": "object",
                "properties": {
                    "timestamp": {
                        "type": "array",
                        "items": {
                            "type": "number"
                        }
                    },
                    "marketValue": {
                        "type": "array",
                        "items": {
                            "type": "number"
                        }
                    },
                    "volume": {
                        "type": "array",
                        "items": {
                            "type": "number"
                        }
                    }
                },
                "required": [
                    "timestamp",
                    "marketValue",
                    "volume"
                ]
            },
        },
    });
    
    const customerInsightsPool = await prisma.pool.create({
        data: {
            name: 'Customer Insights',
            description: 'Aggregated customer behavior metrics',
            chainAddress: 'BPFLoader2111111111111111111111111111111111',
            ownerId: user2.id,
            schemaDefinition: {
                "$schema": "http://json-schema.org/draft-07/schema#",
                "type": "object",
                "properties": {
                    "customerCount": {
                        "type": "array",
                        "items": {
                            "type": "number"
                        }
                    },
                    "averageSpend": {
                        "type": "array",
                        "items": {
                            "type": "number"
                        }
                    },
                    "segmentId": {
                        "type": "array",
                        "items": {
                            "type": "number"
                        }
                    }
                },
                "required": [
                    "customerCount",
                    "averageSpend",
                    "segmentId"
                ]
            },
        },
    });
    
    const financialMetricsPool = await prisma.pool.create({
        data: {
            name: 'Financial Metrics',
            description: 'Quarterly financial performance data',
            chainAddress: 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA',
            ownerId: user4.id,
            schemaDefinition: {
                "$schema": "http://json-schema.org/draft-07/schema#",
                "type": "object",
                "properties": {
                    "revenue": {
                        "type": "array",
                        "items": {
                            "type": "number"
                        }
                    },
                    "profit": {
                        "type": "array",
                        "items": {
                            "type": "number"
                        }
                    },
                    "expenses": {
                        "type": "array",
                        "items": {
                            "type": "number"
                        }
                    }
                },
                "required": [
                    "revenue",
                    "profit",
                    "expenses"
                ]
            },
        },
    });
    
    const developerSalaryPool = await prisma.pool.create({
        data: {
            name: 'Developer Salaries',
            description: 'Monthly salary data for software developers',
            chainAddress: 'sdfhjkhasmnjjasdkhjkhsSsoadijsdklfjsd',
            ownerId: user4.id,
            schemaDefinition: {
                "$schema": "http://json-schema.org/draft-07/schema#",
                "type": "object",
                "properties": {
                    "income": {
                        "type": "array",
                        "items": {
                            "type": "number"
                        }
                    },
                    "tax": {
                        "type": "array",
                        "items": {
                            "type": "number"
                        }
                    },
                    "netSalary": {
                        "type": "array",
                        "items": {
                            "type": "number"
                        }
                    }
                },
                "required": [
                    "income",
                    "tax",
                    "netSalary"
                ]
            },
        },
    });    

    console.log('✅ Pools created');

    // 🔗 Define Pool-DRT Relationships
    await prisma.poolAllowedDRT.createMany({
        data: [
            { poolId: marketAnalysisPool.id, drtId: appendDrt.id },
            { poolId: marketAnalysisPool.id, drtId: executeMedianWASMDrt.id },
            { poolId: customerInsightsPool.id, drtId: executeMedianPythonDrt.id },
            { poolId: financialMetricsPool.id, drtId: appendDrt.id },
            { poolId: financialMetricsPool.id, drtId: executeMedianWASMDrt.id },
            { poolId: financialMetricsPool.id, drtId: executeMedianPythonDrt.id },
            { poolId: developerSalaryPool.id, drtId: appendDrt.id },
            { poolId: developerSalaryPool.id, drtId: executeMedianPythonDrt.id },
        ],
    });

    console.log('✅ Pool-DRT relationships set');

    // 📈 Create enclave measurements
    await prisma.enclaveMeasurement.create({
        data: {
            poolId: marketAnalysisPool.id,
            mrenclave: 'c5e34826d42766363286055750373441545bc601df37fab07231bca4324db319',
            mrsigner: 'eb33db710373cbf7c6bfa26e6e9d40e261cfd1f5adc38db6599bfe764e9180cc',
            isvProdId: '0',
            isvSvn: '0',
        },
    });

    await prisma.enclaveMeasurement.create({
        data: {
            poolId: customerInsightsPool.id,
            mrenclave: 'kljsdfkljkljesk12321la89237jklshdfjkhsdf',
            mrsigner: '6e6e9d40e261cfd1f5adc38db6599bfe764e9180cc',
            isvProdId: '0',
            isvSvn: '0',
        },
    });

    await prisma.enclaveMeasurement.create({
        data: {
            poolId: financialMetricsPool.id,
            mrenclave: 'jkhsdfjkhjkadhSDA786Das6as78d6asd786dsaHASDJg',
            mrsigner: '879sadf756df232esd7F7SD801237432HUJ89DR71213',
            isvProdId: '0',
            isvSvn: '0',
        },
    });

    await prisma.enclaveMeasurement.create({
        data: {
            poolId: developerSalaryPool.id,
            mrenclave: 'JKASHDKLKJSDYS79s7d61972jkhsajkhfd76979asd',
            mrsigner: 'sdfkhg32j4h4jl32891789asldhnjksdaghkgwyiqu28',
            isvProdId: '0',
            isvSvn: '0',
        },
    });

    console.log('✅ Enclave Measurements added');

    // 🎟️ Create DRT instances
    await prisma.dRTInstance.createMany({
        data: [
            {
                mintAddress: 'market_append_1',
                drtId: appendDrt.id,
                poolId: marketAnalysisPool.id,
                ownerId: user1.id,
                state: 'active',
                isListed: true,
                price: 2.0,
            },
            {
                mintAddress: 'market_wasm_1',
                drtId: executeMedianWASMDrt.id,
                poolId: marketAnalysisPool.id,
                ownerId: user1.id,
                state: 'active',
                isListed: true,
                price: 3.1,
            },
            {
                mintAddress: 'customer_python_1',
                drtId: executeMedianPythonDrt.id,
                poolId: customerInsightsPool.id,
                ownerId: user2.id,
                state: 'active',
                isListed: true,
                price: 2.5,
            },
            {
                mintAddress: 'financial_append_1',
                drtId: appendDrt.id,
                poolId: financialMetricsPool.id,
                ownerId: user4.id,
                state: 'pending',
                isListed: false,
                price: 3.0,
            },
            {
                mintAddress: 'financial_python_1',
                drtId: executeMedianPythonDrt.id,
                poolId: financialMetricsPool.id,
                ownerId: user4.id,
                state: 'active',
                isListed: false,
                price: 2.8,
            },
            {
                mintAddress: 'developer_append_1',
                drtId: appendDrt.id,
                poolId: developerSalaryPool.id,
                ownerId: user4.id,
                state: 'completed',
                isListed: false,
                price: 1.9,
            },
            {
                mintAddress: 'developer_python_1',
                drtId: executeMedianPythonDrt.id,
                poolId: developerSalaryPool.id,
                ownerId: user4.id,
                state: 'completed',
                isListed: false,
                price: 2.2,
            },
            {
                mintAddress: 'financial_wasm_1',
                drtId: executeMedianWASMDrt.id,
                poolId: financialMetricsPool.id,
                ownerId: user4.id,
                state: 'active',
                isListed: true,
                price: 3.3,
            },
            {
                mintAddress: 'market_python_1',
                drtId: executeMedianPythonDrt.id,
                poolId: marketAnalysisPool.id,
                ownerId: user1.id,
                state: 'active',
                isListed: true,
                price: 2.7,
            },
            {
                mintAddress: 'developer_wasm_1',
                drtId: executeMedianWASMDrt.id,
                poolId: developerSalaryPool.id,
                ownerId: user4.id,
                state: 'active',
                isListed: false,
                price: 2.4,
            },
        ],
    });

    console.log('✅ DRT Instances created');
    console.log('🌱 Seed data fully loaded!');
}

main()
    .catch((e) => {
        console.error('❌ Seed error:', e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
