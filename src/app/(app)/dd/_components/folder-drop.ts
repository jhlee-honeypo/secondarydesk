// 폴더 드롭/선택에서 파일을 모으는 유틸(클라이언트 전용).
//
// `DataTransfer.files` 는 **폴더를 포함하지 않는다** — 폴더를 떨어뜨리면 빈 목록이
// 온다. 폴더 안을 보려면 `DataTransferItem.webkitGetAsEntry()` 로 FileSystemEntry 를
// 얻어 재귀로 훑어야 한다.
//
// ⚠️ DataTransfer 는 이벤트 핸들러가 반환되면 무효화된다(neutered). 그래서
// `webkitGetAsEntry()` 호출은 **await 이전에 동기로** 끝내야 한다. 아래 함수는
// items → entries 변환까지를 동기 구간에 두고, 그 뒤부터 비동기로 훑는다.

/** macOS/Windows 가 폴더에 끼워 넣는 메타 파일. 올려 봐야 분류 비용만 든다. */
const JUNK = new Set([".DS_Store", "Thumbs.db", "desktop.ini", ".localized"]);

function isJunk(file: File): boolean {
  if (JUNK.has(file.name)) return true;
  // macOS 리소스 포크(._파일명)와 숨김 파일
  if (file.name.startsWith("._") || file.name.startsWith(".")) return true;
  // 폴더를 File 로 잘못 집은 경우(type 없고 크기 0)는 버린다
  if (file.size === 0 && !file.type) return true;
  return false;
}

function readFile(entry: FileSystemFileEntry): Promise<File | null> {
  return new Promise((resolve) => {
    entry.file(
      (f) => resolve(f),
      () => resolve(null),
    );
  });
}

/**
 * 디렉터리 한 겹을 전부 읽는다.
 *
 * ⚠️ `readEntries` 는 **한 번에 최대 100개**만 돌려주고, 더 없을 때 빈 배열을 준다.
 * 한 번만 호출하면 101번째부터 조용히 사라진다 — 실사 폴더가 그 크기를 넘는 일은
 * 드물지만, 누락이 '서류 미제출'로 둔갑하므로 끝까지 비울 때까지 반복한다.
 */
function readAllEntries(reader: FileSystemDirectoryReader): Promise<FileSystemEntry[]> {
  return new Promise((resolve) => {
    const all: FileSystemEntry[] = [];
    const step = () => {
      reader.readEntries(
        (batch) => {
          if (batch.length === 0) {
            resolve(all);
            return;
          }
          all.push(...batch);
          step();
        },
        () => resolve(all),
      );
    };
    step();
  });
}

async function walk(entry: FileSystemEntry, out: File[]): Promise<void> {
  if (entry.isFile) {
    const file = await readFile(entry as FileSystemFileEntry);
    if (file && !isJunk(file)) out.push(file);
    return;
  }
  if (!entry.isDirectory) return;

  const entries = await readAllEntries(
    (entry as FileSystemDirectoryEntry).createReader(),
  );
  // 하위 폴더까지 재귀 — 기업별 폴더 안에 '등기/재무' 같은 하위 폴더를 두는 경우가 흔하다.
  for (const child of entries) await walk(child, out);
}

/**
 * 드롭된 항목에서 파일을 모은다. 폴더면 안을 재귀로 훑고, 파일이면 그대로.
 * 반드시 drop 핸들러에서 **동기로 호출**할 것(DataTransfer 무효화 때문).
 */
export function collectDroppedFiles(dt: DataTransfer): Promise<File[]> {
  // ── 동기 구간 ──────────────────────────────────────────────────────────
  const entries: FileSystemEntry[] = [];
  for (const item of Array.from(dt.items ?? [])) {
    if (item.kind !== "file") continue;
    const entry = item.webkitGetAsEntry?.();
    if (entry) entries.push(entry);
  }
  // 폴백: webkitGetAsEntry 미지원 브라우저는 파일만이라도 건진다.
  const fallback = Array.from(dt.files ?? []);
  // ── 여기서부터 비동기 ───────────────────────────────────────────────────
  if (entries.length === 0) return Promise.resolve(fallback.filter((f) => !isJunk(f)));

  return (async () => {
    const out: File[] = [];
    for (const entry of entries) await walk(entry, out);
    return out;
  })();
}

/** `<input webkitdirectory>` 나 일반 파일 선택 결과를 같은 규칙으로 거른다. */
export function collectPickedFiles(list: FileList | null): File[] {
  return Array.from(list ?? []).filter((f) => !isJunk(f));
}
