# Chaeum Marketing

채움영어학원 풍무캠퍼스의 마케팅 성과·비용·콘텐츠·이벤트를 날짜 × 채널 운영 시트로 기록하고 분석하는 웹 서비스입니다.

## 현재 구현

2026-09-14: [당근 광고 템플릿·컴팩트 시트·서버 날짜 업데이트](docs/update-20260914.md).

- 채널 → 소재 → 광고 집행 구조의 월간 운영 시트. 지표별 직접 입력, 다중 셀 붙여넣기, 실행 취소와 기간 제한을 지원합니다.
- 채널 템플릿·지표·소재·집행·이벤트 관리, 아카이브·휴지통·복원.
- 학원 일일 퍼널과 개별 고객의 상담·등록·주 유입 경로를 구분합니다.
- 실제 지급 비용, 결제·환불·서비스 원가를 연결해 일·월·연간 비용, 순수납, 객단가, ROI와 확인된 출처별 성과를 계산합니다.
- 같은 계산 결과를 사용하는 Excel, 인쇄/PDF 저장용 보고서, 보고 시점 보존, JSON 백업과 같은 작업공간 복원.
- Supabase `chaeum-marketing` 프로젝트에 신규 스키마와 검증 규칙을 적용했습니다. 로한북/가계부 프로젝트는 사용하지 않습니다.

각 채널 관리자 화면에서 확인한 값을 수기로 기록합니다. 외부 채널 API 자동 수집은 포함하지 않습니다. 계산 정의와 누락값 처리는 [제품 기준](docs/product-contract.md), 구현·검증 내역과 운영 제한은 [구현 기록](docs/implementation-20260913.md)을 참고하세요.

## 개발·검증

`web` 폴더에서 `pnpm install --frozen-lockfile`, `pnpm dev`로 실행합니다. `.env.local`에는 Supabase 공개 URL과 publishable key만 설정합니다. 서비스 역할 키는 프런트엔드에 넣지 않습니다.

```text
pnpm test
pnpm exec tsc --noEmit
pnpm exec eslint src
pnpm build
```

DB 통합 검사는 `supabase/tests`에 있습니다. 현재 채움 작업공간을 대상으로 트랜잭션 안에서 실행하고 롤백합니다.

## 배포·마이그레이션

GitHub Desktop에서 커밋·푸시하면 기존 GitHub Pages 워크플로가 `web/out`을 배포합니다. 이번 작업에서는 커밋·푸시하지 않았습니다. `GITHUB_ACTIONS=true`일 때 `/chaeum-marketing` 하위 경로로 빌드합니다.

이번에 추가한 마이그레이션 5개의 파일 버전은 원격 적용 이력에 맞췄습니다. 과거 초기 스키마는 원격 migration history에 등록되지 않았으므로 기존 DB에 `db push`를 무조건 실행하지 마세요. 먼저 초기 스키마와 원격 상태를 대조하고 기준 이력을 정리해야 합니다.
