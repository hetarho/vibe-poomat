/**
 * Arctic 3 is ESM only and this app compiles to CommonJS, so it cannot be a
 * static import: `require()` of an ES module works on some Node builds and not
 * others, which is not a thing to discover in production. It is loaded through
 * `import()` once, where the module wires its providers, which keeps every
 * client below synchronous and works on every runtime.
 *
 * The shape is declared here rather than imported, because a type import from an
 * ES module into a CommonJS file needs a resolution-mode attribute that Biome
 * cannot parse. Declaring it has a second use: this is the seam a test stubs, so
 * exercising the clients costs no network and no real credentials.
 * `arctic-module.test.ts` asserts the real package still matches.
 */
export type ArcticTokens = {
  accessToken(): string
  idToken(): string
}

export type ArcticGitHub = {
  createAuthorizationURL(state: string, scopes: string[]): URL
  validateAuthorizationCode(code: string): Promise<ArcticTokens>
}

export type ArcticGoogle = {
  createAuthorizationURL(state: string, codeVerifier: string, scopes: string[]): URL
  validateAuthorizationCode(code: string, codeVerifier: string): Promise<ArcticTokens>
}

export type ArcticModule = {
  GitHub: new (clientId: string, clientSecret: string, redirectUri: string) => ArcticGitHub
  Google: new (clientId: string, clientSecret: string, redirectUri: string) => ArcticGoogle
  generateState(): string
  generateCodeVerifier(): string
  decodeIdToken(idToken: string): object
}

export async function loadArctic(): Promise<ArcticModule> {
  return (await import('arctic')) as unknown as ArcticModule
}
