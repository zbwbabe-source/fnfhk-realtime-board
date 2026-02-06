/**
 * HKMC Store 면적.csv를 JSON으로 변환
 * 
 * 출력: data/store_area.json
 * 
 * 구조:
 * {
 *   "M18": {
 *     "country": "HK",
 *     "channel": "정상",
 *     "areas": {
 *       "2401": 32,
 *       "2402": 32,
 *       ...
 *       "2612": 32
 *     }
 *   },
 *   ...
 * }
 * 
 * 주의사항:
 * - 면적은 평(pyeong) 단위
 * - 월별로 면적이 변경될 수 있으므로 모든 월 데이터 저장
 * - 빈 값(empty)은 null 처리
 */

import * as fs from 'fs';
import * as path from 'path';

interface StoreAreaData {
  country: string;
  channel: string;
  areas: {
    [yearMonth: string]: number | null; // "2401", "2402", ...
  };
}

interface StoreAreaMap {
  [storeCode: string]: StoreAreaData;
}

function parseCSV(filePath: string): StoreAreaMap {
  const csvContent = fs.readFileSync(filePath, 'utf-8');
  const lines = csvContent.trim().split('\n');
  
  if (lines.length < 2) {
    throw new Error('CSV 파일이 비어있거나 헤더만 존재합니다.');
  }

  const header = lines[0].split(',');
  
  // 월별 컬럼 인덱스 찾기 (2401, 2402, ... 2612)
  const monthColumns: { yearMonth: string; index: number }[] = [];
  
  for (let i = 3; i < header.length; i++) {
    const colName = header[i].trim();
    // YYMM 형식 (4자리 숫자)
    if (/^\d{4}$/.test(colName)) {
      monthColumns.push({
        yearMonth: colName,
        index: i,
      });
    }
  }

  console.log(`📅 발견된 월별 컬럼: ${monthColumns.length}개 (${monthColumns[0]?.yearMonth} ~ ${monthColumns[monthColumns.length - 1]?.yearMonth})`);

  const result: StoreAreaMap = {};
  
  // 데이터 행 파싱 (헤더 제외)
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    const columns = line.split(',');
    
    const storeCode = columns[0]?.trim();
    const country = columns[1]?.trim();
    const channel = columns[2]?.trim();
    
    if (!storeCode || !country || !channel) {
      console.warn(`⚠️ Line ${i + 1}: 필수 컬럼이 누락되었습니다. 스킵합니다.`);
      continue;
    }

    // 월별 면적 데이터 파싱
    const areas: { [yearMonth: string]: number | null } = {};
    
    for (const { yearMonth, index } of monthColumns) {
      const areaValue = columns[index]?.trim();
      
      if (areaValue && areaValue !== '') {
        const parsedArea = parseFloat(areaValue);
        if (!isNaN(parsedArea) && parsedArea > 0) {
          areas[yearMonth] = parsedArea;
        } else {
          areas[yearMonth] = null;
        }
      } else {
        areas[yearMonth] = null;
      }
    }

    result[storeCode] = {
      country,
      channel,
      areas,
    };
  }

  return result;
}

function main() {
  try {
    console.log('🚀 면적 CSV → JSON 변환 시작...\n');

    // 파일 경로
    const csvPath = path.resolve(__dirname, '../HKMC Store 면적.csv');
    const outputPath = path.resolve(__dirname, '../data/store_area.json');

    // CSV 파싱
    console.log(`📂 입력 파일: ${csvPath}`);
    const storeAreaMap = parseCSV(csvPath);

    // 통계 출력
    const totalStores = Object.keys(storeAreaMap).length;
    
    // 최신 월 기준으로 면적 있는 매장 수 계산
    const latestMonth = Object.values(storeAreaMap)[0]?.areas 
      ? Object.keys(Object.values(storeAreaMap)[0].areas).sort().pop()
      : null;
    
    const storesWithArea = latestMonth 
      ? Object.values(storeAreaMap).filter(s => s.areas[latestMonth] !== null && s.areas[latestMonth] !== undefined).length
      : 0;
    const storesWithoutArea = totalStores - storesWithArea;

    console.log(`\n📊 파싱 결과:`);
    console.log(`   - 전체 매장: ${totalStores}개`);
    console.log(`   - 면적 있음 (${latestMonth} 기준): ${storesWithArea}개`);
    console.log(`   - 면적 없음: ${storesWithoutArea}개`);

    // 채널별 통계
    const byChannel: { [key: string]: number } = {};
    Object.values(storeAreaMap).forEach(store => {
      const key = `${store.country} ${store.channel}`;
      byChannel[key] = (byChannel[key] || 0) + 1;
    });

    console.log(`\n📍 채널별 매장 수:`);
    Object.entries(byChannel)
      .sort((a, b) => b[1] - a[1])
      .forEach(([channel, count]) => {
        console.log(`   - ${channel}: ${count}개`);
      });

    // JSON 파일로 저장
    const outputDir = path.dirname(outputPath);
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    fs.writeFileSync(
      outputPath,
      JSON.stringify({ stores: storeAreaMap }, null, 2),
      'utf-8'
    );

    console.log(`\n✅ 저장 완료: ${outputPath}`);
    
    // 샘플 출력
    console.log(`\n📋 샘플 데이터 (처음 3개):`);
    Object.entries(storeAreaMap).slice(0, 3).forEach(([code, data]) => {
      const latestMonth = Object.keys(data.areas).sort().pop();
      const latestArea = latestMonth ? data.areas[latestMonth] : null;
      console.log(`   ${code}: ${latestArea || 'N/A'}평 @ ${latestMonth} (${data.country} ${data.channel})`);
    });

  } catch (error: any) {
    console.error('❌ 오류 발생:', error.message);
    process.exit(1);
  }
}

// 실행
main();
