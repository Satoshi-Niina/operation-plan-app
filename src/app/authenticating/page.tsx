"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

function AuthenticatingContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [status, setStatus] = useState<"connecting" | "exchanging" | "success" | "error">("connecting");
  const [errorMessage, setErrorMessage] = useState<string>("");

  useEffect(() => {
    const targetOrigins = new Set<string>();
    if (typeof window !== "undefined" && window.location.origin) {
      targetOrigins.add(window.location.origin);
    }
    if (document.referrer) {
      try {
        targetOrigins.add(new URL(document.referrer).origin);
      } catch {}
    }
    if (process.env.NEXT_PUBLIC_DASHBOARD_URL) {
      try {
        targetOrigins.add(new URL(process.env.NEXT_PUBLIC_DASHBOARD_URL).origin);
      } catch {}
    }
    targetOrigins.add("https://localhost:8443");
    targetOrigins.add("http://localhost:3000");

    let isHandshakeSettled = false;

    const sendAckToOpener = (replyOrigin?: string) => {
      if (!window.opener || window.opener.closed) return;
      if (replyOrigin) {
        try {
          window.opener.postMessage({ type: "EXTERNAL_AUTH_ACK" }, replyOrigin);
        } catch {}
      }
      for (const origin of targetOrigins) {
        try {
          window.opener.postMessage({ type: "EXTERNAL_AUTH_ACK" }, origin);
        } catch {}
      }
    };

    const sendFailedToOpener = (replyOrigin?: string) => {
      if (!window.opener || window.opener.closed) return;
      if (replyOrigin) {
        try {
          window.opener.postMessage({ type: "EXTERNAL_AUTH_FAILED" }, replyOrigin);
        } catch {}
      }
      for (const origin of targetOrigins) {
        try {
          window.opener.postMessage({ type: "EXTERNAL_AUTH_FAILED" }, origin);
        } catch {}
      }
    };

    // 0. 既存セッションの確認（middlewareが既にCookieを発行している場合、即遷移）
    fetch("/planning/api/auth/session")
      .then((r) => r.json())
      .then((data) => {
        if (data && data.authenticated && data.tenantKey) {
          isHandshakeSettled = true;
          setStatus("success");
          sendAckToOpener();

          const nextParam = searchParams.get("next");
          const nextUrl = nextParam && nextParam.includes(`/${data.tenantKey}`)
            ? (nextParam.startsWith("/planning") ? nextParam : `/planning${nextParam}`)
            : `/planning/${data.tenantKey}/planning`;
          window.location.replace(nextUrl);
        }
      })
      .catch(() => {});

    // 認証交換処理の共通ロジック
    const performAuthExchange = async (token: string, tenantId: string, replyOrigin?: string) => {
      if (isHandshakeSettled) return;
      isHandshakeSettled = true;
      setStatus("exchanging");

      try {
        const response = await fetch("/planning/api/auth/external", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token, tenantKey: tenantId }),
        });

        const result = await response.json();
        if (!response.ok || !result.success) {
          throw new Error(result.message || "認証交換に失敗しました");
        }

        setStatus("success");
        sendAckToOpener(replyOrigin);

        if (window.location.hash) {
          try {
            window.history.replaceState(null, "", window.location.pathname + window.location.search);
          } catch {}
        }

        const effectiveTenant = result.tenantKey || tenantId || "daitetsu";
        const nextParam = searchParams.get("next");
        const nextUrl = nextParam && nextParam.includes(`/${effectiveTenant}`)
          ? (nextParam.startsWith("/planning") ? nextParam : `/planning${nextParam}`)
          : `/planning/${effectiveTenant}/planning`;

        window.setTimeout(() => {
          window.location.replace(nextUrl);
        }, 200);
      } catch (err) {
        setStatus("error");
        const msg = err instanceof Error ? err.message : "認証連携中にエラーが発生しました";
        setErrorMessage(msg);
        sendFailedToOpener(replyOrigin);
      }
    };

    // A. URLハッシュ/クエリからのトークン取得をまず試行（即時連携フォールバック）
    let directToken = "";
    let directTenant = "";
    if (typeof window !== "undefined") {
      if (window.location.hash) {
        const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ""));
        directToken = hashParams.get("token") || hashParams.get("auth_token") || "";
        directTenant = hashParams.get("tenant") || hashParams.get("tenantId") || "";
      }
      if (!directToken) {
        directToken = searchParams.get("token") || searchParams.get("auth_token") || "";
        directTenant = searchParams.get("tenant") || "";
      }

      if (directToken) {
        performAuthExchange(directToken, directTenant);
      }
    }

    // B. window.opener の有無確認
    const hasOpener = window.opener && !window.opener.closed;

    // もし直接トークンもなく、かつ opener もない直接アクセスの場合はエラー表示
    if (!directToken && !hasOpener) {
      window.setTimeout(() => {
        if (!isHandshakeSettled) {
          setStatus("error");
          setErrorMessage("ダッシュボードからの起動情報が見つかりません。ダッシュボードからアプリを起動してください。");
        }
      }, 1000);
      return;
    }

    const handleMessage = async (event: MessageEvent) => {
      const data = event.data || {};
      const type = String(data.type || "");

      if (type !== "EXTERNAL_AUTH_CONTEXT" && type !== "EXTERNAL_AUTH_TOKEN") return;

      const token = String(data.token || data.auth_token || data.external_token || "").trim();
      const tenantId = String(data.tenantId || data.tenant_id || searchParams.get("tenant") || "").trim();

      if (!token) {
        setStatus("error");
        setErrorMessage("ダッシュボードから認証トークンを受信できませんでした。");
        sendFailedToOpener(event.origin);
        return;
      }

      performAuthExchange(token, tenantId, event.origin);
    };

    window.addEventListener("message", handleMessage);

    const sendReady = () => {
      if (isHandshakeSettled || !window.opener || window.opener.closed) return;
      for (const origin of targetOrigins) {
        try {
          window.opener.postMessage({ type: "EXTERNAL_AUTH_READY" }, origin);
        } catch (err) {
          console.warn("[authenticating] Failed to postMessage READY to", origin, err);
        }
      }
    };

    sendReady();
    const intervalId = window.setInterval(() => {
      if (!isHandshakeSettled) {
        sendReady();
      } else {
        window.clearInterval(intervalId);
      }
    }, 1000);

    const timeoutId = window.setTimeout(() => {
      if (!isHandshakeSettled) {
        window.clearInterval(intervalId);
        setStatus("error");
        setErrorMessage("ダッシュボードとの認証ハンドシェイクがタイムアウトしました。ダッシュボードから再度起動してください。");
      }
    }, 15000);

    return () => {
      window.removeEventListener("message", handleMessage);
      window.clearInterval(intervalId);
      window.clearTimeout(timeoutId);
    };
  }, [router, searchParams]);

  return (
    <div style={{
      minHeight: "100vh",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: "#0f172a",
      color: "#f8fafc",
      fontFamily: "sans-serif",
      padding: "20px"
    }}>
      <div style={{
        maxWidth: "480px",
        width: "100%",
        backgroundColor: "#1e293b",
        borderRadius: "12px",
        padding: "32px",
        boxShadow: "0 20px 25px -5px rgba(0, 0, 0, 0.5), 0 8px 10px -6px rgba(0, 0, 0, 0.5)",
        textAlign: "center"
      }}>
        <div style={{
          width: "48px",
          height: "48px",
          margin: "0 auto 16px",
          backgroundColor: status === "error" ? "#ef4444" : "#3b82f6",
          borderRadius: "50%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: "24px"
        }}>
          {status === "error" ? "✕" : status === "success" ? "✓" : "運"}
        </div>

        <h1 style={{ fontSize: "1.25rem", fontWeight: "bold", marginBottom: "8px" }}>
          {status === "connecting" && "ダッシュボードと連携中..."}
          {status === "exchanging" && "セッションを認証中..."}
          {status === "success" && "認証が完了しました"}
          {status === "error" && "起動エラー"}
        </h1>

        <p style={{ color: "#94a3b8", fontSize: "0.875rem", lineHeight: "1.5", marginBottom: "24px" }}>
          {status === "connecting" && "ダッシュボードの認証情報を安全に引き継いでいます。少々お待ちください。"}
          {status === "exchanging" && "テナント権限を確認し、専用データベースへの接続を確立しています。"}
          {status === "success" && "仕業計画アプリへ自動遷移します..."}
          {status === "error" && errorMessage}
        </p>

        {status === "error" && (
          <a
            href={typeof window !== "undefined" && window.location.origin ? `${window.location.origin}/` : (process.env.NEXT_PUBLIC_DASHBOARD_URL || "http://localhost:3000")}
            style={{
              display: "inline-block",
              backgroundColor: "#2563eb",
              color: "#ffffff",
              padding: "10px 20px",
              borderRadius: "6px",
              textDecoration: "none",
              fontSize: "0.875rem",
              fontWeight: 500
            }}
          >
            ダッシュボードへ戻る
          </a>
        )}
      </div>
    </div>
  );
}

export default function AuthenticatingPage() {
  return (
    <Suspense fallback={<div style={{ minHeight: "100vh", backgroundColor: "#0f172a" }} />}>
      <AuthenticatingContent />
    </Suspense>
  );
}
