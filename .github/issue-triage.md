# Issue triage

新規・再開・本文編集時に、Issueの種類と対象領域をラベルで補助する。手動実行では既存のopen Issueを1件ずつ指定できる。workflowをmainへ取り込んだ後に有効になる。

- 種類は既存の`bug`・`enhancement`・`documentation`を優先し、なければタイトルやフォームから補う。
- 対象領域は`area:core`・`area:cli`・`area:demo`・`area:docs`・`area:automation`。明示的な手がかりがある領域を複数付けられる。
- 再現手順や利用目的が不足する場合は`triage:needs-info`、記載が揃った場合は`triage:needs-review`。後者も妥当性・優先度の判断はまだ行っていない状態を示す。
- この2つのステータスだけを相互に置き換える。手動ラベル、担当者、優先度、open / closedの状態は変更しない。Auto Approvalも付けない。

Issue本文は分類するデータとして扱い、コードや指示として実行しない。処理はdefault branchのスクリプトを使い、API書き込み権限をラベル操作に使う。曖昧な内容の判断、重複の確定、対応方針の決定は保守者または別の調査タスクで行う。

`pnpm test:automation`で分類と更新処理のテスト、`pnpm code:check`で静的検査を行う。GitHub上の実イベントはmainへの導入後に確認する。
