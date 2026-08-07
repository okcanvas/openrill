# OR-ISSUE-248 — Retention initially admitted report-only active-authority conflicts

## First observation

The first maintenance implementation could schedule cleanup for a terminal Task whose Run was still active and for a terminal Flow that still had an active child Task.

## Exact risk

Audit correctly classified both states as report-only invariant violations, but retention used terminal projection status alone. This could make evidence eligible for later deletion while execution authority remained active.

## Classification

Product safety / retention boundary.

## Correction

- Task cleanup scheduling and retention preview require both Task and owning Run to be terminal.
- Flow cleanup scheduling and preview require every linked Task to exist and be terminal.
- Active, missing, or inconsistent authority increments protected counts and is never a candidate.

## Verified behavior

Focused tests retain `cleanupAfter=null`, report the invariant, and return no retention candidate for both conflict forms.
