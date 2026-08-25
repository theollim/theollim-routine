더올림수학 학생 루틴 앱 — 세련된 디자인 수정본

구성
- index.html: 학생용 화면 전체
- api/links.js: Tally 링크 자동 연결
- api/study-log.js: 학습 완료 기록 전송

배포
1. 이 폴더 전체를 ZIP으로 압축합니다.
2. https://vercel.com/drop 에 ZIP 파일을 올립니다.
3. Vercel 프로젝트의 환경 변수에 필요한 값을 등록합니다.

필수 환경 변수
- TALLY_API_KEY
- NOTION_KEY

선택 환경 변수
- STUDY_DB_ID: 기본 학습 기록 DB가 아닌 다른 DB를 사용할 때만 등록합니다.

이번 수정에서는 기존 학습 데이터와 동작을 유지하고 화면 디자인만 정돈했습니다.
