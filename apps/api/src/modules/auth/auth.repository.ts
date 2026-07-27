import { Inject, Injectable } from '@nestjs/common';
import type { AuthUser } from '@pitstop/contracts';
import {
  createUlid,
  type Pool,
  type PoolConnection,
  type ResultSetHeader,
  type RowDataPacket,
} from '@pitstop/database';

import { DATABASE_POOL } from '../../common/database/database.module';
import { maskEmail, parseAuthRole } from './auth-security';

interface UserRow extends RowDataPacket {
  readonly id: string;
  readonly status: string;
}

interface RoleRow extends RowDataPacket {
  readonly id: string;
}

interface LoginTokenRow extends RowDataPacket {
  readonly consumed: number;
  readonly expired: number;
  readonly return_to: string;
  readonly status: string;
  readonly user_id: string;
}

interface SessionRow extends RowDataPacket {
  readonly email: string;
  readonly id: string;
  readonly role: string;
}

export type LoginTokenState = 'ACTIVE' | 'INVALID' | 'EXPIRED';

export interface LoginTokenCreation {
  readonly deliverable: boolean;
}

export interface LoginVerification {
  readonly state: LoginTokenState;
  readonly returnTo?: string;
  readonly user?: AuthUser;
}

@Injectable()
export class AuthRepository {
  constructor(@Inject(DATABASE_POOL) private readonly pool: Pool) {}

  async createLoginToken(input: {
    readonly email: string;
    readonly expiresAt: Date;
    readonly returnTo: string;
    readonly tokenHash: string;
  }): Promise<LoginTokenCreation> {
    return this.withTransaction(async (connection) => {
      await connection.execute(
        `INSERT INTO users (id, email, normalized_email, display_name)
         VALUES (?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE normalized_email = VALUES(normalized_email)`,
        [createUlid(), input.email, input.email, 'Pengguna PitStop'],
      );
      const [users] = await connection.execute<UserRow[]>(
        `SELECT id, status FROM users
         WHERE active_normalized_email = ? FOR UPDATE`,
        [input.email],
      );
      const user = users[0];
      if (!user || user.status !== 'ACTIVE') return { deliverable: false };

      const [roles] = await connection.execute<RoleRow[]>(
        `SELECT id FROM roles WHERE code = ? LIMIT 1`,
        ['USER'],
      );
      const role = roles[0];
      if (!role) throw new Error('Default USER role is unavailable');
      await connection.execute(
        `INSERT INTO user_roles (user_id, role_id)
         VALUES (?, ?)
         ON DUPLICATE KEY UPDATE user_id = VALUES(user_id)`,
        [user.id, role.id],
      );
      await connection.execute(
        `UPDATE auth_login_tokens SET consumed_at = CURRENT_TIMESTAMP(3)
         WHERE user_id = ? AND consumed_at IS NULL`,
        [user.id],
      );
      await connection.execute(
        `INSERT INTO auth_login_tokens (
           id, user_id, token_hash, return_to, expires_at
         ) VALUES (?, ?, ?, ?, ?)`,
        [createUlid(), user.id, input.tokenHash, input.returnTo, input.expiresAt],
      );
      return { deliverable: true };
    });
  }

  async invalidateLoginToken(tokenHash: string): Promise<void> {
    await this.pool.execute(
      `UPDATE auth_login_tokens SET consumed_at = CURRENT_TIMESTAMP(3)
       WHERE token_hash = ? AND consumed_at IS NULL`,
      [tokenHash],
    );
  }

  async consumeLoginToken(input: {
    readonly sessionExpiresAt: Date;
    readonly sessionTokenHash: string;
    readonly tokenHash: string;
  }): Promise<LoginVerification> {
    return this.withTransaction(async (connection) => {
      const [tokens] = await connection.execute<LoginTokenRow[]>(
        `SELECT t.user_id, t.return_to, u.status,
           (t.consumed_at IS NOT NULL) AS consumed,
           (t.expires_at <= CURRENT_TIMESTAMP(3)) AS expired
         FROM auth_login_tokens t
         JOIN users u ON u.id = t.user_id
         WHERE t.token_hash = ?
         FOR UPDATE`,
        [input.tokenHash],
      );
      const token = tokens[0];
      if (!token || token.consumed === 1 || token.status !== 'ACTIVE') {
        return { state: 'INVALID' };
      }
      if (token.expired === 1) {
        await connection.execute(
          `UPDATE auth_login_tokens SET consumed_at = CURRENT_TIMESTAMP(3)
           WHERE token_hash = ? AND consumed_at IS NULL`,
          [input.tokenHash],
        );
        return { state: 'EXPIRED' };
      }

      const [consumeResult] = await connection.execute<ResultSetHeader>(
        `UPDATE auth_login_tokens SET consumed_at = CURRENT_TIMESTAMP(3)
         WHERE token_hash = ? AND consumed_at IS NULL
           AND expires_at > CURRENT_TIMESTAMP(3)`,
        [input.tokenHash],
      );
      if (consumeResult.affectedRows !== 1) return { state: 'INVALID' };

      await connection.execute(
        `INSERT INTO auth_sessions (
           id, user_id, session_token_hash, expires_at, last_seen_at
         ) VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP(3))`,
        [createUlid(), token.user_id, input.sessionTokenHash, input.sessionExpiresAt],
      );
      await connection.execute(
        `UPDATE users SET email_verified_at = COALESCE(email_verified_at, CURRENT_TIMESTAMP(3)),
           last_login_at = CURRENT_TIMESTAMP(3)
         WHERE id = ?`,
        [token.user_id],
      );
      const user = await this.loadUser(connection, token.user_id);
      return { state: 'ACTIVE', returnTo: token.return_to, user };
    });
  }

  async findSession(sessionTokenHash: string): Promise<AuthUser | null> {
    const [sessions] = await this.pool.execute<SessionRow[]>(
      `SELECT u.id, u.email, r.code AS role
       FROM auth_sessions s
       JOIN users u ON u.id = s.user_id
       JOIN user_roles ur ON ur.user_id = u.id
       JOIN roles r ON r.id = ur.role_id
       WHERE s.session_token_hash = ?
         AND s.revoked_at IS NULL
         AND s.expires_at > CURRENT_TIMESTAMP(3)
         AND u.deleted_at IS NULL
         AND u.status = 'ACTIVE'
       ORDER BY CASE r.code WHEN 'ADMIN' THEN 0 WHEN 'USER' THEN 1 ELSE 2 END
       LIMIT 1`,
      [sessionTokenHash],
    );
    const session = sessions[0];
    if (!session) return null;
    await this.pool.execute(
      `UPDATE auth_sessions SET last_seen_at = CURRENT_TIMESTAMP(3)
       WHERE session_token_hash = ? AND revoked_at IS NULL`,
      [sessionTokenHash],
    );
    return {
      id: session.id,
      email: maskEmail(session.email),
      role: parseAuthRole(session.role),
    };
  }

  async revokeSession(sessionTokenHash: string): Promise<void> {
    await this.pool.execute(
      `UPDATE auth_sessions SET revoked_at = COALESCE(revoked_at, CURRENT_TIMESTAMP(3))
       WHERE session_token_hash = ?`,
      [sessionTokenHash],
    );
  }

  private async loadUser(connection: PoolConnection, userId: string): Promise<AuthUser> {
    const [users] = await connection.execute<SessionRow[]>(
      `SELECT u.id, u.email, r.code AS role
       FROM users u
       JOIN user_roles ur ON ur.user_id = u.id
       JOIN roles r ON r.id = ur.role_id
       WHERE u.id = ?
       ORDER BY CASE r.code WHEN 'ADMIN' THEN 0 WHEN 'USER' THEN 1 ELSE 2 END
       LIMIT 1`,
      [userId],
    );
    const user = users[0];
    if (!user) throw new Error('Authenticated user role is unavailable');
    return { id: user.id, email: maskEmail(user.email), role: parseAuthRole(user.role) };
  }

  private async withTransaction<T>(operation: (connection: PoolConnection) => Promise<T>) {
    const connection = await this.pool.getConnection();
    try {
      await connection.beginTransaction();
      const result = await operation(connection);
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
