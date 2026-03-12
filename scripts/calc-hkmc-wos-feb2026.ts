import * as dotenv from 'dotenv';
import * as path from 'path';
import { executeSnowflakeQuery } from '../lib/snowflake';

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

async function run() {
  const sql = `
    WITH params AS (
      SELECT TO_DATE('2026-02-28') AS asof_date, TO_DATE('2026-01-01') AS from_date
    ),
    category_map AS (
      SELECT * FROM VALUES
        ('BN','HAT'), ('CP','HAT'), ('HT','HAT'), ('SC','HAT'), ('WR','HAT'), ('CB','HAT'), ('MC','HAT'), ('WM','HAT'),
        ('CV','SHOES'), ('LP','SHOES'), ('MU','SHOES'), ('SH','SHOES'), ('SX','SHOES'), ('RN','SHOES'), ('SD','SHOES'), ('WB','SHOES'),
        ('BG','BAG'), ('BK','BAG'), ('CR','BAG'), ('HS','BAG'), ('SG','BAG'), ('UB','BAG'), ('BM','BAG'), ('BQ','BAG'),
        ('BW','BAG'), ('OR','BAG'), ('BZ','BAG')
      AS t(small_cd, cat)
    ),
    hkmc_base_shop AS (
      SELECT COLUMN1 AS shop_cd FROM VALUES
        ('M01'),('M02'),('M03'),('M05'),('M06'),('M07'),('M08'),('M09'),('M10'),('M11'),
        ('M12'),('M13'),('M14'),('M15'),('M16'),('M17'),('M18'),('M19'),('M20'),('M21'),('M22'),
        ('MC1'),('MC2'),('MC3'),('MC4'),('HE1'),('HE2')
    ),
    hkmc_related_shop AS (
      SELECT DISTINCT s.LOCAL_SHOP_CD AS shop_cd
      FROM SAP_FNF.DW_HMD_STOCK_SNAP_D s
      JOIN hkmc_base_shop b
        ON s.LOCAL_SHOP_CD = b.shop_cd
        OR s.LOCAL_SHOP_CD LIKE b.shop_cd || 'DGM'
      WHERE (CASE WHEN s.BRD_CD IN ('M','I') THEN 'M' ELSE s.BRD_CD END) = 'M'
      UNION
      SELECT DISTINCT s.LOCAL_SHOP_CD
      FROM SAP_FNF.DW_HMD_STOCK_SNAP_D s
      WHERE (CASE WHEN s.BRD_CD IN ('M','I') THEN 'M' ELSE s.BRD_CD END) = 'M'
        AND REGEXP_LIKE(s.LOCAL_SHOP_CD, '^(WH[0-9A-Z]*|WM[0-9A-Z]*)$')
    ),
    stock_base_dt AS (
      SELECT
        COALESCE(
          MAX(CASE WHEN s.STOCK_DT = DATEADD(day, 1, p.asof_date) THEN s.STOCK_DT END),
          MAX(CASE WHEN s.STOCK_DT <= DATEADD(day, 1, p.asof_date) THEN s.STOCK_DT END)
        ) AS stock_dt
      FROM SAP_FNF.DW_HMD_STOCK_SNAP_D s
      CROSS JOIN params p
      WHERE (CASE WHEN s.BRD_CD IN ('M','I') THEN 'M' ELSE s.BRD_CD END) = 'M'
    ),
    stock_q AS (
      SELECT
        cm.cat,
        SUM(s.TAG_STOCK_AMT) AS tag_stock_amt
      FROM SAP_FNF.DW_HMD_STOCK_SNAP_D s
      JOIN stock_base_dt d ON s.STOCK_DT = d.stock_dt
      JOIN hkmc_related_shop hs ON s.LOCAL_SHOP_CD = hs.shop_cd
      JOIN category_map cm ON SUBSTR(s.PART_CD, 3, 2) = cm.small_cd
      WHERE (CASE WHEN s.BRD_CD IN ('M','I') THEN 'M' ELSE s.BRD_CD END) = 'M'
      GROUP BY cm.cat
    ),
    sales_q AS (
      SELECT
        cm.cat,
        SUM(s.TAG_SALE_AMT) AS tag_sales_amt
      FROM SAP_FNF.DW_HMD_SALE_D s
      CROSS JOIN params p
      JOIN hkmc_related_shop hs ON s.LOCAL_SHOP_CD = hs.shop_cd
      JOIN category_map cm ON SUBSTR(s.PART_CD, 3, 2) = cm.small_cd
      WHERE (CASE WHEN s.BRD_CD IN ('M','I') THEN 'M' ELSE s.BRD_CD END) = 'M'
        AND s.SALE_DT BETWEEN p.from_date AND p.asof_date
      GROUP BY cm.cat
    )
    SELECT
      COALESCE(st.cat, sa.cat) AS category,
      COALESCE(st.tag_stock_amt, 0) AS tag_stock_amt,
      COALESCE(sa.tag_sales_amt, 0) AS tag_sales_amt,
      CASE
        WHEN COALESCE(sa.tag_sales_amt, 0) = 0 THEN NULL
        ELSE (COALESCE(st.tag_stock_amt, 0) / COALESCE(sa.tag_sales_amt, 0)) * (59.0 / 7.0)
      END AS weeks_of_supply
    FROM stock_q st
    FULL OUTER JOIN sales_q sa ON st.cat = sa.cat
    ORDER BY 1
  `;

  const rows = await executeSnowflakeQuery(sql, []);
  console.log(JSON.stringify(rows, null, 2));
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
