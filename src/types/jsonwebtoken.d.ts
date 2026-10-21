declare module "jsonwebtoken" {
  export interface SignOptions {
    expiresIn?: string | number;
    issuer?: string;
    audience?: string | string[];
    algorithm?: string;
  }

  export interface VerifyOptions {
    issuer?: string | string[];
    audience?: string | string[] | RegExp;
    ignoreExpiration?: boolean;
    algorithms?: string[];
  }

  export interface JwtPayload {
    [key: string]: unknown;
    iss?: string;
    sub?: string;
    aud?: string | string[];
    exp?: number;
    nbf?: number;
    iat?: number;
    jti?: string;
  }

  export function sign(
    payload: string | Buffer | object,
    secretOrPrivateKey: string | Buffer,
    options?: SignOptions
  ): string;

  export function verify(
    token: string,
    secretOrPublicKey: string | Buffer,
    options?: VerifyOptions
  ): JwtPayload | string;

  export function decode(
    token: string,
    options?: { json?: boolean; complete?: boolean }
  ): null | JwtPayload | string;
}
