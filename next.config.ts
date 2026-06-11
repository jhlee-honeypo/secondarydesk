import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    // 명함·투자사·매물 엑셀 임포트는 파싱한 행 전체를 Server Action 인자로 넘긴다.
    // 기본 1MB 제한으로는 대량 명함(수천 건) 업로드가 막히므로 한도를 올린다.
    serverActions: {
      bodySizeLimit: "10mb",
    },
  },
};

export default nextConfig;
