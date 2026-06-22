import pkg from "../../package.json";

/** package.json 의 버전(예: "0.1.0"). */
export const APP_VERSION = pkg.version;

/**
 * 배포 커밋 짧은 SHA. Vercel 빌드 시 VERCEL_GIT_COMMIT_SHA 로 주입된다.
 * 로컬 개발 등 값이 없을 땐 "dev".
 */
export const APP_COMMIT = process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? "dev";

/** 사이드바 등에 노출할 표시용 라벨(예: "v0.1.0 · a1b2c3d"). */
export const APP_VERSION_LABEL = `v${APP_VERSION} · ${APP_COMMIT}`;
