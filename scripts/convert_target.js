const fs = require('fs');
const path = require('path');

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
  const headers = lines[0].split(',').map(h => h.trim());
  
  const targets = {};
  
  for (let i = 1; i < lines.length; i++) {
    const values = lines[i].split(',').map(v => v.trim());
    if (values.length < 5) continue;
    
    const period = values[0]; // e.g., "2601"
    const storeCode = values[1]; // e.g., "M01"
    const targetValue = parseFloat(values[2]) || 0;
    const country = values[3];
    const currency = values[4];
    
    // Convert period "2601" to "2026-01"
    const year = '20' + period.substring(0, 2);
    const month = period.substring(2, 4);
    const periodKey = `${year}-${month}`;
    
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
