# 軽微な文書修正の自動承認

`Auto Approval`は、人がラベルを付けるだけでは有効にならない。既定ブランチ上のworkflowが、変更内容・現在のコミットへの独立レビュー・CIを毎回照合して付与する。

## 対象

- 同じリポジトリからmainへの、Draftではない`docs:` PR。
- README.md / README.ja.md / packages/core/README.mdの既存ファイルだけ。最大2ファイル・4行の置換で、合計編集距離は12文字以内。
- 通常の文章の小さな修正に限る。コードブロック、HTML、リンク、数値、コマンド、API・既定値・権限・ライセンスなどの契約に触れる表現は対象外。

構文・既知のCLI語・契約に関係する語を機械的に除外するが、意味の判定まで保証するものではない。独立レビューで文意を確認し、行数やラベルだけでは承認しない。対象を広げるときは、このポリシーと判定・回帰テストを通常のPRでレビューする。コード・UI・依存関係・設定・workflow・Skills・このポリシー自身は自動承認しない。

## 必要な根拠

現在のheadに対するCodex GitHub Appの独立レビューが必要。GitHub上のBot IDも照合し、正式なAPPROVED、またはレビュー本文の独立した行に`<!-- somen-code-review:pass -->`があるCOMMENTEDだけを受け付ける。リアクション、一般コメント、以前のheadへのレビュー、レビューの失敗・省略は受け付けない。指摘があるレビューには完了マーカーを付けない。AGENTS.mdのレビュー規約を参照する。

未解決のレビュー会話や変更要求がある場合、チェック・会話の取得が途中で切れた場合は停止する。GitHub Actionsの`Checks`成功と、headに対するチェック全体の成功が揃ったら、workflowがそのコミットを正式に承認し、同じheadを指定して[GitHub標準のsquash merge API](https://docs.github.com/en/rest/pulls/pulls#merge-a-pull-request)を実行する。既存の必須レビュー・最新CI・会話解決などのブランチ保護は維持する。

条件を満たさなくなった場合やマージが拒否された場合は、自動化のラベル・承認を取り消す。人がすでにauto-mergeを予約したPRには介入しない。新しいpushではブランチ保護による古い承認の無効化も働く。API障害時はエラーを記録し、取り消しにも失敗した場合は明示的にworkflowを失敗させる。

## 実行と導入

PRの作成・更新、CIの完了、手動実行で再判定する。レビューの完了がCIより後になる場合に備え、30分ごとにも開いているPRを確認する。write権限を持つjobは既定ブランチのコードだけを実行し、PRのコードやartifactを実行しない。判定対象の本文やファイルはAPIからデータとして読む。[GitHubの権限分離の説明](https://docs.github.com/en/actions/reference/security/secure-use#mitigating-the-risks-of-untrusted-code-checkout)に従う。

GITHUB_TOKENでのマージは通常のpush連動workflowを起動しないため、マージ前のPR Checksで検証を完結させる。mainへのpushでの公開やdeployをこの仕組みの完了条件にはしない。

導入にはmainへのworkflowのマージ、PR作成フローのレビュー規約、Codexの自動レビュー有効化、GitHub ActionsによるPR承認の許可が必要。マージAPIにはcontents:write、承認にはpull-requests:writeをjob単位で付ける。設定不足や完了マーカーがない場合は通常のレビュー待ちに戻る。新しいAPI keyは必要ない。

画面に影響するPRでは、PR作成Skillに従ってsandbox / previewを起動し、広い画面と320pxで画像を実際に見て確認する。ブラウザ回帰テストもCIで実行し、画像はartifactに残す。画面変更はこの自動承認の対象には含めない。

ローカル確認は`pnpm test:automation`、`pnpm code:check`、`pnpm docs:check`。GitHub上の承認・取り消し・マージはmainへの導入後に、条件を満たす小さな文書PRで確認する。それまで運用開始済みとは扱わない。
