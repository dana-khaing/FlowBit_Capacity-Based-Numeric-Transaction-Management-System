"use client";

import { useEffect, useRef, useState } from "react";

declare global {
  interface Window {
    google?: {
      accounts: {
        id: {
          initialize: (options: {
            client_id: string;
            callback: (response: { credential?: string }) => void;
          }) => void;
          renderButton: (
            parent: HTMLElement,
            options: {
              type?: "standard" | "icon";
              theme?: "outline" | "filled_blue" | "filled_black";
              text?: "signin_with" | "signup_with" | "continue_with" | "signin";
              shape?: "rectangular" | "pill" | "circle" | "square";
              size?: "large" | "medium" | "small";
              width?: number;
              logo_alignment?: "left" | "center";
            },
          ) => void;
        };
      };
    };
  }
}

type GoogleSignInButtonProps = {
  disabled?: boolean;
  onCredential: (credential: string) => void;
  onError: (message: string) => void;
};

export function GoogleSignInButton({
  disabled = false,
  onCredential,
  onError,
}: GoogleSignInButtonProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [googleReady, setGoogleReady] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    if (window.google?.accounts?.id) {
      setGoogleReady(true);
      return;
    }

    const intervalId = window.setInterval(() => {
      if (window.google?.accounts?.id) {
        setGoogleReady(true);
        window.clearInterval(intervalId);
      }
    }, 250);

    return () => window.clearInterval(intervalId);
  }, []);

  useEffect(() => {
    const clientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;

    if (!clientId) {
      onError("Google sign-in is not configured for this environment.");
      return;
    }

    if (!googleReady || !window.google?.accounts?.id || !containerRef.current || disabled) {
      return;
    }

    containerRef.current.innerHTML = "";

    window.google.accounts.id.initialize({
      client_id: clientId,
      callback: (response) => {
        if (!response.credential) {
          onError("Google sign-in did not return a valid credential.");
          return;
        }

        onCredential(response.credential);
      },
    });

    const width = containerRef.current.offsetWidth || 320;

    window.google.accounts.id.renderButton(containerRef.current, {
      type: "standard",
      theme: "outline",
      text: "signin_with",
      shape: "pill",
      size: "large",
      width,
      logo_alignment: "left",
    });
  }, [disabled, googleReady, onCredential, onError]);

  return (
    <div
      ref={containerRef}
      className={`flex min-h-11 w-full items-center justify-center ${disabled ? "pointer-events-none opacity-60" : ""}`}
    />
  );
}
