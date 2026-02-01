const fs = require('fs');
const path = require('path');
const { parse } = require('csv-parse/sync');

async function convertStoremaster() {
  const csvPath = path.join(process.cwd(), 'FNF HKMCTW Store code.csv');
  const outputPath = path.join(process.cwd(), 'data', 'store_master.json');
  
  // Read CSV and remove BOM if exists
  let csvContent = fs.readFileSync(csvPath, 'utf-8');
  // Remove BOM (UTF-8 BOM: 0xEF,0xBB,0xBF)
  if (csvContent.charCodeAt(0) === 0xFEFF) {
    csvContent = csvContent.slice(1);
  }
  
  const records = parse(csvContent, {
    columns: true,
    skip_empty_lines: true,
    trim: true,
    bom: true,  // Handle BOM
  });
  
  const stores = records
    .filter(r => {
      const storeCode = r['Store code'] || r['﻿Store code']; // Handle both cases
      return storeCode && storeCode.trim() !== '';
    })
    .map((r) => {
      const storeCode = r['Store code'] || r['﻿Store code']; // Handle both cases
      const storeName = r['store name'] || r['Store name'] || '';
      return {
        store_code: storeCode.trim(),
        store_name: storeName.trim(),
        brand: r['Brand'].trim(),
        country: r['country'].trim(),
        channel: r['channel'].trim(),
      };
    });
  
  // HKMC stores (non-warehouse)
  const hkmcStoresNonWh = stores
    .filter(s => ['HK', 'MC'].includes(s.country) && s.channel !== 'Warehouse')
    .map(s => s.store_code);
  
  // HKMC warehouse stores
  const hkmcWhStores = stores
    .filter(s => ['HK', 'MC'].includes(s.country) && s.channel === 'Warehouse')
    .map(s => s.store_code);
  
  // Main warehouse mapping
  const mainWhMapping = {
    M: 'WHM',  // MLB main warehouse
    X: 'XHM',  // Discovery main warehouse
  };
  
  const storeMaster = {
    stores,
    hkmc_stores_non_wh: hkmcStoresNonWh,
    hkmc_wh_stores: hkmcWhStores,
    main_wh_mapping: mainWhMapping,
  };
  
  // Create data directory if not exists
  const dataDir = path.dirname(outputPath);
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }
  
  // Write JSON
  fs.writeFileSync(outputPath, JSON.stringify(storeMaster, null, 2), 'utf-8');
  
  console.log('✅ Store master converted successfully!');
  console.log(`   Total stores: ${stores.length}`);
  console.log(`   HKMC stores (non-WH): ${hkmcStoresNonWh.length}`);
  console.log(`   HKMC warehouses: ${hkmcWhStores.length}`);
  console.log(`   Output: ${outputPath}`);
  console.log('');
  console.log('📊 Statistics:');
  
  // Statistics
  const byCountry = stores.reduce((acc, s) => {
    acc[s.country] = (acc[s.country] || 0) + 1;
    return acc;
  }, {});
  console.log(`   By Country: ${JSON.stringify(byCountry)}`);
  
  const byChannel = stores.reduce((acc, s) => {
    acc[s.channel] = (acc[s.channel] || 0) + 1;
    return acc;
  }, {});
  console.log(`   By Channel: ${JSON.stringify(byChannel)}`);
  
  const byBrand = stores.reduce((acc, s) => {
    acc[s.brand] = (acc[s.brand] || 0) + 1;
    return acc;
  }, {});
  console.log(`   By Brand: ${JSON.stringify(byBrand)}`);
}

convertStoremaster().catch(console.error);
