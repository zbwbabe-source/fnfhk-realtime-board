import snowflake from 'snowflake-sdk';

export interface SnowflakeConfig {
  account: string;
  username: string;
  password: string;
  database: string;
  schema: string;
  warehouse: string;
  role?: string;
}

let connectionPool: snowflake.Connection | null = null;

export function getSnowflakeConfig(): SnowflakeConfig {
  // Snowflake SDK는 account를 특정 형식으로 요구합니다
  // cixxjbf-wp67697 형식을 그대로 사용
  const account = process.env.SNOWFLAKE_ACCOUNT || '';
  
  return {
    account: account,
    username: process.env.SNOWFLAKE_USERNAME || '',
    password: process.env.SNOWFLAKE_PASSWORD || '',
    database: process.env.SNOWFLAKE_DATABASE || 'FNF',
    schema: process.env.SNOWFLAKE_SCHEMA || 'SAP_FNF',
    warehouse: process.env.SNOWFLAKE_WAREHOUSE || '',
    role: process.env.SNOWFLAKE_ROLE || undefined,
  };
}

export async function getSnowflakeConnection(): Promise<snowflake.Connection> {
  if (connectionPool && connectionPool.isUp()) {
    return connectionPool;
  }

  const config = getSnowflakeConfig();

  return new Promise((resolve, reject) => {
    const connection = snowflake.createConnection({
      account: config.account,
      username: config.username,
      password: config.password,
      database: config.database,
      schema: config.schema,
      warehouse: config.warehouse,
      role: config.role,
    });

    connection.connect((err, conn) => {
      if (err) {
        console.error('❌ Snowflake connection failed:', err);
        reject(err);
      } else {
        console.log('✅ Snowflake connected successfully');
        connectionPool = conn;
        resolve(conn);
      }
    });
  });
}

export async function executeSnowflakeQuery<T = any>(
  query: string,
  binds?: any[]
): Promise<T[]> {
  const connection = await getSnowflakeConnection();

  return new Promise((resolve, reject) => {
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
  });
}

export async function executeSnowflakeMerge(
  query: string,
  binds?: any[]
): Promise<{ rowsAffected: number }> {
  const connection = await getSnowflakeConnection();

  return new Promise((resolve, reject) => {
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
  });
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
