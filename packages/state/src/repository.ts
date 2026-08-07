import type { DatabaseSync } from "node:sqlite";
import { StateDatabaseError } from "./errors.js";
import { runImmediateStateTransaction } from "./transaction.js";
import type { StateHealthCheckRecord, StateHealthStatus, StateIdentity } from "./types.js";
import { StateConversationRepository } from "./conversation-repository.js";
import { StateWorkspaceRepository } from "./workspace-repository.js";
import { StateApprovalProcessRepository } from "./approval-process-repository.js";
import { StateSkillRepository } from "./skill-repository.js";
import { StateAutomationRepository } from "./automation-repository.js";
import { StateBrowserRepository } from "./browser-repository.js";
import { StateDelegationRepository } from "./delegation-repository.js";
import { StateMemoryRepository } from "./memory-repository.js";
import { StateGoalRepository } from "./goal-repository.js";
import { StateTaskRepository } from "./task-repository.js";
import { StateTaskFlowRepository } from "./task-flow-repository.js";
import { StateTaskDeliveryRepository } from "./task-delivery-repository.js";
import { StateConnectorRepository } from "./connector-repository.js";
import { StateRetentionRepository } from "./retention-repository.js";

function parseDetails(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    throw new StateDatabaseError("STATE_SCHEMA_INCONSISTENT", "state_health_checks.details_json is invalid JSON");
  }
}

export class StateRepositories {
  public readonly conversations: StateConversationRepository;
  public readonly workspaces: StateWorkspaceRepository;
  public readonly approvalProcess: StateApprovalProcessRepository;
  public readonly skills: StateSkillRepository;
  public readonly automations: StateAutomationRepository;
  public readonly browser: StateBrowserRepository;
  public readonly delegations: StateDelegationRepository;
  public readonly memory: StateMemoryRepository;
  public readonly goals: StateGoalRepository;
  public readonly tasks: StateTaskRepository;
  public readonly taskFlows: StateTaskFlowRepository;
  public readonly taskDeliveries: StateTaskDeliveryRepository;
  public readonly connectors: StateConnectorRepository;
  public readonly retention: StateRetentionRepository;
  public constructor(private readonly database: DatabaseSync) {
    this.conversations = new StateConversationRepository(database);
    this.workspaces = new StateWorkspaceRepository(database);
    this.approvalProcess = new StateApprovalProcessRepository(database);
    this.skills = new StateSkillRepository(database);
    this.automations = new StateAutomationRepository(database);
    this.browser = new StateBrowserRepository(database);
    this.delegations = new StateDelegationRepository(database);
    this.memory = new StateMemoryRepository(database);
    this.goals = new StateGoalRepository(database);
    this.tasks = new StateTaskRepository(database);
    this.taskFlows = new StateTaskFlowRepository(database);
    this.taskDeliveries = new StateTaskDeliveryRepository(database);
    this.connectors = new StateConnectorRepository(database);
    this.retention = new StateRetentionRepository(database);
  }

  public readIdentity(): StateIdentity {
    const row = this.database.prepare(`
      SELECT product, profile, schema_version AS schemaVersion,
             created_at AS createdAt, updated_at AS updatedAt
      FROM state_identity WHERE id = 1
    `).get() as StateIdentity | undefined;
    if (!row) {
      throw new StateDatabaseError("STATE_SCHEMA_INCONSISTENT", "OpenRill state identity is missing");
    }
    return {
      product: row.product,
      profile: row.profile,
      schemaVersion: row.schemaVersion,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }

  public recordHealthCheck(input: {
    readonly checkName: string;
    readonly status: StateHealthStatus;
    readonly details: unknown;
    readonly checkedAt: number;
  }): void {
    if (!/^[a-z0-9][a-z0-9._-]{0,127}$/.test(input.checkName)) {
      throw new TypeError(`invalid state health check name: ${input.checkName}`);
    }
    const detailsJson = JSON.stringify(input.details);
    if (detailsJson === undefined) throw new TypeError("state health check details must be JSON-serializable");
    this.database.prepare(`
      INSERT INTO state_health_checks (check_name, status, details_json, checked_at)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(check_name) DO UPDATE SET
        status = excluded.status,
        details_json = excluded.details_json,
        checked_at = excluded.checked_at
    `).run(input.checkName, input.status, detailsJson, input.checkedAt);
  }

  public readHealthCheck(checkName: string): StateHealthCheckRecord | null {
    const row = this.database.prepare(`
      SELECT check_name AS checkName, status, details_json AS detailsJson, checked_at AS checkedAt
      FROM state_health_checks WHERE check_name = ?
    `).get(checkName) as
      | { checkName: string; status: StateHealthStatus; detailsJson: string; checkedAt: number }
      | undefined;
    if (!row) return null;
    return {
      checkName: row.checkName,
      status: row.status,
      details: parseDetails(row.detailsJson),
      checkedAt: row.checkedAt,
    };
  }
}

export function runStateRepositoryTransaction<T>(
  database: DatabaseSync,
  callback: (repositories: StateRepositories) => T,
): T {
  return runImmediateStateTransaction(database, () => callback(new StateRepositories(database)));
}
