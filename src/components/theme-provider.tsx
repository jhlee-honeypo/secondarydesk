"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";

// 경량 테마 프로바이더 (next-themes 대체).
// 깜빡임 방지 인라인 스크립트는 서버 컴포넌트(RootLayout <head>)에서 렌더하므로
// 여기서는 <script> 를 만들지 않는다 → React 19 의 "client script" 경고 없음.
// 다크모드 키잉은 globals.css 의 .dark 클래스(@custom-variant dark) 기준.

export type Theme = "light" | "dark" | "system";
export const THEME_STORAGE_KEY = "theme";
const THEMES: Theme[] = ["light", "dark"];

type ThemeContextValue = {
  theme: Theme;
  resolvedTheme: "light" | "dark";
  setTheme: (theme: Theme) => void;
};

const ThemeContext = createContext<ThemeContextValue | undefined>(undefined);

function systemTheme(): "light" | "dark" {
  return window.matchMedia("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light";
}

// .dark/.light 클래스 + color-scheme 적용. 전환 시 트랜지션 깜빡임 억제.
function applyTheme(resolved: "light" | "dark") {
  const el = document.documentElement;
  // 전환 애니메이션 일시 비활성(disableTransitionOnChange 동작)
  const style = document.createElement("style");
  style.appendChild(
    document.createTextNode(
      "*,*::before,*::after{transition:none!important}",
    ),
  );
  document.head.appendChild(style);

  el.classList.remove(...THEMES);
  el.classList.add(resolved);
  el.style.colorScheme = resolved;

  // 강제 reflow 후 스타일 제거 → 다음 변경부터 트랜지션 복원
  window.getComputedStyle(document.body);
  setTimeout(() => document.head.removeChild(style), 1);
}

export function ThemeProvider({
  children,
  defaultTheme = "light",
}: {
  children: React.ReactNode;
  defaultTheme?: Theme;
}) {
  const [theme, setThemeState] = useState<Theme>(defaultTheme);
  const [resolvedTheme, setResolvedTheme] = useState<"light" | "dark">("light");

  // 마운트 시 저장값 반영(인라인 스크립트가 이미 클래스는 적용해 둠)
  useEffect(() => {
    const stored = localStorage.getItem(THEME_STORAGE_KEY) as Theme | null;
    if (stored) setThemeState(stored);
  }, []);

  // 테마 변경 시 적용
  useEffect(() => {
    const resolved = theme === "system" ? systemTheme() : theme;
    setResolvedTheme(resolved);
    applyTheme(resolved);
  }, [theme]);

  // system 선택 시 OS 설정 변화 추종
  useEffect(() => {
    if (theme !== "system") return;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => {
      const resolved = systemTheme();
      setResolvedTheme(resolved);
      applyTheme(resolved);
    };
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, [theme]);

  // 다른 탭과 동기화
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === THEME_STORAGE_KEY) {
        setThemeState((e.newValue as Theme) || defaultTheme);
      }
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, [defaultTheme]);

  const setTheme = useCallback((next: Theme) => {
    try {
      localStorage.setItem(THEME_STORAGE_KEY, next);
    } catch {
      // localStorage 접근 불가(프라이빗 모드 등) — 메모리 상태만 갱신
    }
    setThemeState(next);
  }, []);

  const value = useMemo(
    () => ({ theme, resolvedTheme, setTheme }),
    [theme, resolvedTheme, setTheme],
  );

  return (
    <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
  );
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used within <ThemeProvider>");
  return ctx;
}
