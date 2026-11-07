# ja and ko_KR notes

Files: src/i18n/locales/ja.ts, ko_KR.ts (625 keys each; `_one` plural keys omitted, `_other` only).

## Glossary (ja / ko)
- table: テーブル / 테이블; field: フィールド / 필드; relationship: リレーションシップ (tabs: 関係) / 관계
- diagram: ダイアグラム / 다이어그램; area: エリア / 영역; note: メモ / 메모; schema: スキーマ / 스키마
- custom type: カスタム型 / 사용자 정의 타입; index: インデックス / 인덱스; view: ビュー / 뷰
- primary key: 主キー / 기본 키; foreign key: 外部キー / 외래 키; cardinality: 多重度 / 카디널리티
- register: ja です・ます; ko 해요체 (labels as noun forms)

## Doubts
- ko: particles after placeholders (을(를), 와/과 via "와", 으로/로) are approximations since the value is unknown; `foundWithViews`/`foundOnly` use 와/를.
- ja `rail.customTypes` = 型 and ko 타입 (short rail label); `rail.visuals` = その他 / 기타.
- ja `fields.autoIncrement` = 自動採番, ko 자동 증가; `lengthCustom` = 指定 / 직접 입력.
- ja `entity.showLess` = 閉じる (pairs with もっと見る).
- ko `menu.view.compactTables` = 간단한 테이블.
