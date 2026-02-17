-- 2월 15일과 2월 16일 매출 데이터 비교
-- 실제 데이터가 있는지 확인

-- 1. 2월 15일 데이터 확인
SELECT 
    '2025-02-15' AS check_date,
    LOCAL_SHOP_CD,
    COUNT(*) AS record_count,
    SUM(ACT_SALE_AMT) AS total_sales,
    SUM(TAG_SALE_AMT) AS total_tag_sales,
    MIN(SALE_DT) AS min_date,
    MAX(SALE_DT) AS max_date
FROM SAP_FNF.DW_HMD_SALE_D
WHERE SALE_DT = '2025-02-15'
    AND LOCAL_SHOP_CD IN (
        -- HKMC stores
        'M01','M02','M03','M05','M06','M07','M08','M09','M10',
        'M11','M12','M13','M14','M15','M16','M17','M18','M19','M20','M21','M22',
        'MC1','MC2','MC3','MC4',
        'HE1','HE2',
        'X01','XE1',
        -- TW stores
        'T01','T02','T03','T04','T05','T06','T07','T08','T09','T10',
        'T11','T12','T13','T14','T15','T16','T17','T18',
        'TU1','TU2','TU3',
        'TE1','TE2','TE3','TE4',
        'D01','D02','D03','D04','D05',
        'DE1','DE2'
    )
GROUP BY LOCAL_SHOP_CD
ORDER BY LOCAL_SHOP_CD;

-- 2. 2월 16일 데이터 확인
SELECT 
    '2025-02-16' AS check_date,
    LOCAL_SHOP_CD,
    COUNT(*) AS record_count,
    SUM(ACT_SALE_AMT) AS total_sales,
    SUM(TAG_SALE_AMT) AS total_tag_sales,
    MIN(SALE_DT) AS min_date,
    MAX(SALE_DT) AS max_date
FROM SAP_FNF.DW_HMD_SALE_D
WHERE SALE_DT = '2025-02-16'
    AND LOCAL_SHOP_CD IN (
        -- HKMC stores
        'M01','M02','M03','M05','M06','M07','M08','M09','M10',
        'M11','M12','M13','M14','M15','M16','M17','M18','M19','M20','M21','M22',
        'MC1','MC2','MC3','MC4',
        'HE1','HE2',
        'X01','XE1',
        -- TW stores
        'T01','T02','T03','T04','T05','T06','T07','T08','T09','T10',
        'T11','T12','T13','T14','T15','T16','T17','T18',
        'TU1','TU2','TU3',
        'TE1','TE2','TE3','TE4',
        'D01','D02','D03','D04','D05',
        'DE1','DE2'
    )
GROUP BY LOCAL_SHOP_CD
ORDER BY LOCAL_SHOP_CD;

-- 3. 2월 15일과 16일 합계 비교
SELECT 
    SALE_DT,
    COUNT(DISTINCT LOCAL_SHOP_CD) AS store_count,
    COUNT(*) AS total_records,
    SUM(ACT_SALE_AMT) AS total_sales,
    SUM(TAG_SALE_AMT) AS total_tag_sales
FROM SAP_FNF.DW_HMD_SALE_D
WHERE SALE_DT IN ('2025-02-15', '2025-02-16')
    AND LOCAL_SHOP_CD IN (
        -- HKMC stores
        'M01','M02','M03','M05','M06','M07','M08','M09','M10',
        'M11','M12','M13','M14','M15','M16','M17','M18','M19','M20','M21','M22',
        'MC1','MC2','MC3','MC4',
        'HE1','HE2',
        'X01','XE1',
        -- TW stores
        'T01','T02','T03','T04','T05','T06','T07','T08','T09','T10',
        'T11','T12','T13','T14','T15','T16','T17','T18',
        'TU1','TU2','TU3',
        'TE1','TE2','TE3','TE4',
        'D01','D02','D03','D04','D05',
        'DE1','DE2'
    )
GROUP BY SALE_DT
ORDER BY SALE_DT;

-- 4. MTD (2월 1일 ~ 2월 15일 vs 2월 1일 ~ 2월 16일) 비교
SELECT 
    '2025-02-01 to 2025-02-15' AS period,
    COUNT(DISTINCT LOCAL_SHOP_CD) AS store_count,
    SUM(ACT_SALE_AMT) AS total_sales
FROM SAP_FNF.DW_HMD_SALE_D
WHERE SALE_DT BETWEEN '2025-02-01' AND '2025-02-15'
    AND LOCAL_SHOP_CD IN (
        'M01','M02','M03','M05','M06','M07','M08','M09','M10',
        'M11','M12','M13','M14','M15','M16','M17','M18','M19','M20','M21','M22',
        'MC1','MC2','MC3','MC4',
        'HE1','HE2',
        'X01','XE1',
        'T01','T02','T03','T04','T05','T06','T07','T08','T09','T10',
        'T11','T12','T13','T14','T15','T16','T17','T18',
        'TU1','TU2','TU3',
        'TE1','TE2','TE3','TE4',
        'D01','D02','D03','D04','D05',
        'DE1','DE2'
    )
UNION ALL
SELECT 
    '2025-02-01 to 2025-02-16' AS period,
    COUNT(DISTINCT LOCAL_SHOP_CD) AS store_count,
    SUM(ACT_SALE_AMT) AS total_sales
FROM SAP_FNF.DW_HMD_SALE_D
WHERE SALE_DT BETWEEN '2025-02-01' AND '2025-02-16'
    AND LOCAL_SHOP_CD IN (
        'M01','M02','M03','M05','M06','M07','M08','M09','M10',
        'M11','M12','M13','M14','M15','M16','M17','M18','M19','M20','M21','M22',
        'MC1','MC2','MC3','MC4',
        'HE1','HE2',
        'X01','XE1',
        'T01','T02','T03','T04','T05','T06','T07','T08','T09','T10',
        'T11','T12','T13','T14','T15','T16','T17','T18',
        'TU1','TU2','TU3',
        'TE1','TE2','TE3','TE4',
        'D01','D02','D03','D04','D05',
        'DE1','DE2'
    );

-- 5. 최근 데이터 확인 (최신 날짜가 언제인지)
SELECT 
    MAX(SALE_DT) AS latest_date,
    COUNT(DISTINCT SALE_DT) AS distinct_dates,
    COUNT(DISTINCT LOCAL_SHOP_CD) AS store_count
FROM SAP_FNF.DW_HMD_SALE_D
WHERE SALE_DT >= '2025-02-01'
    AND LOCAL_SHOP_CD IN (
        'M01','M02','M03','M05','M06','M07','M08','M09','M10',
        'M11','M12','M13','M14','M15','M16','M17','M18','M19','M20','M21','M22',
        'MC1','MC2','MC3','MC4',
        'HE1','HE2',
        'X01','XE1',
        'T01','T02','T03','T04','T05','T06','T07','T08','T09','T10',
        'T11','T12','T13','T14','T15','T16','T17','T18',
        'TU1','TU2','TU3',
        'TE1','TE2','TE3','TE4',
        'D01','D02','D03','D04','D05',
        'DE1','DE2'
    );
