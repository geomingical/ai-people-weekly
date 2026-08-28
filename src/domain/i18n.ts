import type { Locale } from './story';

// Typed message catalog. `MessageKey` is a union of the keys below, so a
// missing translation is a compile error rather than a runtime fallback —
// bilingual completeness is guaranteed at build time, not by review.
export const messages = {
  siteTitle: { 'zh-tw': 'AI 與人週報', en: 'AI and People Weekly' },
  siteTagline: {
    'zh-tw': '每週追蹤 AI 如何改變使用它的人',
    en: 'A weekly read on what AI does to the people who use it',
  },
  skipToContent: { 'zh-tw': '跳至主要內容', en: 'Skip to content' },

  navThisWeek: { 'zh-tw': '本週', en: 'This week' },
  navArchive: { 'zh-tw': '往期', en: 'Archive' },
  navSources: { 'zh-tw': '來源', en: 'Sources' },
  navMethod: { 'zh-tw': '製作方法', en: 'Method' },
  navAriaLabel: { 'zh-tw': '網站導覽', en: 'Site' },
  languageSwitchToEnglish: { 'zh-tw': 'EN', en: 'EN' },
  languageSwitchToChinese: { 'zh-tw': '繁中', en: '繁中' },

  introHeadline: {
    'zh-tw': '本週 AI 影響人的研究',
    en: 'What AI is doing to people, this week',
  },
  introBody: {
    'zh-tw':
      '每週從一份人工挑選的學術來源清單抓取，只收有真實受試者的研究。全部保留原文標題與官方連結。中文摘要由模型生成，僅供快速判斷是否值得點進去讀。',
    en:
      'Collected weekly from a hand-picked list of academic sources, and only studies with real human participants. Original titles and official links are always kept. Chinese summaries are machine-generated and exist only to help you decide what to open.',
  },

  issueLabel: { 'zh-tw': '本期', en: 'Issue' },
  issueDateRange: { 'zh-tw': '涵蓋期間', en: 'Covers' },
  issueEmpty: {
    'zh-tw': '本期沒有抓到任何符合條件的消息。',
    en: 'No matching stories were collected for this issue.',
  },
  issuePrevious: { 'zh-tw': '上一期', en: 'Previous issue' },
  issueNext: { 'zh-tw': '下一期', en: 'Next issue' },
  archiveTitle: { 'zh-tw': '往期週報', en: 'Issue archive' },
  archiveIntro: {
    'zh-tw': '所有已發布的期數，最新的在最前面。',
    en: 'Every published issue, newest first.',
  },
  archiveStoryCount: { 'zh-tw': '{count} 則', en: '{count} stories' },

  filterTopicLabel: { 'zh-tw': '主題', en: 'Topic' },
  filterCategoryLabel: { 'zh-tw': '來源類型', en: 'Source type' },
  filterRegionLabel: { 'zh-tw': '地區', en: 'Region' },
  filterSearchLabel: { 'zh-tw': '搜尋標題或來源', en: 'Search headline or source' },
  filterSearchPlaceholder: { 'zh-tw': '關鍵字、機構或來源名稱', en: 'Keyword, organisation, or source' },
  filterAll: { 'zh-tw': '全部', en: 'All' },
  filterToggleLabel: { 'zh-tw': '搜尋與篩選', en: 'Search and filter' },

  topicSycophancy: { 'zh-tw': '奉承與迎合', en: 'Sycophancy' },
  topicDependence: { 'zh-tw': '依賴', en: 'Dependence' },
  topicRelationships: { 'zh-tw': '關係與陪伴', en: 'Relationships' },
  topicTrust: { 'zh-tw': '信任與過度信賴', en: 'Trust and overreliance' },
  topicWellbeing: { 'zh-tw': '心理健康', en: 'Wellbeing' },
  topicCognition: { 'zh-tw': '認知與思考', en: 'Cognition' },
  topicSocial: { 'zh-tw': '社會行為', en: 'Social behaviour' },

  categoryJournalHci: { 'zh-tw': '人機互動期刊', en: 'HCI journals' },
  categoryJournalPsych: { 'zh-tw': '心理與社會科學期刊', en: 'Psychology and social science' },
  categoryJournalMedical: { 'zh-tw': '醫學與心理健康期刊', en: 'Medicine and mental health' },
  categoryJournalGeneral: { 'zh-tw': '綜合科學期刊', en: 'Multidisciplinary journals' },
  categoryPreprint: { 'zh-tw': '預印本', en: 'Preprints' },
  categoryInstitution: { 'zh-tw': '調查機構', en: 'Survey organisations' },

  tierFirstParty: { 'zh-tw': '第一手', en: 'First-party' },
  tierInstitution: { 'zh-tw': '機構', en: 'Institution' },
  tierMedia: { 'zh-tw': '媒體', en: 'Media' },
  tierResearch: { 'zh-tw': '研究', en: 'Research' },
  tierCommunity: { 'zh-tw': '社群', en: 'Community' },

  regionGlobal: { 'zh-tw': '全球', en: 'Global' },
  regionTaiwan: { 'zh-tw': '台灣', en: 'Taiwan' },
  regionUS: { 'zh-tw': '美國', en: 'United States' },
  regionEU: { 'zh-tw': '歐盟', en: 'European Union' },
  regionUK: { 'zh-tw': '英國', en: 'United Kingdom' },
  regionCN: { 'zh-tw': '中國大陸', en: 'Mainland China' },
  regionJP: { 'zh-tw': '日本', en: 'Japan' },
  regionAPAC: { 'zh-tw': '亞太', en: 'Asia-Pacific' },
  regionEE: { 'zh-tw': '愛沙尼亞', en: 'Estonia' },

  storyOriginalTitleLabel: { 'zh-tw': '原標題', en: 'Original headline' },
  storySourceLabel: { 'zh-tw': '來源', en: 'Source' },
  storyPublishedLabel: { 'zh-tw': '發布日期', en: 'Published' },
  accessOpen: { 'zh-tw': '免費全文', en: 'Open access' },
  accessRestricted: { 'zh-tw': '需訂閱', en: 'Subscription' },
  accessUnknown: { 'zh-tw': '未確認', en: 'Not checked' },
  accessFreeVersion: { 'zh-tw': '免費版本', en: 'Free version' },

  storyReadOriginal: { 'zh-tw': '讀原文', en: 'Read the original' },
  // Shown on every machine-written line. Auto-publish means no human read
  // this before it went live, and the page must say so plainly.
  storyMachineSummaryBadge: { 'zh-tw': 'AI 摘要', en: 'AI summary' },
  storySourceSummaryBadge: { 'zh-tw': '來源原文摘要', en: 'Source summary' },
  storyNoSummary: { 'zh-tw': '此來源未提供摘要，請直接讀原文。', en: 'This source provides no summary; open the original.' },

  resultsCountTemplate: { 'zh-tw': '符合條件：{count} 則', en: '{count} matching stories' },
  resultsEmpty: { 'zh-tw': '找不到符合條件的消息。', en: 'No stories match these filters.' },
  resultsSortLabel: { 'zh-tw': '最新發布優先', en: 'Newest first' },

  sourcesTitle: { 'zh-tw': '來源清單', en: 'Source list' },
  sourcesIntro: {
    'zh-tw':
      '本站只從下列來源抓取，每一筆都附上官方首頁與 feed 位址。清單以外的內容不會出現在網站上。',
    en:
      'The site collects only from the sources below, each listed with its official homepage and feed address. Nothing outside this list ever appears on the site.',
  },
  sourcesFeedLabel: { 'zh-tw': 'Feed', en: 'Feed' },
  sourcesHomepageLabel: { 'zh-tw': '官方網站', en: 'Homepage' },
  sourcesNoFeed: { 'zh-tw': '無 feed（人工閱讀清單）', en: 'No feed (reading list only)' },
  sourcesLicenseLabel: { 'zh-tw': '使用條款備註', en: 'Reuse note' },
  sourcesVerifiedLabel: { 'zh-tw': '最後確認', en: 'Last checked' },
  sourcesInactive: { 'zh-tw': '未啟用', en: 'Inactive' },
  sourcesCountTemplate: { 'zh-tw': '共 {count} 個來源', en: '{count} sources' },

  methodTitle: { 'zh-tw': '製作方法', en: 'How this is made' },
  methodPipelineHeading: { 'zh-tw': '每週流程', en: 'The weekly run' },
  methodPipelineBody: {
    'zh-tw':
      '每週一次，程式只向來源清單上的 feed 發出請求，讀取標題、摘要、發布時間與原文連結，依 ISO 週次歸期，去除重複後直接發布。網站不轉載全文，只保留來源自己寫的摘要並連回原文。',
    en:
      'Once a week the pipeline requests only the feeds on the source list, reads each item’s headline, summary, publication time, and link, files it under its ISO week, removes duplicates, and publishes. Full article text is never republished — the site keeps the source’s own summary and links back.',
  },
  methodMachineHeading: { 'zh-tw': '中文摘要怎麼來的', en: 'Where the Chinese summaries come from' },
  methodMachineBody: {
    'zh-tw':
      '中文標題與摘要由語言模型生成，沒有經過人工逐則審閱就會上線。模型可能誤解或遺漏重點，因此原文標題、來源名稱與原文連結一律保留在旁邊，任何一則有疑問都可以直接對照原文。',
    en:
      'Chinese headlines and summaries are produced by a language model and go live without per-item human review. A model can misread or omit the point, so the original headline, the source name, and the link stay next to it — any item can be checked against the original.',
  },
  methodSourcesHeading: { 'zh-tw': '來源怎麼選', en: 'How sources are chosen' },
  methodSourcesBody: {
    'zh-tw':
      '編輯控制發生在來源層而不是逐則審稿：清單經過人工挑選與驗證，程式只能抓清單上的位址，連轉址都必須落在同一個官方網域內。要調整收錄範圍，就是改來源清單。',
    en:
      'Editorial control happens at the source level rather than per item: the list is hand-picked and verified, the pipeline may fetch only those addresses, and even redirects must stay within the same official domain. Changing what gets covered means changing the source list.',
  },
  methodLimitsHeading: { 'zh-tw': '這個網站不做什麼', en: 'What this site does not do' },
  methodLimitsBody: {
    'zh-tw':
      '不轉載全文、不評分、不排名、不做廣告或聯盟連結、不追蹤讀者。抓取失敗的來源會在該期缺席，不會用其他內容補位。',
    en:
      'No full-text republishing, no scoring, no ranking, no advertising or affiliate links, no reader tracking. A source that fails to fetch is simply absent from that issue; nothing is substituted for it.',
  },

  footerCadenceStatement: { 'zh-tw': '每週更新', en: 'Weekly' },
  footerSourceStatement: { 'zh-tw': '來源公開', en: 'Sources published' },
  footerMachineStatement: { 'zh-tw': '中文摘要由 AI 生成', en: 'Chinese summaries are AI-generated' },
  attributionText: { 'zh-tw': 'AIMing Data 的專案', en: 'A project by AIMing Data' },
  rssLinkLabel: { 'zh-tw': '訂閱 RSS', en: 'RSS feed' },

  notFoundTitle: { 'zh-tw': '找不到頁面', en: 'Page not found' },
  notFoundBody: {
    'zh-tw': '這個網址不存在。請回到本週的週報。',
    en: 'This page does not exist. Return to this week’s issue.',
  },
  backToHome: { 'zh-tw': '回到本週', en: 'Back to this week' },

  fixtureNotice: {
    'zh-tw': '目前顯示的是版面示意資料，不是真實新聞。',
    en: 'Layout fixtures only. These are not real stories.',
  },
} as const;

export type MessageKey = keyof typeof messages;

export function t(locale: Locale, key: MessageKey): string {
  return messages[key][locale];
}
