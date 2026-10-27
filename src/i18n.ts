export type Locale = 'en' | 'ko';

export const copy = {
  en: {
    app: 'Script Reader', interfaceLanguage: 'Interface language', settings: 'Script settings', settingsButton: 'Settings',
    scriptFile: 'Script file', open: 'Open Script', drop: 'or drop CSV', character: 'Character',
    castFile: 'Cast file', openCast: 'Open Cast', removeCast: 'Remove cast',
    selectCharacter: 'Select character', context: 'Context', before: 'Before', after: 'After',
    actions: 'Include actions & cues', korean: 'Display Korean lines',
    script: 'Script', opening: 'Opening…', checkCsv: 'Check the CSV', file: 'File',
    chooseCharacter: 'Select a character', openPrompt: 'Open a script', noMatches: 'No matches.',
    passage: 'Rehearsal passage', contribution: 'Your contribution', scene: 'SCENE',
    print: 'Print / Save PDF', preparingPrint: 'Preparing print…', printError: 'Print font could not load.', retry: 'Retry',
    play: 'Play video', openYoutube: 'Open on YouTube', reload: 'Reload script', allowance: (n: number) => `${n}/5 characters today`,
    apiError: { not_found: 'Production not available.', invalid_request: 'Check the selection.', quota: 'Daily character allowance reached.', rate: 'Too many requests. Try again shortly.', revision_changed: 'The script has been updated. Reload to continue.', unavailable: 'Unable to load the script. Please retry.' },
    allowanceResets: 'Character allowance resets at:', retryAt: 'Try again after:',
    record: (n: number) => `CSV record ${n}`,
    summary: (lines: number, scenes: number) => `${lines} ${lines === 1 ? 'line' : 'lines'} · ${scenes} ${scenes === 1 ? 'scene' : 'scenes'}`,
  },
  ko: {
    app: 'Script Reader', interfaceLanguage: '화면 언어', settings: '대본 설정', settingsButton: '설정',
    scriptFile: '대본 파일', open: '대본 열기', drop: '또는 CSV 파일 놓기', character: '배역',
    castFile: '배역 목록 파일', openCast: '배역 목록 열기', removeCast: '배역 목록 제거',
    selectCharacter: '배역 선택', context: '앞뒤 내용', before: '앞', after: '뒤',
    actions: '동작·큐 포함', korean: '한국어 표기',
    script: '대본', opening: '여는 중…', checkCsv: 'CSV 파일을 확인하세요', file: '파일',
    chooseCharacter: '배역을 선택하세요', openPrompt: '대본을 열어 주세요', noMatches: '해당 내용이 없습니다.',
    passage: '연습 구간', contribution: '내 참여 부분', scene: '장면',
    print: '인쇄 / PDF 저장', preparingPrint: '인쇄 준비 중…', printError: '인쇄 글꼴을 불러올 수 없습니다.', retry: '다시 시도',
    play: '영상 재생', openYoutube: 'YouTube에서 열기', reload: '대본 새로고침', allowance: (n: number) => `오늘 배역 ${n}/5개`,
    apiError: { not_found: '공개된 작품이 없습니다.', invalid_request: '선택한 내용을 확인하세요.', quota: '오늘 선택할 수 있는 배역 수를 초과했습니다.', rate: '요청이 너무 많습니다. 잠시 후 다시 시도하세요.', revision_changed: '대본이 업데이트되었습니다. 새로고침해 주세요.', unavailable: '대본을 불러오지 못했습니다. 다시 시도하세요.' },
    allowanceResets: '배역 선택 한도 초기화 시각:', retryAt: '다시 시도할 수 있는 시각:',
    record: (n: number) => `CSV ${n}번째 레코드`,
    summary: (lines: number, scenes: number) => `대사 ${lines}개 · 장면 ${scenes}개`,
  },
};
export type Copy = typeof copy.en;

/** Translate diagnostics around source identifiers; never translate or alter script text. */
export function diagnosticMessage(message: string, locale: Locale): string {
  if (locale === 'en') return message;
  const fixed: Record<string, string> = {
    'The script contains no records.': '대본에 레코드가 없습니다.',
    'Must be a positive safe integer.': '0보다 큰 안전한 범위의 정수여야 합니다.',
    'Duplicate source identifier.': '원본 번호가 중복되었습니다.',
    'Source identifiers must be increasing.': '원본 번호는 오름차순이어야 합니다.',
    'Content is required.': '내용이 필요합니다.',
    'Duplicate classification token.': '유형 토큰이 중복되었습니다.',
    'Use distinct individual tokens separated by semicolons, without empty tokens or embedded whitespace.': '개별 배역 토큰을 세미콜론으로 구분하세요. 중복, 빈 토큰, 토큰 내부 공백은 허용되지 않습니다.',
    'Dialogue requires a speaker label.': '대사에는 화자 이름이 필요합니다.',
    'Must be Y or blank.': 'Y 또는 빈 값이어야 합니다.',
    'The file could not be read. Please try opening it again.': '파일을 읽을 수 없습니다. 다시 열어 주세요.',
    'Opening the file was interrupted. Please try again.': '파일 열기가 중단되었습니다. 다시 열어 주세요.',
    'Unable to open the file.': '파일을 열 수 없습니다.',
    'Please open one script file at a time.': '대본 파일을 하나씩 열어 주세요.',
    'Please open one CSV file per control.': '각 버튼에서 CSV 파일을 하나씩 열어 주세요.',
    'The cast contains no characters.': '배역 목록이 비어 있습니다.',
    'Each cast row requires one individual tag without whitespace, commas or semicolons.': '각 배역 행에는 공백·쉼표·세미콜론이 없는 개별 태그가 하나 필요합니다.',
    'Duplicate cast tag.': '배역 태그가 중복되었습니다.',
    'A character name is required.': '배역 이름이 필요합니다.',
    'Quoted field unterminated': '따옴표로 시작한 필드가 닫히지 않았습니다.',
    'Trailing quote on quoted field is malformed': '필드를 닫는 따옴표 형식이 올바르지 않습니다.',
  };
  if (fixed[message]) return fixed[message];
  let match = message.match(/^Expected headers in this order: (.*)\.$/);
  if (match) return `다음 순서의 헤더가 필요합니다: ${match[1]}.`;
  match = message.match(/^Expected (\d+) fields; received (\d+)\.$/);
  if (match) return `필드 ${match[1]}개가 필요하지만 ${match[2]}개입니다.`;
  match = message.match(/^Use only: (.*)\.$/);
  if (match) return `허용되는 유형: ${match[1]}.`;
  match = message.match(/^Character token (.*) has conflicting speaker labels\.$/);
  if (match) return `배역 토큰 ${match[1]}에 서로 다른 화자 이름이 연결되어 있습니다.`;
  match = message.match(/^Character token (.*) needs a single-character dialogue record to identify its name\.$/);
  if (match) return `배역 토큰 ${match[1]}의 이름을 확인할 수 있는 단독 배역 대사 레코드가 필요합니다.`;
  match = message.match(/^Character token (.*) is missing from the cast roster\.$/);
  if (match) return `배역 토큰 ${match[1]}이 배역 목록에 없습니다.`;
  return message;
}
