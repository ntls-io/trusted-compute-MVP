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

// ntc-web/app/sign-in/[[...sign-in]]/page.tsx
'use client';

import { SignIn } from '@clerk/nextjs';
import { useRouter, useSearchParams } from 'next/navigation';
import Image from 'next/image';

export default function SignInPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirectUrl = searchParams.get('redirect_url') || '/';
  const currentYear = new Date().getFullYear();

  return (
    <div className="min-h-screen flex flex-col">
      <div className="flex-grow flex items-center justify-center bg-gray-50">
        <div className="w-full max-w-md">
          <div className="bg-white py-8 px-6 shadow-sm rounded-lg">
            <div className="mb-6 text-center">
              <div className="mb-4 flex justify-center">
                <div className="w-80 h-80 relative">
                  <Image
                    src="/logo.png"
                    fill
                    sizes="(max-width:768px)100vw,(max-width:1200px)80vw,400px"
                    placeholder="blur"
                    blurDataURL="/logo.png"
                    className="object-contain"
                    alt="Logo"
                  />
                </div>
              </div>
              <h2 className="text-2xl font-bold text-gray-900">Nautilus MVP Sign In</h2>
            </div>
            <SignIn
              fallbackRedirectUrl={redirectUrl}
              appearance={{
                elements: {
                  formButtonPrimary: 'bg-blue-600 hover:bg-blue-700 text-sm normal-case',
                  card: 'shadow-none',
                  headerTitle: 'hidden',
                  headerSubtitle: 'hidden',
                  socialButtonsBlockButton: 'text-gray-600 hover:bg-gray-100 border border-gray-300',
                  footerActionLink: 'text-blue-600 hover:text-blue-700 font-semibold',
                },
              }}
            />
          </div>
        </div>
      </div>
      
      <footer className="py-6 bg-gray-50">
        <div className="text-center text-sm text-gray-600">
          <div className="mb-2">
            Copyright © {currentYear}. <span className="font-semibold">Nautilus</span> All rights reserved.
          </div>
          <div>
            <a href="#" className="font-semibold hover:text-gray-900 transition-colors">
              Privacy
            </a>
            <span className="mx-2 font-light">and</span>
            <a href="#" className="font-semibold hover:text-gray-900 transition-colors">
              Terms of Use
            </a>
          </div>
        </div>
      </footer>
    </div>
  );
}