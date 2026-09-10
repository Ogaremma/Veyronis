"use client";

import React from "react";
import type {
  AgreementDeliverable,
  AgreementEvidenceRequirement,
  WorkEvidenceKind,
} from "@veyronis/shared";
import { GlassButton, GlassInput } from "../ui/glass";

const evidenceKinds: WorkEvidenceKind[] = [
  "PHOTO",
  "FILE",
  "PDF",
  "URL",
  "GITHUB_REPOSITORY",
  "GITHUB_COMMIT",
  "TRACKING_URL",
  "RECEIPT",
  "TEXT",
  "TRANSACTION_HASH",
];

export function DeliverablesEditor({
  deliverables,
  onChange,
}: {
  deliverables: AgreementDeliverable[];
  onChange: (value: AgreementDeliverable[]) => void;
}) {
  const update = (id: string, changes: Partial<AgreementDeliverable>) =>
    onChange(
      deliverables.map((deliverable) =>
        deliverable.id === id ? { ...deliverable, ...changes } : deliverable,
      ),
    );

  return (
    <section className="terms-editor">
      <header>
        <div>
          <h3>Deliverables</h3>
          <p>What must the seller deliver?</p>
        </div>
        <GlassButton
          onClick={() =>
            onChange([
              ...deliverables,
              {
                id: crypto.randomUUID(),
                title: "",
                description: "",
                required: true,
                active: true,
                position: deliverables.length,
                evidenceRequirements: [],
              },
            ])
          }
        >
          + Add deliverable
        </GlassButton>
      </header>
      {deliverables.map((deliverable, index) => (
        <article key={deliverable.id} className="deliverable-card">
          <div className="terms-card-header">
            <strong>Deliverable {index + 1}</strong>
            <div>
              <GlassButton
                disabled={index === 0}
                onClick={() => moveDeliverable(deliverables, index, -1, onChange)}
              >
                ↑
              </GlassButton>
              <GlassButton
                disabled={index === deliverables.length - 1}
                onClick={() => moveDeliverable(deliverables, index, 1, onChange)}
              >
                ↓
              </GlassButton>
              <GlassButton
                onClick={() =>
                  onChange(deliverables.filter((item) => item.id !== deliverable.id))
                }
              >
                Remove
              </GlassButton>
            </div>
          </div>
          <label>
            Title
            <GlassInput
              value={deliverable.title}
              placeholder="Product shipment"
              onChange={(event) => update(deliverable.id, { title: event.currentTarget.value })}
            />
          </label>
          <label>
            Description
            <GlassInput
              value={deliverable.description}
              placeholder="10 custom T-shirts delivered to buyer."
              onChange={(event) =>
                update(deliverable.id, { description: event.currentTarget.value })
              }
            />
          </label>
          <div className="terms-toggles">
            <label>
              <input
                type="checkbox"
                checked={deliverable.required}
                onChange={(event) =>
                  update(deliverable.id, { required: event.currentTarget.checked })
                }
              />
              Required deliverable
            </label>
            <label>
              <input
                type="checkbox"
                checked={deliverable.active}
                onChange={(event) =>
                  update(deliverable.id, { active: event.currentTarget.checked })
                }
              />
              Active in agreement
            </label>
          </div>
        </article>
      ))}
      {deliverables.length === 0 && (
        <p className="dash-muted">Add at least one deliverable before review.</p>
      )}
    </section>
  );
}

export function EvidenceRequirementsEditor({
  deliverables,
  onChange,
}: {
  deliverables: AgreementDeliverable[];
  onChange: (value: AgreementDeliverable[]) => void;
}) {
  const updateDeliverable = (
    deliverableId: string,
    requirements: AgreementEvidenceRequirement[],
  ) =>
    onChange(
      deliverables.map((deliverable) =>
        deliverable.id === deliverableId
          ? { ...deliverable, evidenceRequirements: requirements }
          : deliverable,
      ),
    );

  return (
    <section className="terms-editor">
      <header>
        <div>
          <h3>Evidence Requirements</h3>
          <p>What proof must the seller provide?</p>
        </div>
      </header>
      {deliverables.map((deliverable) => (
        <article key={deliverable.id} className="deliverable-card">
          <div className="terms-card-header">
            <strong>{deliverable.title || "Untitled deliverable"}</strong>
            <GlassButton
              onClick={() =>
                updateDeliverable(deliverable.id, [
                  ...deliverable.evidenceRequirements,
                  {
                    id: crypto.randomUUID(),
                    label: "",
                    kind: "URL",
                    required: true,
                    configuration: {},
                    position: deliverable.evidenceRequirements.length,
                  },
                ])
              }
            >
              + Add evidence requirement
            </GlassButton>
          </div>
          {deliverable.evidenceRequirements.map((requirement, index) => (
            <div key={requirement.id} className="requirement-row">
              <label>
                Label
                <GlassInput
                  value={requirement.label}
                  placeholder="Live website URL"
                  onChange={(event) =>
                    updateDeliverable(
                      deliverable.id,
                      deliverable.evidenceRequirements.map((item) =>
                        item.id === requirement.id
                          ? { ...item, label: event.currentTarget.value }
                          : item,
                      ),
                    )
                  }
                />
              </label>
              <label>
                Evidence kind
                <select
                  value={requirement.kind}
                  onChange={(event) =>
                    updateDeliverable(
                      deliverable.id,
                      deliverable.evidenceRequirements.map((item) =>
                        item.id === requirement.id
                          ? {
                              ...item,
                              kind: event.currentTarget.value as WorkEvidenceKind,
                            }
                          : item,
                      ),
                    )
                  }
                >
                  {evidenceKinds.map((kind) => (
                    <option key={kind} value={kind}>
                      {kind.replaceAll("_", " ")}
                    </option>
                  ))}
                </select>
              </label>
              <label className="compact-toggle">
                <input
                  type="checkbox"
                  checked={requirement.required}
                  onChange={(event) =>
                    updateDeliverable(
                      deliverable.id,
                      deliverable.evidenceRequirements.map((item) =>
                        item.id === requirement.id
                          ? { ...item, required: event.currentTarget.checked }
                          : item,
                      ),
                    )
                  }
                />
                Required
              </label>
              <GlassButton
                onClick={() =>
                  updateDeliverable(
                    deliverable.id,
                    deliverable.evidenceRequirements.filter(
                      (item) => item.id !== requirement.id,
                    ),
                  )
                }
              >
                Remove
              </GlassButton>
            </div>
          ))}
        </article>
      ))}
    </section>
  );
}

function moveDeliverable(
  deliverables: AgreementDeliverable[],
  index: number,
  direction: -1 | 1,
  onChange: (value: AgreementDeliverable[]) => void,
) {
  const target = index + direction;
  if (target < 0 || target >= deliverables.length) return;
  const reordered = [...deliverables];
  const [moved] = reordered.splice(index, 1);
  reordered.splice(target, 0, moved!);
  onChange(
    reordered.map((deliverable, position) => ({ ...deliverable, position })),
  );
}
