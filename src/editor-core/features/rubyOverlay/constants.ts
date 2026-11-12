/**
 * EDITOR-RUBY-OVERLAY-P0: Ruby Overlay の識別子と定数（import-0）。
 *
 * 本文のDOM（schema・`renderHTML`・`parseHTML`）は変えない。flagがONのときだけ、CSSでルビの親文字の`position`を外し、
 * 読みの要素を`display: none`にして、画面の近くの読みだけを`.editor-surface`の子の1つの層に描く。
 */

/** `.editor-core-host`（Hostのroot）へ、editorを作るときに1回だけ付ける。CSSはこの属性の下だけに書く。 */
export const RUBY_OVERLAY_ATTRIBUTE = 'data-nyoze-ruby-overlay'
/** 層の要素。 */
export const RUBY_OVERLAY_LAYER_ATTRIBUTE = 'data-nyoze-ruby-overlay-layer'
/** 層の子（読み1つ）。 */
export const RUBY_OVERLAY_READING_ATTRIBUTE = 'data-nyoze-ruby-overlay-reading'

export const RUBY_SELECTOR = '.tategaki-aozora-ruby'
export const RUBY_READING_SELECTOR = '.tategaki-aozora-ruby-rt'
/** 段落プレーン編集で、入力欄が重なっている段落（node decorationのclass）。この中の読みは描かない。 */
export const PARAGRAPH_PLAIN_TARGET_SELECTOR = '.tategaki-plain-overlay-target'

/** 画面の前後に、画面1つ分ずつ描く。 */
export const DRAW_BUFFER_RATIO = 1
/** これより遠い読みは、次に描き直すときに外す（描く範囲より、さらに画面1つ分外）。 */
export const PRUNE_BUFFER_RATIO = 2
/**
 * scrollで、画面の端が「描いた範囲の端」からこの割合（画面の大きさに対して）まで近づいたら、足りない分を足す。
 * 描き終えた直後は、画面の端から描いた範囲の端まで`DRAW_BUFFER_RATIO`の余裕がある。
 */
export const LIVE_REFILL_MARGIN_RATIO = 0.5

/** 読みの`line-height`（`.tategaki-aozora-ruby-rt`のCSSと同じ値）。 */
export const READING_LINE_HEIGHT = '1.2'
