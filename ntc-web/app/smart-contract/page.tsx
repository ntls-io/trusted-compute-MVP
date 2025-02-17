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

// app/smart-contract/page.tsx
"use client";

import React from "react";
import CreatePoolForm from "@/components/CreatePoolForm";
import BuyDrtForm from "@/components/BuyDrtForm";
import RedeemDrtForm from "@/components/RedeemDrtForm";

export default function SmartContractPage() {
  return (
    <div className="p-8 space-y-8">
      <h1 className="text-3xl font-bold">Smart Contract Interaction</h1>
      <p className="text-gray-700">
        Use the forms below to create new pools, buy DRTs, and redeem DRTs.
      </p>
      <CreatePoolForm />
      <BuyDrtForm />
      <RedeemDrtForm />
    </div>
  );
}