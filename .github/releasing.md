# リリースの判断と手順

## リリースノートに載せる内容

利用者が更新する理由や移行の判断に使う情報を載せる。機能、修正、互換性の変更、利用者に影響するセキュリティ対応が対象。PRタイトル・本文には目的と利用者ができるようになることを書く。

CI、開発ツール、開発用依存、テストやデモだけの更新は、通常は載せない。自動ラベル `release:internal` でGitHubの生成対象から除外する。掲載対象が混在するPRや判定できないPRは除外しない。ドキュメント更新も自動除外しない。

`dependencies` やDependabotを一律には除外しない。公開パッケージの実行時依存、peer dependencies、対応Node.js、ビルド方法などの変更は掲載候補に残す。開発用依存の更新でも、生成物や利用者の安全性に影響する場合は `release:include` または `release:security` を付ける。

| ラベル | 用途 |
| --- | --- |
| `release:internal` | 自動判定した内部保守。差分が変われば再判定する |
| `release:include` | 内部変更の自動除外を解除し、公開する理由があることを明示する |
| `release:skip` | 明示的にリリースノートから除外する |
| `release:feature` / `release:fix` | 掲載する変更の分類 |
| `release:breaking` / `release:security` | 移行や安全性に関する変更。内部変更の自動除外も解除する |

生成設定は [.github/release.yml](release.yml)。`release:skip` は明示的な除外なので、include系ラベルと併用しない。自動処理は `release:internal` だけを管理し、他のラベルは保持する。

## 公開するタイミング

PRをマージするたびには公開しない。利用者に届ける機能・修正がまとまり、その内容のコードレビューと必要なブラウザー確認を終えた時点で、通常のレビューを受けるバージョン更新PRを作る。

1. 公開する変更をmainへマージする。生成予定のノートを確認し、内部保守だけのPRに掲載ラベルを付けない。
2. `packages/core/package.json` のバージョンを上げるPRを作る。目的、利用者に届く変更、前提PRを書く。バージョン更新に `Auto Approval` は使わない。
3. バージョン更新PRのレビュー・マージ後、そのmainコミットのCIとCodeQLが成功したら、[Release workflow](workflows/release.yml) がタグ、npm公開、GitHub Releaseの作成を順に行う。CIには実ブラウザーのテストも含む。
4. npmのバージョン・dist-tag、GitHub Releaseと生成されたノートを確認する。

既存のバージョンには再公開しない。CIや開発用依存だけの更新ではバージョンPRを作らない。前回公開からの実装・CLI・公開設定の変更、または `release:include` / `release:security` / `release:breaking` のあるマージ済みPRがなければ公開を見送る。

alpha期間は `0.1.0-alpha.N` を継続し、npmの `alpha` に公開する。安定版へ移す判断は別途行い、alphaの公開で `latest` を動かさない。GitHubもprereleaseとして扱う。beta・rcも同様に専用チャンネルを使う。

## GitHub側の前提

この個人リポジトリではGitHub Actionsをタグ作成ルールの例外に登録できないため、新しい `v*` タグは通常のリポジトリwrite権限で作成できる設定にする。`Protect release tags` の更新・削除制限と所有者だけの例外は維持し、Actionsには公開済みタグの付け替え・削除を許可しない。mainのレビュー・CI保護も継続する。

write権限を持つ共同開発者やworkflowも新規タグを作成できる点に注意する。workflowの権限は原則readとし、公開ジョブだけにcontents:writeを付ける。タグを作成しても、公開ジョブがmainの履歴、バージョン、利用者向け変更、CI・CodeQLを検証するため、任意のPRコミットは公開しない。

npm Trusted Publisherはこのリポジトリの `release.yml` を使う。公開権限とOIDCはpublishジョブだけに持たせる。

## 失敗時の再実行

タグを作る前に検証を済ませる。GitHubのトークンで作ったタグは別workflowを起動しないため、同じReleaseジョブ内で公開まで実行する。

タグ作成後に失敗した場合は、原因を確認し、Releaseの失敗ジョブを再実行するか、mainのRelease workflowを既存タグを指定して手動実行する。手動実行でもmainの履歴、タグとバージョンの一致、CI・CodeQL成功を検証する。既に公開済みのnpmバージョンは同じコミットであることを確認してスキップし、GitHub Releaseの作成を再試行する。既存Releaseの本文は上書きしない。既存draftがある場合は確認を求めて停止する。

npm registryの通信失敗を「未公開」とは扱わない。タグや公開済みバージョンを付け替えない。新しいmainが到着した場合、自動公開はそのCIを待つ。

## 検証

`pnpm test:automation` で分類・公開条件の回帰を確認する。`pnpm code:check`、`pnpm test`、`pnpm unused:check`、`pnpm docs:check` とworkflowの静的検証も行う。

GitHubが生成する本文は [Generate release notes API](https://docs.github.com/en/rest/releases/releases#generate-release-notes-content-for-a-release) でプレビューできる。このAPIはRelease自体を作成しない。設定の反映前にはPR上の設定ファイルを `configuration_file_path` に指定し、`target_commitish` にそのブランチを指定する。
