import fs from 'fs';
import path from 'path';

/**
 * TW_Exchange Rate.csv를 읽어서 JSON 형식으로 변환하여 저장
 */
function convertExchangeRateToJson() {
  const csvPath = path.join(process.cwd(), 'TW_Exchange Rate.csv');
  const jsonPath = path.join(process.cwd(), 'data', 'tw_exchange_rate.json');

  // CSV 파일 읽기
  const csvContent = fs.readFileSync(csvPath, 'utf-8');
  const lines = csvContent.trim().split('\n');

  // 첫 번째 줄(헤더) 제거
  const dataLines = lines.slice(1);

  // JSON 객체 생성
  const exchangeRates: { [key: string]: number } = {};

  dataLines.forEach((line) => {
    const trimmedLine = line.trim();
    if (!trimmedLine) return; // 빈 줄 건너뛰기

    const [period, rateStr] = trimmedLine.split(',');
    if (period && rateStr) {
      const rate = parseFloat(rateStr);
      if (!isNaN(rate)) {
        exchangeRates[period.trim()] = rate;
      }
    }
  });

  // data 디렉토리 확인 및 생성
  const dataDir = path.join(process.cwd(), 'data');
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }

  // JSON 파일로 저장
  fs.writeFileSync(jsonPath, JSON.stringify(exchangeRates, null, 2), 'utf-8');

  console.log('✅ 환율 데이터 변환 완료!');
  console.log(`📁 저장 위치: ${jsonPath}`);
  console.log(`📊 총 ${Object.keys(exchangeRates).length}개 기간의 환율 데이터`);
  console.log('\n변환된 데이터:');
  console.log(JSON.stringify(exchangeRates, null, 2));
}

// 스크립트 실행
convertExchangeRateToJson();
