# Chaeum Marketing

채움영어학원 풍무캠퍼스의 마케팅 성과·비용·콘텐츠·이벤트를 날짜 × 채널 운영 시트로 기록하고 분석하는 웹 서비스입니다.

## 현재 상태

- Supabase 초기 데이터 스키마 작성 완료
- 데이터베이스 프로젝트: `chaeum-marketing` (서울 리전)
- 아직 원격 데이터베이스에는 스키마를 적용하지 않음

## 스키마

초기 스키마는 [supabase/migrations/202609080001_initial_marketing_schema.sql](supabase/migrations/202609080001_initial_marketing_schema.sql)에 있습니다.

향후 앱 구현 시 Supabase CLI를 프로젝트 의존성으로 추가하고, 모든 데이터베이스 변경은 마이그레이션으로 관리합니다.
