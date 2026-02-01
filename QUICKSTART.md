# HKMC Dashboard - 빠른 시작 가이드

## 🚀 빠른 시작 (5분 안에)

### 1단계: 프로젝트 설정

```bash
# 패키지 설치
npm install

# Store master 변환
npm run convert-store-master
```

### 2단계: 환경 변수 설정

`.env.local` 파일 생성:

```env
SNOWFLAKE_ACCOUNT=your_account.region
SNOWFLAKE_USERNAME=your_username
SNOWFLAKE_PASSWORD=your_password
SNOWFLAKE_DATABASE=SAP_FNF
SNOWFLAKE_SCHEMA=DASH
SNOWFLAKE_WAREHOUSE=COMPUTE_WH
SNOWFLAKE_ROLE=FNF_DASHBOARD_ROLE
CRON_SECRET=random_secret_key_123
```

### 3단계: Snowflake 초기화

Snowflake에서 다음 파일들을 순서대로 실행:

1. `sql/setup_snowflake.sql` - 권한 설정
2. `sql/ddl_create_tables.sql` - 테이블 생성

### 4단계: 개발 서버 실행

```bash
npm run dev
```

브라우저에서 http://localhost:3000 접속

---

## 📦 배포 (Vercel)

### GitHub Push

```bash
git init
git add .
git commit -m "Initial commit"
git branch -M main
git remote add origin https://github.com/YOUR_USERNAME/fnfhk-dashboard.git
git push -u origin main
```

### Vercel 배포

1. https://vercel.com 로그인
2. "Import Project" 선택
3. GitHub Repository 연결
4. Environment Variables 추가 (위의 환경 변수 전부)
5. "Deploy" 클릭

### Cron 동작 확인

배포 후 다음 날 오전 5시 이후에 Vercel 로그 확인:
- Settings → Cron Jobs → Logs

수동 테스트:

```bash
curl -X GET \
  https://your-app.vercel.app/api/cron/daily-aggregate \
  -H "Authorization: Bearer your_cron_secret"
```

---

## 🔍 문제 해결

### Q1: Snowflake 연결 실패

**원인**: 계정 정보 오류 또는 네트워크 문제

**해결**:
1. `SNOWFLAKE_ACCOUNT` 형식 확인 (`account.region`)
2. Snowflake 사용자 계정 활성화 여부 확인
3. IP 허용 목록 설정 (필요시)

### Q2: Store master 데이터 없음

**원인**: CSV 변환 미실행

**해결**:
```bash
npm run convert-store-master
```

### Q3: API 에러 500

**원인**: Snowflake 테이블 미생성 또는 데이터 부재

**해결**:
1. `sql/ddl_create_tables.sql` 실행 확인
2. Cron Job 최소 1회 실행 후 데이터 확인

### Q4: 날짜 선택 안됨

**원인**: 메타 API 응답 실패

**해결**:
- 브라우저 콘솔 확인
- `/api/meta` 직접 접속하여 응답 확인

---

## 📞 지원

기술 지원이 필요하시면 개발팀으로 연락 바랍니다.

**Happy Dashboard Building! 🎉**
