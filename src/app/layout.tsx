import type { Metadata } from "next";
import { Inter, Geist_Mono } from "next/font/google";
import "./globals.css";
import { ThemeProvider } from "@/components/theme-provider";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "SecondaryDesk",
  description: "VC 구주 세일즈 CRM — 만기 펀드 EXIT를 위한 구주 세일즈 활동 관리",
};

// 하이드레이션 전에 .dark/.light 클래스를 적용해 테마 깜빡임(FOUC) 방지.
// 서버 렌더 <script> 라 클라이언트가 재렌더하지 않음 → React 19 script 경고 없음.
// theme-provider 의 저장 키/기본값과 동일해야 함(THEME_STORAGE_KEY="theme", 기본 light).
const themeInitScript = `(function(){try{var t=localStorage.getItem("theme")||"light";var r=t==="system"?(window.matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light"):t;var d=document.documentElement;d.classList.remove("light","dark");d.classList.add(r);d.style.colorScheme=r;}catch(e){}})();`;

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="ko"
      suppressHydrationWarning
      className={`${inter.variable} ${geistMono.variable} h-full antialiased`}
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
        {/* 메인 폰트: Pretendard 가변폰트(동적 서브셋, CDN). 한글·영문 통일 표기. */}
        <link
          rel="stylesheet"
          href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@1.3.9/dist/web/variable/pretendardvariable-dynamic-subset.css"
        />
      </head>
      <body className="min-h-full flex flex-col">
        <ThemeProvider defaultTheme="light">{children}</ThemeProvider>
      </body>
    </html>
  );
}
