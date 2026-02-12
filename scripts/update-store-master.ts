import * as fs from 'fs';
import * as path from 'path';

// CSV 파일 읽기
const csvPath = path.join(process.cwd(), 'FNF HKMCTW Store code.csv');
const csvContent = fs.readFileSync(csvPath, 'utf-8');

// JSON 파일 경로
const jsonPath = path.join(process.cwd(), 'data', 'store_master.json');

// CSV 파싱 (간단한 split으로)
const lines = csvContent.trim().split('\n');

const stores = lines.slice(1).map(line => {
  const parts = line.split(',');
  
  return {
    store_code: parts[0]?.trim() || '',
    store_name: parts[1]?.trim() || '',
    brand: parts[2]?.trim() || '',
    country: parts[3]?.trim() || '',
    channel: parts[4]?.trim() || ''
  };
}).filter(store => store.store_code); // 빈 행 제거

// JSON 생성
const json = {
  stores: stores
};

// 파일 저장
fs.writeFileSync(jsonPath, JSON.stringify(json, null, 2), 'utf-8');

console.log(`✅ store_master.json 업데이트 완료!`);
console.log(`총 ${stores.length}개 매장 정보 저장`);
console.log(`\n샘플 (TW 매장):`);
const twStores = stores.filter(s => s.country === 'TW');
console.log(twStores.slice(0, 5));
