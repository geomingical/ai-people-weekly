# AI 與人週報：每週自動蒐集與發布設計

日期：2026-08-28

## 目標

讓 AI 與人週報在每週一台北時間 10:30 自動執行現有的研究蒐集流程，與 09:00 執行的教育週報錯開。流程必須先通過測試，才可抓取資料、呼叫模型、更新 `main` 與部署網站。

## 範圍

本次啟用既有的 `.github/workflows/weekly-digest.yml`，不重寫蒐集、篩選、摘要或部署程式。

- 將排程設為每週一 10:30（Asia/Taipei），對應 UTC cron `30 2 * * 1`。
- 將本機已有的 `NVIDIA_API_KEY` 與 `GROQ_API_KEY` 設為 repository-level GitHub Actions Secrets；金鑰不得進入 commit、log 或 workflow 輸出。
- 修正 workflow 中從教育週報複製而來、宣稱 09:00 與已啟用的過時註解。
- 將 pipeline 的新增筆數提升為 collect job output，並讓 deploy job 只在新增筆數大於 0 時執行；目前註解雖如此宣稱，但實際 YAML 尚未設定這個條件。
- 保留 `workflow_dispatch`，讓人可以手動指定回溯天數。
- 保留一般版面部署為手動操作；本次不替 `.github/workflows/deploy.yml` 增加 `push` 觸發。

## 不在本次範圍

- 不改變來源清單、相關性判準、摘要 schema、模型順序或故事內容。
- 不改成每週建立 PR；成功的自動週報仍直接更新 `main`。
- 不設定自訂網域。
- 不自動合併一般功能 PR。

## 執行流程

1. GitHub Actions 啟動 `Weekly digest`。
2. 安裝相依套件並執行現有測試。測試失敗時立即停止，不能抓取或發布。
3. 以 8 天回溯範圍執行 pipeline，涵蓋正常一週並容納排程時間邊界。
4. NVIDIA 是第一摘要提供者；只有第一提供者沒有產出時才使用 Groq。
5. pipeline 產生 run report，GitHub Actions Summary 顯示新增數量、提供者與來源警告，但不得顯示金鑰。
6. 若沒有新研究，不修改 repository，也不部署重複版本。
7. 若有新研究，先建置網站；建置失敗時不得 commit 或部署。
8. 建置成功後，只提交 `src/data/stories.json` 到 `main`，再部署 GitHub Pages。

## 啟用順序

採取「先手動驗證，再開排程」：

1. 設定兩個 GitHub Actions Secrets。
2. 在功能分支上完成 cron、註解與「零筆不部署」條件，推送並建立 PR，但先不合併；因此 `main` 的正式排程仍是關閉狀態。
3. 從該功能分支手動執行一次 `Weekly digest`，使用正常的 8 天回溯範圍。workflow 定義來自功能分支，但內容 checkout 與資料 commit 仍明確指向 `main`。
4. 檢查 Actions jobs、run report、遠端 `main` 是否只有預期資料變動，以及公開網站是否正常。
5. 只有首次手動流程成功，才合併排程 PR，讓每週一 10:30 的 cron 正式生效。

首次手動執行會立即使用模型 API 額度；若找到新研究，也會直接更新公開網站。這是本設計中刻意保留的端到端驗證。

## 失敗與停止條件

- 任一必要 GitHub Secret 缺少或無效：workflow 應失敗或產生零筆通過 gate 的內容；不得把未經 gate 接受的研究發布出去。
- 測試、pipeline 或建置失敗：不得 commit、不得部署。
- `git push` 因遠端 `main` 已改變而失敗：不得 force-push；保留失敗紀錄並人工處理。
- Pages 部署失敗：資料 commit 可能已存在於 `main`，但必須明確回報網站未更新，不得將資料提交成功等同於部署成功。
- 首次手動驗證失敗：保持 cron 關閉，先診斷失敗原因。

## 驗證標準

首次手動執行必須同時滿足：

- workflow 結論為 success。
- 測試 job 完成。
- run report 可辨識 outcome、stories added、provider 與來源警告。
- 若 stories added 大於 0，`main` 只新增預期的 `src/data/stories.json` commit，Pages deploy 成功，公開網址回傳 HTTP 200。
- 若 stories added 等於 0，沒有資料 commit，沒有 deploy；這是有效的負面結果，不算失敗。
- GitHub log、commit 與 repository 檔案不含 API Key。

排程 PR 合併後，另確認 workflow YAML 中仍保留手動入口，且 cron 為 `30 2 * * 1`。

## 成本與公開風險

- 每次執行會使用 NVIDIA；必要時使用 Groq，因此消耗對應 API 額度。
- 排程找到的新研究會在沒有逐篇人工審核的情況下公開。來源 registry、相關性 gate、schema 與建置是保護措施，但不能視為人工科學確認。
- 模型產生的中文摘要仍是模型輸出，不代表研究作者或領域專家的確認。

## 暫停與回復

若要停止自動發布，只需再次註解 `schedule`；保留 `workflow_dispatch` 供人工執行。若要停止模型存取，可另外刪除 repository Secrets。兩者是不同控制層，不應混為同一個動作。
