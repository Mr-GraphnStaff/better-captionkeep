# Branch promotion verification

This control-plane candidate exercises the owner-directed Dev -> QA ->
Production workflow. It changes executable promotion workflows, policy
checks/tests, validation routing, and supporting documentation. Review and QA
acceptance cover those executable controls as part of the candidate.

It changes no extension runtime source, published package, or Store submission.
Control-plane acceptance does not certify a new product release or live meeting
behavior.

Verification must record rejection of a skipped lane, successful development
and QA promotion, and an owner approval requirement for production. Evidence
is retained under working/manifests/branch-promotion-2026-11-11 locally.
