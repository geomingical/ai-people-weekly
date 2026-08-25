# AI 與人週報 — 設計規格

日期：2026-08-25
狀態：Ming 已審閱通過（2026-08-25）

> 這份規格用中文寫，因為它是給 Ming 審的。專案內的程式註解、README、HANDOFF
> 沿用 `AI_education` 的英文慣例。

---

## 1. 這是什麼

一個雙語靜態網站，每週從學術來源收集「AI 如何改變使用它的人」的研究，
每一則保留原標題、來源、原文連結，旁邊附上機器寫的繁體中文摘要。

沿用 `AI_education`（AI 教育週報）的全部骨架與安全規則，只換掉主題層。

**最重要的繼承規則：這個站自動發布，沒有人在上線前逐則審稿。**
編輯權在來源清單，不在逐則審核。所有設計都從這條規則推導出來。

### 收錄範圍

AI 對使用者的**心理、認知、社會關係**影響：

- 心理：奉承與迎合、依賴、陪伴與擬社會關係、孤獨、心理健康
- 認知：批判思考、認知外包、去技能化、記憶與學習
- 社會關係：親社會行為、信任與過度信賴、說服與觀點改變、誠實

**不收**：勞動市場衝擊、產業政策、AI 治理法規、模型能力本身、演算法公平性。

### 編輯界線（唯一一條硬規則）

**必須有真實的人被觀察、測量或訪談。**

- 收：實驗、隨機對照試驗、問卷調查、訪談、使用日誌分析、真實對話紀錄分析、長期追蹤。
- 不收：純模型行為研究、benchmark、參數調校、模型內部機制分析 —
  即使主題是奉承、操縱、依賴也不收。

範例（用來寫測試）：

| 論文 | 判定 | 理由 |
|---|---|---|
| Cheng et al., *Sycophantic AI decreases prosocial intentions and promotes dependence* | 收 | 有招募受試者做實驗 |
| *PCA-guided Activation Scaling for Monotonic Bidirectional Control over LLM Sycophancy* | 不收 | 純模型工程，沒有真人 |
| *Affective Context Amplifies Sycophancy in LLM Responses* | 待判 | 要讀摘要才知道有沒有真人；若只是模型對模型，不收 |
| *Large language models do not have emotions*（Nature Human Behaviour） | 待判 | 若是觀點文章而非實證研究，依「有無真人資料」判定 |

這條線只靠標題判斷不出來，守門的模型**必須讀摘要**。

---

## 2. 網站識別

| 項目 | 值 |
|---|---|
| 中文名 | AI 與人週報 |
| 英文名 | AI and People Weekly |
| 中文副標 | 每週追蹤 AI 如何改變使用它的人 |
| 英文副標 | A weekly read on what AI does to the people who use it |
| repo / 網址路徑 | `ai-people-weekly` |
| 部署 | GitHub Pages，`https://geomingical.github.io/ai-people-weekly/` |

> 名稱由 Ming 於 2026-08-25 確認。改名影響 `astro.config.mjs` 的 `base`、
> `package.json`、i18n 文案、README —— 若日後要改，這四處要一次改完。

---

## 3. 來源清單

全部已於 2026-08-25 實測：feed 真的回 feed、有內容、robots.txt 沒有針對
feed 路徑的禁止規則，也沒有整站封鎖。

### 3.1 第一層 — 主題專門期刊（整本訂閱）

| id | 期刊 | ISSN | feed 平台 | 抓到筆數 |
|---|---|---|---|---|
| `chb-artificial-humans` | Computers in Human Behavior: Artificial Humans | 2949-8821 | ScienceDirect | 98 |
| `chb` | Computers in Human Behavior | 0747-5632 | ScienceDirect | 60 |
| `chb-reports` | Computers in Human Behavior Reports | 2451-9588 | ScienceDirect | 100 |
| `ijhcs` | International Journal of Human-Computer Studies | 1071-5819 | ScienceDirect | 29 |
| `telematics-informatics` | Telematics and Informatics | 0736-5853 | ScienceDirect | 15 |
| `behaviour-info-tech` | Behaviour & Information Technology | 0144-929X | Taylor & Francis | 277 |
| `ijhci` | International Journal of Human–Computer Interaction | 1044-7318 | Taylor & Francis | 890 |
| `hci-journal` | Human–Computer Interaction | 0737-0024 | Taylor & Francis | 17 |
| `media-psychology` | Media Psychology | 1521-3269 | Taylor & Francis | 58 |
| `info-comm-society` | Information, Communication & Society | 1369-118X | Taylor & Francis | 218 |
| `new-media-society` | New Media & Society | 1461-4448 | SAGE | 294 |
| `big-data-society` | Big Data & Society | 2053-9517 | SAGE | 20 |
| `social-sci-comp-review` | Social Science Computer Review | 0894-4393 | SAGE | 101 |
| `communication-research` | Communication Research | 0093-6502 | SAGE | 90 |
| `tochi` | ACM Transactions on Computer-Human Interaction | 1073-0516 | ACM DL | 10 |
| `pacm-hci` | PACM on Human-Computer Interaction（CHI / CSCW） | 2573-0142 | ACM DL | 29 |
| `cyberpsychology-journal` | Cyberpsychology: J. of Psychosocial Research on Cyberspace | 1802-7962 | OJS | 12 |
| `jmir-mental-health` | JMIR Mental Health | 2368-7959 | JMIR Atom | 10 |
| `jmir` | Journal of Medical Internet Research | 1438-8871 | JMIR Atom | 10 |
| `nature-human-behaviour` | Nature Human Behaviour | 2397-3374 | Nature RDF | 9 |
| `nature-machine-intelligence` | Nature Machine Intelligence | 2522-5839 | Nature RDF | 9 |
| `nature-mental-health` | Nature Mental Health | 2731-6076 | Nature RDF | 9 |
| `nature-reviews-psychology` | Nature Reviews Psychology | 2731-0574 | Nature RDF | 8 |
| `npj-digital-medicine` | npj Digital Medicine | 2398-6352 | Nature RDF | 8 |
| `trends-cognitive-sciences` | Trends in Cognitive Sciences | 1364-6613 | Cell Press | 12 |
| `patterns` | Patterns | 2666-3899 | Cell Press | 12 |
| `psychological-science` | Psychological Science | 0956-7976 | SAGE | 8 |
| `lancet-digital-health` | The Lancet Digital Health | 2589-7500 | Lancet | 10 |

### 3.2 第二層 — 預印本與查詢式訂閱

| id | 來源 | 說明 |
|---|---|---|
| `arxiv-human-impact-query` | arXiv API 查詢 | 關鍵字寫進位址，伺服器端先過濾。**既有管線已支援，不需新程式。** |
| `arxiv-cs-hc` | arXiv cs.HC 全類別 | **初版設 `active: false`。** 量大，是否開啟由階段 0 的乾跑量測數字決定。 |
| `europepmc-query` | Europe PMC 查詢 API | **階段二**。一次涵蓋 PNAS、PLOS、Science Advances 及所有 PubMed 收錄的心理與醫學期刊。需要新的轉接器。 |

#### arXiv 查詢關鍵字

**關鍵字只在這裡真正決定看不看得見。** 第 3.1 節那 28 個期刊是整本訂閱，
守門的模型會讀到每一篇，關鍵字漏了不影響；只有 arXiv 查詢是「沒被關鍵字撈到
就永遠看不到」。所以這份清單是實測出來的，不是列舉出來的。

實測方法（2026-08-25）：拿 42 個候選詞去 arXiv 撈 2026-05-25 至 2026-08-25
三個月的論文，逐詞檢查撈回來的標題，再算覆蓋率。

**採用清單（23 個查詢，三個月 296 篇，約 23 篇／週）**

初版那 10 個全部保留：
`sycophancy`、`parasocial`、`"AI companion"`、`overreliance`、
`"cognitive offloading"`、`deskilling`、`anthropomorphism`、
`"human-AI" AND trust`、`"AI dependence"`、`chatbot AND loneliness`

新增 13 個（實測補進 76 篇，初版 10 詞的覆蓋率只有 **74%**）：
`"self-disclosure"`、`"companion chatbot" OR "social chatbot"`、
`"mental health" AND chatbot`、`"emotional support" AND chatbot`、
`"AI advice"`、`"trust calibration"`、`"reliance on AI"`、`companionship`、
`"automation bias"`、`longitudinal AND chatbot`、
`"emotional reliance" OR "emotional dependence"`、`"human-chatbot"`、
`"user well-being" OR "user wellbeing"`

新增詞撈到、而初版 10 詞完全漏掉的代表作：

- *AI advice suppresses people's willingness to say "I don't know", even when the advice is wrong*
- *Longitudinal Evidence That General-Purpose Chatbots Actively Foster Relational Engagement*
- *Love in the Age of AI: An Integrative Process Model of Romantic Human-Chatbot Relationships*
- *Stumbling Into AI Emotional Dependence: How Routine AI Interactions Reshape Human Connection*
- *Sweet Little Lies: Strategic Deception in AI Emotional Support Chatbots*
- *How People Evaluate AI-, Expert-, and Peer-Style Financial Advice*

**明確排除的詞 — 不要再加回來**

這些詞看起來很貼題，實測是雜訊產生器。加上去會多帶 410 篇進模型，
幾乎全是不相干的：

| 詞 | 實際撈到什麼 |
|---|---|
| `homogenization` | 數學物理的「均質化理論」：環面平移的對數律、21 公分吸收系統目錄 |
| `participants AND companion` | 天文：羅曼太空望遠鏡日冕儀社群參與計畫、鈉原子無鏡雷射 |
| `dependence AND LLM` | 「dependency parsing」「long-range dependence」，撈到 VAT 稅務試算 |
| `delegation AND AI` | 代理人架構論文，不是人受到的影響 |
| `human agency` | agentic AI 的架構設計 |
| `critical thinking` | 教育與學習領域 — 那是 AI 教育週報的地盤，不是這個站的 |
| `prosocial`（單獨用） | 多智能體強化學習，模型對模型，沒有人 |
| `attitude change` / `opinion change`（單獨用） | 無人機追蹤、視覺量測平台 |

#### 那個 74% 不是召回率 — 這個數字不可以拿來當「漏稿率」用

Codex 對抗式審查（2026-08-25 第二輪）指出這個方法學錯誤，**它是對的**。

74% 的分母是「我自己挑的 42 個候選詞所找到的聯集」。它只能說初版 10 詞佔了
這 42 詞找到的東西的 74%，**它量不到「42 個詞全部都漏掉的論文」**。

這件事之所以嚴重，是因為 arXiv 的關鍵字是**不可逆的前置過濾**：撈不到的論文
不會進守門、不會進執行報告、不會出現在任何地方。用同一套方法每季重測，也永遠
偵測不到自己的盲區。把 74% 當覆蓋率，會造成「高信心的靜默漏稿」。

**要求：用獨立母體量真正的召回率。** 方法：

1. 從同期的 cs.HC 全類別隨機抽 300 篇（不經任何關鍵字過濾）。
2. 用**本站的守門模型**（同一個提示詞）逐篇判定是否符合收錄範圍，得到銀標準集。
   — 不用人工標記，因為守門模型的判準就是本站的判準；用它標記量到的正是
   「我們自己想收、但關鍵字撈不到」的那些。
3. 算那 23 個查詢對這個銀標準集的召回率，並列出漏掉的清單。
4. 把這個抽樣程序、固定回歸樣本與最低召回門檻寫進 `docs/research/`，每季重跑。

#### 更乾脆的替代路線：不要前置過濾

如果召回率不夠好，還有一條路是**直接訂閱 cs.HC 整個類別，讓守門模型讀每一篇**，
關鍵字盲區直接消失。代價是量：

| 路線 | 每週進守門模型 | 關鍵字盲區 |
|---|---|---|
| 23 個查詢 | 約 23 篇 | 有，大小未知（待召回率測試） |
| cs.HC 整個類別 | 約 420 篇（實測單日 60 篇） | 沒有 |

**決議（2026-08-25）：走路線 B —— 訂閱 cs.HC 與 cs.CY 整個類別，不做關鍵字前置過濾。**

原本擋住路線 B 的唯一理由是模型成本。這個理由已經消失：Ming 的 NVIDIA 帳號
沒有總量計量，只有 40 RPM 的速率限制，而路線 B 一次執行約 105 次呼叫，
除以 40 約三分鐘 —— 對每週一次的批次工作不構成問題（見第 11 節）。

既然如此，**就不需要做召回率測試去估算「我漏了多少」，直接不過濾，盲區就不存在**。
這比量測盲區更徹底地解決了 Codex 指出的問題。

- 訂閱 `cs.HC`（人機互動）與 `cs.CY`（電腦與社會）整個類別。
  實測單日：cs.HC 60 篇、cs.CY 47 篇 → 合計約 750 篇／週。
- **上面那 23 個關鍵字查詢仍然保留**，但角色改變：它們不再是主要的過濾器，
  而是撈那些被歸類在 cs.HC／cs.CY 以外類別（cs.AI、cs.CL、econ、q-bio）的
  相關論文。每週約 23 篇，成本可忽略。
- 因此第 3.2 節的 `arxiv-cs-hc` 改為 `active: true`，並新增 `arxiv-cs-cy`。

**這個決議的代價要說清楚**：每週多 750 篇經過守門模型，而守門模型的判斷
直接決定什麼會在無人審閱的情況下上線。量變大，判錯的絕對次數也會變大。
這是刻意接受的取捨 —— 漏稿是看不見的，誤收是看得見且可修正的。

**維護方式**：這份清單會過時。每季重跑一次上面的召回率測試（不是重跑覆蓋率），
把結果記進 `docs/research/`。

### 3.3 第三層 — 機構調查

| id | 來源 | 說明 |
|---|---|---|
| `pew-internet` | Pew Research Center — Internet & Technology | 唯一做得出全國性使用者調查的來源。 |

### 3.4 有 feed 但拿不到 — 列在來源頁當人工閱讀清單

網站已支援「無 feed（人工閱讀清單）」這個顯示狀態（`sourcesNoFeed`）。
這些期刊很貼題，但沒有可用的自動化管道，`active: false`：

| 期刊 | ISSN | 狀況 |
|---|---|---|
| AI & Society | 0951-5666 | Springer 擋機器人（回機器人挑戰頁） |
| Minds and Machines | 0924-6495 | 同上 |
| Ethics and Information Technology | 1388-1957 | 同上 |
| Human Behavior and Emerging Technologies | 2578-1863 | Wiley RSS 404 |
| Cyberpsychology, Behavior, and Social Networking | 2152-2715 | Liebert RSS 404 |
| Technology, Mind, and Behavior | 2689-0208 | APA 回 403 |
| Journal of Computer-Mediated Communication | 1083-6101 | Oxford RSS 404 |

**規則沿用**：不得為了「修好」這些來源而繞過對方的封鎖。

---

## 4. 主題標籤

教育站的 8 個標籤整組換掉。新的 7 個：

| key | 中文 | English |
|---|---|---|
| `sycophancy` | 奉承與迎合 | Sycophancy |
| `dependence` | 依賴 | Dependence |
| `relationships` | 關係與陪伴 | Relationships |
| `trust` | 信任與過度信賴 | Trust and overreliance |
| `wellbeing` | 心理健康 | Wellbeing |
| `cognition` | 認知與思考能力 | Cognition |
| `social` | 社會行為 | Social behaviour |

一則最多掛 3 個標籤（沿用既有上限）。

---

## 5. 開放取用（Open Access）標籤 — 新功能

### 5.1 三種狀態，不是兩種

| 狀態 | 中文 | English | 意義 |
|---|---|---|---|
| `open` | 免費全文 | Open access | 確認有免費可讀的版本 |
| `restricted` | 需訂閱 | Subscription | 查到了，且沒有免費版本 |
| `unknown` | 未確認 | Not checked | 查不到（通常是太新，尚未被收錄） |

**`unknown` 絕不可顯示成 `restricted`。** 實測：Nature 一篇 2026-08-24
剛上線的論文，OpenAlex 查不到 — 剛發表的論文本來就會有一段空窗期。

### 5.2 怎麼查

查詢對象只有**通過守門、確定要發布的文章**（每週約數十則），不是全部 feed 項目。

1. **來源預設值**：確定整本免費的期刊，在來源清單標 `accessDefault: 'open'`，
   直接採用，不查詢。
   - 確定可直接標的：arXiv、PLOS、Frontiers、JMIR 系列、Big Data & Society、
     Cyberpsychology（Masaryk）。
   - **每一本都要在實作時逐一確認才能寫死**。實測發現 Computers in Human
     Behavior: Artificial Humans 的文章在 OpenAlex 上是 `closed`，
     不能因為它是新期刊就假設它免費。沒確認的一律走查詢。
2. **有 DOI**：`GET https://api.openalex.org/works?filter=doi:<doi>`
   （Nature、SAGE、T&F、ACM、Cell 都有帶 DOI）
3. **沒 DOI**：`filter=title.search:<正規化標題>`，且**只接受正規化後完全相符**
   的結果（ScienceDirect、JMIR 走這條）。正規化＝轉小寫、去掉所有標點與空白、
   去掉尾端句號後逐字元比對；不相符就當作查不到，寧可標 `unknown` 也不猜。
4. 查不到 → `unknown`

OpenAlex 免金鑰、免註冊。**不帶 `mailto` 參數** — 不把 Ming 的 email 送到
外部服務。用可識別的 User-Agent，並限速。

### 5.3 補查

**`unknown` 和 `restricted` 都要在往後 8 週的每次執行中重查一次**，查到就更新。
沿用 `resummarize.ts` 的模式寫一支獨立小工具，不塞進主流程。

`restricted` 也要重查的理由（Codex 對抗式審查 2026-08-25 指出）：OpenAlex 的
開放取用狀態來自 Unpaywall 那條資料鏈，**有同步延遲**。一筆 work 可能已經被
OpenAlex 收錄、但它的免費版本位置尚未同步；更常見的是作者事後把預印本存進
PMC 或 arXiv，狀態就會從 `closed` 變成 `green`。

**`restricted` 不是定論，是一個時間點的觀測。** 初版規格把它當成終身標籤，
讓「暫時還沒同步」永久顯示成「需訂閱」，而且沒有修正路徑。這是錯的。

測試要涵蓋：work 已存在但 OA location 尚未出現的情況。

### 5.4 顯示

每一則的標籤列加一個徽章。狀態為 `open` 且 OpenAlex 給了免費連結時，
額外顯示一個「免費版本」連結，並在旁邊標出該連結的網域，讓讀者知道會連去哪裡。

**原標題、來源名稱、原文連結一律不動。** 免費連結是額外的，不是替代的。

### 5.5 Schema 變更

`story` 記錄新增兩個欄位（這是 schema 變更，Ming 已核可）：

```
access:  'open' | 'restricted' | 'unknown'
openUrl: string | null
```

`source` 記錄新增一個欄位：

```
accessDefault: 'open' | null    // null = 逐篇查詢
```

---

## 6. 發表日期 — 以線上日期為主

Ming 的決定：**以線上發表日（online-first）為準，不是期別出版日。**
週報靠日期分期，這個欄位錯了整期就錯了。

每一家的寫法都不同，需要一個 `resolvePublishedAt()` 模組，按來源家族分派：

| 來源家族 | 日期在哪 | 格式 |
|---|---|---|
| ScienceDirect | 描述文字裡的 `Publication date: Available online 22 August 2026` | 要解析英文散文日期 |
| Nature（RDF） | `<dc:date>` | ISO 8601 |
| SAGE | `<dc:date>` | ISO 8601 |
| Taylor & Francis | `<dc:date>` | ISO 8601 |
| ACM DL | `<dc:date>` | ISO 8601 |
| Cell Press | `<dc:date>`（少數項目只有年月，見下） | ISO 8601 |
| JMIR（Atom） | `<published>`，退回 `<updated>` | ISO 8601 |
| **arXiv RSS**（`rss.arxiv.org/rss/<類別>`） | `<pubDate>` | RFC 822 |
| **arXiv 查詢 API**（`export.arxiv.org/api/query`） | **Atom `<published>`，退回 `<updated>`** | **ISO 8601** |
| Europe PMC（階段二） | `firstPublicationDate` | ISO 8601 |

**arXiv 的兩個來源格式不同，不可混為一談**（Codex review 2026-08-25 指出，已實測確認）：

- RSS 給的是 RFC 822 的 `<pubDate>`（實測：`Tue, 25 Aug 2026 00:00:00 -0400`）。
- 查詢 API 給的是 Atom 的 ISO 8601 `<published>` / `<updated>`
  （實測：`<published>2026-04-03T03:02:42Z`）。**查詢 API 是主要來源**，
  照 RSS 的格式實作會讓這個來源整個失效，每一筆都被判 `no-date`。
- 既有的 `feed-parser.ts` 已經正確處理 Atom（先讀 `published`，讀不到才退回
  `updated`），**不需要改程式**，但規格必須寫對，否則會誤導實作。

**arXiv 要用 `published` 而不是 `updated`。** `published` 是第一版投稿日，
`updated` 是最新改版日。用 `updated` 會讓舊論文每改一次版就重新冒出來一次；
用 `published` 則是「這篇第一次出現的時間」，正是週報要的。代價是四月投稿、
八月改版的論文不會在八月被收 — 這是刻意的取捨。查詢位址一律帶
`sortBy=submittedDate&sortOrder=descending`。

規則：
- 解析不出日期 → 用既有的 `no-date` 理由拒絕，不猜。
- **只有年月（`YYYY-MM`）→ 用新的拒絕理由 `imprecise-date` 擋掉，並記進執行
  報告的逐則明細。不猜日期。** 理由見下。
- 沿用既有的未來日期容忍度（6 小時）與拒絕機制。
- **每一種格式都要有單元測試，用實際抓到的字串當測資。**

### 6.1 為什麼只有年月的要擋掉，而不是猜一個日期

初版規格寫的是「只有年月就視為該月一日」。Codex review 指出這會靜靜吃掉文章：
若這一期的時間窗是 8/18–8/25，一篇標著 `2026-08` 的文章會被算成 8 月 1 日、
判定超出時間窗而丟棄，**而下一週的窗口只會更晚，等於永久消失**。這個批評成立。

但實測資料顯示這個情況的規模很小，而且集中在非文章上：

| feed | 完整日期 | 只有年月 | 只有年月的是哪幾筆 |
|---|---|---|---|
| Trends in Cognitive Sciences | 10 | 2 | 「Advisory Board and Contents」、「Subscription and Copyright Information」 |
| Patterns | 11 | 0 | — |

只有年月的兩筆都是版權頁與編輯委員名單，本來就會被守門邏輯擋掉。

因此採用「擋掉並記錄」而不是另建一套不確定性處理機制：

- **不猜日期** — 解決 Codex 指出的靜默誤置。
- **不蓋多餘機制** — 目前的資料裡沒有需要它的真實文章。
- **看得見** — 見下。

### 6.2 「看得見」必須是逐則明細，不能只有計數

Codex 的對抗式審查（2026-08-25 第二輪）指出：只有拒絕計數，看不出被拒的是
版權頁還是一篇真的研究；等計數引起注意時，那幾筆可能早就滾出 feed，連重跑
都救不回來。**這個批評成立，而且比表面更嚴重。**

查證既有程式碼：`ingest.ts` 的回傳值裡確實有逐則的 `rejected: { reason, title }[]`，
但 `run.ts` 只取用了它的長度與直方圖：

```
outcome.rejectCounts  = screened.rejectCounts;
outcome.itemsRejected = screened.rejected.length;
```

**逐則明細被算完就丟掉了**，`RunReport` 型別裡根本沒有承載它的欄位。
所以初版規格說的「看得見」在現況下是假的。

**要求**：執行報告必須為日期類與摘要類拒絕（`no-date`、`imprecise-date`、
`future-dated`、`outside-window`、`no-abstract`）保留逐則明細：

```
source id、原標題、URL、原始日期字串、首次發現時間
```

報告是寫進檔案的，所以就算該筆已經滾出 feed，URL 仍留在報告裡，人工點得進去。
這達成 Codex 要的可稽核性，而不需要蓋一整套 quarantine 與自動重新入列機制 —
後者是為目前尚未觀察到的情況預先建設。

**`not-relevant` 明確不做逐則明細（Ming 決定，2026-08-25）。**

同樣的觀測缺口也存在於 `not-relevant`：只有計數，看不出守門模型這週刷掉的是
哪幾篇。但在走了路線 B（訂閱 cs.HC + cs.CY 整類，約 750 篇／週）之後，
被判不相關的會是每週好幾百篇。**把它們逐則寫進報告，只會產生一份沒有人會讀的
清單**，而一份沒人讀的日誌不提供任何觀測能力，只是讓報告變大。

日期類拒絕的性質不同：它們**應該是零或極少**（實測只有版權頁），所以一旦出現
就值得逐則看。這是兩者差別的關鍵 —— 明細只對稀有事件有用。

若日後真的需要檢查守門模型的判斷品質，正確的做法是**抽樣**（隨機取 N 篇被拒
的做人工複核），不是全量記錄。

若日後 `imprecise-date` 的逐則明細裡開始出現真正的研究文章，再回頭做精度處理。

實測到的另一件事：Taylor & Francis 和 SAGE 的目次 feed **不是按時間排序**，
而且含有大量一年前的舊文章（T&F 的 IJHCI 一次回 890 筆，第一筆是
2025-12-17）。這不是問題 — 日期窗會濾掉 — 但它是每週要處理的資料量的主因。

---

## 7. 程式架構

**以 `AI_education` 複製一份為底，換掉主題層，骨架不動。**

### 7.1 完全不動

- Astro 網站骨架、元件、樣式、雙語路由
- `pipeline/src/feed-parser.ts` — 已支援 RSS 2.0、**RSS 1.0/RDF**（Nature 用這個）、
  Atom、JSON Feed。實測不需修改。
- `pipeline/src/fetcher.ts` — SSRF 網域白名單
- `pipeline/src/summarize/` — 摘要與防注入。**注入防禦是承重牆，不是裝飾。**
- 去重、ISO 週分期、執行報告
- `tests/unit/guards.test.ts` — 禁止全文上網、禁止打開排程觸發器

### 7.2 換掉

| 檔案 | 改什麼 |
|---|---|
| `src/data/sources.json` | 全新來源清單（第 3 節） |
| `pipeline/src/classify.ts` | 詞表整組換（第 4 節的 7 個標籤 + 主題詞彙） |
| `pipeline/src/classify-agent.ts` | 守門指示詞：加入「必須有真人參與」這條硬規則 |
| `src/domain/story.ts` | 標籤列舉、新增 `access` / `openUrl` |
| `src/domain/i18n.ts` | 全站中英文案 |
| `astro.config.mjs`、`package.json` | 名稱與路徑 |
| `README.md`、`CLAUDE.md`、`docs/HANDOFF.md` | 全部重寫 |

### 7.3 新增

| 檔案 | 做什麼 |
|---|---|
| `pipeline/src/published-at.ts` | 各家日期解析（第 6 節） |
| `pipeline/src/access.ts` | OpenAlex 查 OA 狀態（第 5 節） |
| `pipeline/src/refresh-access.ts` | 補查 `unknown`（獨立工具） |
| `pipeline/src/europepmc.ts` | **階段二**：Europe PMC 轉接器 |

### 7.4 摘要從哪裡來 —— 這是本設計最大的一個修正

**初版規格寫錯了。** 它說「ScienceDirect、SAGE、T&F、ACM 的 feed 都已經帶摘要」。
2026-08-25 逐一實測，事實相反：

| 出版社 | feed 的 description 內容 | 長度 |
|---|---|---|
| ScienceDirect（5 本） | 只有出版日期、期刊名、作者名單 | 144–173 |
| Taylor & Francis（5 本） | 只有卷、期、頁碼 | **52** |
| ACM（2 本） | 只有引用資訊 | 91 |
| SAGE（5 本） | 引用資訊 ＋ 摘要開頭殘句 | 326 |
| Nature（5 本） | 「Published online… doi…」＋ 標題重複 | 131–431 |
| Cell、JMIR、Cyberpsychology、Lancet、arXiv（6 個） | **完整摘要** | 543–2,615 |
| Pew | 一句導言（新聞型來源，足夠） | 110–156 |

**這件事會癱瘓整個設計**，因為第 1 節寫死了：「『有沒有真人參與』這條線只靠標題
判斷不出來，守門的模型必須讀摘要。」而 17 本期刊的 feed 不給摘要。

#### 摘要取得順位（fallback ladder）

實測驗證過的三層，依序嘗試：

1. **feed 自己帶的**（Cell、JMIR、Cyberpsychology、Lancet、arXiv、Pew）。
2. **OpenAlex 以 DOI 查詢**。實測命中率：
   Taylor & Francis 5/5、ACM 5/5、SAGE 5/5、ScienceDirect 4/5。
   摘要長度 750–1,650 字元，足夠守門模型判斷。
3. **抓出版社的文章頁**（僅限 robots.txt 允許者）。目前只有 Nature 走這條。

取不到 → 用新的拒絕理由 **`no-abstract`** 擋掉，並列入第 6.2 節的逐則明細。

#### 各出版社走哪一條，以及為什麼

| 出版社 | 摘要來源 | 依據 |
|---|---|---|
| Cell / JMIR / Cyberpsychology / Lancet / arXiv / Pew | feed | 已帶完整摘要 |
| Taylor & Francis / ACM / SAGE | OpenAlex（DOI） | 實測 15/15 命中 |
| ScienceDirect | OpenAlex（DOI 或標題） | 實測 4/5 命中。**文章頁絕對不可抓** |
| Nature（5 本） | **抓文章頁** | OpenAlex 對 Nature 命中率只有 35–50%（見下） |

#### 為什麼 ScienceDirect 的文章頁不可以抓

`www.sciencedirect.com/robots.txt` 對一般客戶端直接回 **403**，而且回應頁面帶著
`<meta name="tdm-reservation" content="1">` 與指向 Elsevier TDM 政策的連結 ——
**這是明確的、機器可讀的文字與資料探勘保留聲明**。連 robots.txt 本身都讀不到的
網站，不能去抓它的文章頁。

feed 主機（`rss.sciencedirect.com`）是另一台，讀 feed 沒有問題。

ScienceDirect 那 20% OpenAlex 查不到的，就用 `no-abstract` 擋掉並記錄。

#### 為什麼 Nature 例外，要抓文章頁

OpenAlex 對 Nature 的摘要覆蓋不是延遲問題，是**永久性的不完整**：
取樣 2026 上半年（已出版半年以上）的文章，Nature Human Behaviour 只有 35% 有摘要，
Nature Machine Intelligence 50%。Springer Nature 交摘要給索引服務的習慣不穩定。

而 `www.nature.com/robots.txt` **允許** `/articles/`（只擋 `/figures`、`/tables`、
`/metrics`、`*.ris` 等子路徑）。實測抓取研究論文頁：HTTP 200，摘要在
`id="Abs1-content"` 區塊內，約 1,100 字元，可穩定取出。

News & Views、Comment 這類短文本來就沒有摘要區塊 → 走 `no-abstract`，正確。

#### 這對流程順序的影響

**摘要補完必須排在守門之前**，因為守門模型要讀它。流程從：

```
篩選 → 守門 → 收錄 → 抓全文 → 摘要
```

改為：

```
篩選 → 摘要補完（feed／OpenAlex／文章頁）→ 守門 → 收錄 → 中文摘要
```

**因此 OpenAlex 不再是「開放取用徽章」的附屬功能，而是承重結構**：28 本期刊裡
有 17 本的守門判斷依賴它。它的失敗處理要照承重元件的標準寫，不是照裝飾品。

一次 OpenAlex 呼叫同時取得摘要與開放取用狀態，只對通過篩選的候選項目發出，
每週約 50 次，成本可忽略。

#### 實作陷阱（實測踩到的）

**feed 裡的 DOI 後面會黏著網址參數。** Taylor & Francis 的 feed 給的是
`10.1080/10447318.2025.2598113?af=R`，直接拿去查 OpenAlex 會全部落空。
**必須在 `?` 與 `#` 處截斷。** 這個 bug 在研究階段造成兩次錯誤的量測結果
（一度誤判命中率只有 16%，實際是 76%）。要寫測試把它釘住。

### 7.5 模型供應商

Ming 的決定：**把 DeepSeek 換成 Groq。** 主要供應商維持 NVIDIA，備援改 Groq。

```
providers:
  1. nvidia  — baseUrl https://integrate.api.nvidia.com/v1, key: NVIDIA_API_KEY
  2. groq    — baseUrl https://api.groq.com/openai/v1,      key: GROQ_API_KEY
```

**模型名稱不在這份規格裡寫死。** 實作時先呼叫 `GET /openai/v1/models` 取得
當下可用清單，挑一個同時滿足兩個條件的：支援結構化 JSON 輸出、繁體中文品質可用。
挑完把選擇理由記進 `pipeline/config/agents.json` 的註解。

環境變數：`NVIDIA_API_KEY`（主要）、`GROQ_API_KEY`（備援）。
教育站那組 `AI_EDU_API_KEY` / `AI_EDU_FALLBACK_API_KEY` 的別名不沿用 —
兩個專案共用同一台機器，別名相同會讓人搞不清楚哪個站在用哪把金鑰。
`.env` 一律不讀、不印、不提交。

---

## 8. 分階段

| 階段 | 內容 | 產出 |
|---|---|---|
| 0 | 複製骨架、改名、清空教育層、寫入來源清單、**跑一次乾跑量測** | 知道每週實際資料量與模型成本 |
| 1 | 新守門邏輯 + 日期解析 + 標籤 + OA 查詢 + 文案 + 測試 | 本機 `npm run verify` 全綠 |
| 2 | Europe PMC 轉接器 | 涵蓋 PNAS / PLOS / Science Advances |
| 3 | 部署與開排程 | **人工檢查點：要 Ming 明確同意才做** |

階段 0 的乾跑結果出來之前，不承諾成本數字。

---

## 9. 明確不做

沿用教育站的界線，加上這個主題特有的：

- 不轉載全文（摘要一律截斷 + 連回原文）
- 不評分、不排名、不做引用數或影響因子（那是排名的另一種形式）
- 不做廣告、聯盟連結、讀者帳號、分析追蹤
- 不代管 PDF
- 不繞過任何出版社的封鎖
- 不把 Ming 的 email 送給任何外部服務
- 不擴大 SSRF 白名單到共用平台網域

---

## 10. 已知風險

1. **成本上升幅度未知。** 教育站每週約 108 則進模型；這裡粗估 300–600 則。
   階段 0 的乾跑會給出實際數字，之後再決定要不要關掉量最大的來源。
2. **「有無真人參與」這條線會判錯，而且錯了就直接上線。**
   建議第一次上線前先人工看一輪乾跑結果。Ming 已表示這部分自己看即可。
3. **期刊日期髒。** 第 6 節已針對每一家設計解析規則，但只有實跑才知道有沒有漏。
4. **OpenAlex 的 `unknown` 空窗期。** 最新的論文查不到 OA 狀態，這是常態不是錯誤。
5. **T&F / SAGE 目次 feed 含大量舊文章。** 靠日期窗處理，但這是資料量的主因。


---

## 11. 每週用量與供應商限額

### 11.1 實測週流量（2026-08-25）

逐一抓取第 3 節的每個 feed，解析日期後統計落在近 7 天與近 30 天的項目：

| 來源群 | 近 7 天 | 近 30 天 |
|---|---|---|
| 期刊 28 個 + Pew | **97 篇** | 267 篇（平均每週 62 篇） |

高產的來源：`ijhci` 17 篇／週、`chb-artificial-humans` 10 篇、`jmir` 10 篇、
`nature-human-behaviour` 8 篇、`npj-digital-medicine` 8 篇。
零產出的：`pacm-hci`、`cyberpsychology`、`trends-cognitive-sciences`、
`psychological-science` — 這幾本本來就是季刊或不定期，屬正常。

### 11.2 **警告：小 feed 可能在兩次執行之間就翻頁**

實測發現一個第 6 節沒涵蓋的問題：Nature 系列與 JMIR 的 feed **總長只有 8–10 筆，
而且全部都落在近 7 天內**。這代表這些 feed 是一個滾動視窗，它翻頁的速度可能
比每週執行一次還快。

若 Nature Human Behaviour 某週發表 15 篇，我們只會看到最新的 8 篇，**另外 7 篇
永遠不會被看到，而且不會出現在任何拒絕統計裡** —— 它們根本沒進過管線。

這比第 6 節處理的日期問題更會漏稿，因為它連「被拒絕」的痕跡都不會留下。

**可能的處理方式（待階段 0 決定）**：
- 抓取頻率與發布頻率脫鉤：每天抓、每週發。抓到的存起來，週日組期。
- 或：對這幾個小 feed 記錄「上次看到的最舊一筆」，若兩次執行之間整個 feed
  都換新了，就在報告裡發警告，代表中間漏了東西。

推薦第二個先做（便宜、只是一個檢查），視警告頻率再決定要不要改成每天抓。

### 11.3 模型呼叫次數推算

既有實作的參數：守門模型每批 **12 篇**（`CLASSIFY_BATCH_SIZE = 12`），
每篇標題上限 300 字元、摘錄上限 600 字元 → 每次呼叫約 4,000 tokens。
摘要模型每篇文章一次呼叫。

**本站的摘要輸入是「論文摘要」，不是全文** —— 期刊 feed 已經帶了 abstract，
一篇約 1,000–2,000 字元，遠低於教育站設定的 `maxInputChars: 24000`
（那是為新聞全文設的）。**這個上限應該調低**，既省成本也縮小提示注入的受攻擊面。

| | 路線 A（23 個 arXiv 查詢） | 路線 B（cs.HC 整類） |
|---|---|---|
| 進守門模型 | 約 120 篇／週 | 約 517 篇／週 |
| 守門呼叫 | 約 10 次 | 約 43 次 |
| 摘要呼叫 | 約 15–30 次 | 約 20–40 次 |
| **每次執行總呼叫** | **約 25–40 次** | **約 63–83 次** |
| 每次執行總 tokens | 約 80k | 約 220k |

### 11.4 兩家供應商的限額

**NVIDIA NIM（build.nvidia.com）**
- 速率：**40 RPM** — Ming 於 2026-08-25 在自己的儀表板上確認
  （「Your API Rate Limit Up to 40 rpm」）。
  對本站不構成限制：單次執行最多 83 次呼叫，除以 40 約三分鐘，而這是每週
  跑一次的批次工作。
- 額度：**儀表板上沒有任何 credits 餘額或已用量計量**（Ming 於 2026-08-25 確認）。
  該帳號是被速率管，不是被總量管。

  **速率限制與總額度是兩回事**：40 RPM 是節奏限制，等一等就好、永遠不會用完；
  credits 是存量，用完就停。既然沒有餘額計量，本設計按「沒有總量上限」進行。

  **但這不是證明。** 看不到計量不等於不存在上限。因此：階段 0 的乾跑要記錄
  實際呼叫次數，且 429 的處理與供應商切換必須真的能運作 —— 若真有隱藏上限，
  它會以 429 的形式現身，而不是以一則公告。

**Groq**
- 速率：**30 RPM、6,000 TPM、14,400 RPD**
- 官方文件的 rate-limits 頁面**沒有列出免費方案的具體數字**（只列了
  Developer 方案，例如 gpt-oss 系列 30 RPM / 1K RPD / 8K TPM / 200K TPD）。
  上面的免費方案數字來自第三方彙整，**不是官方來源，實作時必須以帳號自己的
  限額頁與回應標頭為準**。

### 11.5 結論與建議

**速率限制不是問題。額度才是。**

- 每次執行 25–83 次呼叫，對 40 RPM / 30 RPM 而言只是排程問題，既有程式已經
  在批次之間有間隔，加上摘要階段的間隔即可。
- Groq 的 **6,000 TPM** 是最緊的一條，但因為本站摘要的是 abstract（約 1,500
  tokens）而不是全文，每次呼叫都塞得進去。**前提是 `maxInputChars` 要從 24,000
  調低** —— 若沿用 24,000，單一次摘要呼叫就會吃掉整分鐘的 token 預算而被 429。
- NVIDIA 的 1,000 credits 若不補充，路線 A 約撐 25–40 次執行（半年到九個月），
  路線 B 約撐 12–15 次執行（三個月）—— **而且要跟教育站對半分**。

**決議（2026-08-25）：NVIDIA 在前，Groq 備援。**

依據：Ming 的 NVIDIA 帳號只有速率限制、沒有餘額計量，所以沒有「額度會用完」
的壓力。而 AI 教育週報已經在 NVIDIA 上跑了數週，繁中摘要品質是經過驗證的實績；
Groq 的中文品質尚未驗證。沒有非換不可的理由時，不拿已證明可用的換未驗證的。

**無論走哪一種，這兩件事都要做**：
1. `maxInputChars` 從 24,000 調低到約 6,000 —— 本站摘要的是 abstract 不是全文，
   沿用舊值會讓 Groq 的單次呼叫吃掉整分鐘的 token 預算而被 429。
2. 實作時實測 Groq 上所選模型的繁體中文品質，把結果記進
   `pipeline/config/agents.json` 的註解。備援模型寫出來的中文如果不能用，
   那個備援就是假的。
