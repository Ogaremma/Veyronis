import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { getAddress, verifyMessage } from "ethers";

export interface WalletSession {
  address: string;
  expiresAt: number;
}

export class WalletAuthService {
  private readonly challenges = new Map<
    string,
    { message: string; expiresAt: number }
  >();

  constructor(
    private readonly secret: string,
    private readonly now = () => Date.now(),
  ) {}

  createChallenge(addressInput: string): {
    address: string;
    message: string;
    expiresAt: string;
  } {
    const address = getAddress(addressInput);
    const nonce = randomBytes(16).toString("hex");
    const expiresAt = this.now() + 5 * 60_000;
    this.pruneChallenges();
    if (this.challenges.size >= 1000) this.challenges.delete(this.challenges.keys().next().value!);
    const message = [
      "Veyronis wallet authentication",
      "",
      `Address: ${address}`,
      `Nonce: ${nonce}`,
      `Expires: ${new Date(expiresAt).toISOString()}`,
      "",
      "This signature does not authorize a blockchain transaction.",
    ].join("\n");
    this.challenges.set(address.toLowerCase(), { message, expiresAt });
    return { address, message, expiresAt: new Date(expiresAt).toISOString() };
  }

  private pruneChallenges(): void {
    const now = this.now();
    for (const [address, challenge] of this.challenges) if (challenge.expiresAt <= now) this.challenges.delete(address);
  }

  verify(addressInput: string, signature: string): string {
    const address = getAddress(addressInput);
    const pending = this.challenges.get(address.toLowerCase());
    if (!pending || pending.expiresAt < this.now())
      throw new Error("Challenge expired");
    const recovered = getAddress(verifyMessage(pending.message, signature));
    if (recovered !== address) throw new Error("Signature mismatch");
    this.challenges.delete(address.toLowerCase());
    return this.issueSession(address);
  }

  readSession(token: string | undefined): WalletSession | undefined {
    if (!token) return undefined;
    const [payload, signature] = token.split(".");
    if (!payload || !signature) return undefined;
    const expected = this.sign(payload);
    const a = Buffer.from(signature, "hex");
    const b = Buffer.from(expected, "hex");
    if (a.length !== b.length || !timingSafeEqual(a, b)) return undefined;
    try {
      const session = JSON.parse(
        Buffer.from(payload, "base64url").toString("utf8"),
      ) as WalletSession;
      return session.expiresAt > this.now()
        ? { ...session, address: getAddress(session.address) }
        : undefined;
    } catch {
      return undefined;
    }
  }

  private issueSession(address: string): string {
    const payload = Buffer.from(
      JSON.stringify({ address, expiresAt: this.now() + 8 * 60 * 60_000 }),
    ).toString("base64url");
    return `${payload}.${this.sign(payload)}`;
  }
  private sign(payload: string): string {
    return createHmac("sha256", this.secret).update(payload).digest("hex");
  }
}

export const sessionCookie = (token: string, appEnv = process.env.APP_ENV ?? "development") =>
  `veyronis_session=${token}; HttpOnly; Path=/; SameSite=Lax; Max-Age=28800${appEnv === "local" ? "" : "; Secure"}`;
export const expiredSessionCookie = (appEnv = process.env.APP_ENV ?? "development") =>
  `veyronis_session=; HttpOnly; Path=/; SameSite=Lax; Max-Age=0${appEnv === "local" ? "" : "; Secure"}`;
export function readCookie(
  header: string | undefined,
  name: string,
): string | undefined {
  return header
    ?.split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${name}=`))
    ?.slice(name.length + 1);
}
