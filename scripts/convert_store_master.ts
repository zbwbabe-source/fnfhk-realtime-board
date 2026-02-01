import * as fs from 'fs';
import * as path from 'path';
import { parse } from 'csv-parse/sync';

interface StoreRecord {
  store_cd: string;
  brand: string;
  country: string;
  channel: string;
}

async function convertStoreMaster() {
  try {
    const csvPath = path.join(process.cwd(), 'FNF HKMCTW Store code.csv');
    const csvContent = fs.readFileSync(csvPath, 'utf-8');
    
    const records = parse(csvContent, {
      columns: true,
      skip_empty_lines: true,
      trim: true,
    });

    const storeMaster: StoreRecord[] = records.map((row: any) => ({
      store_cd: row['Store code'],
      brand: row['Brand'],
      country: row['country'],
      channel: row['channel'],
    }));

    const outputDir = path.join(process.cwd(), 'data');
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    const outputPath = path.join(outputDir, 'store_master.json');
    fs.writeFileSync(outputPath, JSON.stringify(storeMaster, null, 2), 'utf-8');

    console.log(`✅ Store master converted successfully!`);
    console.log(`   Total stores: ${storeMaster.length}`);
    console.log(`   Output: ${outputPath}`);

    // 통계 출력
    const stats = {
      byCountry: {} as Record<string, number>,
      byChannel: {} as Record<string, number>,
      byBrand: {} as Record<string, number>,
    };

    storeMaster.forEach((store) => {
      stats.byCountry[store.country] = (stats.byCountry[store.country] || 0) + 1;
      stats.byChannel[store.channel] = (stats.byChannel[store.channel] || 0) + 1;
      stats.byBrand[store.brand] = (stats.byBrand[store.brand] || 0) + 1;
    });

    console.log('\n📊 Statistics:');
    console.log('   By Country:', stats.byCountry);
    console.log('   By Channel:', stats.byChannel);
    console.log('   By Brand:', stats.byBrand);

  } catch (error) {
    console.error('❌ Error converting store master:', error);
    process.exit(1);
  }
}

convertStoreMaster();
