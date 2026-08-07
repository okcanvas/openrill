import { createHash } from "node:crypto";
import { gzipSync } from "node:zlib";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  applyNotice,
  applySnapshot,
  createLongTranscript,
  createProjection,
  moveCardSelection,
  reconnectPlan,
  replayFixture,
  resolveApprovalLocally,
  validateProjection,
  virtualWindow,
} from "../apps/agent-web/spikes/shared/workload.mjs";
import { assertAccessibleDescriptor, viewDescriptor } from "../apps/agent-web/spikes/shared/dom-contract.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SPIKES = path.join(ROOT, "apps", "agent-web", "spikes");
const ARTIFACT = path.join(ROOT, ".artifacts", "step010a");

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function minifyForSpike(source, extension) {
  if (extension === ".json") return canonical(JSON.parse(source));
  if (extension === ".html") return source.replace(/>\s+</g, "><").replace(/\s{2,}/g, " ").trim();
  if (extension === ".css") return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\s+/g, " ").replace(/\s*([{}:;,])\s*/g, "$1").trim();
  return source.replace(/^\s*\/\/.*$/gm, "").replace(/\n{2,}/g, "\n").trim();
}

async function candidateMetrics(candidate, lock) {
  const directory = path.join(SPIKES, candidate);
  const files = ["index.html", "app.mjs"];
  let sourceBytes = 0;
  let sourceLines = 0;
  let builtBytes = 0;
  let builtGzipBytes = 0;
  const hashes = {};
  await mkdir(path.join(ARTIFACT, "build", candidate), { recursive: true });
  for (const filename of files) {
    const input = await readFile(path.join(directory, filename), "utf8");
    sourceBytes += Buffer.byteLength(input);
    sourceLines += input.split(/\r?\n/).length;
    const built = minifyForSpike(input, path.extname(filename));
    const bytes = Buffer.from(built, "utf8");
    builtBytes += bytes.length;
    builtGzipBytes += gzipSync(bytes, { level: 9, mtime: 0 }).length;
    hashes[filename] = sha256(bytes);
    await writeFile(path.join(ARTIFACT, "build", candidate, filename), bytes);
  }
  const source = await readFile(path.join(directory, "app.mjs"), "utf8");
  const runtime = lock.finalists[candidate];
  assert(source.includes(`from "${runtime.module}"`), `${candidate} runtime pin mismatch`);
  assert(source.includes("../shared/workload.mjs"), `${candidate} does not consume shared workload`);
  assert(source.includes("../shared/dom-contract.mjs"), `${candidate} does not consume shared DOM contract`);
  assert(source.includes('aria-label="OpenRill Control UI"') || source.includes('"aria-label": "OpenRill Control UI"'), `${candidate} banner accessibility contract missing`);
  assert(source.includes('aria-label="Conversation transcript"') || source.includes('"aria-label": "Conversation transcript"'), `${candidate} transcript accessibility contract missing`);
  return {
    candidate,
    version: runtime.version,
    runtimeModule: runtime.module,
    externalRuntimeBytes: runtime.publishedRuntimeBytes,
    sourceBytes,
    sourceLines,
    builtAppBytes: builtBytes,
    builtAppGzipBytes: builtGzipBytes,
    hashes,
  };
}

await rm(ARTIFACT, { recursive: true, force: true });
await mkdir(ARTIFACT, { recursive: true });
const fixtureBytes = await readFile(path.join(SPIKES, "shared", "fixture.json"));
const fixture = JSON.parse(fixtureBytes.toString("utf8"));
const fixtureCanonical = canonical(fixture);
const fixtureSha256 = sha256(fixtureCanonical);
const lock = JSON.parse(await readFile(path.join(SPIKES, "frameworks.lock.json"), "utf8"));
const matrix = JSON.parse(await readFile(path.join(SPIKES, "decision-matrix.json"), "utf8"));

const replay = replayFixture(fixture);
validateProjection(replay.state);
assert(replay.outcomes.every((outcome) => outcome === "APPLIED"), "fixture replay did not apply every notice");
assert(replay.state.cursor === fixture.expected.finalCursor, "final cursor mismatch");
assert(replay.state.run.status === fixture.expected.runStatus, "run status mismatch");
assert(replay.state.cards.map((card) => card.kind).join(",") === fixture.expected.cardKinds.join(","), "card kinds mismatch");
assert(replay.state.cards.find((card) => card.kind === "text")?.text === fixture.expected.assistantText, "text projection mismatch");
assert(replay.state.cards.find((card) => card.kind === "unknown")?.title === fixture.expected.unknownEventType, "unknown fallback mismatch");

const duplicateState = createProjection(fixture);
applyNotice(duplicateState, fixture.notices[0]);
assert(applyNotice(duplicateState, fixture.notices[0]).outcome === "DUPLICATE", "duplicate notice not ignored");
const gapState = createProjection(fixture);
assert(applyNotice(gapState, fixture.notices[1]).outcome === "GAP", "sequence gap not detected");
assert(reconnectPlan(gapState).strategy === "SNAPSHOT_RESYNC", "gap did not require snapshot resync");
applySnapshot(gapState, fixture, fixture.initialCursor);
assert(reconnectPlan(gapState).strategy === "CURSOR_RESUME", "snapshot did not restore cursor resume");

const approvalState = replayFixture(fixture).state;
const approval = resolveApprovalLocally(approvalState, fixture.expected.approvalRequestId, "allow_once");
assert(approval.status === "APPROVED" && approval.actions.length === 0, "approval projection did not resolve");

const transcript = createLongTranscript(10000);
const firstWindow = virtualWindow(transcript, { scrollTop: 0, viewportHeight: 720, rowHeight: 36, overscan: 5 });
const middleWindow = virtualWindow(transcript, { scrollTop: 180000, viewportHeight: 720, rowHeight: 36, overscan: 5 });
assert(firstWindow.items.length <= 30 && middleWindow.items.length <= 30, "virtual window is unbounded");
assert(middleWindow.start > firstWindow.start && middleWindow.totalHeight === 360000, "virtual window position mismatch");

const keyboardState = replayFixture(fixture).state;
assert(moveCardSelection(keyboardState, "next") === 0, "keyboard next did not select first card");
assert(moveCardSelection(keyboardState, "previous") === keyboardState.cards.length - 1, "keyboard previous did not wrap");
const descriptor = viewDescriptor(keyboardState);
assertAccessibleDescriptor(descriptor);

const productionClient = await readFile(path.join(ROOT, "apps", "agent-web", "src", "api", "local-protocol-client.ts"), "utf8");
assert(!/\b(vue|lit|react|svelte|solid-js)\b/.test(productionClient), "framework leaked into Local Protocol client");

const candidates = [];
for (const candidate of ["vue", "lit"]) candidates.push(await candidateMetrics(candidate, lock));

const weightsTotal = Object.values(matrix.weights).reduce((sum, value) => sum + value, 0);
assert(weightsTotal === 100, "decision weights must total 100");
const totals = {};
for (const [candidate, scores] of Object.entries(matrix.scores)) {
  totals[candidate] = Object.entries(matrix.weights).reduce((sum, [dimension, weight]) => sum + scores[dimension] * weight, 0) / 100;
}
assert(totals.vue > totals.lit && matrix.decision === "VUE_3", "decision matrix does not select Vue 3");
const unsignedMatrix = structuredClone(matrix);
delete unsignedMatrix.matrixSha256;
const matrixSha256 = sha256(canonical(unsignedMatrix));
assert(matrix.matrixSha256 === matrixSha256, "decision matrix signature mismatch");

const report = {
  step: "STEP010A_CONTROL_UI_FRAMEWORK_SELECTION",
  version: "0.11.2-step011r2",
  fixture: { fixtureId: fixture.fixtureId, sha256: fixtureSha256, notices: fixture.notices.length },
  scenarios: {
    projection: "PASS",
    duplicateNotice: "PASS",
    sequenceGapResync: "PASS",
    approval: "PASS",
    unknownFallback: "PASS",
    transcriptRows: transcript.length,
    maximumRenderedRows: Math.max(firstWindow.items.length, middleWindow.items.length),
    keyboard: "PASS",
    accessibility: "PASS",
    frameworkIsolation: "PASS"
  },
  candidates,
  decision: { selected: matrix.decision, totals, matrixSha256 },
};
await writeFile(path.join(ARTIFACT, "report.json"), `${JSON.stringify(report, null, 2)}\n`, "utf8");
await writeFile(path.join(ARTIFACT, "fixture.sha256"), `${fixtureSha256}\n`, "ascii");
process.stdout.write(`OPENRILL_STEP010A_SPIKE_PASS fixture=${fixture.fixtureId} sha256=${fixtureSha256} finalists=2 selected=${matrix.decision} transcript=10000 rendered<=30\n`);
process.stdout.write(`${JSON.stringify(report)}\n`);
