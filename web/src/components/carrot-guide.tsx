import Image from "next/image";
import reference from "@/assets/carrot-metrics.png";
export function CarrotGuide() {
  return (
    <details className="carrot-guide">
      <summary>당근 지표 입력 기준 · 참고 이미지</summary>
      <p>
        노출·클릭·반응·지출은 당근에서 하루씩 조회해 해당 날짜에 입력하세요.
        클릭률과 클릭당 비용은 자동 계산됩니다. 반응 합계와 단골·관심·쿠폰은
        각각 기록하며 다시 합산하지 않습니다.
      </p>
      <p>
        도달은 중복 인원을 포함할 수 있어 월 합계 대신 마지막 관측값으로
        표시합니다. 아래 ‘최근 7일’ 합계를 하루 값으로 입력하면 일별 비용과
        성과가 달라집니다.
      </p>
      <Image
        src={reference}
        alt="당근 광고 성과 참고: 노출, 도달, 클릭, 클릭률, 클릭당 지출, 총 지출, 반응 및 단골·관심·쿠폰 다운로드"
        unoptimized
      />
    </details>
  );
}
