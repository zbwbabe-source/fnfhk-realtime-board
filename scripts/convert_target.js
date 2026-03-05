const fs = require('fs');
const path = require('path');

function parseCsvLine(line) {
  const out = [];
  let cur = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }
    if (ch === ',' && !inQuotes) {
      out.push(cur.trim());
      cur = '';
      continue;
    }
    cur += ch;
  }
  out.push(cur.trim());
  return out;
}

function toNumber(value) {
  if (!value) return 0;
  const cleaned = String(value).replace(/,/g, '').trim();
  if (cleaned === '-' || cleaned === '') return 0;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : 0;
}

async function convertTarget() {
  const csvPath = path.join(process.cwd(), 'TARGET.csv');
  const outputPath = path.join(process.cwd(), 'data', 'target.json');
  
  // Read CSV
  let csvContent = fs.readFileSync(csvPath, 'utf-8');
  
  // Remove BOM if exists
  if (csvContent.charCodeAt(0) === 0xFEFF) {
    csvContent = csvContent.slice(1);
  }
  
  // Manual CSV parsing
  const lines = csvContent.trim().split('\n');
  const headers = parseCsvLine(lines[0]);
  
  console.log('CSV Headers:', headers);
  
  const targets = {};
  
  for (let i = 1; i < lines.length; i++) {
    const values = parseCsvLine(lines[i]);
    if (values.length < 6) continue;
    
    const year = values[0]; // e.g., "2026"
    const month = values[1]; // e.g., "1"
    const storeCode = values[2]; // e.g., "M01"
    const targetValue = toNumber(values[3]);
    const country = values[4];
    const currency = values[5];
    
    // Create period key "2026-01"
    const periodKey = `${year}-${month.padStart(2, '0')}`;
    
    if (!targets[periodKey]) {
      targets[periodKey] = {};
    }
    
    targets[periodKey][storeCode] = {
      target_mth: targetValue,
      country,
      currency
    };
  }
  
  // Write JSON
  fs.writeFileSync(outputPath, JSON.stringify(targets, null, 2), 'utf-8');
  
  console.log('✅ Target data converted successfully!');
  console.log(`   Output: ${outputPath}`);
  console.log(`   Periods: ${Object.keys(targets).join(', ')}`);
  
  // Statistics
  Object.keys(targets).forEach(period => {
    const stores = Object.keys(targets[period]).length;
    const total = Object.values(targets[period]).reduce((sum, s) => sum + s.target_mth, 0);
    console.log(`   ${period}: ${stores} stores, Total target: ${total.toLocaleString()}`);
  });
}

convertTarget().catch(console.error);
