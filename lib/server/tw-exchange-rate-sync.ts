import fs from 'fs';
import path from 'path';

const EXCHANGE_RATE_CSV_CANDIDATES = ['TW_Exchange Rate.csv', 'TW_Exchange Rate 2512.csv'];

export type ExchangeRateSyncResult = {
  sourceCsv: string;
  outputJson: string;
  totalPeriods: number;
};

function resolveExchangeRateCsv(cwd: string): string {
  for (const candidate of EXCHANGE_RATE_CSV_CANDIDATES) {
    const fullPath = path.join(cwd, candidate);
    if (fs.existsSync(fullPath)) {
      return fullPath;
    }
  }

  const discovered = fs
    .readdirSync(cwd)
    .filter((name) => /^TW_Exchange Rate.*\.csv$/i.test(name))
    .sort()
    .reverse();
  const first = discovered[0];
  if (!first) {
    throw new Error('TW exchange rate CSV 파일을 찾을 수 없습니다.');
  }
  return path.join(cwd, first);
}

export function syncTwExchangeRateJson(cwd = process.cwd()): ExchangeRateSyncResult {
  const csvPath = resolveExchangeRateCsv(cwd);
  const jsonPath = path.join(cwd, 'data', 'tw_exchange_rate.json');

  const csvContent = fs.readFileSync(csvPath, 'utf-8');
  const lines = csvContent.trim().split(/\r?\n/);
  const dataLines = lines.slice(1);

  const exchangeRates: Record<string, number> = {};
  for (const line of dataLines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const [periodRaw, rateRaw] = trimmed.split(',');
    if (!periodRaw || !rateRaw) continue;

    const period = periodRaw.trim();
    const rate = parseFloat(rateRaw.trim());
    if (!Number.isNaN(rate)) {
      exchangeRates[period] = rate;
    }
  }

  const dataDir = path.dirname(jsonPath);
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }

  fs.writeFileSync(jsonPath, JSON.stringify(exchangeRates, null, 2), 'utf-8');
  return {
    sourceCsv: path.basename(csvPath),
    outputJson: jsonPath,
    totalPeriods: Object.keys(exchangeRates).length,
  };
}
