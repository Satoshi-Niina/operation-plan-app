"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

export default function AuthenticatingPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [status, setStatus] = useState<"connecting" | "exchanging" | "success" | "error">("connecting");
  const [errorMessage, setErrorMessage] = useState<string>("");

  useEffect(() => {
    // 1. window.opener がない場合（直接アクセス時）
    if (!window.opener || window.opener.closed) {
      queueMicrotask(() => {
        setStatus("error");
        setErrorMessage("ダッシュボードからの起動情報が見つかりません。ダッシュボードからアプリを起動してください。");
      });
      return;
    }

    const defaultDashboardOrigin = process.env.NEXT_PUBLIC_DASHBOARD_URL
      ? new URL(process.env.NEXT_PUBLIC_DASHBOARD_URL).origin
      : "http://localhost:3000";

    let targetDashboardOrigin = defaultDashboardOrigin;
    if (document.referrer) {
      try {
        targetDashboardOrigin = new URL(document.referrer).origin;
      } catch {
        targetDashboardOrigin = defaultDashboardOrigin;
      }
    }

    let isHandshakeSettled = false;

    // 2. メッセージ受信ハンドラ
    const handleMessage = async (event: MessageEvent) => {
      // 送信元の検証
      if (event.source !== window.opener) return;

      const data = event.data || {};
      const type = String(data.type || "");

      if (type !== "EXTERNAL_AUTH_CONTEXT" && type !== "EXTERNAL_AUTH_TOKEN") return;

      const token = String(data.token || data.auth_token || data.external_token || "").trim();
      const tenantId = String(data.tenantId || data.tenant_id || searchParams.get("tenant") || "").trim();

      if (!token) {
        setStatus("error");
        setErrorMessage("ダッシュボードから認証トークンを受信できませんでした。");
        try {
          window.opener?.postMessage({ type: "EXTERNAL_AUTH_FAILED" }, event.origin);
        } catch {}
        return;
      }

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

        isHandshakeSettled = true;
        setStatus("success");

        // ダッシュボードへ完了通知
        try {
          window.opener?.postMessage({ type: "EXTERNAL_AUTH_ACK" }, event.origin);
        } catch {}

        // リダイレクト先の決定
        const effectiveTenant = result.tenantKey || tenantId || "daitetsu";
        const nextParam = searchParams.get("next");
        const nextUrl = nextParam && nextParam.includes(`/${effectiveTenant}`)
          ? (nextParam.startsWith("/planning") ? nextParam : `/planning${nextParam}`)
          : `/planning/${effectiveTenant}/planning`;

        window.setTimeout(() => {
          window.location.replace(nextUrl);
        }, 300);
      } catch (err) {
        isHandshakeSettled = true;
        setStatus("error");
        const msg = err instanceof Error ? err.message : "認証連携中にエラーが発生しました";
        setErrorMessage(msg);
        try {
          window.opener?.postMessage({ type: "EXTERNAL_AUTH_FAILED" }, event.origin);
        } catch {}
      }
    };

    window.addEventListener("message", handleMessage);

    // 3. ダッシュボードへ「準備完了（EXTERNAL_AUTH_READY）」を送信
    const sendReady = () => {
      if (isHandshakeSettled) return;
      try {
        window.opener?.postMessage({ type: "EXTERNAL_AUTH_READY" }, targetDashboardOrigin);
      } catch (err) {
        console.warn("[authenticating] Failed to postMessage READY:", err);
      }
    };

    // 初期送信と安全のための再送インターバル（1秒ごと最大5回）
    sendReady();
    const intervalId = window.setInterval(() => {
      if (!isHandshakeSettled) {
        sendReady();
      } else {
        window.clearInterval(intervalId);
      }
    }, 1000);

    // 15秒でタイムアウト判定
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
            href={process.env.NEXT_PUBLIC_DASHBOARD_URL || "http://localhost:3000"}
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
