# AI 與人週報每週自動化 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 先以功能分支手動證明完整週報流程，再讓 AI 與人週報於每週一台北時間 10:30 自動蒐集、更新 `main` 並在有新研究時部署。

**Architecture:** 保留現有單一 `weekly-digest.yml` 流程與直接更新 `main` 的資料流，只新增精確 cron、把新增筆數提升為 job output，並以該 output 阻止零筆結果重複部署。排程設定先存在功能分支，從該分支手動執行成功後才允許合併，因此未驗證的 cron 不會先進入預設分支。

**Tech Stack:** GitHub Actions YAML、Vitest、Node.js 24、Astro、GitHub CLI、GitHub Pages

---

## 檔案結構

- Modify: `.gitignore` — 排除使用者指定的專案內 `.worktrees/` 隔離目錄；在實作開始前隨規劃文件提交。
- Modify: `.github/workflows/weekly-digest.yml` — 排程、job output、零筆不部署與正確操作註解。
- Modify: `tests/unit/guards.test.ts` — 將「禁止所有自動觸發」改成只允許本次核准的週一 10:30 排程，並鎖定零筆不部署條件。
- Create: `docs/superpowers/specs/2026-08-28-weekly-digest-automation-design.md` — 已批准的設計與風險邊界。
- Create: `docs/superpowers/plans/2026-08-28-weekly-digest-automation.md` — 本實作計畫。

### Task 1: 先用 guard tests 寫下核准的自動化邊界

**Files:**
- Modify: `tests/unit/guards.test.ts:13-63`
- Test: `tests/unit/guards.test.ts`

- [ ] **Step 1: 將「所有 workflow 都不能自動觸發」改成精確白名單測試**

以以下測試取代目前的 `has no automatic trigger at all` 與 `has no active cron` 測試；保留既有的 `never publishes on a push` 測試：

```ts
  const automaticTrigger = /^\s*(schedule|push|pull_request|pull_request_target|release):/;

  it.each(files.filter((name) => name !== 'weekly-digest.yml'))(
    '%s has no automatic trigger',
    (name) => {
      const lines = readFileSync(resolve(dir, name), 'utf8').split('\n');
      expect(lines.filter((line) => automaticTrigger.test(line))).toEqual([]);
    },
  );

  it('weekly-digest.yml has only the approved weekly trigger', () => {
    const body = readFileSync(resolve(dir, 'weekly-digest.yml'), 'utf8');
    const lines = body.split('\n');
    expect(lines.filter((line) => automaticTrigger.test(line))).toEqual(['  schedule:']);
    expect(/^\s*-\s*cron:\s*'([^']+)'/m.exec(body)?.[1]).toBe('30 2 * * 1');
    expect(body).toContain('workflow_dispatch:');
  });

  it('deploys only when the pipeline added stories', () => {
    const body = readFileSync(resolve(dir, 'weekly-digest.yml'), 'utf8');
    expect(body).toMatch(/collect:\n(?:.|\n)*?outputs:\n\s+added: \$\{\{ steps\.pipeline\.outputs\.added \}\}/);
    expect(body).toMatch(/deploy:\n\s+needs: collect\n\s+if: needs\.collect\.outputs\.added != '0'/);
  });
```

- [ ] **Step 2: 執行 guard tests，確認因功能尚未實作而失敗**

Run:

```bash
npx vitest run tests/unit/guards.test.ts
```

Expected: FAIL。錯誤必須指出 active `schedule` 尚不存在、cron 仍是註解狀態，或 collect output／deploy condition 尚不存在；不能是 TypeScript 語法錯誤。

### Task 2: 最小化修改 weekly workflow

**Files:**
- Modify: `.github/workflows/weekly-digest.yml:1-47`
- Modify: `.github/workflows/weekly-digest.yml:49-119`
- Test: `tests/unit/guards.test.ts`

- [ ] **Step 1: 修正 workflow 頂端的公開狀態說明**

將過時的教育週報網址、09:00 與「已啟用」敘述改成：

```yaml
# Weekly collection and publish for AI and People Weekly.
#
# Approved on 2026-08-28 after the site's first manual Pages deployment. The
# schedule is merged only after one manual run from the feature branch proves
# tests, collection, reporting, any data commit, and deployment end to end.
# Runs every Monday at 10:30 Taipei time, ninety minutes after the education
# weekly, so the two workflows do not compete for the same provider quota.
#
# To pause automatic publishing, comment out the two `schedule:` lines again.
# Keep workflow_dispatch available for deliberate manual runs.
```

- [ ] **Step 2: 啟用唯一核准的 cron，並保留手動入口**

將 `on` 區塊改成：

```yaml
on:
  schedule:
    - cron: '30 2 * * 1'   # 10:30 Taipei every Monday
  workflow_dispatch:
    inputs:
      since_days:
        description: 'How many days back to collect (8 = a normal week; use a larger number once to backfill the archive)'
        required: false
        default: '8'
```

- [ ] **Step 3: 將新增筆數傳出 collect job**

在 `collect` job 的 `runs-on` 與 `permissions` 之間加入：

```yaml
    outputs:
      added: ${{ steps.pipeline.outputs.added }}
```

- [ ] **Step 4: 讓零筆結果跳過 deploy job**

將 deploy job 開頭改成：

```yaml
  deploy:
    needs: collect
    if: needs.collect.outputs.added != '0'
    runs-on: ubuntu-latest
```

- [ ] **Step 5: 執行聚焦測試，確認由紅轉綠**

Run:

```bash
npx vitest run tests/unit/guards.test.ts
```

Expected: `tests/unit/guards.test.ts` PASS，且核准 cron、手動入口與零筆不部署三項 guard 都執行。

- [ ] **Step 6: 執行完整本機驗證**

Run:

```bash
npm run verify
git diff --check
```

Expected: 866 個既有 unit tests 加上新的 guard tests 全部通過；Astro 建置成功；12 個 browser tests 通過；`git diff --check` 無輸出。若測試總數因新增 guard 而增加，以實際輸出的零失敗為準，不把固定數字當成功條件。

### Task 3: 設定 repository Secrets

**Files:**
- Read only: `.env`
- External state: GitHub repository `geomingical/ai-people-weekly` Actions Secrets

- [ ] **Step 1: 從本機載入兩個既有金鑰，不輸出其值**

Run:

```zsh
set -a
source .env
set +a
test -n "$NVIDIA_API_KEY"
test -n "$GROQ_API_KEY"
```

Expected: commands exit 0，stdout 為空。不得執行 `env`、`printenv`、`echo $NVIDIA_API_KEY` 或任何會顯示值的命令。

- [ ] **Step 2: 將兩個金鑰寫入 GitHub Actions Secrets**

Run:

```zsh
gh secret set NVIDIA_API_KEY --repo geomingical/ai-people-weekly --body "$NVIDIA_API_KEY"
gh secret set GROQ_API_KEY --repo geomingical/ai-people-weekly --body "$GROQ_API_KEY"
```

Expected: 兩個 commands exit 0，且不顯示 secret value。

- [ ] **Step 3: 只驗證 Secret 名稱與更新時間**

Run:

```bash
gh secret list --repo geomingical/ai-people-weekly
```

Expected: 列出 `NVIDIA_API_KEY` 與 `GROQ_API_KEY`；GitHub 不會回傳值。

### Task 4: 精確提交實作並建立排程 PR，但先不合併

**Files:**
- Modify: `.github/workflows/weekly-digest.yml`
- Modify: `tests/unit/guards.test.ts`

規格、計畫與 `.gitignore` 已在建立隔離 worktree 前保存為規劃 commit；此 Task 只提交實作檔案，最終 PR 會同時包含兩個 commits。

- [ ] **Step 1: 精確 stage 兩個實作檔案**

Run:

```bash
git add -- \
  .github/workflows/weekly-digest.yml \
  tests/unit/guards.test.ts
git diff --cached --check
git diff --cached --name-only
```

Expected: cached name list 恰好是上述兩個路徑，沒有 `.env`、資料檔或建置產物。

- [ ] **Step 2: 建立單一功能 commit**

Run:

```bash
git commit -m "feat: schedule the people weekly after a proven run"
```

Expected: commit 成功，且 `git status --short` 為空。

- [ ] **Step 3: 推送功能分支**

Run:

```bash
git push -u origin feat/automate-weekly-digest
```

Expected: 遠端建立同名分支；`origin/main` 不變。

- [ ] **Step 4: 建立不合併的 PR**

Run:

```bash
gh pr create \
  --base main \
  --head feat/automate-weekly-digest \
  --title "Automate the weekly people digest at 10:30" \
  --body "Enable the approved Monday 10:30 Taipei schedule only after a manual branch run proves the workflow. The change also prevents zero-story runs from deploying and updates the workflow guard tests."
```

Expected: PR state 為 OPEN。到此不得 merge。

### Task 5: 從功能分支執行首次端到端週報

**Files:**
- External state: GitHub Actions run、可能更新的遠端 `main`、GitHub Pages
- Possible remote modification: `src/data/stories.json` only

- [ ] **Step 1: 記錄執行前的遠端 main 與資料 SHA**

Run:

```bash
git fetch origin main
git rev-parse origin/main > /tmp/ai-people-weekly-before-main.sha
gh api repos/geomingical/ai-people-weekly/contents/src/data/stories.json?ref=main \
  --jq '.sha' > /tmp/ai-people-weekly-before-stories.sha
```

Expected: 兩個暫存檔各含一個 SHA，供執行後比較；repository 內容不變。

- [ ] **Step 2: 從功能分支手動執行正常 8 天窗口**

Run:

```bash
gh workflow run weekly-digest.yml \
  --repo geomingical/ai-people-weekly \
  --ref feat/automate-weekly-digest \
  -f since_days=8
```

Expected: GitHub 建立 event=`workflow_dispatch`、headBranch=`feat/automate-weekly-digest` 的新 run。這一步會呼叫外部來源與模型，並可能直接更新遠端 `main` 與公開網站。

- [ ] **Step 3: 等待 run 結束，不以排隊或單一 job 成功冒充完成**

找出 run ID 並監看：

```bash
weekly_run_id=$(gh run list \
  --repo geomingical/ai-people-weekly \
  --workflow weekly-digest.yml \
  --branch feat/automate-weekly-digest \
  --event workflow_dispatch \
  --limit 1 \
  --json databaseId \
  --jq '.[0].databaseId')
test -n "$weekly_run_id"
gh run watch "$weekly_run_id" --repo geomingical/ai-people-weekly --exit-status
```

Expected: workflow conclusion=`success`。若 failure，停止，不合併 PR，不開啟正式排程。

- [ ] **Step 4: 判定零筆或有新增的實際分支**

Run:

```bash
weekly_run_id=$(gh run list \
  --repo geomingical/ai-people-weekly \
  --workflow weekly-digest.yml \
  --branch feat/automate-weekly-digest \
  --event workflow_dispatch \
  --limit 1 \
  --json databaseId \
  --jq '.[0].databaseId')
gh run view "$weekly_run_id" --repo geomingical/ai-people-weekly
git fetch origin main
before_main_sha=$(sed -n '1p' /tmp/ai-people-weekly-before-main.sha)
test -n "$before_main_sha"
git diff --name-only "$before_main_sha"..origin/main
```

Expected, exactly one branch:

- 零筆：`origin/main` SHA 不變，deploy job 顯示 skipped，這是成功的負面結果。
- 有新增：`origin/main` 前進，changed-name list 只有 `src/data/stories.json`，collect 與 deploy jobs 都成功。

若 changed-name list 包含其他路徑，停止並回報；不得繼續合併排程 PR。

- [ ] **Step 5: 若有部署，驗證公開網站而不只看 Actions 綠勾**

Run:

```bash
curl -sS -L -o /dev/null -w '%{http_code}\n' https://geomingical.github.io/ai-people-weekly/
```

Expected: HTTP `200`。零筆而 deploy skipped 時，既有網站仍可讀，但不得把既有 200 說成這次有部署。

- [ ] **Step 6: 檢查 provider 與來源報告**

在 run 的 Summary 中確認 `outcome`、`stories added`、`summaries`、`warnings` 與逐來源狀態存在；不得複製或輸出任何 Secret。若 CLI 無法取得 step summary，提供該 run 的 GitHub URL 供使用者查看，不自行猜測 provider 結果。

### Task 6: 報告首次結果並停在合併批准閘門

**Files:**
- No file changes

- [ ] **Step 1: 回報可驗證結果**

報告必須分開列出：workflow conclusion、是否新增故事、`main` 是否改變、Pages 是否真的重新部署、API/provider 報告是否可讀，以及任何 warnings。

- [ ] **Step 2: 請使用者明確批准是否合併排程 PR**

只有使用者明確批准 merge 後才能進入 Task 7。首次 run 成功不自動等於合併批准。

### Task 7: 合併後確認正式排程

**Files:**
- Remote modification: merge the approved scheduling PR into `main`

- [ ] **Step 1: 合併已批准的 PR**

Run:

```bash
schedule_pr_number=$(gh pr list \
  --repo geomingical/ai-people-weekly \
  --head feat/automate-weekly-digest \
  --state open \
  --json number \
  --jq '.[0].number')
test -n "$schedule_pr_number"
gh pr merge "$schedule_pr_number" --repo geomingical/ai-people-weekly --merge
```

Expected: PR state=`MERGED`，遠端 `main` 包含排程 commit。不得順便刪除分支或改啟其他 workflow trigger。

- [ ] **Step 2: 驗證遠端 main 的實際 workflow 設定**

Run:

```bash
gh api \
  -H 'Accept: application/vnd.github.raw+json' \
  repos/geomingical/ai-people-weekly/contents/.github/workflows/weekly-digest.yml?ref=main \
  | rg "schedule:|cron: '30 2 \* \* 1'|workflow_dispatch:|if: needs.collect.outputs.added != '0'"
```

Expected: 四項設定都存在於遠端 `main`。

- [ ] **Step 3: 驗證 Secrets 名稱、PR 與遠端分支狀態**

Run:

```bash
gh secret list --repo geomingical/ai-people-weekly
schedule_pr_number=$(gh pr list \
  --repo geomingical/ai-people-weekly \
  --head feat/automate-weekly-digest \
  --state merged \
  --json number \
  --jq '.[0].number')
test -n "$schedule_pr_number"
gh pr view "$schedule_pr_number" \
  --repo geomingical/ai-people-weekly \
  --json state,mergedAt,url
git ls-remote --heads origin main feat/automate-weekly-digest
```

Expected: 兩個 Secret 名稱存在、PR 已合併、`main` 指向 merge 後 SHA；功能分支保留，除非使用者另外批准刪除。

- [ ] **Step 4: 最終狀態說明**

清楚說明下一次預定執行是下一個星期一台北時間 10:30；GitHub scheduled workflow 可能因平台負載稍晚啟動。另提供 Actions、repository 與公開網站入口，不宣稱模型摘要經人工或專家確認。
