import snowflake from 'snowflake-sdk';
import { createPrivateKey } from 'node:crypto';

export interface SnowflakeConfig {
  account: string;
  username: string;
  privateKey: string;
  database: string;
  schema: string;
  warehouse: string;
  role?: string;
}

let connectionPool: snowflake.Connection | null = null;
const CONNECTION_TIMEOUT_MS = 15000;
const QUERY_TIMEOUT_MS = 30000;

function normalizeSnowflakePrivateKey(rawValue?: string): string {
  if (!rawValue) return '';

  const trimmed = rawValue.trim();
  const unwrapped =
    trimmed.startsWith('"') && trimmed.endsWith('"')
      ? trimmed.slice(1, -1)
      : trimmed;

  const normalized = unwrapped.replace(/\\n/g, '\n').replace(/\r\n/g, '\n').trim();
  if (!normalized) return '';

  try {
    return createPrivateKey(normalized)
      .export({ format: 'pem', type: 'pkcs8' })
      .toString();
  } catch (error) {
    throw new Error(
      'Invalid Snowflake private key. Provide a valid PEM key; PKCS#1 keys will be converted automatically if the input is parseable.'
    );
  }
}

export function getSnowflakeConfig(): SnowflakeConfig {
  // Snowflake SDK는 account를 특정 형식으로 요구합니다
  // cixxjbf-wp67697 형식을 그대로 사용
  const account = process.env.SNOWFLAKE_ACCOUNT || '';
  const privateKey = normalizeSnowflakePrivateKey(process.env.SNOWFLAKE_PRIVATE_KEY);
  
  return {
    account: account,
    username: process.env.SNOWFLAKE_USERNAME || '',
    privateKey,
    database: process.env.SNOWFLAKE_DATABASE || 'FNF',
    schema: process.env.SNOWFLAKE_SCHEMA || 'SAP_FNF',
    warehouse: process.env.SNOWFLAKE_WAREHOUSE || '',
    role: process.env.SNOWFLAKE_ROLE || undefined,
  };
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, message: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(message));
    }, timeoutMs);

    promise
      .then((value) => {
        clearTimeout(timer);
        resolve(value);
      })
      .catch((error) => {
        clearTimeout(timer);
        reject(error);
      });
  });
}

export async function getSnowflakeConnection(): Promise<snowflake.Connection> {
  if (connectionPool && connectionPool.isUp()) {
    return connectionPool;
  }

  const config = getSnowflakeConfig();
  if (!config.account || !config.username || !config.privateKey) {
    throw new Error('Snowflake config is incomplete. Check SNOWFLAKE_ACCOUNT, SNOWFLAKE_USERNAME, and SNOWFLAKE_PRIVATE_KEY.');
  }

  const connection = snowflake.createConnection({
    account: config.account,
    username: config.username,
    authenticator: 'SNOWFLAKE_JWT',
    privateKey: config.privateKey,
    database: config.database,
    schema: config.schema,
    warehouse: config.warehouse,
    role: config.role,
  });

  try {
    await withTimeout(
      connection.connectAsync(),
      CONNECTION_TIMEOUT_MS,
      `Snowflake connection timed out after ${CONNECTION_TIMEOUT_MS}ms`
    );
    console.log('✅ Snowflake connected successfully');
    connectionPool = connection;
    return connection;
  } catch (err) {
    console.error('❌ Snowflake connection failed:', err);
    throw err;
  }
}

export async function executeSnowflakeQuery<T = any>(
  query: string,
  binds?: any[]
): Promise<T[]> {
  const connection = await getSnowflakeConnection();

  return withTimeout(
    new Promise((resolve, reject) => {
      connection.execute({
        sqlText: query,
        binds: binds,
        complete: (err, stmt, rows) => {
          if (err) {
            console.error('❌ Query execution failed:', err);
            console.error('Query:', query);
            reject(err);
          } else {
            resolve((rows || []) as T[]);
          }
        },
      });
    }),
    QUERY_TIMEOUT_MS,
    `Snowflake query timed out after ${QUERY_TIMEOUT_MS}ms`
  );
}

export async function executeSnowflakeMerge(
  query: string,
  binds?: any[]
): Promise<{ rowsAffected: number }> {
  const connection = await getSnowflakeConnection();

  return withTimeout(
    new Promise((resolve, reject) => {
      connection.execute({
        sqlText: query,
        binds: binds,
        complete: (err, stmt) => {
          if (err) {
            console.error('❌ Merge execution failed:', err);
            console.error('Query:', query);
            reject(err);
          } else {
            const rowsAffected = stmt.getNumUpdatedRows() || 0;
            resolve({ rowsAffected });
          }
        },
      });
    }),
    QUERY_TIMEOUT_MS,
    `Snowflake merge timed out after ${QUERY_TIMEOUT_MS}ms`
  );
}

export async function closeSnowflakeConnection(): Promise<void> {
  if (connectionPool) {
    return new Promise((resolve, reject) => {
      connectionPool!.destroy((err) => {
        if (err) {
          console.error('❌ Error closing connection:', err);
          reject(err);
        } else {
          console.log('✅ Snowflake connection closed');
          connectionPool = null;
          resolve();
        }
      });
    });
  }
}
