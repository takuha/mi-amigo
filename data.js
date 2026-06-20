// Mi Amigo — 実データ（アンティグアの実在の店舗・体験）
// 写真の入れ方: img フィールドに "img/<id>.jpg" を置くか、画像URLを指定。
//   未指定なら emoji＋グラデーションのプレースホルダーで表示されます。
// 価格(price)は USD のおおよその目安。実際の料金は各店舗で要確認。
window.MI_AMIGO_DATA = {
  listings: [
    {
      id: "delagente-coffee", type: "exp", emoji: "☕",
      title: "De La Gente コーヒー農園＆コミュニティ体験",
      desc: "生産者協同組合と歩く社会的企業のツアー。摘み取り〜焙煎、コミュニティ支援の現場まで",
      price: 40, unit: "USD", maxSlots: 8,
      area: "サンミゲル・エスコバル（アンティグア近郊）", link: "https://www.delagente.org/",
      img: ""
    },
    {
      id: "chocomuseo-bar", type: "exp", emoji: "🍫",
      title: "ChocoMuseo Bean-to-Bar チョコ ワークショップ",
      desc: "カカオ豆から板チョコまで（約2時間）。手作り120gをお持ち帰り",
      price: 33, unit: "USD", maxSlots: 12,
      area: "4a calle oriente（中央公園すぐ）", link: "https://www.chocomuseo.com/",
      img: ""
    },
    {
      id: "kakaw-weaving", type: "exp", emoji: "🧵",
      title: "Kakaw Designs バックストラップ織り ワークショップ",
      desc: "マヤの腰機織りを庭で学ぶ（英・西対応）。福祉×ウイピル アップサイクルと連動",
      price: 45, unit: "USD", maxSlots: 5,
      area: "アンティグア中心部", link: "https://kakawdesigns.com/",
      img: ""
    },
    {
      id: "food-tour", type: "exp", emoji: "🥘",
      title: "アンティグア ストリートフード ツアー",
      desc: "ガイドと市場〜名店を巡り約10品を試食。少人数制",
      price: 55, unit: "USD", maxSlots: 10,
      area: "アンティグア旧市街", link: "",
      img: ""
    },
    {
      id: "kombu-ramen", type: "food", emoji: "🍜",
      title: "Kombu Ramen Shop 席予約",
      desc: "グアテマラ初のラーメン店。地元産小麦の自家製麺と6種のラーメン",
      price: 14, unit: "USD", maxSlots: 16,
      area: "3a calle oriente #19D", link: "https://komburamenshop.com/",
      img: ""
    },
    {
      id: "barbara-hostel", type: "stay", emoji: "🛏️",
      title: "Barbara's Boutique Hostel（1泊・ドミトリー）",
      desc: "コロニアル様式の邸宅。屋上テラスからアグア・フエゴ・アカテナンゴの3火山",
      price: 15, unit: "USD", maxSlots: 10,
      area: "アンティグア中心部", link: "",
      img: ""
    },
  ],

  // 謎解きカフェ巡り（実在のスペシャルティカフェ）
  quest: {
    title: "アンティグア スペシャルティカフェ謎解きラリー",
    reward: "5軒コンプリートで限定ステッカー＋次回10%OFF",
    cafes: [
      { id: "q-sol",     emoji: "☀️", name: "Café Sol",        area: "アグア火山が見えるテラス",
        riddle: "花で飾られた小さなテラスから“アグア火山”が見える、朝の一杯から。", answer: "アグア火山", img: "" },
      { id: "q-fatcat",  emoji: "🐱", name: "Fat Cat (Café Raíz)", area: "アンティグア中心部",
        riddle: "Gersonが10年以上前に始めた、グアテマラ最初期のスペシャルティの一軒。", answer: "Fat Cat", img: "" },
      { id: "q-artista", emoji: "🎨", name: "Artista de Café", area: "San José El Viejo 教会の向かい",
        riddle: "白くミニマルな店内。サン・ホセ・エル・ビエホ教会の真向かいを探せ。", answer: "教会", img: "" },
      { id: "q-alegria", emoji: "😊", name: "Alegría Café",    area: "アンティグア中心部",
        riddle: "コミュニティと環境を大切にする一杯。クッキーも名物。", answer: "クッキー", img: "" },
      { id: "q-12onzas", emoji: "⏳", name: "12 Onzas",        area: "アンティグア中心部",
        riddle: "ミニマルなデザインのモダンカフェ。最後のスタンプはここで。", answer: "12", img: "" },
    ],
  },

  // 音声ウォーキングガイド（日本語・英語・スペイン語）
  // audio フィールドに音声ファイルを置けば録音音声を再生。未指定なら端末の音声合成(TTS)で読み上げ。
  guide: {
    route: {
      title: { ja: "アンティグア 街歩き音声ガイド", en: "Antigua Walking Audio Guide", es: "Audioguía a pie de Antigua" },
      intro: {
        ja: "世界遺産の街アンティグアを、約10スポット巡ります。各スポットで再生ボタンを押すと、その場所の物語が流れます。",
        en: "Walk the UNESCO city of Antigua across ~10 stops. Tap play at each stop to hear its story.",
        es: "Recorre la ciudad Patrimonio de Antigua en ~10 paradas. Pulsa reproducir en cada parada para oír su historia.",
      },
      stops: [
        { id: "s1", emoji: "🌉", lat: 14.5586, lng: -90.7339,
          title: { ja: "サンタ・カタリナのアーチ", en: "Santa Catalina Arch", es: "Arco de Santa Catalina" },
          text: {
            ja: "アンティグアの象徴、黄色いアーチ。17世紀、修道女たちが通りに姿を見せず行き来できるよう、修道院と学校をつなぐ橋として造られました。背後にはアグア火山がそびえます。",
            en: "Antigua's icon, the yellow arch. Built in the 17th century so cloistered nuns could cross the street unseen, linking the convent and school. Volcán de Agua rises behind it.",
            es: "El ícono de Antigua, el arco amarillo. Construido en el siglo XVII para que las monjas de clausura cruzaran la calle sin ser vistas. Detrás se alza el Volcán de Agua.",
          } },
        { id: "s2", emoji: "⛲", lat: 14.5564, lng: -90.7339,
          title: { ja: "中央公園（プラサ・マヨール）", en: "Central Park (Plaza Mayor)", es: "Parque Central (Plaza Mayor)" },
          text: {
            ja: "街の心臓部。中央には「人魚の噴水」が立ち、大聖堂や旧総督府に囲まれています。人々が集い、休む、アンティグアの暮らしの中心です。",
            en: "The heart of the city. At its center stands the Fountain of the Sirens, surrounded by the cathedral and the old palaces. It is where life in Antigua gathers.",
            es: "El corazón de la ciudad. En su centro está la Fuente de las Sirenas, rodeada por la catedral y los antiguos palacios. Aquí se reúne la vida de Antigua.",
          } },
        { id: "s3", emoji: "⛪", lat: 14.5566, lng: -90.7327,
          title: { ja: "サン・ホセ大聖堂（旧聖堂跡）", en: "Cathedral of San José (ruins)", es: "Catedral de San José (ruinas)" },
          text: {
            ja: "かつて中米最大級を誇った聖堂。1773年の大地震で崩れ、今もその壮大な廃墟が残ります。崩れたアーチの天井に、当時の繁栄が偲ばれます。",
            en: "Once among the grandest cathedrals in Central America, toppled by the 1773 earthquake. Its majestic ruins still stand, the broken vaults hinting at past glory.",
            es: "Una de las catedrales más grandiosas de Centroamérica, derribada por el terremoto de 1773. Sus ruinas majestuosas aún se alzan, evocando su antiguo esplendor.",
          } },
        { id: "s4", emoji: "🏛️", lat: 14.5560, lng: -90.7335,
          title: { ja: "総督府（カピタネス・ヘネラレス宮殿）", en: "Palace of the Captains General", es: "Palacio de los Capitanes Generales" },
          text: {
            ja: "スペイン植民地時代、グアテマラ総督領を治めた政庁。長く連なるアーチの回廊が、当時の権力の大きさを物語ります。",
            en: "The seat of Spanish colonial government for the Captaincy General of Guatemala. Its long arcade of arches speaks to the reach of that power.",
            es: "La sede del gobierno colonial español de la Capitanía General de Guatemala. Su larga arcada habla del alcance de aquel poder.",
          } },
        { id: "s5", emoji: "💛", lat: 14.5601, lng: -90.7344,
          title: { ja: "ラ・メルセー教会", en: "La Merced Church", es: "Iglesia de La Merced" },
          text: {
            ja: "鮮やかな黄色と白の漆喰装飾が美しいバロック教会。地震に耐えるよう低く頑丈に設計されました。中庭の修道院跡には中米最大級の噴水があります。",
            en: "A Baroque church famed for its vivid yellow facade and white stucco. Built low and strong to resist earthquakes. Its convent ruins hold one of Central America's largest fountains.",
            es: "Una iglesia barroca célebre por su fachada amarilla y su estuco blanco. Construida baja y fuerte para resistir terremotos. En su convento está una de las fuentes más grandes de Centroamérica.",
          } },
        { id: "s6", emoji: "🏚️", lat: 14.5588, lng: -90.7316,
          title: { ja: "カプチナス修道院", en: "Las Capuchinas Convent", es: "Convento de las Capuchinas" },
          text: {
            ja: "保存状態の良い修道院。円形に並ぶ修道女の小部屋「塔」が珍しく、静寂と祈りの暮らしを今に伝えます。",
            en: "A remarkably preserved convent. Its unusual circular 'tower' of nuns' cells still conveys a life of silence and prayer.",
            es: "Un convento muy bien conservado. Su singular 'torre' circular de celdas de monjas evoca una vida de silencio y oración.",
          } },
        { id: "s7", emoji: "✝️", lat: 14.5650, lng: -90.7300,
          title: { ja: "クルスの丘（展望台）", en: "Hill of the Cross (viewpoint)", es: "Cerro de la Cruz (mirador)" },
          text: {
            ja: "街を見下ろす丘の上の十字架。アンティグアの碁盤の街並みと、その先にそびえるアグア火山が一直線に並ぶ絶景スポットです。",
            en: "A cross on the hill above the city. From here the grid of Antigua lines up perfectly with Volcán de Agua beyond — the classic panorama.",
            es: "Una cruz en la colina sobre la ciudad. Desde aquí la cuadrícula de Antigua se alinea con el Volcán de Agua: la vista clásica.",
          } },
        { id: "s8", emoji: "🙏", lat: 14.5535, lng: -90.7313,
          title: { ja: "サン・フランシスコ教会（エルマノ・ペドロ）", en: "San Francisco Church (Hermano Pedro)", es: "Iglesia de San Francisco (Hermano Pedro)" },
          text: {
            ja: "中米初の聖人、エルマノ・ペドロが眠る巡礼地。今も多くの人が願いを胸に訪れ、祈りを捧げます。",
            en: "A pilgrimage site holding the tomb of Hermano Pedro, the first saint of Central America. Many still come to pray and leave their wishes.",
            es: "Un sitio de peregrinación con la tumba del Hermano Pedro, el primer santo de Centroamérica. Muchos aún vienen a orar y dejar sus peticiones.",
          } },
        { id: "s9", emoji: "💧", lat: 14.5560, lng: -90.7300,
          title: { ja: "タンケ・ラ・ウニオン（洗濯場）", en: "Tanque La Unión (wash basins)", es: "Tanque La Unión (lavaderos)" },
          text: {
            ja: "石造りの公共洗濯場。植民地時代から人々が洗濯や語らいに集った場所で、今も地元の暮らしが息づいています。",
            en: "Public stone wash basins. Since colonial times people have gathered here to wash and talk — local daily life still lives on.",
            es: "Lavaderos públicos de piedra. Desde la época colonial la gente se reúne aquí a lavar y conversar; la vida local sigue viva.",
          } },
        { id: "s10", emoji: "🧶", lat: 14.5558, lng: -90.7352,
          title: { ja: "工芸市場（ウイピルの織物）", en: "Crafts Market (Huipil textiles)", es: "Mercado de Artesanías (huipiles)" },
          text: {
            ja: "色鮮やかなマヤの織物「ウイピル」が並ぶ市場。一枚一枚が村ごとの模様を持ち、作り手の物語を宿しています。アンティグアの手仕事に触れて旅を締めくくりましょう。",
            en: "A market bright with Maya 'huipil' textiles. Each piece carries the pattern of its village and the story of its maker. End your walk by touching Antigua's craft.",
            es: "Un mercado lleno de textiles mayas 'huipiles'. Cada pieza lleva el patrón de su pueblo y la historia de quien la teje. Cierra tu paseo tocando la artesanía de Antigua.",
          } },
      ],
    },
    // 歴史を聴くシリーズ（場所に縛られない音声コンテンツ）
    history: [
      { id: "h1", emoji: "📜",
        title: { ja: "グアテマラ小史", en: "A Short History of Guatemala", es: "Breve historia de Guatemala" },
        text: {
          ja: "マヤ文明の地に、1524年スペインのアルバラードが征服者として現れ、植民地時代が始まりました。1821年に独立。先住民の文化と植民の歴史が、今のグアテマラに重なっています。",
          en: "On the land of the Maya, the Spaniard Alvarado arrived as conqueror in 1524, beginning the colonial era. Independence came in 1821. Indigenous culture and colonial history layer into today's Guatemala.",
          es: "En tierra maya, el español Alvarado llegó como conquistador en 1524, iniciando la época colonial. La independencia llegó en 1821. La cultura indígena y la historia colonial se superponen en la Guatemala de hoy.",
        } },
      { id: "h2", emoji: "🌋",
        title: { ja: "アンティグア、遷都の物語", en: "Antigua: Why the Capital Moved", es: "Antigua: por qué se mudó la capital" },
        text: {
          ja: "この街はかつて「サンティアゴ・デ・ロス・カバジェロス」と呼ばれた首都でした。1773年のサンタ・マルタ大地震で甚大な被害を受け、首都は現在のグアテマラシティへ移転。残されたこの街は「ラ・アンティグア（古い都）」と呼ばれるようになりました。",
          en: "This city was once the capital, 'Santiago de los Caballeros.' The Santa Marta earthquakes of 1773 devastated it, and the capital moved to today's Guatemala City. What remained became 'La Antigua' — the old capital.",
          es: "Esta ciudad fue la capital, 'Santiago de los Caballeros'. Los terremotos de Santa Marta de 1773 la devastaron y la capital se trasladó a la actual Ciudad de Guatemala. Lo que quedó pasó a llamarse 'La Antigua'.",
        } },
    ],
  },
};
