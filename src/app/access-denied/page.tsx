"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";

function AccessDeniedContent() {
  const searchParams = useSearchParams();
  const reason = searchParams.get("reason");

  const getReasonDetails = () => {
    switch (reason) {
      case "tenant-mismatch":
        return {
          title: "アクセス権限がありません（テナント不一致）",
          message: "現在ログイン中のテナントと、リクエストされたテナントが一致しません。所属テナントの画面をご利用いただくか、ダッシュボードからテナントを切り替えてください。",
        };
      case "expired":
        return {
          title: "セッションの有効期限が切れました",
          message: "ダッシュボードでの認証有効期限が切れています。ダッシュボードに再ログインのうえ、再度アクセスしてください。",
        };
      case "no-session":
        return {
          title: "未ログイン状態です",
          message: "ダッシュボードからのログインセッションが見つかりません。ダッシュボードからアプリを起動してください。",
        };
      default:
        return {
          title: "アクセスが拒否されました",
          message: "このページを表示する権限がないか、セッションが無効です。ダッシュボードから再度アプリを起動してください。",
        };
    }
  };

  const details = getReasonDetails();
  const dashboardUrl = process.env.NEXT_PUBLIC_DASHBOARD_URL || "http://localhost:3000";

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
          borderRadius: "50%",
          backgroundColor: "#ef444420",
          color: "#ef4444",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: "24px"
        }}>
          ⚠️
        </div>
        <h1 style={{ fontSize: "20px", fontWeight: "bold", marginBottom: "12px", color: "#f8fafc" }}>
          {details.title}
        </h1>
        <p style={{ fontSize: "14px", color: "#94a3b8", lineHeight: "1.6", marginBottom: "24px" }}>
          {details.message}
        </p>
        <a
          href={dashboardUrl}
          style={{
            display: "inline-block",
            backgroundColor: "#2563eb",
            color: "white",
            padding: "10px 20px",
            borderRadius: "6px",
            textDecoration: "none",
            fontWeight: "500",
            fontSize: "14px"
          }}
        >
          ダッシュボードへ戻る
        </a>
      </div>
    </div>
  );
}

export default function AccessDeniedPage() {
  return (
    <Suspense fallback={<div style={{ minHeight: "100vh", backgroundColor: "#0f172a" }} />}>
      <AccessDeniedContent />
    </Suspense>
  );
}

