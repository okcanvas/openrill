# OR-ISSUE-152 — External-model acceptance could silently guess a model

## Symptom and code-confirmed cause

Provider accounts differ in model availability. Hardcoding or defaulting a model would make a failure ambiguous between product behavior and account/model access.

## Correction

`OPENRILL_STEP014D_MODEL` and `OPENAI_API_KEY` are mandatory live prerequisites. Endpoint override is explicit. No model fallback exists.

## Recurrence gate

The live-script source test requires both environment variables and rejects hardcoded model identifiers.
