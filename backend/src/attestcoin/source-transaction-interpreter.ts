import type {
  InterpretedEvidence,
  VerifiedEvidenceInterpreter,
  VerifiedSourceTransaction,
} from "./verifier-types.js";

export class SourceTransactionSenderInterpreter implements VerifiedEvidenceInterpreter {
  constructor(readonly evidenceType: string) {}

  interpret(transaction: VerifiedSourceTransaction): InterpretedEvidence {
    return { evidenceType: this.evidenceType, subject: transaction.from };
  }
}
