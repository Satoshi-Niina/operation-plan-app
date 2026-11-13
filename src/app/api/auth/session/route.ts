import { NextRequest, NextResponse } from "next/server";
import { getAppSession } from "@/lib/auth/session";

export async function GET(request: NextRequest) {
  try {
    const session = await getAppSession();
    if (!session || !session.tenantKey) {
      return NextResponse.json({ authenticated: false }, { status: 401 });
    }
    return NextResponse.json({
      authenticated: true,
      userId: session.userId,
      username: session.username,
      displayName: session.displayName,
      role: session.role,
      tenantKey: session.tenantKey,
      isSuperAdmin: session.isSuperAdmin,
    });
  } catch (error) {
    return NextResponse.json({ authenticated: false }, { status: 500 });
  }
}
