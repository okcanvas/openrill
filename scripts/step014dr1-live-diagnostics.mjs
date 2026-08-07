import { createHash } from "node:crypto";
import { DatabaseSync } from "node:sqlite";

function queryOne(database, sql, ...params) {
  return database.prepare(sql).get(...params) ?? null;
}

function queryAll(database, sql, ...params) {
  return database.prepare(sql).all(...params);
}

function hashText(value) {
  if (typeof value !== "string") return null;
  return createHash("sha256").update(value, "utf8").digest("hex");
}


function safeToolEvents(database, runId) {
  return queryAll(
    database,
    "SELECT sequence,event_type eventType,payload_json payloadJson FROM run_events WHERE run_id=? AND event_type IN ('tool.started','tool.completed','tool.replayed') ORDER BY sequence DESC LIMIT 20",
    runId,
  ).map((row) => {
    let payload = null;
    try { payload = typeof row.payloadJson === "string" ? JSON.parse(row.payloadJson) : null; } catch { payload = null; }
    return {
      sequence: row.sequence,
      eventType: row.eventType,
      name: typeof payload?.name === "string" ? payload.name : null,
      toolCallId: typeof payload?.toolCallId === "string" ? payload.toolCallId : null,
      isError: typeof payload?.isError === "boolean" ? payload.isError : null,
      errorCode: typeof payload?.errorCode === "string" ? payload.errorCode : null,
    };
  });
}

function safeRunFailure(database, runId) {
  const row = queryOne(
    database,
    "SELECT payload_json payloadJson FROM run_events WHERE run_id=? AND event_type='run.failed' ORDER BY sequence DESC LIMIT 1",
    runId,
  );
  if (!row || typeof row.payloadJson !== "string") return null;
  try {
    const payload = JSON.parse(row.payloadJson);
    const message = typeof payload?.message === "string" ? payload.message : null;
    return {
      errorCode: typeof payload?.errorCode === "string" ? payload.errorCode : null,
      messageLength: message?.length ?? 0,
      messageSha256: hashText(message),
    };
  } catch {
    return { errorCode: null, messageLength: 0, messageSha256: null, payloadInvalid: true };
  }
}

export function collectExternalModelRunDiagnostics(databasePath, runId) {
  const database = new DatabaseSync(databasePath, { readOnly: true, timeout: 1_000 });
  try {
    return {
      runId,
      agentRun: queryOne(
        database,
        "SELECT status,recovery_state recoveryState,current_attempt_id currentAttemptId,last_event_sequence lastEventSequence FROM agent_runs WHERE run_id=?",
        runId,
      ),
      attempts: queryAll(
        database,
        "SELECT attempt_number attemptNumber,status,recovery_reason recoveryReason,terminal_reason terminalReason,provider_id providerId,model_id modelId,used_turns usedTurns,used_input_tokens usedInputTokens,used_output_tokens usedOutputTokens,model_call_count modelCalls,tool_call_count toolCalls FROM run_attempts WHERE run_id=? ORDER BY attempt_number",
        runId,
      ),
      modelInvocations: queryAll(
        database,
        "SELECT request_number requestNumber,turn_number turnNumber,status,error_code errorCode,input_tokens inputTokens,output_tokens outputTokens FROM model_invocations WHERE run_id=? ORDER BY request_number",
        runId,
      ),
      latestEvents: queryAll(
        database,
        "SELECT sequence,event_type eventType,attempt_id attemptId FROM run_events WHERE run_id=? ORDER BY sequence DESC LIMIT 20",
        runId,
      ),
      recentToolEvents: safeToolEvents(database, runId),
      delegations: queryAll(
        database,
        "SELECT depth,status FROM run_delegations WHERE root_run_id=? ORDER BY depth,created_at,delegation_id",
        runId,
      ),
      runFailure: safeRunFailure(database, runId),
    };
  } finally {
    database.close();
  }
}

export function formatExternalModelRunDiagnostics(input) {
  return `OPENRILL_STEP014DR1_ROOT_FAILURE_DIAGNOSTICS ${JSON.stringify(input)}`;
}
