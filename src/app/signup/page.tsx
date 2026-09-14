"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { SignupForm } from "@/features/auth/AuthForms";
import { useAuth } from "@/features/auth/AuthProvider";

export default function SignupPage() {
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && user) router.replace("/");
  }, [loading, router, user]);

  return <SignupForm />;
}
