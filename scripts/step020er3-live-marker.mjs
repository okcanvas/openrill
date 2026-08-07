import { readFile } from "node:fs/promises";

const CONTRACT_URL = new URL("../config/step020er3-live-marker-contract.json", import.meta.url);

export async function loadStep020er3LiveMarkerContract() {
  const contract = JSON.parse(await readFile(CONTRACT_URL, "utf8"));
  if (!contract || typeof contract !== "object" || !contract.fields || typeof contract.fields !== "object") {
    throw new Error("OPENRILL_STEP020ER3_LIVE_MARKER_CONTRACT_INVALID");
  }
  return contract;
}

export function renderStep020er3LiveMarker(contract, { passed, total, state }) {
  const parts = [
    contract.step,
    `checks=${passed}/${total}`,
    `state=${state}`,
    `version=${contract.version}`,
    `schema=${contract.schema}`,
  ];
  for (const [key, value] of Object.entries(contract.fields)) parts.push(`${key}=${value}`);
  parts.push(`live_harness=${contract.liveHarness}`);
  return parts.join(" ");
}
