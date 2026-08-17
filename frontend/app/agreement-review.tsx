import React from "react";
import type { AgreementDraft } from "@veyronis/shared";

export function AgreementReview({
  draft,
  preview,
  back,
  deploy,
  deploying,
}: {
  draft: AgreementDraft;
  preview: { policy: string; agreement: string };
  back: () => void;
  deploy: () => void;
  deploying: boolean;
}) {
  return (
    <>
      <section className="review">
        <div>
          <h2>Participants</h2>
          <p>
            Buyer <code>{draft.buyer}</code>
          </p>
          <p>
            Seller <code>{draft.seller}</code>
          </p>
          <p>
            Arbitrator <code>{draft.arbitrator}</code>
          </p>
        </div>
        <div>
          <h2>Deployment</h2>
          <p>
            Required amount <strong>{draft.requiredAmount} wei</strong>
          </p>
          <p>
            Asset <strong>{draft.policy.assetKind}</strong>
          </p>
          <p>
            Amount rule <strong>{draft.policy.amountRule}</strong>
          </p>
        </div>
      </section>
      <section className="commitments">
        <h2>Commitment Preview</h2>
        <dl>
          <dt>Evidence policy commitment</dt>
          <dd>{preview.policy}</dd>
          <dt>Agreement commitment</dt>
          <dd>{preview.agreement}</dd>
        </dl>
      </section>
      <aside className="warning">
        <strong>Commitments are immutable after deployment.</strong>
        <span>
          Verified evidence remains advisory. It does not automatically resolve
          disputes or move funds.
        </span>
      </aside>
      <div className="actions">
        <button onClick={back}>Back</button>
        <button className="primary" onClick={deploy} disabled={deploying}>
          {deploying ? "Deploying..." : "Confirm & Deploy"}
        </button>
      </div>
    </>
  );
}
