import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { collectExternalModelRunDiagnostics, formatExternalModelRunDiagnostics } from "../../scripts/step014dr1-live-diagnostics.mjs";

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), "openrill-step014dr1-diag-"));
  const path = join(root, "agent.db");
  const db = new DatabaseSync(path);
  db.exec(`
    CREATE TABLE agent_runs(run_id TEXT PRIMARY KEY,status TEXT,recovery_state TEXT,current_attempt_id TEXT,last_event_sequence INTEGER);
    CREATE TABLE run_attempts(run_id TEXT,attempt_number INTEGER,status TEXT,recovery_reason TEXT,terminal_reason TEXT,provider_id TEXT,model_id TEXT,used_turns INTEGER,used_input_tokens INTEGER,used_output_tokens INTEGER,model_call_count INTEGER,tool_call_count INTEGER);
    CREATE TABLE model_invocations(run_id TEXT,request_number INTEGER,turn_number INTEGER,status TEXT,error_code TEXT,input_tokens INTEGER,output_tokens INTEGER);
    CREATE TABLE run_events(run_id TEXT,sequence INTEGER,event_type TEXT,attempt_id TEXT,payload_json TEXT);
    CREATE TABLE run_delegations(root_run_id TEXT,depth INTEGER,status TEXT,created_at INTEGER,delegation_id TEXT);
  `);
  db.prepare("INSERT INTO agent_runs VALUES(?,?,?,?,?)").run("run-1","FAILED","NONE","attempt-1",3);
  db.prepare("INSERT INTO run_attempts VALUES(?,?,?,?,?,?,?,?,?,?,?,?)").run("run-1",1,"FAILED",null,"AGENT_MODEL_FAILED","openai-responses","explicit-model",1,0,0,1,0);
  db.prepare("INSERT INTO model_invocations VALUES(?,?,?,?,?,?,?)").run("run-1",1,1,"FAILED","MODEL_RATE_LIMITED",0,0);
  db.prepare("INSERT INTO run_events VALUES(?,?,?,?,?)").run("run-1",1,"tool.started","attempt-1",JSON.stringify({toolCallId:"call-1",name:"agent.spawn",arguments:{task:"must stay private"}}));
  db.prepare("INSERT INTO run_events VALUES(?,?,?,?,?)").run("run-1",2,"model.requested","attempt-1","{}");
  db.prepare("INSERT INTO run_events VALUES(?,?,?,?,?)").run("run-1",3,"run.failed","attempt-1",JSON.stringify({errorCode:"AGENT_MODEL_FAILED",message:"provider response text must not be emitted"}));
  db.close();
  return { root, path };
}

test("STEP014DR1 preserves typed external-model failure metadata without raw message", async () => {
  const { root, path } = await fixture();
  try {
    const result = collectExternalModelRunDiagnostics(path, "run-1");
    assert.equal(result.agentRun.status, "FAILED");
    assert.equal(result.attempts[0].terminalReason, "AGENT_MODEL_FAILED");
    assert.equal(result.modelInvocations[0].errorCode, "MODEL_RATE_LIMITED");
    assert.equal(result.runFailure.errorCode, "AGENT_MODEL_FAILED");
    assert.deepEqual({ ...result.recentToolEvents[0] }, { sequence: 1, eventType: "tool.started", name: "agent.spawn", toolCallId: "call-1", isError: null, errorCode: null });
    assert.equal(result.runFailure.messageLength, "provider response text must not be emitted".length);
    assert.match(result.runFailure.messageSha256, /^[a-f0-9]{64}$/);
    const output = formatExternalModelRunDiagnostics(result);
    assert.equal(output.includes("provider response text must not be emitted"), false);
    assert.equal(output.includes("MODEL_RATE_LIMITED"), true);
    assert.equal(output.includes("must stay private"), false);
    assert.equal(output.includes("agent.spawn"), true);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("STEP014DR1 diagnostics never select conversation messages, event payloads, or Tool arguments", async () => {
  const source = await import("node:fs/promises").then(({readFile})=>readFile(new URL("../../scripts/step014dr1-live-diagnostics.mjs", import.meta.url),"utf8"));
  assert.doesNotMatch(source, /conversation_messages|tool_calls|arguments_json|SELECT\s+.*message/i);
  assert.doesNotMatch(source, /payloadJson:\s*row\.payloadJson/);
  assert.match(source, /messageSha256/);
  assert.match(source, /messageLength/);
});
