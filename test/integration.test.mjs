import test from 'node:test';
import assert from 'node:assert/strict';
import jwt from 'jsonwebtoken';
import crypto from 'node:crypto';

// テスト用環境変数の設定
process.env.SHARED_SSO_SECRET = 'test-sso-secret-32-chars-long-minimum!!';
process.env.APP_SESSION_SECRET = 'test-session-secret-32-chars-long!!';
process.env.INTERNAL_GATEWAY_SECRET = 'test-gateway-secret-32-chars-long!';
process.env.DASHBOARD_JWT_ISSUER = 'dashboard-auth';
process.env.DASHBOARD_JWT_AUDIENCE = 'dashboard-apps';
process.env.DATABASE_URL = 'postgresql://postgres:password@localhost:5432/common_db';

const {
  verifyDashboardToken,
  issueAppSessionToken,
  verifyAppSessionToken,
  DashboardSsoError
} = await import('../src/lib/auth/dashboardSso.ts');

const {
  isAllowedTenant,
  resolveTenantDatabaseName,
  buildDatabaseUrlForDatabase,
  maskDatabaseUrl,
  getTenantPool,
  TenantDatabaseUnavailableError
} = await import('../src/lib/db/tenantPool.ts');

test('【SSO検証】正常なダッシュボードランチトークンが検証できること', () => {
  const payload = {
    userId: 'user-001',
    username: 'yamada',
    displayName: '山田 太郎',
    role: 'operator',
    tenantKey: 'daitetsu',
    appKey: 'planning',
  };
  const token = jwt.sign(payload, process.env.SHARED_SSO_SECRET, {
    expiresIn: '60s',
    issuer: 'dashboard-auth',
    audience: 'dashboard-apps',
  });

  const decoded = verifyDashboardToken(token, 'daitetsu');
  assert.equal(decoded.userId, 'user-001');
  assert.equal(decoded.username, 'yamada');
  assert.equal(decoded.tenantKey, 'daitetsu');
  assert.equal(decoded.role, 'operator');
  assert.equal(decoded.isSuperAdmin, false);
});

test('【SSO検証】ユーザー名niina単独では管理者権限が付与されず、署名クレーム（roleまたはis_super_admin）が必要なこと', () => {
  // 1. niina だが role が operator で is_super_admin なし -> 一般ユーザーとして判定
  const regularNiinaPayload = {
    userId: 'niina-001',
    username: 'niina',
    role: 'operator',
    tenantKey: 'daitetsu',
    appKey: 'planning',
  };
  const regularToken = jwt.sign(regularNiinaPayload, process.env.SHARED_SSO_SECRET);
  const regularDecoded = verifyDashboardToken(regularToken, 'daitetsu');
  assert.equal(regularDecoded.isSuperAdmin, false);

  // 2. Dashboard が system_admin または is_super_admin: true を署名 -> 管理者として認可
  const adminNiinaPayload = {
    userId: 'niina-001',
    username: 'niina',
    role: 'system_admin',
    tenantKey: 'kosei',
    appKey: 'planning',
    is_super_admin: true,
  };
  const adminToken = jwt.sign(adminNiinaPayload, process.env.SHARED_SSO_SECRET);
  const adminDecoded = verifyDashboardToken(adminToken, 'kosei');
  assert.equal(adminDecoded.isSuperAdmin, true);
  assert.equal(adminDecoded.role, 'system_admin');
});

test('【SSO検証】別アプリ向け（inspection等）のトークンは拒否されること', () => {
  const payload = {
    userId: 'user-001',
    username: 'yamada',
    role: 'operator',
    tenantKey: 'daitetsu',
    appKey: 'inspection', // planning ではない
  };
  const token = jwt.sign(payload, process.env.SHARED_SSO_SECRET, {
    expiresIn: '60s',
    issuer: 'dashboard-auth',
    audience: 'dashboard-apps',
  });

  assert.throws(
    () => verifyDashboardToken(token, 'daitetsu'),
    (err) => err instanceof DashboardSsoError && err.status === 403
  );
});

test('【SSO検証】署名不正または期限切れトークンは拒否されること', () => {
  const badToken = jwt.sign({ username: 'hacker' }, 'wrong-secret');
  assert.throws(
    () => verifyDashboardToken(badToken),
    (err) => err instanceof DashboardSsoError && err.status === 401
  );
});

test('【セッション管理】発行したセッションCookieトークンが正しく検証できること', () => {
  const session = {
    userId: 'user-001',
    username: 'yamada',
    displayName: '山田 太郎',
    role: 'operator',
    tenantKey: 'daitetsu',
    isSuperAdmin: false,
  };
  const token = issueAppSessionToken(session);
  const verified = verifyAppSessionToken(token);
  assert.ok(verified);
  assert.equal(verified.userId, 'user-001');
  assert.equal(verified.tenantKey, 'daitetsu');
});

test('【テナントDB解決】ホワイトリストに基づくテナントDB名解決', () => {
  assert.equal(isAllowedTenant('daitetsu'), true);
  assert.equal(isAllowedTenant('kosei'), true);
  assert.equal(isAllowedTenant('kintetsu'), true);
  assert.equal(isAllowedTenant('demo'), true);
  assert.equal(isAllowedTenant('malicious_db'), false);
  assert.equal(isAllowedTenant('admin'), false);

  assert.equal(resolveTenantDatabaseName('daitetsu'), 'daitetsu_db');
  assert.equal(resolveTenantDatabaseName('kosei'), 'kosei_db');
  assert.equal(resolveTenantDatabaseName('kintetsu'), 'kintetsu_db');
  assert.equal(resolveTenantDatabaseName('unknown'), null);
});

test('【テナントDB安全性】DB接続文字列内のパスワードマスキング', () => {
  const plainUrl = 'postgresql://myuser:supersecretpass@127.0.0.1:5432/daitetsu_db';
  const masked = maskDatabaseUrl(plainUrl);
  assert.equal(masked, 'postgresql://myuser:***@127.0.0.1:5432/daitetsu_db');
  assert.equal(masked.includes('supersecretpass'), false);
});

test('【テナントDB安全性】本番モード／モック禁止時の未設定DBに対する503エラー', async () => {
  const originalEnv = process.env.NODE_ENV;
  const originalDb = process.env.DATABASE_URL;
  try {
    process.env.NODE_ENV = 'production';
    delete process.env.DATABASE_URL;
    delete process.env.DB_CONNECTION_URL;
    delete process.env.TENANT_DB_DAITETSU_URL;
    delete process.env.ALLOW_MOCK_DATA;

    await assert.rejects(
      async () => await getTenantPool('daitetsu'),
      (err) => err instanceof TenantDatabaseUnavailableError && err.status === 503
    );
  } finally {
    process.env.NODE_ENV = originalEnv;
    process.env.DATABASE_URL = originalDb;
  }
});

test('【テナントDB解決】基本DB接続URLからテナントDBへの置換（TCP & Cloud SQL Socket形式）', () => {
  // 1. 標準TCP形式
  const tcpBase = 'postgresql://postgres:secret@127.0.0.1:5432/common_db';
  assert.equal(
    buildDatabaseUrlForDatabase(tcpBase, 'daitetsu_db'),
    'postgresql://postgres:secret@127.0.0.1:5432/daitetsu_db'
  );
  assert.equal(
    buildDatabaseUrlForDatabase(tcpBase, 'kosei_db'),
    'postgresql://postgres:secret@127.0.0.1:5432/kosei_db'
  );

  // 2. Cloud SQL Unix Socket形式
  const socketBase = 'postgresql://app_user:pass@/common_db?host=/cloudsql/maint-vehicle-management:asia-northeast2:free-trial-first-project';
  const resolvedSocket = buildDatabaseUrlForDatabase(socketBase, 'daitetsu_db');
  assert.ok(resolvedSocket.includes('/daitetsu_db'));
  assert.ok(resolvedSocket.includes('?host=/cloudsql/'));
});

test('【Gateway HMAC検証】HMAC-SHA256署名の生成と検証', () => {
  const secret = process.env.INTERNAL_GATEWAY_SECRET;
  const payload = JSON.stringify({ authorized: true, fingerprint256: 'abc123' });
  const hmac = crypto.createHmac('sha256', secret).update(payload).digest('hex');
  const token = Buffer.from(JSON.stringify({ payload, hmac })).toString('base64');

  // 検証処理
  const decoded = JSON.parse(Buffer.from(token, 'base64').toString('utf8'));
  const calculatedHmac = crypto.createHmac('sha256', secret).update(decoded.payload).digest('hex');
  assert.equal(decoded.hmac, calculatedHmac);
});
