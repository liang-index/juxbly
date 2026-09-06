# Juxbly

**ブラウザの即席アプリ工場。** 今見ているページでやりたいことを言葉で伝える：結果はすぐに届き、それを生み出したツールはその場に残る——次に同じページを訪れると、自動的に戻ってきます。

[English](README.md) · [简体中文](README.zh-CN.md) · **日本語** · [Português (Brasil)](README.pt-BR.md) · [Español](README.es.md)

> 本ドキュメントはコミュニティ翻訳です。英語版に追従するのはベストエフォートで、遅れることがあります。両者が一致しない場合は [英語版 README](README.md) が正です。

> 状態：**実装前（pre-implementation）**。MV3 のスケルトンは Chrome に読み込めます。DSL とその検証層は整っていますが、ページ分析、ツール、パネル、ハイライト確認はまだ未実装です。V1 が意図的にやらないことについては [`docs/contributing/SCOPE.md`](docs/contributing/SCOPE.md) を参照してください。

<p align="center">
  <img src="docs/assets/screenshots/highlight-confirm.png" width="32.5%" alt="構築フロー：やりたいことを伝えると、Juxbly が読み取る対象をハイライトし、フィールドごとに確認する" title="構築：記述 &rarr; ハイライト &rarr; 確認" />
  <img src="docs/assets/screenshots/run-panel-result.png" width="32.5%" alt="実行パネル：結果が先に届き、それを生み出したツールが結果上に明示される" title="実行：結果第一、出所つき" />
  <img src="docs/assets/screenshots/overview-popup.png" width="32.5%" alt="ツールバーの概要：保存したツールが最近の使用順に並び、いつでも自動で戻ってくる" title="永続化されたツール、最近使った順" />
</p>
<p align="center"><sub>プロトタイプ UI：やりたいことを記述 &rarr; ハイライトされたフィールドを確認 &rarr; 結果を取得 &rarr; ツールは残り、次回から自動で戻ってくる。</sub></p>

---

## 1. Juxbly とは

Juxbly はオープンソースの Chrome 拡張機能（Manifest V3）です。現在のページ上でやりたいことを自然言語で記述すると、モデルがページを分析して **Tool DSL** 設定を生成します。ページ上のハイライトで一度確認すれば、そのツールは**保存**されます。以降、一致するページを訪れるたびに、ツールは現れて自動的に実行されます。

価値の単位はプロンプトではなく**ツール（Tool）**です：

```
発見 → 構築 → 確認 → 保存 → 実行 → 提供 → 健康 → 修復 → バージョン → 再利用
```

## 2. なぜ存在するのか

「この表から価格列を取り出す」「この検索ページの結果カードを全部集める」「この商品ページのレビューを要約する」——こうした一度きりのウェブタスクの大半は、スクリプトを書くには小さすぎ、既存の拡張機能に当てはめるには特殊すぎます。

Juxbly の賭けは「このタスクを一度実行すること」ではありません。こうです：

> **一度きりのロングテールなニーズを、持ち帰れる結果と——手元に残る永続的なページツールに変える。**

結果が先：実行のたびにデータが目の前に届き、コピー / CSV / JSON はワンクリック。ツールは副産物として残り、結果そのものに出所が明示されるので、何がそれを生んだのか——そして次回もそこにあるのか——が常にわかります。

つまり難所は生成だけではなく、**失敗の可視化・低コストな修復・バージョン管理**です。Juxbly はツールが決して壊れないことは約束しません。壊れたツールが検出され、説明され、安く再構築できることを約束します。

## 3. 誰のためのものか

- ページ固有の情報タスクに繰り返し遭遇する開発者・パワーユーザー。
- ウェブページを大量に処理する研究者・ナレッジワーカー。
- LLM と DOM 理解、プロンプトインジェクション防御、ローカルファーストなブラウザツーリングに関心のあるコントリビューター。

Juxbly は汎用チャットサイドバー**ではなく**、万能スクレイパー**ではなく**、「AI が JavaScript を書いて実行する」エンジン**でもありません**。明確な境界は [`docs/contributing/SCOPE.md`](docs/contributing/SCOPE.md) にあります。

### どこで効き、どこで苦しいか

実装前に 10 サイトのサンプルで測定：

| ページの形態 | 状態 |
|---|---|
| 整然とした構造のページとドキュメント | 信頼できる——V1 の狙いはここ |
| 無限スクロール | ベストエフォート |
| クライアント描画の SPA | ベストエフォート |
| ハッシュ化・自動生成された class 名 | ベストエフォート |

ベストエフォートとは、動くかもしれないし動かないかもしれない、ということです。動かないとき Juxbly は空の結果を見せるのではなく、そう言います——すべてのサイトで動くという主張はどこにもありません。

## 4. 仕組み

```
Tool DSL（LLM が生成するのは設定だけで、コードは決して生成しない）
   ↓
Capability Runtime（extract / transform / llm / render / export）
   ↓
Browser Adapter（chrome.* に触れる唯一の場所）
   ↓
Browser APIs
```

- **コードは固定、設定だけが可変。** モデルは JSON を出力し、ホワイトリスト式のインタープリタが実行します。リポジトリのどこにも `eval` も `new Function` もリモートコードのロードもありません。
- **決定的な処理はモデルを呼ばない。** `extract` / `transform` / `render` はローカル。トークンを消費するのは `llm` ステップだけで、入力が変わっていなければスキップされます。
- **API キーは自分のものを（BYOK）。** **OpenAI 互換エンドポイント**なら何でも使えます——OpenAI、OpenRouter、Together、あるいはローカルゲートウェイ（LM Studio、Ollama の OpenAI 互換サーバー……）。base URL を一度設定するだけです。ページ内容はあなたのブラウザから、あなた自身の API キーを通って、あなたが選んだエンドポイントへ。経路に Juxbly のサーバーはなく、テレメトリーもありません。

詳細：[`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md)。

## 5. インストール（ソースから）

```bash
git clone https://github.com/liang-index/juxbly.git
cd juxbly
pnpm install
pnpm dev            # .output/chrome-mv3 に watch 付きでビルド
```

続いて Chrome で：

1. `chrome://extensions` を開く。
2. **デベロッパー モード**を有効にする。
3. **パッケージ化されていない拡張機能を読み込む** → `.output/chrome-mv3` を選択。

初回は任意のページでフローティングボールをクリックし、やりたいことを記述します。Juxbly が API キーを求めるのは、実際にモデルを呼ぶ必要が生じたその瞬間だけです。

> スケルトンは読み込まれ、ポップアップも開きますが、まだ何も繋がっていません：ページ分析、ツール、パネル、ハイライト確認はこれからです。

## 6. ローカル開発

| コマンド | 用途 |
|---|---|
| `pnpm install` | ワークスペースの依存をインストール |
| `pnpm dev` | watch モードで拡張機能をビルド |
| `pnpm build` | 本番ビルド |
| `pnpm typecheck` | 全パッケージで `tsc --noEmit` |
| `pnpm lint` | ESLint |
| `pnpm test` | Vitest ユニット + インテグレーション |
| `pnpm test:bench` | ローカル Web ベンチマーク（Phase 2+） |

セットアップ全体、デバッグ、トラブルシューティング：[`docs/DEVELOPMENT.md`](docs/DEVELOPMENT.md)。

## 7. テスト

```bash
pnpm test                 # ユニット（tests/unit）+ インテグレーション（tests/integration）
pnpm test -- --watch      # watch モード
pnpm test:bench           # Web Corpus + Task Corpus（Phase 2）
```

インテグレーションテストは、モックの `BrowserAdapter` とモックの `LlmPort` を使って fixture HTML に対し実際のランタイムを走らせます——Chrome もネットワークも API キーも不要です。テストの範囲とリグレッション判定ルール：[`docs/testing/TESTING.md`](docs/testing/TESTING.md)。

## 8. どこから読むか

| 目的 | ここから |
|---|---|
| システムと型契約を理解する | [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) |
| 各モジュールの担当を知る | [`docs/CODE_MAP.md`](docs/CODE_MAP.md) |
| DSL を読む | `packages/dsl` + [`docs/ARCHITECTURE.md` §5](docs/ARCHITECTURE.md) |
| Capability を追加する | [`docs/contributing/CAPABILITY_GUIDE.md`](docs/contributing/CAPABILITY_GUIDE.md) |
| デザイントークンを読む | [`docs/UI_SPEC.md`](docs/UI_SPEC.md) |
| V1 がやらないことを知る | [`docs/contributing/SCOPE.md`](docs/contributing/SCOPE.md) |

この構成を駆動する二つの指標：**開発者が最初に成功するまでの時間**と**開発者が最初に貢献するまでの時間**。

## 9. コントリビュート

摩擦の低い順に：ドキュメント、テスト、**ベンチマークケース**、**Recipe**、その次にバグ修正、そして小さな Capability。コアアーキテクチャ、DSL、権限、セキュリティ境界はメンテナーが管理します。

[`CONTRIBUTING.md`](CONTRIBUTING.md) から始め、貢献の種類に合わせてガイドを選んでください：

- Capability → [`docs/contributing/CAPABILITY_GUIDE.md`](docs/contributing/CAPABILITY_GUIDE.md)
- Recipe → [`docs/contributing/RECIPE_GUIDE.md`](docs/contributing/RECIPE_GUIDE.md)
- ベンチマークケース → [`docs/contributing/BENCHMARK_GUIDE.md`](docs/contributing/BENCHMARK_GUIDE.md)

## 10. プライバシーとセキュリティ

- すべてのデータは `chrome.storage.local` に留まります。同期なし、アカウントなし、テレメトリーなし——これはオープンソース版の恒久的な立場であり、一時的な状態ではありません。
- API キーは **background service worker でのみ**読まれ、content script・ページコンテキスト・ログには決して入りません。
- ページ内容は信頼できない入力です。モデルのプロンプトでは常に*データ*として包み、指示として扱いません。
- 脆弱性の報告：[`SECURITY.md`](SECURITY.md)。データ取り扱い声明：[`PRIVACY.md`](PRIVACY.md)。

## 11. ドキュメント索引

| ドキュメント | 役割 |
|---|---|
| [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) | 型契約とモジュールインターフェース |
| [`docs/UI_SPEC.md`](docs/UI_SPEC.md) | デザイントークンとコンポーネント動作ルール |
| [`docs/CONVENTIONS.md`](docs/CONVENTIONS.md) | エンジニアリング規約とリグレッションルール |
| [`docs/CODE_MAP.md`](docs/CODE_MAP.md) | モジュール → 責務 → 見る場所 |
| [`docs/DEVELOPMENT.md`](docs/DEVELOPMENT.md) | 開発者向けセットアップ |
| [`docs/contributing/SCOPE.md`](docs/contributing/SCOPE.md) | V1 が意図的にやらないこと |
| [`docs/contributing/CAPABILITY_GUIDE.md`](docs/contributing/CAPABILITY_GUIDE.md) | Capability の書き方 |
| [`docs/contributing/RECIPE_GUIDE.md`](docs/contributing/RECIPE_GUIDE.md) | Recipe の公開の仕方 |
| [`docs/contributing/BENCHMARK_GUIDE.md`](docs/contributing/BENCHMARK_GUIDE.md) | Web Corpus ベンチマークの仕組み |
| [`docs/testing/TESTING.md`](docs/testing/TESTING.md) | テスト階層とリグレッション判定ルール |
| [`docs/contributing/DOC_CHANGE_PROTOCOL.md`](docs/contributing/DOC_CHANGE_PROTOCOL.md) | 共有契約の変更手順 |

各事実の権威あるソースはただ一つ。他のドキュメントは参照するだけです（[`docs/contributing/DOC_CHANGE_PROTOCOL.md`](docs/contributing/DOC_CHANGE_PROTOCOL.md)）。

## 12. ライセンス

コードは **AGPL-3.0** のもとでライセンスされます——[`LICENSE`](LICENSE) を参照。

**Juxbly の名称、ロゴ、公式ドメイン、公式 Chrome Web Store の識別情報はコードライセンスの対象外**であり、[`TRADEMARK.md`](TRADEMARK.md) のブランドポリシーにより別個に定められます。
