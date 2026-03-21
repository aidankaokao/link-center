# CLAUDE.md

此檔案提供 Claude Code（claude.ai/code）在此專案中操作時的參考指引。

## 重要前提

**所有工具、套件、模型的選擇，必須以開源免費為原則。** 避免引入需要付費授權、或商業使用有爭議的工具（包含 npm 套件、二進位工具、AI 模型等）。如果有多個選項，優先選擇 Apache 2.0、MIT、GPL 等明確開源授權的方案。

## 常用指令

```bash
npm run dev        # 啟動開發伺服器（Vite HMR）
npm run build      # tsc 型別檢查 + Vite 生產環境建置
npm run lint       # ESLint 檢查
npm run preview    # 本地預覽生產環境建置結果
npx tsc --noEmit   # 僅執行型別檢查，不產生輸出
```

## 架構說明

**路由** — 使用 `react-router-dom` v6 的 `BrowserRouter`。`App.tsx` 內部的 `AppRoutes` 元件定義所有路由，頁面對應如下：`/` → Home、`/link` → Link、`/chat` → Chat、`/tts` → Tts、`/celebrity` → Celebrity、`/learner` → Learner。頁面切換使用 `useNavigate`，子頁面返回首頁透過 `onBack` prop 傳入 `() => navigate('/')`。

**跨頁狀態** — `App.tsx` 持有以下提升至 App 層的狀態：
- `root: TreeItem[]` — `Link.tsx` 的完整連結／資料夾樹狀結構
- `linksEtag: useRef<string>` — 目前 links.json 的 ETag，用於樂觀鎖並發控制
- `linkConflict: boolean` — 發生 409 衝突時顯示 toast 通知（5 秒後自動消失）

其餘頁面（`Chat.tsx`、`Tts.tsx` 等）的所有狀態均由元件自身管理。

**各頁說明**

| 檔案 | 功能 |
|---|---|
| `Home.tsx` | 卡片式導覽頁。`NAV_ITEMS` 陣列驅動卡片格線（`auto-fit minmax(230px,270px)` + `justify-content:center`，`max-width:1200px`）：帶有 `page` 屬性（路由路徑字串）的項目執行內部導航（`useNavigate`），帶有 `href` 的項目開啟外部連結，帶有 `disabled` 的項目顯示為 Coming Soon。目前卡片：01 頁面連結（hardcoded）、02 LLM 問答、03 民國人物傳、04 學習者。（TTS 卡片已暫時移除，`Tts.tsx` 保留備用） |
| `Link.tsx` | 階層式連結管理頁，頁面標題「頁面連結」。使用遞迴的 `TreeItem`（`LinkItem` / `FolderItem` 的辨別聯合型別）樹狀結構。`FolderItem` 支援可選 `password?: string` 欄位；有密碼的資料夾在進入、編輯、刪除時會彈出密碼驗證 modal，卡片右下角顯示鎖頭圖示。五個純函式 tree helpers（`treeAdd`、`treeUpdate`、`treeDelete`、`getChildrenAtPath`、`buildBreadcrumbs`）定義於元件外部。樹內導航使用 `navPath: string[]`（從根節點到當前資料夾的 ID 陣列）。 |
| `Chat.tsx` | 多服務商 LLM 問答介面。左側 sidebar 提供三個服務商 tab（OpenAI / Gemini / Ollama），各服務商設定獨立保留於記憶體。OpenAI 使用 `gpt-4o-mini`，Gemini 使用 `gemini-2.0-flash`（OpenAI 相容介面），Ollama 需輸入 URL + Model（儲存時自動測試連線）。OpenAI / Gemini 透過 SSE 串流回應，Ollama 透過 NDJSON 串流回應。支援圖片（base64 vision；Ollama 使用 `images` 陣列格式）與 PDF（使用 `pdfjs-dist` 在 client 端提取文字）作為問答上下文。支援匯出 markdown 表格為 CSV。所有設定僅存於記憶體，關閉頁面後自動清除。Topbar 右側顯示**服務商 badge**（金色膠囊標籤，顯示當前對話實際使用的服務商）：badge 使用 `convProvider` state 鎖定——第一則訊息送出時捕捉當時的 `llmProvider`，切換 tab 不改變 badge，直到新對話才重設；未開始對話時顯示當前 tab 選項作為提示（`convProvider ?? llmProvider`）。Topbar 最左側有**新對話按鈕**（對話泡泡 + 加號圖示），點擊清空 messages、重設 `convProvider`、清除 error 與上傳檔案。 |
| `Tts.tsx` | 中文文字轉語音頁面（暫未掛載於首頁）。左側 sidebar 顯示模型狀態與聲線選單（可收折），主區域含文字輸入卡（支援上傳 `.txt`）與語音輸出卡（HTML5 audio player + 下載 WAV）。透過輪詢 `/api/tts/status` 等待模型就緒。 |
| `Celebrity.tsx` | 民國人物傳頁面（`/celebrity`）。人物資料存於 `src/data/celebrities.json`，開發者可自行新增人物。左側浮動人物選擇器（金色邊框按鈕，mask 漸消邊界），右側時間軸隨捲動高亮對應節點並可點擊跳轉，主畫面各生平段落以 IntersectionObserver 觸發進場動效（Apple 式滾動）。預設每 3 秒自動推進下一段落，右上角有 Play/Pause 切換按鈕。亮色模式採多層金色暈散漸層背景 + 細纖維紋理。 |
| `Learner.tsx` | 主題式互動學習頁面（`/learner`）。主題 JSON 存於 `data/learner/{id}.json`，server 動態讀取，無需重啟即可新增主題。左側 sidebar 依分類分組列出主題清單；分類標題在單一分類時隱藏，多分類時顯示為**可點擊按鈕**（`.lr-category-heading`），點擊折疊／展開該分類下的主題列表（`collapsedCats: Set<string>` state + CSS `max-height` transition）；折疊狀態由 chevron 圖示旋轉指示。分類標題樣式：深色模式為金色橫向漸層底色 + 金色文字；亮色模式為深海軍藍（`#1a3060`）底色 + 白色文字。右側主區顯示 hero、level tabs（初階／進階／高階）、各段落內容。段落支援：可點擊高亮關鍵詞（浮動 popover 說明）、程式練習（輸入批改 + 提示 + 答錯後出現「查看答案」按鈕）、行動建議清單。右上角控制列：文字大小切換（小／中／大）、**匯出主題 PDF**（印表機 icon，選中主題時才顯示，輸出所有層級的帶樣式 HTML，`window.print()` 觸發列印）、管理面板（⚙）、主題切換。右下角浮動聊天按鈕（Chat FAB）展開 LLM 問答面板（360×600px 懸浮卡片，AI 回覆以 `react-markdown + remark-gfm` 渲染 markdown，聊天記錄有內容時 header 出現**匯出問答 PDF** 按鈕，跨主題切換時保留各主題獨立對話記錄），聊天輸入框支援中文 IME（`isComposing` 防誤送）。聊天面板 header 顯示**服務商 badge**（金色膠囊，邏輯同 Chat.tsx：`convProvider ?? llmProvider`，鎖定於第一則訊息，切換主題時重設）。亮色模式使用者泡泡改為淡金色底（`rgba(200,169,110,0.18)`）以提升可讀性。管理面板（⚙）提供：**分類管理**（新增自訂分類、刪除空分類需輸入 `DELETE` 確認）、**LLM 設定**（三個服務商 tab：OpenAI API Key、Gemini API Key、Ollama URL + Model；各服務商設定獨立保留；Ollama 儲存時自動測試連線；所有設定僅存記憶體）、貼上 LLM 生成 JSON 匯入主題（可選擇分類，預設「未分類」）、各主題可移動分類、Prompt 生成器（輸入主題名稱後複製填好的 prompt）、各主題的下載 JSON 與刪除（刪除需輸入 `DELETE` 確認）。 |

**後端（server.js）** — Node.js 內建 HTTP server（無 express），ESM。除了服務靜態檔案外，提供：
- `GET /api/links` — 讀取 `data/links.json`，回應帶 `ETag` header（MD5 hash 前 8 碼）
- `POST /api/links` — 寫入 `data/links.json`；若請求帶 `If-Match` 且版本不符回 409（樂觀鎖並發控制），成功後回應新 `ETag`
- `GET /api/learner` — 列出 `data/learner/` 目錄下所有主題（過濾 `.backup.json` 與 `_categories.json`，回傳 `[{ id, name, description, category }]`，category 預設 `'未分類'`）
- `GET /api/learner/:id` — 讀取特定主題完整 JSON（`_categories` id 被保護，回 404）
- `POST /api/learner` — 接收完整主題 JSON，寫入 `data/learner/{id}.json`（id 欄位必須存在且合法，覆寫時直接取代，無備份）
- `DELETE /api/learner/:id` — 刪除 `data/learner/{id}.json`
- `GET /api/learner/categories` — 讀取 `data/learner/_categories.json`，回傳 `['未分類', ...自訂分類]`（**必須在 `GET /api/learner/:id` 之前定義**）
- `POST /api/learner/categories` — 新增分類（`{ name }`），409 若重複
- `DELETE /api/learner/categories/:name` — 刪除分類；若有主題使用該分類回 400 `category-not-empty`
- `GET /api/tts/status` — proxy 至 Python TTS API `/health`，回傳 `{ ready, initializing, error }`
- `GET /api/tts/speakers` — proxy 至 Python TTS API `/speakers`，回傳聲線列表
- `POST /api/tts` — proxy 至 Python TTS API `/tts`，接收 `{ text, speakerId }`，回傳 WAV binary

**TTS 引擎** — 由外部 Python TTS API server 提供，Node.js 透過 HTTP proxy 呼叫。API base URL 由環境變數 `PYTHON_TTS_URL` 設定（預設 `http://host.docker.internal:14000`）。Timeout：status/speakers 5 秒，合成 120 秒。

**Python TTS API 介面**（Node.js 呼叫的端點）：
- `GET /health` → `{ ready, loading, error }`
- `GET /speakers` → `[{ id, name }]`
- `POST /tts` body: `{ text, speaker_id, speed, format }` → WAV binary

**主題切換** — 每個頁面各自管理 `isDark` 布林值，由固定位置的按鈕切換。深色／亮色類別（`.home-root.light`、`.link-root.light`、`.chat-root.light`、`.tts-root.light`、`.cb-root.light`、`.lr-root.light`）會覆寫各元件根元素上定義的 CSS 變數。字型：`Noto Sans TC`、`Cormorant Garamond`、`DM Mono`，透過 Google Fonts 載入（定義於 `index.html`）。

**人物資料擴充（Celebrity）** — 在 `src/data/celebrities.json` 中新增一個物件（格式：`id`、`name`、`dates`、`tagline`、`periods[]`），頁面會自動渲染新人物的選擇按鈕與生平內容，無需修改任何程式碼。每個 `period` 含 `id`、`years`、`title`、`content`、`works[]`（可為空陣列）。

**學習主題擴充（Learner）** — 在 `data/learner/` 目錄放入符合格式的 JSON 檔案，頁面重新整理後即自動出現新主題，無需修改程式碼。JSON 格式：`{ id, name, description, category?, levels: { beginner?, intermediate?, advanced? } }`，`category` 為可選欄位（預設 `'未分類'`，值須對應已存在的分類）。每個 level 為 section 陣列（`{ id, title, content, highlights?, practice? }`）。`practice.type` 為 `"code"`（程式輸入批改；答錯後顯示「查看答案」按鈕，展開 `lr-answer-reveal` 顯示參考答案）或 `"action"`（行動建議清單）。也可透過管理面板（⚙）直接貼上 JSON 匯入（匯入時可選擇分類），或使用內建 Prompt 生成器讓 LLM 產生符合格式的主題檔案。分類資料存於 `data/learner/_categories.json`（字串陣列，不含「未分類」）。

## 介面風格基準

新增頁面時請遵循以下設計規範，確保視覺一致性。

### 色彩系統

每個頁面在根元素（`{page}-root`）上定義 CSS 變數，深色為預設，亮色以 `.light` 覆寫：

| 變數 | 深色 | 亮色 | 用途 |
|------|------|------|------|
| `--bg` | `#050d1a` | `#eef3fb` | 頁面背景 |
| `--surface` | `rgba(255,255,255,0.13)` | `#ffffff` | 卡片／面板底色 |
| `--border` | `rgba(255,255,255,0.18)` | `#c8d8f0` | 邊框 |
| `--text` | `#e8e4dc` | `#0e1f3d` | 主要文字 |
| `--muted` | `#6b7a90` | `#6e82a4` | 次要文字／placeholder |
| `--gold` | `#c8a96e` | `#9a6f30` | 強調色（accent） |
| `--gold-dim` | `#8a7249` | `#b8924a` | 淡化強調色 |
| `--input-bg` | `rgba(255,255,255,0.07)` | `#f4f7fd` | 輸入框底色 |
| `--input-border` | `rgba(255,255,255,0.14)` | `#c0d0ec` | 輸入框邊框 |
| `--input-focus` | `rgba(200,169,110,0.5)` | `#9a6f30` | 輸入框 focus 邊框 |
| `--btn-primary` | `#c8a96e` | `#0e1f3d` | 主要按鈕底色 |
| `--btn-primary-text` | `#0a0a0a` | `#ffffff` | 主要按鈕文字 |
| `--danger` | `#e05c5c` | `#c94040` | 錯誤／危險 |
| `--danger-hover` | `rgba(224,92,92,0.12)` | `rgba(201,64,64,0.08)` | 錯誤背景 |

### 背景漸層

大多數頁面使用相同的背景：

```css
/* 深色 */
background:
  radial-gradient(ellipse 70% 50% at 15% 10%, rgba(40,100,200,0.18) 0%, transparent 60%),
  radial-gradient(ellipse 55% 45% at 85% 88%, rgba(20,60,150,0.15) 0%, transparent 55%),
  linear-gradient(160deg, #0b1f40 0%, #050d1c 50%, #091528 100%);

/* 亮色（標準） */
background:
  radial-gradient(ellipse 70% 50% at 15% 10%, rgba(100,160,255,0.18) 0%, transparent 60%),
  radial-gradient(ellipse 55% 45% at 85% 88%, rgba(60,120,220,0.10) 0%, transparent 55%),
  linear-gradient(160deg, #ddeaff 0%, #eef3fb 50%, #d8e8ff 100%);
```

**例外**：`Learner.tsx` 亮色背景採金色／白色漸層（與其他頁面不同）：

```css
/* Learner 亮色 */
background:
  radial-gradient(ellipse 70% 50% at 15% 10%, rgba(200,169,110,0.18) 0%, transparent 60%),
  radial-gradient(ellipse 55% 45% at 85% 88%, rgba(154,111,48,0.12) 0%, transparent 55%),
  linear-gradient(160deg, #fdf6e8 0%, #ffffff 50%, #faf2e0 100%);
```

### 字型

| 字型 | 用途 |
|------|------|
| `Noto Sans TC`, `Microsoft JhengHei` | 主要內文、中文、標題 |
| `DM Mono` | 標籤、索引數字、代碼、說明文字 |
| `Cormorant Garamond` | 裝飾性大標（首頁） |

### 版面結構

**子頁面（有 sidebar）：**
```css
.{page}-root {
  display: flex;
  height: 100vh;
  overflow: hidden;
}
```
- 左側 sidebar：寬 260px，收折後 52px，`backdrop-filter: blur(12px)`
- 右側 main：`flex: 1`，垂直排列 topbar + 內容區

**子頁面（無 sidebar，如 Link）：**
```css
.{page}-root {
  min-height: 100vh;
}
```

### 元件規格

**Topbar**
- 高度：56px，`backdrop-filter: blur(12px)`
- 左側：圖示（gold 色）+ 頁面標題，`font-size: 15px; font-weight: 700; letter-spacing: 0.06em`
- 右側：控制按鈕群組（`gap: 6px`）
- 底部邊框：`1px solid var(--border)`

**Topbar 控制按鈕（主題切換、返回首頁等）**
```css
width: 34px; height: 34px;
border-radius: 8px;
border: 1px solid var(--border);
background: var(--input-bg);
color: var(--muted);
/* hover */ color: var(--gold); border-color: var(--gold-dim); transform: scale(1.08);
```

**Sidebar 收折按鈕**
```css
width: 28px; height: 28px;
border-radius: 6px;
border: 1px solid var(--sidebar-border);
/* hover */ color: var(--gold); border-color: var(--gold-dim); background: rgba(200,169,110,0.08);
```

**主要按鈕（Primary）**
```css
background: var(--btn-primary);
color: var(--btn-primary-text);
border-radius: 8–10px;
/* hover */ opacity: 0.85; transform: translateY(-1px) 或 scale(1.06);
/* disabled */ opacity: 0.3; cursor: not-allowed;
```

**輸入框**
```css
background: var(--input-bg);
border: 1px solid var(--input-border);
border-radius: 8px;
padding: 9px 12px;
font-size: 14px;
/* focus */ border-color: var(--input-focus);
```

**錯誤提示**
```css
color: var(--danger);
background: var(--danger-hover);
border: 1px solid var(--danger);
border-radius: 8px;
padding: 8px 14px;
font-size: 13px; letter-spacing: 0.04em;
```

**狀態指示點**
```css
width: 6px; height: 6px; border-radius: 50%;
/* ok */      background: var(--status-ok);  box-shadow: 0 0 6px rgba(76,175,125,0.5);
/* loading */ background: var(--gold);
/* error */   background: var(--danger);
```

**Sidebar 區塊標題**
```css
font-size: 12px; font-weight: 700;
letter-spacing: 0.18em; text-transform: uppercase;
color: var(--muted);
```

### 動畫

```css
/* 元素進場 */
@keyframes fadeUp {
  from { opacity: 0; transform: translateY(24px); }
  to   { opacity: 1; transform: translateY(0); }
}
animation: fadeUp 0.8s cubic-bezier(0.16, 1, 0.3, 1) both;

/* 漸入 */
@keyframes fadeIn {
  from { opacity: 0; }
  to   { opacity: 1; }
}

/* 通用 transition easing（有彈性感） */
transition: ... 0.3s cubic-bezier(0.16, 1, 0.3, 1);
```

### SVG 圖示

所有圖示使用 inline SVG（`viewBox="0 0 24 24"`），`fill="none"`、`stroke="currentColor"`、`strokeWidth="1.8"`、`strokeLinecap="round"`、`strokeLinejoin="round"`，尺寸透過父元素的 `width/height` 控制。不引入外部 icon library。

### 新頁面 CSS 範本

```css
/* ── Dark theme (default) ── */
.{page}-root {
  --bg: #050d1a; --surface: rgba(255,255,255,0.13); --border: rgba(255,255,255,0.18);
  --text: #e8e4dc; --muted: #6b7a90; --gold: #c8a96e; --gold-dim: #8a7249;
  --input-bg: rgba(255,255,255,0.07); --input-border: rgba(255,255,255,0.14);
  --input-focus: rgba(200,169,110,0.5); --btn-primary: #c8a96e; --btn-primary-text: #0a0a0a;
  --danger: #e05c5c; --danger-hover: rgba(224,92,92,0.12);
}
/* ── Light theme ── */
.{page}-root.light {
  --bg: #eef3fb; --surface: #ffffff; --border: #c8d8f0;
  --text: #0e1f3d; --muted: #6e82a4; --gold: #9a6f30; --gold-dim: #b8924a;
  --input-bg: #f4f7fd; --input-border: #c0d0ec; --input-focus: #9a6f30;
  --btn-primary: #0e1f3d; --btn-primary-text: #ffffff;
  --danger: #c94040; --danger-hover: rgba(201,64,64,0.08);
}
```

**新增頁面**

1. 建立 `Page.tsx` 與 `Page.css`
2. 在 `App.tsx` 的 `AppRoutes` 中新增 `<Route path="/xxx" element={<Page onBack={goHome} />} />`
3. 在 `Home.tsx` 的 `NAV_ITEMS` 中新增一張卡片，`page` 屬性填入路由路徑（不含 `/`）

**新增首頁導覽卡片**

`NAV_ITEMS` 中的每個項目需包含 `index`（顯示用數字字串）、`name`、`description`，以及以下三者之一：`page`（路由路徑字串，對應 `/<page>`）、`href`（外部連結）、`disabled: true`（停用）。

## 部署

**建置 Docker image**
```bash
docker build -t link-center:latest .
```

**設定（編輯 `.env`）**
```
UI_PORT=3000
PYTHON_TTS_URL=http://host.docker.internal:14000
```

**啟動容器**
```bash
docker-compose up -d
```

**停止容器**
```bash
docker-compose down
```

**持久化資料目錄**

| 本機路徑 | 容器路徑 | 用途 |
|---|---|---|
| `./data/` | `/app/data/` | links.json（連結樹資料）、learner/（學習主題 JSON） |

遷移時搬運 `data/` 目錄即可無痛移植。

**PostgreSQL**

`docker-compose.yaml` 內含 `postgres:15` 服務，供後續有關聯式資料需求的頁面使用：

| 項目 | 值 |
|---|---|
| container_name | `link-center-postgres` |
| user / password / db | `filecenter` / `Fc2026PgLc!` / `filecenter` |
| volume | `link-center-postgres-vol`（named volume，持久化） |
| ports | 無對外 port，僅容器內部可達 |
| 連線 hostname | `postgres`（同 compose 預設 bridge network） |
