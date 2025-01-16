import { SignUp } from "@clerk/nextjs";
import Image from "next/image";

export default function SignUpPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="w-full max-w-md">
        <div className="bg-white py-8 px-6 shadow-sm rounded-lg">
          <div className="mb-6 text-center">
            <div className="mb-4 flex justify-center">
              <div className="w-48 h-16 relative">
                <Image
                  src="/logo.png"
                  alt="Logo"
                  fill
                  className="object-contain"
                  priority
                />
              </div>
            </div>
            <h2 className="text-2xl font-bold text-gray-900">Create Account</h2>
          </div>

          <SignUp
            appearance={{
              elements: {
                formButtonPrimary: 
                  "bg-blue-600 hover:bg-blue-700 text-sm normal-case",
                card: "shadow-none",
                headerTitle: "hidden",
                headerSubtitle: "hidden",
                socialButtonsBlockButton: 
                  "text-gray-600 hover:bg-gray-100 border border-gray-300",
                footerActionLink: 
                  "text-blue-600 hover:text-blue-700 font-semibold"
              }
            }}
          />

          <div className="mt-6 text-center text-sm">
            <span className="text-gray-600">Already have an account? </span>
            <a 
              href="/sign-in" 
              className="text-blue-600 hover:text-blue-700 font-semibold"
            >
              Sign In
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}