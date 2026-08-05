import type { ReactNode } from "react";
import { SignedMark } from "@/components/ui";

export default async function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-6 py-12">
      <div className="mb-8 flex justify-center">
        <SignedMark />
      </div>
      {children}
    </main>
  );
}
