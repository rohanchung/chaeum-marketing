# 프리텐다드 글꼴 통일

- 앱 전체 기본 글꼴과 Tailwind sans를 Pretendard Variable로 변경. 메뉴·운영시트·입력창·로그 및 SVG 텍스트는 동일 글꼴을 상속한다.
- b/strong은 700 굵기를 지정하고 font-synthesis:none으로 인위적 굵기 생성을 사용하지 않는다. 기존 600/650/750 등 세부 굵기는 가변 폰트로 표현한다. 크기·간격은 유지한다.
- 인쇄/PDF 보고서에도 같은 웹폰트를 적용하고 인쇄 버튼은 폰트 준비 후 실행한다.
- [공식 Pretendard 배포 안내](https://github.com/orioncactus/pretendard)의 v1.3.9 가변 다이나믹 서브셋 CSS를 사용한다. 글꼴은 jsDelivr에서 로드하며 로컬에 번들하지 않는다. 폰트를 불러오지 못하면 sans-serif로 대체된다.
- DB 및 입력 데이터 변경 없음. 로그·최신 핸드오프 갱신. 커밋·푸시는 사용자 GitHub Desktop에서 수행한다.

## GitHub Desktop

검증: 내부 테스트38개, TypeScript 포함 정적 빌드 통과. 배포 CSS 최상단에 프리텐다드 import가 남아 있는지 확인했다. 브라우저 화면 조작은 생략했다.

Summary: 전체 화면과 인쇄 보고서에 프리텐다드 적용

Description:
- 메뉴·운영시트·입력창·로그 글꼴을 프리텐다드로 통일
- 굵은 글씨에 실제 폰트 굵기 적용
- 인쇄 보고서에도 동일한 글꼴 적용
- 기존 글자 크기와 간격 유지, 로그·핸드오프 갱신
