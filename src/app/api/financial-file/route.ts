import { type NextRequest } from "next/server";

import { getCurrentUser } from "@/lib/supabase/auth";

// 재무제표 원본 PDF 임베드용 프록시.
//   slab(Bubble CDN)의 크로스도메인 PDF를 same-origin·inline 으로 다시 내려주어
//   검토 다이얼로그 iframe 에서 바로 렌더되게 한다.
//   이 라우트는 (app) 밖이라 레이아웃 승인 게이트가 걸리지 않는다 → 여기서 직접 확인한다
//   (proxy.ts 세션 가드는 '로그인 여부'만 본다).
//   SSRF 방지: https + 허용 호스트(버블 CDN / sparkERP)만 통과.

export const dynamic = "force-dynamic";

const ALLOWED_HOST = /(\.cdn\.bubble\.io|(^|\.)sparkerp\.co\.kr)$/i;

export async function GET(req: NextRequest) {
  // 미승인 계정은 원본 재무제표를 받아갈 수 없다.
  const user = await getCurrentUser();
  if (!user?.profile?.approved) {
    return new Response("forbidden", { status: 403 });
  }

  const raw = req.nextUrl.searchParams.get("url");
  if (!raw) return new Response("missing url", { status: 400 });

  let target: URL;
  try {
    target = new URL(raw);
  } catch {
    return new Response("bad url", { status: 400 });
  }
  if (target.protocol !== "https:" || !ALLOWED_HOST.test(target.hostname)) {
    return new Response("forbidden host", { status: 403 });
  }

  const upstream = await fetch(target.toString(), {
    headers: { "User-Agent": "Mozilla/5.0" },
    cache: "no-store",
  });
  if (!upstream.ok) {
    return new Response(`upstream ${upstream.status}`, { status: 502 });
  }

  const buf = await upstream.arrayBuffer();
  const contentType =
    upstream.headers.get("content-type")?.split(";")[0] ?? "application/pdf";
  return new Response(buf, {
    status: 200,
    headers: {
      "content-type": contentType,
      "content-disposition": "inline",
      "cache-control": "private, max-age=300",
    },
  });
}
