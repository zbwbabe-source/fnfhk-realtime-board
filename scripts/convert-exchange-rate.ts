import { syncTwExchangeRateJson } from '../lib/server/tw-exchange-rate-sync';

/**
 * TW exchange rate CSV를 읽어서 JSON으로 변환 저장
 */
function convertExchangeRateToJson() {
  const result = syncTwExchangeRateJson();

  console.log('✅ 환율 데이터 변환 완료!');
  console.log(`📄 소스 파일: ${result.sourceCsv}`);
  console.log(`📁 저장 위치: ${result.outputJson}`);
  console.log(`📊 총 ${result.totalPeriods}개 기간의 환율 데이터`);
}

// 스크립트 실행
convertExchangeRateToJson();
