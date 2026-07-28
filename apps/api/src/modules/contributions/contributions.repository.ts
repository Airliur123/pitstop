import { Inject, Injectable } from '@nestjs/common';
import type { ContributionDetail, ContributionDraftPayload } from '@pitstop/contracts';
import {
  createUlid,
  type Pool,
  type PoolConnection,
  type ResultSetHeader,
  type RowDataPacket,
} from '@pitstop/database';
import { contributionDraftSchema } from '@pitstop/validation';

import { DATABASE_POOL } from '../../common/database/database.module';

type RepositoryErrorCode =
  'IDEMPOTENCY_KEY_REUSED' | 'INVALID_STATE' | 'NOT_FOUND' | 'VERSION_CONFLICT';

export class ContributionRepositoryError extends Error {
  constructor(readonly code: RepositoryErrorCode) {
    super(code);
    this.name = 'ContributionRepositoryError';
  }
}

interface ContributionRow extends RowDataPacket {
  readonly contribution_status: ContributionDetail['status'];
  readonly created_at: Date | string;
  readonly id: string;
  readonly payload: unknown;
  readonly submitted_at: Date | string | null;
  readonly updated_at: Date | string;
  readonly version: number;
}

interface IdempotencyRow extends RowDataPacket {
  readonly request_hash: string;
  readonly response_body: unknown;
}

interface LockRow extends RowDataPacket {
  readonly contribution_status: ContributionDetail['status'];
  readonly version: number;
}

interface IdempotencyClaim {
  readonly responseBody: unknown;
}

@Injectable()
export class ContributionsRepository {
  constructor(@Inject(DATABASE_POOL) private readonly pool: Pool) {}

  async createDraft(input: {
    readonly idempotencyKey: string;
    readonly payload: ContributionDraftPayload;
    readonly requestHash: string;
    readonly userId: string;
  }): Promise<ContributionDetail> {
    return this.withTransaction(async (connection) => {
      const scope = `contribution:create:${input.userId}`;
      const claim = await this.claimIdempotencyKey(
        connection,
        scope,
        input.idempotencyKey,
        input.requestHash,
      );
      const existingId = contributionIdFromResponse(claim.responseBody);
      if (existingId) {
        const existing = await this.findOwnedWithExecutor(connection, existingId, input.userId);
        if (existing) return existing;
        throw new Error('Completed contribution idempotency record points to missing data');
      }

      const contributionId = createUlid();
      await connection.execute(
        `INSERT INTO contributions (
           id, submitted_by, source, contribution_status
         ) VALUES (?, ?, 'APPLICATION', 'DRAFT')`,
        [contributionId, input.userId],
      );
      await connection.execute(
        `INSERT INTO contribution_payloads (
           contribution_id, schema_version, payload
         ) VALUES (?, 1, ?)`,
        [contributionId, JSON.stringify(input.payload)],
      );
      const created = await this.findOwnedWithExecutor(connection, contributionId, input.userId);
      if (!created) throw new Error('Created contribution could not be reloaded');
      await this.completeIdempotencyKey(connection, scope, input.idempotencyKey, 201, created);
      return created;
    });
  }

  async findOwned(contributionId: string, userId: string): Promise<ContributionDetail | null> {
    return this.findOwnedWithExecutor(this.pool, contributionId, userId);
  }

  async updateDraft(input: {
    readonly contributionId: string;
    readonly expectedVersion: number;
    readonly payload: ContributionDraftPayload;
    readonly userId: string;
  }): Promise<ContributionDetail> {
    return this.withTransaction(async (connection) => {
      const locked = await this.lockOwned(connection, input.contributionId, input.userId);
      if (!locked) throw new ContributionRepositoryError('NOT_FOUND');
      if (locked.contribution_status !== 'DRAFT') {
        throw new ContributionRepositoryError('INVALID_STATE');
      }
      if (locked.version !== input.expectedVersion) {
        throw new ContributionRepositoryError('VERSION_CONFLICT');
      }
      const [update] = await connection.execute<ResultSetHeader>(
        `UPDATE contributions
         SET version = version + 1
         WHERE id = ? AND submitted_by = ? AND contribution_status = 'DRAFT' AND version = ?`,
        [input.contributionId, input.userId, input.expectedVersion],
      );
      if (update.affectedRows !== 1) {
        throw new ContributionRepositoryError('VERSION_CONFLICT');
      }
      await connection.execute(
        `UPDATE contribution_payloads SET payload = ?, schema_version = 1
         WHERE contribution_id = ?`,
        [JSON.stringify(input.payload), input.contributionId],
      );
      const updated = await this.findOwnedWithExecutor(
        connection,
        input.contributionId,
        input.userId,
      );
      if (!updated) throw new Error('Updated contribution could not be reloaded');
      return updated;
    });
  }

  async submitDraft(input: {
    readonly contributionId: string;
    readonly expectedVersion: number;
    readonly idempotencyKey: string;
    readonly requestHash: string;
    readonly userId: string;
  }): Promise<ContributionDetail> {
    return this.withTransaction(async (connection) => {
      const scope = `contribution:submit:${input.userId}:${input.contributionId}`;
      const claim = await this.claimIdempotencyKey(
        connection,
        scope,
        input.idempotencyKey,
        input.requestHash,
      );
      const completedId = contributionIdFromResponse(claim.responseBody);
      if (completedId) {
        const completed = await this.findOwnedWithExecutor(connection, completedId, input.userId);
        if (completed) return completed;
        throw new Error('Completed submit idempotency record points to missing data');
      }

      const locked = await this.lockOwned(connection, input.contributionId, input.userId);
      if (!locked) throw new ContributionRepositoryError('NOT_FOUND');
      if (locked.contribution_status === 'PENDING') {
        const pending = await this.findOwnedWithExecutor(
          connection,
          input.contributionId,
          input.userId,
        );
        if (!pending) throw new Error('Pending contribution could not be reloaded');
        await this.completeIdempotencyKey(connection, scope, input.idempotencyKey, 200, pending);
        return pending;
      }
      if (locked.contribution_status !== 'DRAFT') {
        throw new ContributionRepositoryError('INVALID_STATE');
      }
      if (locked.version !== input.expectedVersion) {
        throw new ContributionRepositoryError('VERSION_CONFLICT');
      }
      const [update] = await connection.execute<ResultSetHeader>(
        `UPDATE contributions
         SET contribution_status = 'PENDING', submitted_at = CURRENT_TIMESTAMP(3),
             version = version + 1
         WHERE id = ? AND submitted_by = ? AND contribution_status = 'DRAFT' AND version = ?`,
        [input.contributionId, input.userId, input.expectedVersion],
      );
      if (update.affectedRows !== 1) {
        throw new ContributionRepositoryError('VERSION_CONFLICT');
      }
      const submitted = await this.findOwnedWithExecutor(
        connection,
        input.contributionId,
        input.userId,
      );
      if (!submitted) throw new Error('Submitted contribution could not be reloaded');
      await this.completeIdempotencyKey(connection, scope, input.idempotencyKey, 200, submitted);
      return submitted;
    });
  }

  private async findOwnedWithExecutor(
    executor: Pick<Pool, 'execute'> | Pick<PoolConnection, 'execute'>,
    contributionId: string,
    userId: string,
  ): Promise<ContributionDetail | null> {
    const [rows] = await executor.execute<ContributionRow[]>(
      `SELECT c.id, c.contribution_status, c.submitted_at, c.version,
         c.created_at, c.updated_at, cp.payload
       FROM contributions c
       JOIN contribution_payloads cp ON cp.contribution_id = c.id
       WHERE c.id = ? AND c.submitted_by = ?
       LIMIT 1`,
      [contributionId, userId],
    );
    const row = rows[0];
    return row ? mapContribution(row) : null;
  }

  private async lockOwned(
    connection: PoolConnection,
    contributionId: string,
    userId: string,
  ): Promise<LockRow | null> {
    const [rows] = await connection.execute<LockRow[]>(
      `SELECT contribution_status, version
       FROM contributions
       WHERE id = ? AND submitted_by = ?
       FOR UPDATE`,
      [contributionId, userId],
    );
    return rows[0] ?? null;
  }

  private async claimIdempotencyKey(
    connection: PoolConnection,
    scope: string,
    idempotencyKey: string,
    requestHash: string,
  ): Promise<IdempotencyClaim> {
    await connection.execute(
      `INSERT INTO idempotency_keys (
         id, scope, idempotency_key, request_hash, locked_until, expires_at
       ) VALUES (?, ?, ?, ?, DATE_ADD(CURRENT_TIMESTAMP(3), INTERVAL 30 SECOND),
         DATE_ADD(CURRENT_TIMESTAMP(3), INTERVAL 24 HOUR))
       ON DUPLICATE KEY UPDATE id = id`,
      [createUlid(), scope, idempotencyKey, requestHash],
    );
    const [rows] = await connection.execute<IdempotencyRow[]>(
      `SELECT request_hash, response_body
       FROM idempotency_keys
       WHERE scope = ? AND idempotency_key = ?
       FOR UPDATE`,
      [scope, idempotencyKey],
    );
    const row = rows[0];
    if (!row) throw new Error('Idempotency key could not be claimed');
    if (row.request_hash !== requestHash) {
      throw new ContributionRepositoryError('IDEMPOTENCY_KEY_REUSED');
    }
    return { responseBody: row.response_body };
  }

  private async completeIdempotencyKey(
    connection: PoolConnection,
    scope: string,
    idempotencyKey: string,
    responseStatus: number,
    responseBody: ContributionDetail,
  ): Promise<void> {
    await connection.execute(
      `UPDATE idempotency_keys
       SET response_status = ?, response_body = ?, locked_until = NULL
       WHERE scope = ? AND idempotency_key = ?`,
      [responseStatus, JSON.stringify(responseBody), scope, idempotencyKey],
    );
  }

  private async withTransaction<T>(work: (connection: PoolConnection) => Promise<T>): Promise<T> {
    const connection = await this.pool.getConnection();
    try {
      await connection.beginTransaction();
      const result = await work(connection);
      await connection.commit();
      return result;
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  }
}

function mapContribution(row: ContributionRow): ContributionDetail {
  return {
    createdAt: isoDate(row.created_at),
    id: row.id,
    payload: contributionDraftSchema.parse(parseJson(row.payload)),
    status: row.contribution_status,
    submittedAt: row.submitted_at === null ? null : isoDate(row.submitted_at),
    updatedAt: isoDate(row.updated_at),
    version: Number(row.version),
  };
}

function parseJson(value: unknown): unknown {
  return typeof value === 'string' ? (JSON.parse(value) as unknown) : value;
}

function contributionIdFromResponse(value: unknown): string | null {
  const parsed = parseJson(value);
  if (typeof parsed !== 'object' || parsed === null) return null;
  const id = Reflect.get(parsed, 'id');
  return typeof id === 'string' ? id : null;
}

function isoDate(value: Date | string): string {
  return (value instanceof Date ? value : new Date(value)).toISOString();
}
