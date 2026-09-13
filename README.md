# KC Battle Replayer (Iwakawa)

[「七四式電子観測儀（岩川版）」](https://github.com/dais-k/ElectronicObserver)が出力する戦闘詳細ログ（テキストファイル）を解析し、[KC3Kai Battle Replayer](https://kc3kai.github.io/kancolle-replay/battleplayer.html) 形式（URLハッシュ / JSON）に高精度で変換・即時再生できるWebアプリケーションです。

---

## 概要

岩川版七四式電子観測儀は、戦闘経過を人間が読みやすい日本語テキスト形式で記録します。
本ツールは、このテキストログから艦娘・敵艦・装備・基地航空隊・各種戦闘フェーズのデータを解析・逆シリアライズし、公式通信データ準拠のリプレイデータへと変換します。

## 使い方

中央のエリアから、`ElectronicObserver/BalleLog`のフォルダを選択することで、中を解析し、リプレイデータを生成します。
