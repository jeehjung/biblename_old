# Cloudflare 배포

앱 화면과 기록 API를 Cloudflare Worker `bible-quiz-api` 하나로 제공합니다.

- 주소: https://bible-quiz-api.jeeh.workers.dev/
- 코드 저장소: GitHub `jeehjung/biblename_old` (2026-11-10 `JungJeehyun/bible_old`에서 이전, GitHub Pages: https://jeehjung.github.io/biblename_old/)
- 업로드할 모듈: `worker/worker.js` (메인), 저장소 루트의 `index.html` (모듈 이름 `index.html`, 텍스트 모듈)
- 바인딩: KV `PLAYERS` → 네임스페이스 `bible-quiz-players`

`index.html`을 고친 뒤에는 GitHub에 올리는 것과 별도로 Worker도 다시 업로드해야 Cloudflare 주소에 반영됩니다.
