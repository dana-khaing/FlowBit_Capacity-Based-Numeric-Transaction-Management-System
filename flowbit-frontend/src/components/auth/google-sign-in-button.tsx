"use client";

import { useEffect, useRef } from "react";

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

  useEffect(() => {
    const clientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;

    if (!clientId) {
      onError("Google sign-in is not configured for this environment.");
      return;
    }

    if (!window.google?.accounts?.id || !containerRef.current || disabled) {
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

    window.google.accounts.id.renderButton(containerRef.current, {
      type: "standard",
      theme: "outline",
      text: "continue_with",
      shape: "pill",
      size: "large",
      width: 320,
      logo_alignment: "left",
    });
  }, [disabled, onCredential, onError]);

  return <div ref={containerRef} className={disabled ? "pointer-events-none opacity-60" : ""} />;
}
