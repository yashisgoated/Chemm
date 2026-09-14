"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { LoginForm } from "@/features/auth/AuthForms";
import { useAuth } from "@/features/auth/AuthProvider";

export default function LoginPage() {
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && user) router.replace("/");
  }, [loading, router, user]);

  return <LoginForm />;
}
