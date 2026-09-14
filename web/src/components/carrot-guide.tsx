import Image from "next/image";
import reference from "@/assets/carrot-metrics.png";
export function CarrotGuide() {
  return (
    <details className="carrot-guide">
      <summary>당근 지표 입력 기준 · 참고 이미지</summary>
      <p>
        노출·클릭·반응·지출은 당근에서 하루씩 조회해 해당 날짜에 입력하세요.
        클릭률과 클릭당 비용은 자동 계산됩니다. 방문수·단골수·쿠폰 발급수는 광고
        소재 위의 비즈프로필에서 별도로 기록합니다.
      </p>
      <p>
        단골수는 해당 날짜의 총 단골 수이며 월 요약에는 마지막 값을 표시합니다.
        아래 ‘최근 7일’ 합계를 하루 값으로 입력하면 일별 비용과 성과가
        달라집니다.
      </p>
      <Image
        src={reference}
        alt="당근 광고 성과 참고: 노출, 도달, 클릭, 클릭률, 클릭당 지출, 총 지출, 반응 및 단골·관심·쿠폰 다운로드"
        unoptimized
      />
    </details>
  );
}
