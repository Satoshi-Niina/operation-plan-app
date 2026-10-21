import { cookies } from "next/headers";
import { AppSession, sessionCookieName, verifyAppSessionToken } from "./dashboardSso";

export type { AppSession };

/**
 * サーバーコンポーネントまたはRoute Handlerから現在のセッションを取得する。
 * セッションが存在しない、または無効な場合は null を返す。
 */
export async function getAppSession(): Promise<AppSession | null> {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get(sessionCookieName)?.value;
    if (!token) return null;
    return verifyAppSessionToken(token);
  } catch {
    return null;
  }
}
