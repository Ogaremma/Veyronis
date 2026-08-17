import "dotenv/config";
import { z } from "zod";

export class ConfigurationError extends Error {
  readonly code = "CONFIGURATION_MISSING" as const;

  constructor(readonly issues: readonly string[]) {
    super(
      `Missing or invalid live integration configuration: ${issues.join(", ")}`,
    );
    this.name = "ConfigurationError";
  }
}

const schema = z.object({
  CREDITCOIN_RPC_URL: z.string().url(),
  ATTESTCOIN_PROOF_BUILDER_URL: z.string().url(),
  SEPOLIA_CHAIN_KEY: z.coerce.number().int().positive().default(1),
  VEYRONIS_EVIDENCE_REGISTRY_ADDRESS: z.string().regex(/^0x[a-fA-F0-9]{40}$/),
  VEYRONIS_VERIFIER_PRIVATE_KEY: z.string().regex(/^0x[a-fA-F0-9]{64}$/),
});

export type AppConfig = z.infer<typeof schema>;
export const loadConfig = (
  environment: NodeJS.ProcessEnv = process.env,
): AppConfig => {
  const result = schema.safeParse(environment);
  if (!result.success) {
    throw new ConfigurationError(
      result.error.issues.map((issue) => issue.path.join(".")),
    );
  }
  return result.data;
};

const deploymentSchema = z.object({
  DEPLOYER_RPC_URL: z.string().url(),
  DEPLOYER_PRIVATE_KEY: z.string().regex(/^0x[a-fA-F0-9]{64}$/),
});
export type DeploymentConfig = z.infer<typeof deploymentSchema>;

/** Loaded separately so verifier credentials can never be reused for escrow deployment. */
export const loadDeploymentConfig = (
  environment: NodeJS.ProcessEnv = process.env,
): DeploymentConfig => {
  const result = deploymentSchema.safeParse(environment);
  if (!result.success)
    throw new ConfigurationError(
      result.error.issues.map((issue) => issue.path.join(".")),
    );
  return result.data;
};

const agreementServerSchema = deploymentSchema.extend({
  DATABASE_URL: z.string().min(1),
  BACKEND_HOST: z.string().default("127.0.0.1"),
  BACKEND_PORT: z.coerce.number().int().positive().max(65535).default(3001),
});
export type AgreementServerConfig = z.infer<typeof agreementServerSchema>;
export const loadAgreementServerConfig = (
  environment: NodeJS.ProcessEnv = process.env,
): AgreementServerConfig => {
  const result = agreementServerSchema.safeParse(environment);
  if (!result.success)
    throw new ConfigurationError(
      result.error.issues.map((issue) => issue.path.join(".")),
    );
  return result.data;
};
