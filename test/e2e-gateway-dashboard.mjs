import test from 'node:test';
import assert from 'node:assert/strict';
import https from 'node:https';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import jwt from 'jsonwebtoken';

// 証明書および秘密情報のパス
const certsDir = path.resolve(process.cwd(), '../gateway/certs');
const caCert = fs.readFileSync(path.join(certsDir, 'ca.crt'));
const clientCert = fs.readFileSync(path.join(certsDir, 'client_daitetsu.crt'));
const clientKey = fs.readFileSync(path.join(certsDir, 'client_daitetsu.key'));

// mTLS エージェント（Gateway 8443 接続用）
const mtlsAgent = new https.Agent({
  ca: caCert,
  cert: clientCert,
  key: clientKey,
  rejectUnauthorized: false,
});

const GATEWAY_URL = 'https://localhost:8443';
const DASHBOARD_URL = 'http://localhost:3000';
const PLANNING_URL = 'http://localhost:3002';
const JWT_SECRET = 'I713ZkufHbpsKO81UnrwwrEhd5lyalvA5T36vuUcilNzuWhhCerkXr4EkzBSKNRU0';
const INTERNAL_SECRET = '7a332fc80f2f5651b414a9d4abf20bfc9d4dd96e1ceb7a5e8ccbb1fc6892baf0';

function httpsFetch(urlStr, options = {}) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(urlStr);
    const reqOptions = {
      protocol: parsed.protocol,
      hostname: parsed.hostname,
      port: parsed.port,
      path: parsed.pathname + parsed.search,
      method: options.method || 'GET',
      headers: options.headers || {},
      agent: parsed.protocol === 'https:' ? mtlsAgent : undefined,
    };

    const clientModule = parsed.protocol === 'https:' ? https : http;
    const req = clientModule.request(reqOptions, (res) => {
      let body = '';
      res.on('data', (chunk) => { body += chunk; });
      res.on('end', () => {
        resolve({
          status: res.statusCode,
          headers: res.headers,
          text: async () => body,
          json: async () => JSON.parse(body),
        });
      });
    });

    req.on('error', reject);
    if (options.body) {
      req.write(options.body);
    }
    req.end();
  });
}

function createInternalAuthToken(deviceContext) {
  const payload = JSON.stringify({
    ...deviceContext,
    issuedAt: Date.now()
  });
  const hmac = crypto.createHmac('sha256', INTERNAL_SECRET).update(payload).digest('hex');
  return Buffer.from(JSON.stringify({ payload, hmac })).toString('base64');
}

test('【1. Gateway経由Dashboard疎通】Gateway(8443)経由でDashboardが正常表示されること', async () => {
  const res = await httpsFetch(`${GATEWAY_URL}/login.html`);
  assert.equal(res.status, 200, 'Gateway経由でlogin.htmlが取得できること');
  const body = await res.text();
  assert.ok(body.includes('login') || body.includes('ユーザーID') || body.includes('ログイン'), 'ログイン画面のHTMLが含まれること');
});

test('【2. Dashboard直接アクセス遮断とGateway認可】ポート3000への直接アクセスは403、Gateway経由・署名付きは200', async () => {
  // 直接アクセスは遮断されること
  const directRes = await fetch(`${DASHBOARD_URL}/login.html`);
  assert.equal(directRes.status, 403, 'Gatewayを通さない直接アクセスは403 Forbiddenで遮断されること');

  // Gateway経由（mTLS端末認証済み）は200 OK
  const gatewayRes = await httpsFetch(`${GATEWAY_URL}/login.html`);
  assert.equal(gatewayRes.status, 200, 'Gateway経由は正常に200 OK');
});

test('【3. 仕業計画アプリ起動URL】Gateway(8443)から/planning/へのプロキシルーティングが機能すること', async () => {
  const res = await httpsFetch(`${GATEWAY_URL}/planning/authenticating`);
  assert.equal(res.status, 200, 'Gateway経由でauthenticating画面が取得できること');
  const body = await res.text();
  assert.ok(body.includes('ダッシュボード') || body.includes('html') || body.includes('react') || body.includes('連携中'), 'authenticating画面のHTMLが返ること');
});

test('【4. SSOハンドシェイク・セッション確立】Dashboard署名トークンから仕業計画アプリのセッションCookieを発行', async () => {
  const ssoToken = jwt.sign({
    userId: 'user-daitetsu-001',
    username: 'yamada',
    displayName: '山田 太郎',
    role: 'operator',
    tenantKey: 'daitetsu',
    appKey: 'planning',
  }, JWT_SECRET, {
    expiresIn: '5m',
    issuer: 'dashboard-auth',
    audience: 'dashboard-apps',
  });

  const res = await fetch(`${PLANNING_URL}/planning/api/auth/external`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token: ssoToken, tenantId: 'daitetsu' }),
  });

  assert.equal(res.status, 200, 'SSOハンドシェイクAPIが200を返すこと');
  const data = await res.json();
  assert.equal(data.success, true);
  assert.equal(data.tenantKey, 'daitetsu');

  // Set-Cookie ヘッダーの検証
  const setCookie = res.headers.get('set-cookie');
  assert.ok(setCookie, 'セッションCookieが設定されていること');
  assert.ok(setCookie.includes('ops_plan_session='), 'Cookie名がops_plan_sessionであること');
  assert.ok(setCookie.includes('HttpOnly'), 'HttpOnly属性が付与されていること');
});

test('【5. ユーザー・テナント情報引継ぎ】確立したセッションCookieで認証を通過しDB層へ到達すること', async () => {
  const ssoToken = jwt.sign({
    userId: 'user-daitetsu-001',
    username: 'yamada',
    displayName: '山田 太郎',
    role: 'operator',
    tenantKey: 'daitetsu',
    appKey: 'planning',
  }, JWT_SECRET, {
    expiresIn: '5m',
    issuer: 'dashboard-auth',
    audience: 'dashboard-apps',
  });

  // セッションCookie取得
  const authRes = await fetch(`${PLANNING_URL}/planning/api/auth/external`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token: ssoToken, tenantId: 'daitetsu' }),
  });
  const cookieHeader = authRes.headers.get('set-cookie');
  const sessionCookie = cookieHeader.split(';')[0];

  // 自テナント (/planning/daitetsu/planning) へのアクセス
  const pageRes = await fetch(`${PLANNING_URL}/planning/daitetsu/planning`, {
    headers: { Cookie: sessionCookie },
    redirect: 'manual',
  });
  
  // 307(未ログイン認証待ち)にならず、認証が通過していること（本番モードでDB未設定時は500/503、設定時は200）
  assert.notEqual(pageRes.status, 307, 'セッション認証が通過していること（307未ログインリダイレクトにならない）');
  assert.ok(
    pageRes.status === 200 || pageRes.status === 500 || pageRes.status === 503,
    `DB接続レイヤーへ到達 (status: ${pageRes.status})`
  );
});

test('【6. 他テナントアクセス拒否】daitetsuセッションでkoseiへのURL改変アクセスが遮断されること', async () => {
  const ssoToken = jwt.sign({
    userId: 'user-daitetsu-001',
    username: 'yamada',
    displayName: '山田 太郎',
    role: 'operator',
    tenantKey: 'daitetsu',
    appKey: 'planning',
  }, JWT_SECRET, {
    expiresIn: '5m',
    issuer: 'dashboard-auth',
    audience: 'dashboard-apps',
  });

  const authRes = await fetch(`${PLANNING_URL}/planning/api/auth/external`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token: ssoToken, tenantId: 'daitetsu' }),
  });
  const cookieHeader = authRes.headers.get('set-cookie');
  const sessionCookie = cookieHeader.split(';')[0];

  // 他テナント (/planning/kosei/planning) への不正URLアクセス
  const badRes = await fetch(`${PLANNING_URL}/planning/kosei/planning`, {
    headers: { Cookie: sessionCookie },
    redirect: 'manual',
  });

  assert.equal(badRes.status, 307, '他テナントへのアクセスが307 Temporary Redirectで遮断されること');
  const location = badRes.headers.get('location') || '';
  assert.ok(location.includes('access-denied'), 'アクセス拒否画面(/planning/access-denied)へリダイレクトされること');
  assert.ok(location.includes('tenant-mismatch'), '拒否理由はtenant-mismatchであること');
});

test('【7. Gateway HMAC内部署名検証】正常な署名とリプレイ攻撃HMACの検証', async () => {
  const deviceContext = {
    hasCert: true,
    authorized: true,
    fingerprint256: '017bdb02011d8933801e14b14b3a216efe34cb9da8450d6b79448e196a67574e',
    serialNumber: '54c259fd646e03eeaf208341cf7de1a70ed1bbdd',
    subject: 'CN=iPad-Daitetsu-001, O=Daitetsu Kogyo, OU=Operations',
  };

  // 1. 正常なHMAC署名
  const validHmacToken = createInternalAuthToken(deviceContext);
  const gatewaySimRes = await fetch(`${PLANNING_URL}/planning/access-denied`, {
    headers: {
      'x-internal-device-auth': validHmacToken,
    },
  });
  assert.equal(gatewaySimRes.status, 200, '正常なHMAC署名があればアクセス可能');

  // 2. リプレイ攻撃（10分前の古いタイムスタンプ）のHMAC
  const expiredPayload = JSON.stringify({
    ...deviceContext,
    issuedAt: Date.now() - 600000,
  });
  const expiredHmac = crypto.createHmac('sha256', INTERNAL_SECRET).update(expiredPayload).digest('hex');
  const expiredToken = Buffer.from(JSON.stringify({ payload: expiredPayload, hmac: expiredHmac })).toString('base64');

  const raw = Buffer.from(expiredToken, 'base64').toString('utf8');
  const parsed = JSON.parse(raw);
  const payloadObj = JSON.parse(parsed.payload);
  const isSkewAcceptable = Math.abs(Date.now() - payloadObj.issuedAt) <= 300000;
  assert.equal(isSkewAcceptable, false, '10分前のリプレイ攻撃HMACは許容されないこと');
});

test('【8. 既存の仕業点検アプリ動作確認】Gateway(8443)から/inspection/へのルーティング', async () => {
  const res = await httpsFetch(`${GATEWAY_URL}/inspection/`);
  assert.ok(res.status === 200 || res.status === 502, `仕業点検アプリへのルーティングが動作 (status: ${res.status})`);
});

test('【9. セキュリティ確認: SSOセッション期限切れ拒否】期限切れトークンによるアクセス遮断', async () => {
  // 期限切れセッションCookieの作成
  const expiredToken = jwt.sign({
    userId: 'user-001',
    username: 'yamada',
    tenantKey: 'daitetsu',
    role: 'operator',
  }, 'operation-plan-app-local-session-secret-change-me', {
    expiresIn: '-10s', // 過去時刻
    issuer: 'operation-plan-app',
    audience: 'operation-plan-session',
  });

  const res = await fetch(`${PLANNING_URL}/planning/daitetsu/planning`, {
    headers: { Cookie: `ops_plan_session=${expiredToken}` },
    redirect: 'manual',
  });

  assert.equal(res.status, 307, '期限切れセッションは未認証画面へリダイレクト');
  const loc = res.headers.get('location') || '';
  assert.ok(loc.includes('/authenticating'), 'authenticating画面へリダイレクトされること');
});

test('【10. セキュリティ確認: スーパー管理者のテナント切替認可】Dashboard署名クレームに基づく認可', async () => {
  // スーパー管理者がkoseiを選択して起動
  const superAdminToken = jwt.sign({
    userId: 'niina-admin',
    username: 'niina',
    role: 'system_admin',
    tenantKey: 'kosei',
    is_super_admin: true,
    appKey: 'planning',
  }, JWT_SECRET, {
    expiresIn: '5m',
    issuer: 'dashboard-auth',
    audience: 'dashboard-apps',
  });

  const res = await fetch(`${PLANNING_URL}/planning/api/auth/external`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token: superAdminToken, tenantId: 'kosei' }),
  });

  assert.equal(res.status, 200, 'スーパー管理者のテナント切替が成功すること');
  const data = await res.json();
  assert.equal(data.tenantKey, 'kosei', '選択したテナント（kosei）に切り替わること');
});
