export async function restoreWalletSession(input: {
  address: string;
  baseUrl: string;
  fetchImpl?: typeof fetch;
}): Promise<string | undefined> {
  try {
    const response = await (input.fetchImpl ?? fetch)(
      `${input.baseUrl}/auth/session`,
      { credentials: "include" },
    );
    if (!response.ok) return undefined;
    const body = await response.json() as { address?: string };
    return body.address?.toLowerCase() === input.address.toLowerCase()
      ? input.address
      : undefined;
  } catch {
    return undefined;
  }
}
