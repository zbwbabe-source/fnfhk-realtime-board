import { NextResponse } from 'next/server';
import { closeSnowflakeConnection, executeSnowflakeQuery, getSnowflakeConfig } from '@/lib/snowflake';

export const dynamic = 'force-dynamic';

type SnowflakeStatusResponse = {
  ok: boolean;
  status: 'ok' | 'error';
  stage: 'config' | 'connection' | 'query';
  message: string;
  checked_at: string;
  duration_ms: number;
};

export async function GET() {
  const startedAt = Date.now();

  try {
    const config = getSnowflakeConfig();
    if (!config.account || !config.username || !config.privateKey) {
      const response: SnowflakeStatusResponse = {
        ok: false,
        status: 'error',
        stage: 'config',
        message: 'Snowflake config is incomplete. Check account, username, and private key.',
        checked_at: new Date().toISOString(),
        duration_ms: Date.now() - startedAt,
      };
      return NextResponse.json(response, { status: 500 });
    }

    await executeSnowflakeQuery(
      'SELECT CURRENT_VERSION() AS VER, CURRENT_WAREHOUSE() AS WH, CURRENT_DATABASE() AS DB, CURRENT_SCHEMA() AS SC'
    );
    await closeSnowflakeConnection();

    const response: SnowflakeStatusResponse = {
      ok: true,
      status: 'ok',
      stage: 'query',
      message: 'Snowflake connection and query succeeded.',
      checked_at: new Date().toISOString(),
      duration_ms: Date.now() - startedAt,
    };
    return NextResponse.json(response);
  } catch (error: any) {
    const message = error?.message || 'Unknown Snowflake error';
    const normalized = String(message).toLowerCase();
    const stage: SnowflakeStatusResponse['stage'] =
      normalized.includes('config is incomplete') || normalized.includes('private key')
        ? 'config'
        : normalized.includes('query')
          ? 'query'
          : 'connection';

    const response: SnowflakeStatusResponse = {
      ok: false,
      status: 'error',
      stage,
      message,
      checked_at: new Date().toISOString(),
      duration_ms: Date.now() - startedAt,
    };
    return NextResponse.json(response, { status: 500 });
  }
}
