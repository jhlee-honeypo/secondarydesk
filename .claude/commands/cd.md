---
description: 변경사항을 검증(lint+typecheck)한 뒤 main에 커밋·푸시하여 Vercel 배포를 트리거
---

현재 작업트리의 변경사항을 커밋하고 배포한다. 아래 순서를 그대로 따른다.

1. **검증** — 타입체크(전체) + 린트(변경 파일만)를 돌린다:
   - 타입체크는 전체: `npx tsc --noEmit` (타입은 프로젝트 전체 그래프라 전체 검사)
   - 린트는 **이번에 변경된 파일만** 대상으로 한다(기존 무관 파일의 린트 이슈로 멈추지 않게). 변경 + 미추적 파일 중 `.ts/.tsx/.js/.jsx`만 추려서 eslint 실행:
     ```bash
     files=$( { git diff --name-only HEAD; git ls-files --others --exclude-standard; } | sort -u | grep -E '\.(ts|tsx|js|jsx)$' || true )
     if [ -n "$files" ]; then npx eslint $files; else echo "린트할 변경 JS/TS 파일 없음"; fi
     ```
   - 둘 중 하나라도 **오류**가 나면 여기서 **멈추고** 오류 내용을 보고한다. 절대 깨진 코드를 푸시하지 않는다. (경고만 있으면 진행)

2. **변경 확인** — `git status` / `git diff` 로 무엇이 바뀌었는지 파악한다. 변경이 없으면 "커밋할 변경 없음"이라 알리고 종료한다.

3. **커밋** — `git add -A` 후 커밋한다.
   - 메시지는 한국어로, 이 저장소 컨벤션을 따른다: `feat:` / `fix:` / `refactor:` 등 접두사 + 변경 요약. 본문에 핵심 변경을 불릿으로 정리한다.
   - 사용자가 `$ARGUMENTS` 로 메시지를 주면 그것을 제목으로 사용한다. 없으면 diff를 보고 직접 작성한다.
   - 메시지 끝에 다음 트레일러를 붙인다:
     `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`

4. **푸시 = 배포** — `git push origin main`. 이 저장소는 Vercel git 연동이라 `main` 푸시가 곧 프로덕션 배포다.

5. **보고** — 커밋 해시와 "Vercel 자동 배포 시작됨"을 알린다. 변경에 `supabase/migrations/` 파일이 포함됐다면, 코드 배포와 별개로 프로덕션 DB에 마이그레이션 적용이 필요함을 상기시킨다.

주의: 이 프로젝트의 기존 워크플로대로 항상 `main` 브랜치에 직접 커밋·푸시한다.
