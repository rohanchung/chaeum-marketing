import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "채움 마케팅 운영 시트",
  description: "채움영어학원 풍무캠퍼스 마케팅 성과 관리",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return <html lang="ko"><body>{children}</body></html>;
}
