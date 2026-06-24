/* =========================================================================
 * Mi Amigo — アンティグア街おこし統合アプリ（プロトタイプ）
 * 多言語(日英西) / 言語選択(ログイン・マイページ) / 予約決済 / 歴史ミステリー謎解き
 * (ガイド連動・実写真投稿・5プラットフォーム共有) / 音声ガイド(再生中ハイライト) / マップ(GPS+Googleマップ)
 *
 * ⚠️ プロトタイプ: データは localStorage（端末内）。決済はモック。認証はフロント簡易実装。
 * ===================================================================== */
const DATA = window.MI_AMIGO_DATA;

/* ---------- localStorage ---------- */
const DB = {
  get(k, def){ try{ return JSON.parse(localStorage.getItem(k)) ?? def; }catch{ return def; } },
  set(k, v){ localStorage.setItem(k, JSON.stringify(v)); },
};
const K = { users:"ma_users", session:"ma_session", resv:"ma_reservations", album:"ma_album", stamps:"ma_stamps", lang:"ma_lang", chat:"ma_chat", groups:"ma_groups", org:"ma_org", ref:"ma_pending_ref", votes:"ma_votes", myvotes:"ma_myvotes", notifs:"ma_notifs" };

/* ---------- 認証 ---------- */
async function sha256(s){ const b=await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s)); return [...new Uint8Array(b)].map(x=>x.toString(16).padStart(2,"0")).join(""); }
function randSalt(){ const a=new Uint8Array(16); crypto.getRandomValues(a); return [...a].map(b=>b.toString(16).padStart(2,"0")).join(""); }
const Auth = {
  async register(name,email,password){ email=email.trim().toLowerCase(); const u=DB.get(K.users,{}); if(u[email]) throw new Error(t("err_exists")); const salt=randSalt(); u[email]={name:name.trim(),email,salt,passHash:await sha256(salt+password)}; DB.set(K.users,u); DB.set(K.session,email); return u[email]; },
  async login(email,password){ email=email.trim().toLowerCase(); const u=DB.get(K.users,{})[email]; if(!u) throw new Error(t("err_nouser")); if(u.passHash!==await sha256(u.salt+password)) throw new Error(t("err_pass")); DB.set(K.session,email); return u; },
  logout(){ localStorage.removeItem(K.session); },
  current(){ const e=DB.get(K.session,null); return e ? DB.get(K.users,{})[e]||null : null; },
};

/* ---------- 組織（オートバイナリー＋紹介コード） ----------
 * 最初に登録した人 = 会員番号1番 = ルート（権限あり/admin）。
 * 以降は紹介コード(?ref)の持ち主の配下へ left→right で自動配置（オートバイナリー）。
 * introKey=紹介ライン(ユニレベル) / parentKey+position=配置(バイナリー)。
 * ※ データは localStorage（この端末内）。複数端末をまたぐ本番組織には
 *   binary_tree_system の API バックエンドをホストして接続する（下の ORG_API 参照）。 */
/* --- ツリー操作の純関数（cloud=Firestoreドキュメント / local=localStorage の双方で共用） --- */
function orgEmptyTree(){ return {seq:0, rootKey:null, codeIndex:{}, members:{}}; }
function orgChildrenOf(tree, key){ const o={}; for(const k in tree.members){ const u=tree.members[k]; if(u.parentKey===key && u.position) o[u.position]=k; } return o; }
function orgPlace(tree, introKey){ // 紹介者配下を BFS して left→right の空き枠（スピルオーバー）
  if(!introKey) return {parentKey:null, position:null};
  const q=[introKey];
  while(q.length){ const node=q.shift(); const ch=orgChildrenOf(tree,node);
    if(!ch.left) return {parentKey:node, position:"left"};
    if(!ch.right) return {parentKey:node, position:"right"};
    q.push(ch.left); q.push(ch.right); }
  return {parentKey:introKey, position:"left"};
}
function orgGenCode(tree, vanity){
  if(vanity){ const v=(vanity||"").toUpperCase().replace(/[^A-Z0-9]/g,"").slice(0,8); if(v && !tree.codeIndex[v]) return v; }
  const AB="ABCDEFGHJKMNPQRSTUVWXYZ23456789"; let c;
  do{ c="AMG-"+Array.from({length:6},()=>AB[Math.floor(Math.random()*AB.length)]).join(""); }while(tree.codeIndex[c]);
  return c;
}
// 新規メンバーを tree に割り当て（採番・直紹介line・オートバイナリー配置・紹介コード発行）。tree を破壊的更新し rec を返す。
function orgAssign(tree, key, name, refCode){
  if(!tree.members) tree.members={}; if(!tree.codeIndex) tree.codeIndex={};
  if(tree.members[key] && tree.members[key].member_id) return tree.members[key]; // 既に登録済み（冪等）
  let introKey=null, parentKey=null, position=null, role="member";
  if(!tree.rootKey){ tree.rootKey=key; role="admin"; }                 // 1番＝ルート＝TAKUHA
  else {
    const code=(refCode||"").trim().toUpperCase();
    introKey = (code && tree.codeIndex[code]) ? tree.codeIndex[code] : tree.rootKey;  // ref無し→ルート(TAKUHA)の直紹介
    const slot=orgPlace(tree, introKey); parentKey=slot.parentKey; position=slot.position;
  }
  tree.seq=(tree.seq||0)+1;
  const member_id=tree.seq;
  const newCode=orgGenCode(tree, member_id===1 ? (name||"") : "");      // 1番だけ名前ベースの覚えやすいコード
  const rec={ key, name:name||"", member_id, role, introKey, parentKey, position, refCode:newCode };
  tree.members[key]=rec; tree.codeIndex[newCode]=key;
  return rec;
}

/* ---------- 組織（オートバイナリー＋紹介コード）：全ユーザー共有 ----------
 * 最初に登録した人 = 会員番号1番 = ルート（admin）＝ TAKUHA。
 * 紹介コード(?ref)なしで登録 → ルート(TAKUHA)の直紹介。ありなら、その持ち主の直紹介。
 * 配置はオートバイナリー（BFSスピルオーバー）。
 * 保存先：Firebaseがあれば Firestore の単一ドキュメント org/tree（全端末で1つの組織）。
 *         無い/繋がらない時は localStorage（端末内）にフォールバック。
 * プライバシー：共有ツリーのキーは電話番号そのものではなく sha256(電話番号)。 */
const Org = {
  cloud:false, _tree:null,
  meta(){ if(this.cloud){ const t=this._tree||orgEmptyTree(); return {seq:t.seq, rootKey:t.rootKey, codeIndex:t.codeIndex||{}}; } return DB.get(K.org,{seq:0,rootKey:null,codeIndex:{}}); },
  users(){ if(this.cloud){ return (this._tree&&this._tree.members)||{}; } return DB.get(K.users,{}); },
  rec(key){ return this.users()[key]||null; },
  keyOf(u){ return u.key || u.email; },
  byCode(code){ const m=this.meta(); const k=m.codeIndex[(code||"").trim().toUpperCase()]; return k?this.rec(k):null; },
  count(){ return Object.values(this.users()).filter(u=>u.member_id).length; },
  children(key){ const o={}; for(const u of Object.values(this.users())){ if(u.parentKey===key && u.position) o[u.position]=this.keyOf(u); } return o; },
  introducees(key){ return Object.values(this.users()).filter(u=>u.introKey===key).sort((a,b)=>a.member_id-b.member_id).map(u=>this.keyOf(u)); },
  refUrl(code){ return location.origin+location.pathname+"?ref="+encodeURIComponent(code); },
  // 新規登録：電話認証済み(currentUser有り)なら Firestore トランザクションで全員共有ツリーに追加。失敗時はローカル。
  async register(localKey, name, refCode){
    if(Cloud.db && Cloud.auth && Cloud.auth.currentUser){
      try{ return await this.registerCloud(localKey, name, refCode); }
      catch(e){ console.warn("[Org] クラウド登録に失敗→ローカルにフォールバック", e); }
    }
    return this.registerLocal(localKey, name, refCode);
  },
  async registerCloud(localKey, name, refCode){
    const hkey=await sha256(localKey);                  // 電話番号は保存せず sha256 をキーに
    const ref=Cloud.db.collection("org").doc("tree");
    let rec=null;
    await Cloud.db.runTransaction(async tx=>{
      const snap=await tx.get(ref);
      const tree=snap.exists ? snap.data() : orgEmptyTree();
      rec=orgAssign(tree, hkey, name, refCode);
      tx.set(ref, tree);
    });
    return rec;
  },
  registerLocal(key, name, refCode){
    const all=DB.get(K.users,{}); const u=all[key]; if(!u) return null;
    if(u.member_id) return u;
    const meta=DB.get(K.org,{seq:0,rootKey:null,codeIndex:{}});
    const tree={seq:meta.seq, rootKey:meta.rootKey, codeIndex:{...meta.codeIndex}, members:{}};
    for(const k in all){ const x=all[k]; if(x.member_id) tree.members[k]={key:k, name:x.name, member_id:x.member_id, role:x.role, introKey:x.introKey, parentKey:x.parentKey, position:x.position, refCode:x.refCode}; }
    const rec=orgAssign(tree, key, name, refCode);
    Object.assign(u, {key, member_id:rec.member_id, role:rec.role, introKey:rec.introKey, parentKey:rec.parentKey, position:rec.position, refCode:rec.refCode});
    all[key]=u; DB.set(K.users,all);
    DB.set(K.org, {seq:tree.seq, rootKey:tree.rootKey, codeIndex:tree.codeIndex});
    return rec;
  },
  binaryTree(){ const m=this.meta(); if(!m.rootKey) return null; const self=this;
    const node=k=>{ const u=self.rec(k); if(!u) return null; const ch=self.children(k);
      return {name:u.name, member_id:u.member_id, role:u.role, left:ch.left?node(ch.left):null, right:ch.right?node(ch.right):null}; };
    return node(m.rootKey); },
  unilevelTree(){ const m=this.meta(); if(!m.rootKey) return null; const self=this;
    const node=k=>{ const u=self.rec(k); if(!u) return null;
      return {name:u.name, member_id:u.member_id, role:u.role, kids:self.introducees(k).map(node).filter(Boolean)}; };
    return node(m.rootKey); },
};
// 現在ユーザーの組織キー（cloud=sha256ハッシュ / local=電話キー）
function orgKeyOf(){ const u=userRec(); return (u&&(u.okey||u.key||u.email))||""; }
// 登録結果(rec)をローカルのユーザーレコードに反映（mypage表示・紹介コード用）
function mergeMyOrg(nu){
  if(!nu||!State.user) return;
  const all=DB.get(K.users,{}); const lu=all[State.user.email]||State.user;
  Object.assign(lu,{okey:nu.key||State.user.email, member_id:nu.member_id, role:nu.role, introKey:nu.introKey, parentKey:nu.parentKey, position:nu.position, refCode:nu.refCode});
  all[State.user.email]=lu; DB.set(K.users,all); State.user=lu;
}
// クラウドの共有ツリーから、自分の組織フィールドをローカルへ同期（他端末の更新も反映）
async function syncMyOrg(){
  if(!Org.cloud || !State.user || !Org._tree) return;
  try{ const hkey=await sha256(State.user.email); const rec=Org._tree.members&&Org._tree.members[hkey]; if(rec) mergeMyOrg(rec); }catch(e){}
}

/* 紹介まわりの簡易多言語 */
const ORG_I18N = {
  ja:{ your_no:"あなたの会員番号", your_code:"あなたの紹介コード", invite_title:"友だちを招待", invite_sub:"このコード/URLから登録した人が、あなたのアミーゴ（紹介した仲間）になります", copy:"コピー", copied:"コピーしました", share:"共有", org_chart:"組織図", members:"会員数", binary:"バイナリー（配置）", unilevel:"ユニレベル（紹介）", welcome_code:"あなたの紹介コードができました！", introduced_by:"紹介者", joined_via:"招待コードで登録します" },
  en:{ your_no:"Your member no.", your_code:"Your referral code", invite_title:"Invite friends", invite_sub:"People who join via this code/URL become your amigos", copy:"Copy", copied:"Copied", share:"Share", org_chart:"Org chart", members:"Members", binary:"Binary (placement)", unilevel:"Unilevel (referral)", introduced_by:"Referred by", welcome_code:"Your referral code is ready!", joined_via:"Joining with an invite code" },
  es:{ your_no:"Tu nº de miembro", your_code:"Tu código de invitación", invite_title:"Invita a amigos", invite_sub:"Quien se una con este código/URL se vuelve tu amigo", copy:"Copiar", copied:"Copiado", share:"Compartir", org_chart:"Organigrama", members:"Miembros", binary:"Binario (colocación)", unilevel:"Unilevel (referidos)", introduced_by:"Invitado por", welcome_code:"¡Tu código de invitación está listo!", joined_via:"Te registras con un código" },
};
function orgT(k){ return (ORG_I18N[State.lang]||ORG_I18N.ja)[k] || ORG_I18N.ja[k] || k; }
function copyText(s){ if(navigator.clipboard){ navigator.clipboard.writeText(s).then(()=>toast(orgT("copied"))).catch(()=>toast(s)); } else toast(s); }

/* ---------- 状態 ---------- */
const State = {
  user:null, view:"mypage",
  cal:{year:0,month:0},
  lang: localStorage.getItem(K.lang) || "ja",
  speakingId:null,
  geo:null, // 現在地 {lat,lng}
  chatGroup:null, // 開いているグループid
  business:false, // 企業向け広告ページ表示中
};

/* ---------- プロフィール ---------- */
function userRec(){ return DB.get(K.users,{})[State.user.email] || State.user; }
function saveProfile(p){ const u=DB.get(K.users,{}); const r=u[State.user.email]; if(!r) return;
  if(p.nick) r.name=p.nick.trim();
  if(p.avatar!==undefined) r.avatar=p.avatar;
  if(p.bio!==undefined) r.bio=(p.bio||"").trim();
  if(p.age!==undefined) r.age=p.age;
  if(p.gender!==undefined) r.gender=p.gender;
  if(p.country!==undefined) r.country=p.country;
  if(p.prouds!==undefined) r.prouds=p.prouds;
  DB.set(K.users,u); State.user=r; }
function profileMeta(r){ const b=[]; if(r.country) b.push(countryFlag(r.country)+" "+countryName(r.country)); if(r.age) b.push(r.age); if(r.gender) b.push(t("g_"+r.gender)); let s=b.join(" · "); if(r.prouds&&r.prouds.length) s+=(s?"　":"")+"❤️ "+r.prouds.map(countryFlag).join(""); return s; }
function avatarHTML(rec, size){
  size=size||44;
  if(rec && rec.avatar) return `<div class="avatar" style="width:${size}px;height:${size}px;background-image:url('${rec.avatar}')"></div>`;
  if(rec && rec.emoji) return `<div class="avatar ph" style="width:${size}px;height:${size}px;font-size:${Math.round(size*0.5)}px">${rec.emoji}</div>`;
  const ch=((rec && (rec.name||rec.from)) || "?").trim()[0] || "?";
  return `<div class="avatar ph" style="width:${size}px;height:${size}px;font-size:${Math.round(size*0.42)}px">${esc(ch.toUpperCase())}</div>`;
}

/* ---------- i18n ---------- */
const LANGS = [["ja","日本語"],["en","English"],["es","Español"]];
const LANG_CODE = { ja:"ja-JP", en:"en-US", es:"es-ES" };
const I18N = {
  ja:{ tab_discover:"探す", tab_quest:"謎解き", tab_guide:"ガイド", tab_map:"マップ", tab_album:"アルバム", tab_mypage:"アミーゴ",
    tagline:"アンティグアを、もっと面白く歩こう。", register:"新規登録", login:"ログイン", name:"お名前 / ニックネーム", email:"メールアドレス", password:"パスワード", pw_ph:"6文字以上",
    create:"アカウント作成", login_btn:"ログイン", choose_lang:"言語を選択 / Language", proto_note:"プロトタイプ版です。データはこの端末内にのみ保存されます。",
    welcome:"ようこそ", discover_sub:"アンティグアの体験・カフェ・宿を予約", book:"予約する", per:"名", official:"公式サイト",
    pick_date:"日付を選ぶと、その日の空き枠が表示されます", booking_detail:"予約内容", remaining:"空き枠 残り", people:"名", total:"合計", pay_confirm:"💳 決済して予約を確定", no_charge:"※ プロトタイプのため実際の課金は発生しません", slots_max:"空き枠の上限です",
    pay_title:"💳 お支払い", plan:"プラン", date:"日付", num:"人数", cardno:"カード番号（ダミー）", expiry:"有効期限", pay_now:"を支払う", back:"戻る", processing:"処理中…", booked:"✅ 予約が確定しました！",
    quest_sub:"ガイドで語られる“場所”を探して写真を撮ろう", progress:"進捗", checkin:"チェックイン", photo:"写真", checked:"✅ 写真投稿ずみ", reward_done:"🗝️ 次のダンジョン出現！", reward_left:"個で次のダンジョン出現",
    ck_take:"📷 写真を撮る / 選ぶ", ck_later:"あとで", ck_hint:"この場所で写真を撮ろう（顔出し不要）。撮った写真はアルバムに保存され、SNSに投稿して拡散できます。", ck_done:"📸 写真を投稿しました！スタンプGET", ck_fail:"写真の読み込みに失敗しました",
    guide_sub:"🎧 歩きながら聴ける音声ガイド", walk_route:"街歩きルート", listen_history:"歴史を聴く", play:"▶ 再生", stop:"■ 停止", tts_note:"※ 現在は端末の音声合成(TTS)で読み上げ。録音音声に差し替え予定。", reading:"読み上げ中…", replay:"↻ もう一度", close:"閉じる", no_tts:"この端末は音声読み上げに未対応です",
    map_sub:"GPSで現在地から、Googleマップで道案内", enable_loc:"📍 現在地を取得して近い順に並べる", locating:"現在地を取得中…", loc_fail:"現在地を取得できませんでした", go_here:"🧭 ここへ行く（Googleマップ）", open_map:"🗺️ 地図で開く", away:"約", km_away:"km先", all_route:"🗺️ ルート全体を地図で見る",
    album_sub:"投稿した写真を5つのSNSへ", album_empty:"まだ写真がありません。", go_quest:"謎解きへ", caption:"キャプション（SNS投稿文）", share_to:"投稿する（5プラットフォーム）", save_photo:"📥 写真を端末に保存", other_share:"その他のアプリで共有（写真つき）", delete_photo:"この写真を削除", taken:"に撮影", deleted:"削除しました", copied:"投稿文をコピーしました。アプリで貼り付けて投稿してください", shared:"共有しました！",
    mypage_sub:"", reservations:"予約一覧", no_resv:"まだ予約はありません。「探す」から予約してみましょう。", confirmed:"確定", logout:"ログアウト", language:"言語 / Language", proto_ver:"Mi Amigo — Antigua, Guatemala 🌋",
    err_exists:"このメールアドレスは既に登録されています", err_nouser:"アカウントが見つかりません", err_pass:"パスワードが違います", err_email:"メールアドレスの形式が正しくありません", err_pwlen:"パスワードは6文字以上にしてください", err_name:"お名前を入力してください" },
  en:{ tab_discover:"Explore", tab_quest:"Rally", tab_guide:"Guide", tab_map:"Map", tab_album:"Album", tab_mypage:"Amigo",
    tagline:"Walk Antigua in a whole new way.", register:"Sign up", login:"Log in", name:"Name / Nickname", email:"Email", password:"Password", pw_ph:"6+ characters",
    create:"Create account", login_btn:"Log in", choose_lang:"Choose language / 言語", proto_note:"Prototype. Data is stored only on this device.",
    welcome:"Welcome", discover_sub:"Book experiences, cafes and stays in Antigua", book:"Book", per:"person", official:"Website",
    pick_date:"Pick a date to see that day's availability", booking_detail:"Booking", remaining:"left", people:"ppl", total:"Total", pay_confirm:"💳 Pay & confirm booking", no_charge:"※ Prototype — no real charge", slots_max:"No more slots available",
    pay_title:"💳 Payment", plan:"Plan", date:"Date", num:"People", cardno:"Card number (dummy)", expiry:"Expiry", pay_now:"Pay", back:"Back", processing:"Processing…", booked:"✅ Booking confirmed!",
    quest_sub:"Find the places told in the guide and photograph them", progress:"Progress", checkin:"Check in", photo:"Photo", checked:"✅ Posted", reward_done:"🗝️ Next dungeon!", reward_left:" more to next dungeon",
    ck_take:"📷 Take / choose photo", ck_later:"Later", ck_hint:"Take a photo here (no face needed). It's saved to your album and you can share it to social media.", ck_done:"📸 Photo posted! Stamp earned", ck_fail:"Could not load photo",
    guide_sub:"🎧 Listen while you walk", walk_route:"Walking route", listen_history:"Listen: History", play:"▶ Play", stop:"■ Stop", tts_note:"※ Currently read by device text-to-speech. Recorded audio coming.", reading:"Reading…", replay:"↻ Again", close:"Close", no_tts:"This device does not support text-to-speech",
    map_sub:"Use GPS and get directions on Google Maps", enable_loc:"📍 Use my location & sort by nearest", locating:"Getting location…", loc_fail:"Could not get your location", go_here:"🧭 Go here (Google Maps)", open_map:"🗺️ Open in map", away:"~", km_away:"km away", all_route:"🗺️ See full route on map",
    album_sub:"Share your photos to 5 platforms", album_empty:"No photos yet.", go_quest:"To the rally", caption:"Caption (post text)", share_to:"Post (5 platforms)", save_photo:"📥 Save photo to device", other_share:"Share via other apps (with photo)", delete_photo:"Delete this photo", taken:"taken on", deleted:"Deleted", copied:"Caption copied. Paste it in the app to post", shared:"Shared!",
    mypage_sub:"", reservations:"Your bookings", no_resv:"No bookings yet. Try booking from Explore.", confirmed:"Confirmed", logout:"Log out", language:"Language / 言語", proto_ver:"Mi Amigo — Antigua, Guatemala 🌋",
    err_exists:"This email is already registered", err_nouser:"Account not found", err_pass:"Wrong password", err_email:"Invalid email format", err_pwlen:"Password must be 6+ characters", err_name:"Please enter your name" },
  es:{ tab_discover:"Explorar", tab_quest:"Rally", tab_guide:"Guía", tab_map:"Mapa", tab_album:"Álbum", tab_mypage:"Amigo",
    tagline:"Camina Antigua de una forma nueva.", register:"Registrarse", login:"Entrar", name:"Nombre / Apodo", email:"Correo", password:"Contraseña", pw_ph:"6+ caracteres",
    create:"Crear cuenta", login_btn:"Entrar", choose_lang:"Elige idioma / Language", proto_note:"Prototipo. Los datos se guardan solo en este dispositivo.",
    welcome:"Bienvenido", discover_sub:"Reserva experiencias, cafés y hospedaje en Antigua", book:"Reservar", per:"persona", official:"Sitio web",
    pick_date:"Elige una fecha para ver la disponibilidad", booking_detail:"Reserva", remaining:"libres", people:"pers", total:"Total", pay_confirm:"💳 Pagar y confirmar", no_charge:"※ Prototipo — sin cargo real", slots_max:"No hay más cupos",
    pay_title:"💳 Pago", plan:"Plan", date:"Fecha", num:"Personas", cardno:"Tarjeta (ficticia)", expiry:"Vence", pay_now:"Pagar", back:"Volver", processing:"Procesando…", booked:"✅ ¡Reserva confirmada!",
    quest_sub:"Encuentra los lugares de la guía y fotografíalos", progress:"Progreso", checkin:"Registrar", photo:"Foto", checked:"✅ Publicado", reward_done:"🗝️ ¡Nueva mazmorra!", reward_left:" para la próxima mazmorra",
    ck_take:"📷 Tomar / elegir foto", ck_later:"Después", ck_hint:"Toma una foto aquí (sin mostrar la cara). Se guarda en tu álbum y puedes compartirla en redes.", ck_done:"📸 ¡Foto publicada! Sello obtenido", ck_fail:"No se pudo cargar la foto",
    guide_sub:"🎧 Escucha mientras caminas", walk_route:"Ruta a pie", listen_history:"Escuchar: Historia", play:"▶ Reproducir", stop:"■ Parar", tts_note:"※ Por ahora lo lee la voz del dispositivo. Pronto audio grabado.", reading:"Leyendo…", replay:"↻ Otra vez", close:"Cerrar", no_tts:"Este dispositivo no admite lectura por voz",
    map_sub:"Usa GPS y obtén indicaciones en Google Maps", enable_loc:"📍 Usar mi ubicación y ordenar por cercanía", locating:"Obteniendo ubicación…", loc_fail:"No se pudo obtener tu ubicación", go_here:"🧭 Ir aquí (Google Maps)", open_map:"🗺️ Abrir en el mapa", away:"~", km_away:"km", all_route:"🗺️ Ver la ruta completa",
    album_sub:"Comparte tus fotos en 5 plataformas", album_empty:"Aún no hay fotos.", go_quest:"Al rally", caption:"Texto de la publicación", share_to:"Publicar (5 plataformas)", save_photo:"📥 Guardar foto en el dispositivo", other_share:"Compartir en otras apps (con foto)", delete_photo:"Eliminar esta foto", taken:"tomada el", deleted:"Eliminada", copied:"Texto copiado. Pégalo en la app para publicar", shared:"¡Compartido!",
    mypage_sub:"", reservations:"Tus reservas", no_resv:"Aún no hay reservas. Reserva desde Explorar.", confirmed:"Confirmada", logout:"Salir", language:"Idioma / Language", proto_ver:"Mi Amigo — Antigua, Guatemala 🌋",
    err_exists:"Este correo ya está registrado", err_nouser:"Cuenta no encontrada", err_pass:"Contraseña incorrecta", err_email:"Formato de correo inválido", err_pwlen:"La contraseña debe tener 6+ caracteres", err_name:"Ingresa tu nombre" },
};
// 追加i18n（なかま/チャット/プロフィール/位置共有）
Object.assign(I18N.ja,{ tab_community:"なかま", community_sub:"ツアーで出会った仲間とつながろう（ワールドホステル風）", groups:"グループ", create_group:"＋ グループを作成", new_group_ph:"グループ名を入力", group_created:"グループを作成しました", open_chat:"開く", msg_ph:"メッセージを入力…", send:"送信", you:"あなた", share_here:"📍 今ここにいるよ", here_now:"📍 今ここにいるよ！", here_shared:"現在地を共有しました", loc_link:"地図で見る", demo_chat_note:"プロトタイプ：メッセージはこの端末内のデモです。仲間とリアルタイム共有するにはサーバー連携が必要です。", profile:"プロフィール", edit_profile:"編集", amigo_name:"アミーゴネーム / ニックネーム", profile_photo:"プロフィール写真", add_photo:"📷 写真を選ぶ", bio:"ひとこと", bio_ph:"例: コーヒーと火山が好きな旅人", save:"保存", profile_saved:"プロフィールを保存しました" });
Object.assign(I18N.en,{ tab_community:"Amigos", community_sub:"Connect with fellow travelers from the tour (world-hostel vibe)", groups:"Groups", create_group:"＋ Create group", new_group_ph:"Enter group name", group_created:"Group created", open_chat:"Open", msg_ph:"Type a message…", send:"Send", you:"You", share_here:"📍 I'm here now", here_now:"📍 I'm here now!", here_shared:"Location shared", loc_link:"View on map", demo_chat_note:"Prototype: messages are a demo on this device. Real-time sharing needs a backend.", profile:"Profile", edit_profile:"Edit", amigo_name:"Amigo name / Nickname", profile_photo:"Profile photo", add_photo:"📷 Choose photo", bio:"About you", bio_ph:"e.g. A traveler who loves coffee and volcanoes", save:"Save", profile_saved:"Profile saved" });
Object.assign(I18N.es,{ tab_community:"Amigos", community_sub:"Conecta con viajeros del tour (estilo world-hostel)", groups:"Grupos", create_group:"＋ Crear grupo", new_group_ph:"Nombre del grupo", group_created:"Grupo creado", open_chat:"Abrir", msg_ph:"Escribe un mensaje…", send:"Enviar", you:"Tú", share_here:"📍 Estoy aquí", here_now:"📍 ¡Estoy aquí ahora!", here_shared:"Ubicación compartida", loc_link:"Ver en el mapa", demo_chat_note:"Prototipo: los mensajes son una demo en este dispositivo. Compartir en tiempo real requiere un servidor.", profile:"Perfil", edit_profile:"Editar", amigo_name:"Nombre Amigo / Apodo", profile_photo:"Foto de perfil", add_photo:"📷 Elegir foto", bio:"Sobre ti", bio_ph:"ej. Viajero que ama el café y los volcanes", save:"Guardar", profile_saved:"Perfil guardado" });

// 追加i18n（プロフィール拡張・アミーゴカード）
Object.assign(I18N.ja,{ age:"年齢", gender:"性別", g_m:"男性", g_f:"女性", g_o:"その他", g_na:"無回答", from_country:"出身国", proud:"誇りに思う国（複数OK）", proud_hint:"あなたが大好き・誇りに思う国を選んで追加", add_country:"＋ 追加", select_ph:"選択…", optional:"（任意）",
  amigo_card:"アミーゴカード", make_card:"🎫 アミーゴカードを作る", save_card:"📥 画像を保存", share_card:"📲 シェアして拡散", card_from:"出身", card_loves:"大好きな国", card_stamps:"集めたスタンプ", card_made:"カードを保存しました", card_tagline:"アンティグアを歩こう",
  card_what:"あなたの旅プロフィールを1枚の画像に。SNSでシェアして友だちを招待しよう（招待コード入り）", card_invite:"招待コード" });
Object.assign(I18N.en,{ age:"Age", gender:"Gender", g_m:"Male", g_f:"Female", g_o:"Other", g_na:"Prefer not to say", from_country:"From", proud:"Countries you love (multiple)", proud_hint:"Add the countries you love or are proud of", add_country:"＋ Add", select_ph:"Select…", optional:"(optional)",
  amigo_card:"Amigo Card", make_card:"🎫 Make my Amigo Card", save_card:"📥 Save image", share_card:"📲 Share it", card_from:"From", card_loves:"Loves", card_stamps:"Stamps", card_made:"Card saved", card_tagline:"Walking Antigua",
  card_what:"Turn your travel profile into one image. Share it on social to invite friends (includes your invite code).", card_invite:"Invite code" });
Object.assign(I18N.es,{ age:"Edad", gender:"Género", g_m:"Hombre", g_f:"Mujer", g_o:"Otro", g_na:"Prefiero no decir", from_country:"De", proud:"Países que amas (varios)", proud_hint:"Agrega los países que amas o de los que estás orgulloso", add_country:"＋ Agregar", select_ph:"Elegir…", optional:"(opcional)",
  amigo_card:"Tarjeta Amigo", make_card:"🎫 Crear mi Tarjeta Amigo", save_card:"📥 Guardar imagen", share_card:"📲 Compartir", card_from:"De", card_loves:"Ama", card_stamps:"Sellos", card_made:"Tarjeta guardada", card_tagline:"Caminando Antigua",
  card_what:"Convierte tu perfil de viaje en una imagen. Compártela para invitar amigos (incluye tu código).", card_invite:"Código" });

// 追加i18n（世界遺産ステージ・地球儀）
Object.assign(I18N.ja,{ globe_title:"世界遺産マップ", globe_sub:"謎解きをコンプリートして次の遺産へ", you_are_here:"今ここ", stage_open:"解禁中", stage_next:"次のステージ", stage_locked:"近日公開", stage_done:"コンプリート", st_stage:"ステージ", to_quest:"謎解きへ", to_guide:"音声ガイドへ", complete_to_unlock:"アンティグアをコンプリートで解禁", locked_title:"近日公開", locked_msg:"この世界遺産はまだ準備中です。まずは第1ステージ「アンティグア」の謎解きをコンプリートしよう！", stage_unlocked_toast:"🎉 アンティグア制覇！次のステージが解禁されました", drag_hint:"ドラッグで地球をまわせます" });
Object.assign(I18N.en,{ globe_title:"World Heritage map", globe_sub:"Complete the rally to unlock the next site", you_are_here:"You are here", stage_open:"Open", stage_next:"Next stage", stage_locked:"Coming soon", stage_done:"Completed", st_stage:"Stage", to_quest:"Go to rally", to_guide:"Audio guide", complete_to_unlock:"Complete Antigua to unlock", locked_title:"Coming soon", locked_msg:"This site isn't ready yet. First complete the Stage 1 rally in Antigua!", stage_unlocked_toast:"🎉 Antigua cleared! The next stage is unlocked", drag_hint:"Drag to spin the globe" });
Object.assign(I18N.es,{ globe_title:"Mapa del Patrimonio", globe_sub:"Completa el rally para desbloquear el siguiente sitio", you_are_here:"Estás aquí", stage_open:"Abierto", stage_next:"Siguiente etapa", stage_locked:"Próximamente", stage_done:"Completado", st_stage:"Etapa", to_quest:"Ir al rally", to_guide:"Audioguía", complete_to_unlock:"Completa Antigua para desbloquear", locked_title:"Próximamente", locked_msg:"Este sitio aún no está listo. ¡Primero completa el rally de la Etapa 1 en Antigua!", stage_unlocked_toast:"🎉 ¡Antigua completada! Se desbloqueó la siguiente etapa", drag_hint:"Arrastra para girar el globo" });

// 追加i18n（次の目的地ガイド申込ボックス）
Object.assign(I18N.ja,{ gr_cta:"🧭 次の行き先のガイドを申し込む", gr_locked_cta:"🧭 この遺産のガイドを申し込む", gr_title:"次の行き先のガイドを申し込む", gr_sub:"アンティグア制覇おめでとう！次はどこへ？いつ行く？教えてください。出発までにガイドを用意します。", gr_dest:"次に行く世界遺産", gr_other:"その他（自由入力）", gr_other_ph:"行き先を入力", gr_from:"いつから", gr_to:"いつまで", gr_period:"滞在期間", gr_name:"お名前", gr_msg:"ひとこと・要望", gr_msg_ph:"例: コーヒー農園も回りたい / スペイン語ガイド希望 など", gr_send:"📩 この内容で申し込む", gr_sent:"申込メールを作成しました。メールアプリで送信してください。", gr_need_dest:"行き先を入力してください", gr_mail_intro:"Mi Amigo ガイド申込です。次の行き先のガイド作成をお願いします。", gr_clear_at:"個コンプリートで次の遺産が解禁" });
Object.assign(I18N.en,{ gr_cta:"🧭 Request my next guide", gr_locked_cta:"🧭 Request a guide for this site", gr_title:"Request a guide for your next stop", gr_sub:"Congrats on clearing Antigua! Where to next, and when? Tell us and we'll prepare a guide before you go.", gr_dest:"Next heritage site", gr_other:"Other (type it)", gr_other_ph:"Type a destination", gr_from:"From", gr_to:"To", gr_period:"Period", gr_name:"Your name", gr_msg:"Notes / requests", gr_msg_ph:"e.g. add a coffee farm / Spanish-speaking guide", gr_send:"📩 Send request", gr_sent:"Request email created. Please send it from your mail app.", gr_need_dest:"Enter a destination", gr_mail_intro:"Mi Amigo guide request. Please prepare a guide for my next stop.", gr_clear_at:" completed to unlock the next" });
Object.assign(I18N.es,{ gr_cta:"🧭 Solicitar mi próxima guía", gr_locked_cta:"🧭 Solicitar guía de este sitio", gr_title:"Solicita una guía para tu próximo destino", gr_sub:"¡Felicidades por completar Antigua! ¿A dónde vas y cuándo? Cuéntanos y prepararemos una guía antes de tu viaje.", gr_dest:"Próximo sitio del patrimonio", gr_other:"Otro (escríbelo)", gr_other_ph:"Escribe un destino", gr_from:"Desde", gr_to:"Hasta", gr_period:"Periodo", gr_name:"Tu nombre", gr_msg:"Notas / solicitudes", gr_msg_ph:"ej. incluir una finca de café / guía en español", gr_send:"📩 Enviar solicitud", gr_sent:"Correo de solicitud creado. Envíalo desde tu app de correo.", gr_need_dest:"Ingresa un destino", gr_mail_intro:"Solicitud de guía Mi Amigo. Prepara una guía para mi próximo destino.", gr_clear_at:" completados para desbloquear" });

// 追加i18n（開拓投票）
Object.assign(I18N.ja,{ vote_title:"次の開拓地に投票", vote_sub:"行きたい世界遺産に投票しよう。10票集まったら、その場所がアプリに開拓されます（ガイド＆謎解きが作られます）。", vote_btn:"行きたい！投票", voted:"投票済み ✓", votes_unit:"票", votes_left:"票で開拓開始", vote_status:"投票受付中", vote_pioneered:"開拓決定", vote_pioneered_note:"開拓決定！ガイド準備中", vote_pioneered_msg:"みんなの投票で開拓決定！ガイドと謎解きを準備中です。公開までお待ちください。", vote_stage_msg:"ここに行きたい人は投票を。10票で開拓が始まり、ガイドと謎解きが作られます。", vote_remain1:"あと", vote_remain2:"票で開拓", vote_just_pioneered:"🎉 10票達成！この場所の開拓が決定しました", vote_hero_cta:"🗳️ 次の開拓地に投票", vote_open_note:"次の開拓地に投票できます" });
Object.assign(I18N.en,{ vote_title:"Vote for the next site", vote_sub:"Vote for the heritage site you want. When it reaches 10 votes, that place is unlocked in the app (we build the guide & rally).", vote_btn:"I want to go!", voted:"Voted ✓", votes_unit:"votes", votes_left:" to unlock", vote_status:"Voting open", vote_pioneered:"Unlocked!", vote_pioneered_note:"Unlocked! Guide coming", vote_pioneered_msg:"Unlocked by community votes! The guide and rally are being prepared. Stay tuned.", vote_stage_msg:"Want to go here? Vote. At 10 votes we start building the guide and rally.", vote_remain1:"", vote_remain2:" votes to unlock", vote_just_pioneered:"🎉 10 votes! This site is now unlocked", vote_hero_cta:"🗳️ Vote for the next site", vote_open_note:"You can vote for the next site" });
Object.assign(I18N.es,{ vote_title:"Vota por el próximo sitio", vote_sub:"Vota por el sitio del patrimonio que quieres. Al llegar a 10 votos, ese lugar se desbloquea en la app (creamos la guía y el rally).", vote_btn:"¡Quiero ir!", voted:"Votado ✓", votes_unit:"votos", votes_left:" para desbloquear", vote_status:"Votación abierta", vote_pioneered:"¡Desbloqueado!", vote_pioneered_note:"¡Desbloqueado! Guía en camino", vote_pioneered_msg:"¡Desbloqueado por los votos de la comunidad! La guía y el rally se están preparando.", vote_stage_msg:"¿Quieres ir aquí? Vota. Con 10 votos empezamos a crear la guía y el rally.", vote_remain1:"Faltan ", vote_remain2:" votos", vote_just_pioneered:"🎉 ¡10 votos! Este sitio queda desbloqueado", vote_hero_cta:"🗳️ Vota por el próximo sitio", vote_open_note:"Puedes votar por el próximo sitio" });

// 追加i18n（コミュニティ送客）
Object.assign(I18N.ja,{ community_section:"コミュニティに参加", community_note:"アプリの仲間とつながろう。次の開拓地のお知らせもここで！", community_soon:"準備中" });
Object.assign(I18N.en,{ community_section:"Join the community", community_note:"Connect with fellow members — next-site news drops here too!", community_soon:"Coming soon" });
Object.assign(I18N.es,{ community_section:"Únete a la comunidad", community_note:"Conéctate con la comunidad — ¡las novedades también aquí!", community_soon:"Próximamente" });

// 追加i18n（通知・お知らせ）
Object.assign(I18N.ja,{ notif_section:"お知らせ", notif_enable:"通知をオンにする", notif_on:"通知をオンにしました", notif_off:"通知はオフのままです", notif_empty:"まだお知らせはありません", notif_unsupported:"この端末は通知に未対応です", nt_decided:"開拓決定", nt_publish_suffix:" — ガイド＆謎解きを公開してください", nt_unlocked_suffix:"が開拓されました！ガイド＆謎解きが追加されます", ta_now:"たった今", ta_min:"分前", ta_hour:"時間前", ta_day:"日前" });
Object.assign(I18N.en,{ notif_section:"Notifications", notif_enable:"Turn on notifications", notif_on:"Notifications on", notif_off:"Notifications stay off", notif_empty:"No notifications yet", notif_unsupported:"Notifications not supported here", nt_decided:"Unlocked", nt_publish_suffix:" — publish the guide & rally", nt_unlocked_suffix:" is unlocked! Guide & rally coming", ta_now:"just now", ta_min:"m ago", ta_hour:"h ago", ta_day:"d ago" });
Object.assign(I18N.es,{ notif_section:"Avisos", notif_enable:"Activar notificaciones", notif_on:"Notificaciones activadas", notif_off:"Notificaciones desactivadas", notif_empty:"Aún no hay avisos", notif_unsupported:"Notificaciones no soportadas", nt_decided:"Desbloqueado", nt_publish_suffix:" — publica la guía y el rally", nt_unlocked_suffix:" desbloqueado. ¡Guía y rally en camino!", ta_now:"ahora", ta_min:" min", ta_hour:" h", ta_day:" d" });

// 追加i18n（TAKUHA専用：次ダンジョン制作・プレビュー）
Object.assign(I18N.ja,{ admin_section:"次のダンジョン制作（TAKUHA専用）", admin_only:"この機能はTAKUHAのみ閲覧できます", admin_empty:"制作中のダンジョンはまだありません。", admin_notify:"開拓決定！ このダンジョンのガイド＆謎解きを公開してください。", dp_open:"🔧 ガイド＆謎解きをプレビュー", dp_admin_note:"TAKUHA専用プレビュー（一般ユーザーには非公開）", dp_stops:"スポット（ガイド＆謎解き）", dp_history:"歴史を聴く", dp_guide:"ガイド", dp_quest:"謎解き", dp_publish_hint:"内容を確認したら『公開』で一般ユーザーに解放（公開機能は次フェーズで実装）。", no_content:"このダンジョンのコンテンツはまだ未作成です。" });
Object.assign(I18N.en,{ admin_section:"Build next dungeon (admin only)", admin_only:"Admin (TAKUHA) only", admin_empty:"No dungeons in progress yet.", admin_notify:"Unlocked! Publish this dungeon's guide & rally.", dp_open:"🔧 Preview guide & rally", dp_admin_note:"Admin-only preview (hidden from users)", dp_stops:"Spots (guide & rally)", dp_history:"History", dp_guide:"Guide", dp_quest:"Riddle", dp_publish_hint:"After review, 'Publish' to release to users (publish in the next phase).", no_content:"No content for this dungeon yet." });
Object.assign(I18N.es,{ admin_section:"Crear próxima mazmorra (admin)", admin_only:"Solo admin (TAKUHA)", admin_empty:"Aún no hay mazmorras en progreso.", admin_notify:"¡Desbloqueada! Publica la guía y el rally de esta mazmorra.", dp_open:"🔧 Vista previa guía y rally", dp_admin_note:"Vista previa solo admin (oculta a usuarios)", dp_stops:"Lugares (guía y rally)", dp_history:"Historia", dp_guide:"Guía", dp_quest:"Acertijo", dp_publish_hint:"Tras revisar, 'Publicar' para liberar a usuarios (en la próxima fase).", no_content:"Aún no hay contenido para esta mazmorra." });

// 追加i18n（問い合わせ先表示・なんでも言いたいボックス）
Object.assign(I18N.ja,{ contact_to:"お問い合わせ先", contact_section:"お問い合わせ", contact_note:"ガイド申込・ご意見・ご質問はこちらへ。運営に届きます。", fb_cta:"💬 なんでも言いたいボックス", fb_title:"なんでも言いたいボックス", fb_sub:"ご意見・ご要望・お問い合わせ、なんでもどうぞ。運営に届きます。", fb_msg:"メッセージ", fb_msg_ph:"メッセージを入力…", fb_send:"📩 送信する", fb_need:"メッセージを入力してください" });
Object.assign(I18N.en,{ contact_to:"Contact", contact_section:"Contact", contact_note:"Guide requests, feedback and questions — they reach our team.", fb_cta:"💬 Say anything", fb_title:"Say anything", fb_sub:"Feedback, requests, questions — anything goes. It reaches our team.", fb_msg:"Message", fb_msg_ph:"Type your message…", fb_send:"📩 Send", fb_need:"Please enter a message" });
Object.assign(I18N.es,{ contact_to:"Contacto", contact_section:"Contacto", contact_note:"Solicitudes de guía, comentarios y preguntas — llegan a nuestro equipo.", fb_cta:"💬 Buzón de comentarios", fb_title:"Buzón de comentarios", fb_sub:"Comentarios, solicitudes, preguntas — lo que sea. Llega a nuestro equipo.", fb_msg:"Mensaje", fb_msg_ph:"Escribe tu mensaje…", fb_send:"📩 Enviar", fb_need:"Escribe un mensaje" });
// 追加i18n（B2：本物の電話SMS認証）
Object.assign(I18N.ja,{ sms_sending:"SMS送信中…", sms_sent_real:"SMSを送信しました📩", code_real_hint:"SMSで届いた6桁コードを入力してください", err_sms:"SMS送信に失敗しました。番号（国番号付き）をご確認ください", verifying:"確認中…" });
Object.assign(I18N.en,{ sms_sending:"Sending SMS…", sms_sent_real:"SMS sent 📩", code_real_hint:"Enter the 6-digit code from the SMS", err_sms:"Couldn't send SMS. Check the number (with country code).", verifying:"Verifying…" });
Object.assign(I18N.es,{ sms_sending:"Enviando SMS…", sms_sent_real:"SMS enviado 📩", code_real_hint:"Ingresa el código de 6 dígitos del SMS", err_sms:"No se pudo enviar el SMS. Revisa el número (con código de país).", verifying:"Verificando…" });
// 追加i18n（B3：申込・問い合わせのクラウド保存＋admin一覧）
Object.assign(I18N.ja,{ sub_sent:"送信しました。運営に届きました ✅", subs_section:"📥 申込・問い合わせ一覧", subs_empty:"まだ申込・問い合わせはありません。", subs_offline:"クラウド未接続のため一覧は表示できません。", t_guide:"ガイド申込", t_feedback:"ご意見", t_biz:"広告掲載" });
Object.assign(I18N.en,{ sub_sent:"Sent — it reached our team ✅", subs_section:"📥 Submissions", subs_empty:"No submissions yet.", subs_offline:"Not connected to the cloud — list unavailable.", t_guide:"Guide request", t_feedback:"Feedback", t_biz:"Advertising" });
Object.assign(I18N.es,{ sub_sent:"Enviado — llegó a nuestro equipo ✅", subs_section:"📥 Solicitudes", subs_empty:"Aún no hay solicitudes.", subs_offline:"Sin conexión a la nube — lista no disponible.", t_guide:"Solicitud de guía", t_feedback:"Comentario", t_biz:"Publicidad" });

// 追加i18n（電話番号認証）
Object.assign(I18N.ja,{ phone:"電話番号", phone_ph:"電話番号（ハイフン無し）", send_code:"認証コードを送信", code:"認証コード", code_ph:"6桁のコード", verify:"確認して続ける", nick_new:"お名前 / ニックネーム（新規の方）", demo_code:"デモ用コード", sms_note:"SMSで6桁の認証コードをお送りします。", code_sent:"認証コードを送信しました", err_phone:"電話番号を入力してください", err_code:"コードが正しくありません" });
Object.assign(I18N.en,{ phone:"Phone number", phone_ph:"Phone (no dashes)", send_code:"Send code", code:"Verification code", code_ph:"6-digit code", verify:"Verify & continue", nick_new:"Name / Nickname (new users)", demo_code:"Demo code", sms_note:"We'll text you a 6-digit verification code.", code_sent:"Code sent", err_phone:"Enter your phone number", err_code:"Incorrect code" });
Object.assign(I18N.es,{ phone:"Número de teléfono", phone_ph:"Teléfono (sin guiones)", send_code:"Enviar código", code:"Código de verificación", code_ph:"Código de 6 dígitos", verify:"Verificar y continuar", nick_new:"Nombre / Apodo (nuevos)", demo_code:"Código demo", sms_note:"Te enviaremos un código de 6 dígitos por SMS.", code_sent:"Código enviado", err_phone:"Ingresa tu número", err_code:"Código incorrecto" });
// 追加i18n（Google／メールリンク認証＝SMSが届かない人向けの入口）
Object.assign(I18N.ja,{ continue_google:"Googleで続ける", continue_email:"メールで続ける", or_phone:"または電話番号で", email_label:"メールアドレス", email_ph:"you@email.com", email_send_link:"ログインリンクを送る", email_note:"パスワード不要。届いたメールのリンクを開くだけでログインできます。", email_sent_title:"メールを確認してください", email_sent_body:"ログインリンクを送りました📩 メール内のリンクを開いてください：", email_err:"メールの送信に失敗しました。アドレスをご確認ください。", err_email:"メールアドレスを入力してください", google_err:"Googleログインに失敗しました。もう一度お試しください。", signing_in:"ログイン中…", email_confirm_prompt:"確認のためメールアドレスを入力してください" });
Object.assign(I18N.en,{ continue_google:"Continue with Google", continue_email:"Continue with email", or_phone:"or with your phone", email_label:"Email", email_ph:"you@email.com", email_send_link:"Send login link", email_note:"No password. Just open the link we email you to sign in.", email_sent_title:"Check your email", email_sent_body:"We sent a login link 📩 Open the link in the email:", email_err:"Couldn't send the email. Please check the address.", err_email:"Enter your email", google_err:"Google sign-in failed. Please try again.", signing_in:"Signing in…", email_confirm_prompt:"Please confirm your email address" });
Object.assign(I18N.es,{ continue_google:"Continuar con Google", continue_email:"Continuar con correo", or_phone:"o con tu teléfono", email_label:"Correo", email_ph:"tu@correo.com", email_send_link:"Enviar enlace de acceso", email_note:"Sin contraseña. Solo abre el enlace que te enviamos por correo.", email_sent_title:"Revisa tu correo", email_sent_body:"Te enviamos un enlace 📩 Ábrelo en el correo:", email_err:"No se pudo enviar el correo. Revisa la dirección.", err_email:"Ingresa tu correo", google_err:"Error al entrar con Google. Inténtalo otra vez.", signing_in:"Entrando…", email_confirm_prompt:"Confirma tu correo electrónico" });
const DIAL={ JP:"+81",GT:"+502",US:"+1",CA:"+1",MX:"+52",ES:"+34",FR:"+33",DE:"+49",GB:"+44",IT:"+39",NL:"+31",CH:"+41",PT:"+351",IE:"+353",SE:"+46",NO:"+47",AU:"+61",NZ:"+64",BR:"+55",AR:"+54",CL:"+56",CO:"+57",PE:"+51",CR:"+506",SV:"+503",HN:"+504",NI:"+505",BZ:"+501",KR:"+82",CN:"+86",TW:"+886",TH:"+66",IN:"+91",IL:"+972",ZA:"+27",PL:"+48" };

// 隠しタブ「なかま」解禁に必要な紹介人数（アミーゴを何人紹介したら入れるか）
const COMMUNITY_UNLOCK=10;
// アプリの問い合わせ先（ガイド申込・ご意見すべてここに集約。愛ちゃんが受信→下書き保存→TAKUHAに連絡）
const CONTACT_EMAIL="takuha.southamerica@gmail.com";
// コミュニティ送客リンク（SNS→アプリ→外部グループの"次の入り口"）。urlを入れると参加ボタンが有効化、空なら「準備中」表示
// ※過去ログを遡れる種類推奨：LINEオープンチャット／WhatsAppチャンネル／IGブロードキャスト
const COMMUNITY_LINKS=[
  { name:"LINE オープンチャット", emoji:"💚", region:"", url:"https://line.me/ti/g2/msCcSCmaXOhkhB4zRl72lmUw8mLh3TkLiUVHSQ?utm_source=invitation&utm_medium=link_copy&utm_campaign=default" },
  { name:"WhatsApp", emoji:"💬", region:"", url:"https://whatsapp.com/channel/0029VbDFK7bBKfi5HZ8iyW30" },
  { name:"Instagram", emoji:"📷", region:"", url:"https://www.instagram.com/miamigo202606" },
  { name:"TikTok", emoji:"🎵", region:"", url:"https://www.tiktok.com/@miamigo202606" },
];
// 開拓投票：この票数が集まった世界遺産がアプリに開拓される（ガイド＆謎解きを作る）
const VOTE_UNLOCK=10;
// デモ用の初期票数（他の人の投票を想定。本番はバックエンドで全ユーザー合算）
const VOTE_SEED={ machupicchu:9, rome:6, angkor:5, tikal:4, chichen:3, copan:2, cusco:2 };
// 連絡先（広告掲載の問い合わせ受信先。必要に応じて専用アドレスに変更可）
const BIZ_EMAIL="takuha1988@gmail.com";
// 追加i18n（企業向け広告掲載・スポンサー）
Object.assign(I18N.ja,{ pr:"PR", biz_open:"🏢 企業の方へ（広告掲載）", biz_title:"企業の方へ｜広告掲載", biz_hero:"アンティグアを歩く旅行者に、ピンポイントで届く。",
  biz_audience:"届く相手", biz_a1:"電話番号認証済みのリアルな会員", biz_a2:"出身国・年齢・性別・興味でターゲティング可能", biz_a3:"アンティグア来訪中＝“今まさに使う”消費意欲の高い層",
  biz_products:"広告メニュー", biz_p1:"スポンサー掲載（「探す」上位・PR表示）", biz_p2:"バナー広告", biz_p3:"スポンサー謎解きスポット（御社店舗を謎解きに）", biz_p4:"ターゲット・プッシュ通知（本番）",
  biz_members:"現在の登録会員（デモ）", biz_people:"人", biz_inquiry:"広告掲載のお問い合わせ", biz_company:"会社名", biz_person:"ご担当者名", biz_contact:"連絡先（メール/電話）", biz_budget:"ご予算感（任意）", biz_message:"メッセージ", biz_send:"送信する", biz_sent:"メールアプリでお問い合わせを作成しました", biz_note:"このページのURLを企業に送れます。お問い合わせはメールで届きます。", biz_back:"アプリに戻る" });
Object.assign(I18N.en,{ pr:"AD", biz_open:"🏢 For businesses (advertise)", biz_title:"For Businesses · Advertise", biz_hero:"Reach travelers walking Antigua, right when it matters.",
  biz_audience:"Who you reach", biz_a1:"Real, phone-verified members", biz_a2:"Target by country, age, gender, interests", biz_a3:"Visitors in Antigua now — high intent to spend",
  biz_products:"Ad menu", biz_p1:"Sponsored listing (top of Explore, AD label)", biz_p2:"Banner ads", biz_p3:"Sponsored rally spot (your venue in the rally)", biz_p4:"Targeted push notifications (production)",
  biz_members:"Members now (demo)", biz_people:"", biz_inquiry:"Advertising inquiry", biz_company:"Company", biz_person:"Contact name", biz_contact:"Contact (email/phone)", biz_budget:"Budget (optional)", biz_message:"Message", biz_send:"Send", biz_sent:"Inquiry opened in your mail app", biz_note:"Share this page's URL with companies. Inquiries arrive by email.", biz_back:"Back to app" });
Object.assign(I18N.es,{ pr:"AD", biz_open:"🏢 Para empresas (publicidad)", biz_title:"Para Empresas · Publicidad", biz_hero:"Llega a los viajeros que caminan Antigua, justo cuando importa.",
  biz_audience:"A quién llegas", biz_a1:"Miembros reales verificados por teléfono", biz_a2:"Segmenta por país, edad, género, intereses", biz_a3:"Visitantes en Antigua ahora — alta intención de gasto",
  biz_products:"Menú de anuncios", biz_p1:"Anuncio patrocinado (arriba en Explorar, etiqueta AD)", biz_p2:"Banners", biz_p3:"Parada patrocinada del rally (tu negocio en el rally)", biz_p4:"Notificaciones push segmentadas (producción)",
  biz_members:"Miembros ahora (demo)", biz_people:"", biz_inquiry:"Consulta de publicidad", biz_company:"Empresa", biz_person:"Nombre de contacto", biz_contact:"Contacto (correo/teléfono)", biz_budget:"Presupuesto (opcional)", biz_message:"Mensaje", biz_send:"Enviar", biz_sent:"Consulta abierta en tu correo", biz_note:"Comparte la URL de esta página con empresas. Las consultas llegan por correo.", biz_back:"Volver a la app" });

function t(key){ const L=State.lang; return (I18N[L] && I18N[L][key]) || I18N.ja[key] || key; }
function country(code){ return (DATA.countries||[]).find(c=>c.c===code); }
function countryName(code){ const c=country(code); return c?(c[State.lang]||c.en):""; }
function countryFlag(code){ const c=country(code); return c?c.f:""; }
function L(obj){ if(obj==null) return ""; if(typeof obj==="string") return obj; return obj[State.lang] || obj.ja || ""; }
function setLang(code){ State.lang=code; localStorage.setItem(K.lang, code); }

/* ---------- ユーティリティ ---------- */
const $ = (s,r=document)=>r.querySelector(s);
const el = (h)=>{ const t=document.createElement("template"); t.innerHTML=h.trim(); return t.content.firstElementChild; };
const esc = (s)=>String(s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");
const fmtUSD = (n)=>"$"+n.toFixed(0);
const fmtJPY = (usd)=>"≈"+Math.round(usd*150).toLocaleString()+(State.lang==="ja"?"円":" JPY");
const dateKey = (y,m,d)=>`${y}-${m}-${d}`;
const thumbStyle = (it)=> it.img ? `background-image:url('${it.img}');background-size:cover;background-position:center;` : "background:linear-gradient(135deg,#fce9d4,#f6dbe5)";
const thumbInner = (it)=> it.img ? "" : it.emoji;

function seed(str){ let h=2166136261; for(let i=0;i<str.length;i++){ h^=str.charCodeAt(i); h=Math.imul(h,16777619);} return ((h>>>0)%1000)/1000; }
function capacityFor(l,dk){ return Math.max(2, Math.round(l.maxSlots*(0.3+seed(l.id+dk)*0.7))); }
function bookedFor(id,dk){ return DB.get(K.resv,[]).filter(r=>r.listingId===id&&r.dateKey===dk).reduce((s,r)=>s+r.qty,0); }
function remainingFor(l,dk){ return Math.max(0, capacityFor(l,dk)-bookedFor(l.id,dk)); }

function toast(msg){ $(".toast")?.remove(); const t=el(`<div class="toast">${msg}</div>`); $(".phone").appendChild(t); setTimeout(()=>t.remove(),2600); }
function closeSheet(){ $(".sheet-back")?.remove(); }
function openSheet(html){ closeSheet(); const b=el(`<div class="sheet-back"><div class="sheet"><div class="grab"></div>${html}</div></div>`); b.addEventListener("click",e=>{ if(e.target===b) closeSheet(); }); $(".phone").appendChild(b); return b; }

function fileToResizedDataUrl(file,max=900,q=0.78){ return new Promise((res,rej)=>{ const img=new Image(),r=new FileReader(); r.onload=()=>img.src=r.result; r.onerror=rej; img.onload=()=>{ let{width:w,height:h}=img; if(w>h&&w>max){h=h*max/w;w=max;} else if(h>max){w=w*max/h;h=max;} const c=document.createElement("canvas"); c.width=w; c.height=h; c.getContext("2d").drawImage(img,0,0,w,h); res(c.toDataURL("image/jpeg",q)); }; img.onerror=rej; r.readAsDataURL(file); }); }

/* ---------- 音声(TTS) ---------- */
function stopSpeak(){ try{ window.speechSynthesis&&speechSynthesis.cancel(); }catch{} State.speakingId=null; }

/* =========================================================================
 * 描画
 * ===================================================================== */
function render(){
  const screen=$("#screen"), tabbar=$("#tabbar");
  // タブ名を言語反映
  tabbar.querySelectorAll(".tab").forEach(tb=>{ const lab=tb.querySelector(".tab-label"); if(lab) lab.textContent=t("tab_"+tb.dataset.view); });
  // 企業向け広告ページ（未ログインでも閲覧可。URLに #business でも開ける）
  if(State.business){ tabbar.classList.add("hidden"); screen.innerHTML=""; screen.appendChild(viewBusiness()); screen.scrollTop=0; return; }
  if(!State.user){ tabbar.classList.add("hidden"); screen.innerHTML=""; screen.appendChild(viewAuth()); return; }
  tabbar.classList.remove("hidden");
  // 隠しタブ「なかま」: アミーゴを10人紹介すると解禁・出現する
  const ctab=tabbar.querySelector('[data-view="community"]');
  if(ctab){
    const introCount=(State.user&&State.user.member_id)?Org.introducees(orgKeyOf()).length:0;
    const unlocked=introCount>=COMMUNITY_UNLOCK;
    ctab.style.display=unlocked?"":"none";
    if(!unlocked && State.view==="community") State.view="mypage";
  }
  tabbar.querySelectorAll(".tab").forEach(tb=>tb.classList.toggle("active", tb.dataset.view===State.view));
  screen.innerHTML="";
  const v={ discover:viewDiscover, quest:viewQuest, guide:viewGuide, map:viewMap, community:viewCommunity, album:viewAlbum, mypage:viewMyPage }[State.view]();
  screen.appendChild(v); screen.scrollTop=0;
}

/* 言語セグメント（共通） */
function langSeg(onPick){
  const seg=el(`<div class="langseg"></div>`);
  LANGS.forEach(([code,label])=>{ const b=el(`<button class="${code===State.lang?"on":""}">${label}</button>`); b.onclick=()=>{ stopSpeak(); setLang(code); onPick&&onPick(); }; seg.appendChild(b); });
  return seg;
}

/* ---------- 認証（電話番号＋認証コード／言語選択を最初に） ---------- */
function normPhone(dial,num){ return (dial+num).replace(/[^0-9+]/g,""); }
// ソーシャル／メールリンクの共通ログイン：Firebaseユーザー → 端末セッション＋組織ツリー登録
// （電話SMSが届かない人の入口。組織キーはメールアドレスに揃えるので紹介ツリー・資産設計はそのまま動く）
async function socialLogin(fbUser, nickOverride){
  if(!fbUser) return;
  const key=(fbUser.email||fbUser.uid||"").toLowerCase();
  if(!key) return;
  const all=DB.get(K.users,{}); let u=all[key]; const isNew=!u || !u.member_id;
  if(!all[key]){
    u={ id:key, email:key, phone:"", name:((nickOverride&&nickOverride.trim())||fbUser.displayName||fbUser.email||"Amigo"), photo:fbUser.photoURL||"" };
    all[key]=u; DB.set(K.users,all);
  }
  DB.set(K.session,key); State.user=all[key];
  if(isNew){
    const ref=State.pendingRef||localStorage.getItem(K.ref)||null;
    const nu=await Org.register(key, State.user.name, ref);
    if(nu) mergeMyOrg(nu);
    State.pendingRef=null; localStorage.removeItem(K.ref);
  }
  State.view="mypage"; toast(`${t("welcome")}, ${State.user.name}!`); render();
  if(isNew && State.user.member_id) showReferralSheet(State.user, true);
}
// ソーシャル（リダイレクト）／メールリンクからの復帰を起動時に完了させる
async function completeRedirectLogins(){
  if(!(Cloud.ready && Cloud.auth)) return;
  try{
    if(Cloud.auth.isSignInWithEmailLink && Cloud.auth.isSignInWithEmailLink(location.href)){
      let email=localStorage.getItem("ma_email_signin");
      if(!email) email=window.prompt(t("email_confirm_prompt"));
      if(email){
        const res=await Cloud.auth.signInWithEmailLink(email.trim().toLowerCase(), location.href);
        const nick=localStorage.getItem("ma_nick_signin")||"";
        localStorage.removeItem("ma_email_signin"); localStorage.removeItem("ma_nick_signin");
        history.replaceState({},"",location.pathname+(location.hash||""));
        await socialLogin(res.user, nick);
      }
    }
  }catch(e){ console.warn("[Auth] メールリンク完了に失敗", e); }
  try{
    const res=await Cloud.auth.getRedirectResult();
    if(res && res.user && !DB.get(K.session,null)){
      const nick=localStorage.getItem("ma_nick_signin")||""; localStorage.removeItem("ma_nick_signin");
      await socialLogin(res.user, nick);
    }
  }catch(e){ console.warn("[Auth] リダイレクト完了に失敗", e); }
}
function viewAuth(){
  let sentCode=null, pendingKey=null, pendingDisplay=null, pendingNick="";
  const dialOpts=DATA.countries.map(c=>`<option value="${DIAL[c.c]||""}" ${c.c==="JP"?"selected":""}>${c.f} ${DIAL[c.c]||""}</option>`).join("");
  const wrap=el(`<div>
    <div class="auth-hero"><div class="volcano">🌋🌋🌋</div><h1>Mi Amigo</h1><p>${t("tagline")}</p></div>
    <div class="weave"></div>
    <div class="pad">
      <label class="field-label">${t("choose_lang")}</label>
      <div id="authLang"></div>
      <div id="authBody" style="margin-top:18px"></div>
      <div id="recaptcha-container"></div>
    </div></div>`);
  $("#authLang",wrap).appendChild(langSeg(()=>render()));
  const body=$("#authBody",wrap);
  // 本物の電話SMS認証（Firebase）。Firebase未設定/未接続時はデモ（画面表示コード）にフォールバック
  let realMode=false, phoneConfirm=null, recaptcha=null;
  function ensureRecaptcha(){ if(!recaptcha) recaptcha=new firebase.auth.RecaptchaVerifier("recaptcha-container",{ size:"invisible" }); return recaptcha; }
  async function finishLogin(){
    const all=DB.get(K.users,{}); let u=all[pendingKey]; const isNew=!u || !u.member_id;
    if(!all[pendingKey]){ u={ id:pendingKey, email:pendingKey, phone:pendingDisplay, name:(pendingNick.trim()||pendingDisplay) }; all[pendingKey]=u; DB.set(K.users,all); }
    DB.set(K.session,pendingKey); State.user=all[pendingKey];
    if(isNew){ const nu=await Org.register(pendingKey, State.user.name, State.pendingRef); if(nu) mergeMyOrg(nu); State.pendingRef=null; localStorage.removeItem(K.ref); }
    State.view="mypage"; toast(`${t("welcome")}, ${State.user.name}!`); render();
    if(isNew && State.user.member_id) showReferralSheet(State.user, true);
  }
  function refBannerHTML(){
    return State.pendingRef
      ? `<div class="card" style="background:#e1f5ee;border:none;margin-bottom:12px"><div class="card-body" style="padding:10px 12px">🎟️ ${orgT("joined_via")}：<b style="color:var(--teal)">${esc(State.pendingRef)}</b></div></div>`
      : "";
  }
  // メールリンク（パスワードレス）：届いたメールのリンクを開くだけでログイン
  function renderEmail(){
    body.innerHTML=`
      ${refBannerHTML()}
      <div class="field"><label>${t("email_label")}</label><input id="email" type="email" inputmode="email" placeholder="${t("email_ph")}" /></div>
      <div class="field"><label>${t("nick_new")}</label><input id="enick" placeholder="Taku" /></div>
      <p class="error" id="aErr"></p>
      <button class="btn" id="emailSendBtn">${t("email_send_link")}</button>
      <button class="btn ghost" id="ebackBtn" style="margin-top:8px">${t("back")}</button>
      <p class="hint" style="margin-top:12px">${t("email_note")}</p>`;
    $("#ebackBtn",body).onclick=renderPhone;
    $("#emailSendBtn",body).onclick=async ()=>{
      const email=$("#email",body).value.trim().toLowerCase();
      if(!email || !/.+@.+\..+/.test(email)){ $("#aErr",body).textContent=t("err_email"); return; }
      const btn=$("#emailSendBtn",body); btn.disabled=true; btn.textContent=t("signing_in"); $("#aErr",body).textContent="";
      try{
        const acs={ url:location.origin+location.pathname+(State.pendingRef?("?ref="+encodeURIComponent(State.pendingRef)):""), handleCodeInApp:true };
        await Cloud.auth.sendSignInLinkToEmail(email, acs);
        localStorage.setItem("ma_email_signin", email);
        localStorage.setItem("ma_nick_signin", $("#enick",body).value.trim());
        body.innerHTML=`<div class="card" style="background:#e1f5ee;border:none"><div class="card-body" style="text-align:center;padding:22px">
          <div style="font-size:40px">📩</div><h3 style="margin:10px 0 6px">${t("email_sent_title")}</h3>
          <p class="muted" style="font-size:14px">${t("email_sent_body")}<br><b>${esc(email)}</b></p></div></div>
          <button class="btn ghost" id="ebackBtn2" style="margin-top:14px">${t("back")}</button>`;
        $("#ebackBtn2",body).onclick=renderPhone;
      }catch(err){ console.warn("[Auth] メールリンク送信失敗", err); $("#aErr",body).textContent=t("email_err"); btn.disabled=false; btn.textContent=t("email_send_link"); }
    };
  }
  function renderPhone(){
    const social = (Cloud.ready && Cloud.auth) ? `
      <button class="btn btn-google" id="googleBtn"><span style="font-weight:800;color:#4285F4">G</span>&nbsp;${t("continue_google")}</button>
      <button class="btn ghost" id="emailBtn" style="margin-top:10px">✉️ ${t("continue_email")}</button>
      <div class="or-divider"><span>${t("or_phone")}</span></div>` : "";
    body.innerHTML=`
      ${refBannerHTML()}
      ${social}
      <div class="field"><label>${t("phone")}</label>
        <div class="row" style="gap:8px"><select id="dial" style="width:135px">${dialOpts}</select><input id="phone" type="tel" inputmode="tel" style="flex:1" placeholder="${t("phone_ph")}" /></div></div>
      <div class="field"><label>${t("nick_new")}</label><input id="nick" placeholder="Taku" /></div>
      <p class="error" id="aErr"></p>
      <button class="btn" id="sendBtn">${t("send_code")}</button>
      <p class="hint" style="margin-top:12px">${t("sms_note")}</p>`;
    if(Cloud.ready && Cloud.auth){
      $("#googleBtn",body).onclick=async ()=>{
        const btn=$("#googleBtn",body); btn.disabled=true; const orig=btn.innerHTML; btn.textContent=t("signing_in"); $("#aErr",body).textContent="";
        try{
          const provider=new firebase.auth.GoogleAuthProvider();
          let res=null;
          try{ res=await Cloud.auth.signInWithPopup(provider); }
          catch(popupErr){ console.warn("[Auth] popup失敗→redirect", popupErr); await Cloud.auth.signInWithRedirect(provider); return; }
          await socialLogin(res.user);
        }catch(err){ console.warn("[Auth] Googleログイン失敗", err); $("#aErr",body).textContent=t("google_err"); btn.disabled=false; btn.innerHTML=orig; }
      };
      $("#emailBtn",body).onclick=renderEmail;
    }
    $("#sendBtn",body).onclick=async ()=>{ const num=$("#phone",body).value.trim(); if(!num){ $("#aErr",body).textContent=t("err_phone"); return; }
      const dial=$("#dial",body).value; pendingDisplay=dial+" "+num; pendingKey=normPhone(dial,num); pendingNick=$("#nick",body).value;
      const btn=$("#sendBtn",body); $("#aErr",body).textContent="";
      if(Cloud.ready && Cloud.auth){
        btn.disabled=true; btn.textContent=t("sms_sending");
        try{ phoneConfirm=await Cloud.auth.signInWithPhoneNumber(pendingKey, ensureRecaptcha()); realMode=true; toast(t("sms_sent_real")); renderCode(); return; }
        catch(err){ console.warn("[Auth] signInWithPhoneNumber失敗", err); $("#aErr",body).textContent=t("err_sms"); btn.disabled=false; btn.textContent=t("send_code"); try{ recaptcha&&recaptcha.clear(); }catch{} recaptcha=null; return; }
      }
      realMode=false; sentCode=String(Math.floor(100000+Math.random()*900000)); toast(t("code_sent")); renderCode();
    };
  }
  function renderCode(){
    const demoBox = realMode ? "" : `<div class="card" style="background:#f3ece0;border:none;margin-bottom:14px"><div class="card-body">
        <div class="muted" style="font-size:13px">📱 ${esc(pendingDisplay)}</div>
        <div style="margin-top:6px;font-size:14px">${t("demo_code")}: <b style="font-size:22px;letter-spacing:4px;color:var(--terra)">${sentCode}</b></div></div></div>`;
    const realHint = realMode ? `<div class="card" style="background:#f3ece0;border:none;margin-bottom:14px"><div class="card-body"><div class="muted" style="font-size:13px">📱 ${esc(pendingDisplay)}</div><div style="margin-top:4px;font-size:13px">${t("code_real_hint")}</div></div></div>` : "";
    body.innerHTML=`
      ${demoBox}${realHint}
      <div class="field"><label>${t("code")}</label><input id="code" inputmode="numeric" maxlength="6" placeholder="${t("code_ph")}" /></div>
      <p class="error" id="aErr"></p>
      <button class="btn" id="verifyBtn">${t("verify")}</button>
      <button class="btn ghost" id="backBtn" style="margin-top:8px">${t("back")}</button>`;
    if(!realMode) $("#code",body).value=sentCode; // デモ：自動入力
    $("#verifyBtn",body).onclick=async ()=>{
      const code=$("#code",body).value.trim(); $("#aErr",body).textContent="";
      if(realMode){
        if(!phoneConfirm){ $("#aErr",body).textContent=t("err_code"); return; }
        const btn=$("#verifyBtn",body); btn.disabled=true; btn.textContent=t("verifying");
        try{ await phoneConfirm.confirm(code); await finishLogin(); }
        catch(err){ console.warn("[Auth] confirm失敗", err); $("#aErr",body).textContent=t("err_code"); btn.disabled=false; btn.textContent=t("verify"); }
      } else {
        if(code!==sentCode){ $("#aErr",body).textContent=t("err_code"); return; }
        await finishLogin();
      }
    };
    $("#backBtn",body).onclick=renderPhone;
  }
  renderPhone();
  return wrap;
}

/* ---------- 探す（多言語） ---------- */
function viewDiscover(){
  const wrap=el(`<div><div class="topbar"><h1>${t("tab_discover")}</h1><p class="sub">${t("discover_sub")}</p></div><div class="pad" id="listings"></div></div>`);
  const labels={ exp:["exp",{ja:"体験",en:"Experience",es:"Experiencia"}], food:["food",{ja:"飲食",en:"Food",es:"Comida"}], stay:["stay",{ja:"宿",en:"Stay",es:"Hospedaje"}] };
  const root=$("#listings",wrap);
  // スポンサー枠（デモ）— 広告主の体験がここに表示される
  const spon=el(`<div class="card">
    <div class="thumb" style="background:linear-gradient(135deg,#1d7a73,#145c57);color:#fff;font-size:46px">🌋</div>
    <div class="card-body">
      <span class="badge" style="background:#2a211c;color:#fff">${t("pr")}</span>
      <h3 style="margin:8px 0 4px;font-size:17px">Volcán Acatenango — ${({ja:"日の出トレック",en:"Sunrise Trek",es:"Trek al amanecer"})[State.lang]}</h3>
      <p class="muted" style="margin:0 0 10px;font-size:13px">${({ja:"火山の夜明けを見る1泊トレック（提携ツアー枠）",en:"Overnight trek to a volcano sunrise (partner ad slot)",es:"Trek nocturno al amanecer del volcán (espacio de socio)"})[State.lang]}</p>
      <button class="btn sm teal" id="sponsorBtn">${t("book")}</button>
    </div></div>`);
  $("#sponsorBtn",spon).onclick=()=>toast("（デモ）"+t("pr")+": "+t("biz_p1"));
  root.appendChild(spon);
  DATA.listings.forEach(l=>{
    const [cls,jp]=labels[l.type]||labels.exp;
    const card=el(`<div class="card">
      <div class="thumb" style="${thumbStyle(l)}">${thumbInner(l)}</div>
      <div class="card-body">
        <span class="badge ${cls}">${L(jp)}</span>
        <h3 style="margin:8px 0 4px;font-size:17px">${esc(L(l.title))}</h3>
        <p class="muted" style="margin:0 0 6px;font-size:13px">${esc(L(l.desc))}</p>
        <p class="muted" style="margin:0 0 12px;font-size:12px">📍 ${esc(l.area||"")}${l.link?` · <a href="${l.link}" target="_blank" rel="noopener" style="color:var(--teal)">${t("official")}</a>`:""}</p>
        <div class="row"><div><span class="price">${fmtUSD(l.price)}</span> <span class="muted" style="font-size:12px">/ ${t("per")}　${fmtJPY(l.price)}</span></div><span class="spacer"></span><button class="btn sm" data-id="${l.id}">${t("book")}</button></div>
      </div></div>`);
    $("button",card).onclick=()=>openBooking(l); root.appendChild(card);
  });
  return wrap;
}

function openBooking(listing){
  const now=new Date(); State.cal={year:now.getFullYear(),month:now.getMonth()};
  let selected=null, qty=1;
  const back=openSheet(`<h2>${listing.emoji} ${esc(L(listing.title))}</h2><p class="muted" style="margin:-8px 0 14px;font-size:13px">${t("pick_date")}</p><div id="calMount"></div><div id="bookPanel"></div>`);
  function renderCal(){
    const {year,month}=State.cal; const first=new Date(year,month,1).getDay(); const days=new Date(year,month+1,0).getDate();
    const dows=({ja:["日","月","火","水","木","金","土"],en:["Su","Mo","Tu","We","Th","Fr","Sa"],es:["Do","Lu","Ma","Mi","Ju","Vi","Sa"]})[State.lang];
    const today=new Date(); today.setHours(0,0,0,0);
    let cells=dows.map(d=>`<div class="cal-dow">${d}</div>`).join("");
    for(let i=0;i<first;i++) cells+=`<div class="cal-cell empty"></div>`;
    for(let d=1;d<=days;d++){ const dk=dateKey(year,month,d); const cd=new Date(year,month,d); const past=cd<today; const rem=remainingFor(listing,dk); const full=rem<=0;
      const cls=["cal-cell",past?"past":"",full&&!past?"full":"",selected===dk?"sel":""].join(" ");
      const txt=past?"":(full?(State.lang==="ja"?"満":"x"):(State.lang==="ja"?"残"+rem:rem));
      cells+=`<div class="${cls}" data-dk="${past||full?"":dk}"><span class="d">${d}</span><span class="slots">${txt}</span>${!past&&!full?'<span class="dot"></span>':""}</div>`; }
    const m=$("#calMount",back); m.innerHTML=`<div class="cal"><div class="cal-head"><button id="pm">‹</button><strong>${year} / ${month+1}</strong><button id="nm">›</button></div><div class="cal-grid">${cells}</div></div>`;
    $("#pm",m).onclick=()=>{ State.cal.month--; if(State.cal.month<0){State.cal.month=11;State.cal.year--;} renderCal(); };
    $("#nm",m).onclick=()=>{ State.cal.month++; if(State.cal.month>11){State.cal.month=0;State.cal.year++;} renderCal(); };
    m.querySelectorAll(".cal-cell[data-dk]").forEach(c=>{ if(!c.dataset.dk) return; c.onclick=()=>{ selected=c.dataset.dk; qty=1; renderCal(); renderPanel(); }; });
  }
  function renderPanel(){
    const p=$("#bookPanel",back); if(!selected){ p.innerHTML=""; return; }
    const [y,mo,d]=selected.split("-").map(Number); const rem=remainingFor(listing,selected); const total=listing.price*qty;
    p.innerHTML=`<div class="section-title">${t("booking_detail")}</div>
      <div class="row" style="margin-bottom:12px"><div>📅 ${y}/${mo+1}/${d}<br><span class="muted" style="font-size:12px">${t("remaining")} ${rem}</span></div><span class="spacer"></span>
      <div class="row" style="gap:8px"><button class="btn secondary sm" id="minus" style="width:38px">−</button><strong style="min-width:30px;text-align:center">${qty}</strong><button class="btn secondary sm" id="plus" style="width:38px">＋</button></div></div>
      <div class="card" style="margin-bottom:14px"><div class="card-body"><div class="pay-row"><span>${esc(L(listing.title))}</span><span>${fmtUSD(listing.price)} × ${qty}</span></div>
      <div class="pay-total"><span>${t("total")}</span><span>${fmtUSD(total)} <span class="muted" style="font-size:13px;font-weight:500">${fmtJPY(total)}</span></span></div></div></div>
      <button class="btn teal" id="payBtn">${t("pay_confirm")}</button><p class="hint" style="text-align:center">${t("no_charge")}</p>`;
    $("#minus",p).onclick=()=>{ if(qty>1){qty--;renderPanel();} };
    $("#plus",p).onclick=()=>{ if(qty<rem){qty++;renderPanel();} else toast(t("slots_max")); };
    $("#payBtn",p).onclick=()=>openPayment(listing,selected,qty);
  }
  renderCal();
}

function openPayment(listing,dk,qty){
  const total=listing.price*qty; const [y,mo,d]=dk.split("-").map(Number);
  const back=openSheet(`<h2>${t("pay_title")}</h2>
    <div class="card"><div class="card-body">
      <div class="pay-row"><span class="muted">${t("plan")}</span><span>${esc(L(listing.title))}</span></div>
      <div class="pay-row"><span class="muted">${t("date")}</span><span>${y}/${mo+1}/${d}</span></div>
      <div class="pay-row"><span class="muted">${t("num")}</span><span>${qty}</span></div>
      <div class="pay-total"><span>${t("total")}</span><span>${fmtUSD(total)}</span></div></div></div>
    <div class="field"><label>${t("cardno")}</label><input inputmode="numeric" value="4242 4242 4242 4242" /></div>
    <div class="row" style="gap:12px"><div class="field" style="flex:1"><label>${t("expiry")}</label><input value="12 / 28" /></div><div class="field" style="width:110px"><label>CVC</label><input value="123" /></div></div>
    <button class="btn" id="cp">${fmtUSD(total)} ${t("pay_now")}</button><button class="btn ghost" id="cc" style="margin-top:8px">${t("back")}</button>`);
  $("#cc",back).onclick=closeSheet;
  $("#cp",back).onclick=()=>{ const b=$("#cp",back); b.disabled=true; b.textContent=t("processing");
    setTimeout(()=>{ const r=DB.get(K.resv,[]); r.push({id:"r"+Date.now(),userEmail:State.user.email,listingId:listing.id,title:L(listing.title),emoji:listing.emoji,dateKey:dk,qty,total,createdAt:Date.now()}); DB.set(K.resv,r); closeSheet(); toast(t("booked")); State.view="mypage"; render(); },900); };
}

/* ---------- 謎解き（ガイド連動・歴史ミステリー） ---------- */
function viewQuest(){
  const stops=DATA.guide.route.stops;
  const stamps=DB.get(K.stamps,{})[State.user.email]||{};
  const done=stops.filter(s=>stamps[s.id]).length;
  const wrap=el(`<div><div class="topbar"><h1>${esc(L(DATA.quest.title))}</h1><p class="sub">${t("quest_sub")}</p></div>
    <div class="pad">
      <div class="card"><div class="card-body">
        <div class="row"><strong>${t("progress")} ${done} / ${stops.length}</strong><span class="spacer"></span>
        <span class="badge exp">${done>=Math.ceil(stops.length*0.7)?t("reward_done"):(Math.ceil(stops.length*0.7)-done)+t("reward_left")}</span></div>
        <div class="stamp" id="stamps"></div><p class="hint">${esc(L(DATA.quest.reward))}</p></div></div>
      <div id="qlist" style="margin-top:6px"></div></div></div>`);
  const sm=$("#stamps",wrap); stops.forEach(s=>sm.appendChild(el(`<div class="s ${stamps[s.id]?"on":""}">${stamps[s.id]?"✓":s.emoji}</div>`)));
  const list=$("#qlist",wrap);
  stops.forEach((s,i)=>{ const got=!!stamps[s.id];
    const item=el(`<div class="list-item"><div class="ava">${s.emoji}</div>
      <div style="flex:1"><strong>${i+1}. ${esc(L(s.title))}</strong>
        <div class="muted" style="font-size:12px;margin-top:3px">${got?t("checked"):"🔍 "+esc(L(s.riddle))}</div></div>
      <button class="btn sm ${got?"secondary":""}" data-id="${s.id}">${got?t("photo"):t("checkin")}</button></div>`);
    $("button",item).onclick=()=> got ? (State.view="album",render()) : openCheckin(s);
    list.appendChild(item);
  });
  return wrap;
}

function openCheckin(spot){
  const back=openSheet(`<h2>${spot.emoji} ${esc(L(spot.title))}</h2>
    <div class="card"><div class="card-body"><span class="badge cafe">🔍</span><p style="margin:8px 0 0">${esc(L(spot.riddle))}</p></div></div>
    <p class="muted" style="font-size:13px;margin:4px 2px 14px">${t("ck_hint")}</p>
    <label class="btn gold" for="camInput">${t("ck_take")}</label>
    <input id="camInput" type="file" accept="image/*" capture="environment" style="display:none" />
    <button class="btn ghost" id="ckLater" style="margin-top:8px">${t("ck_later")}</button>`);
  $("#ckLater",back).onclick=closeSheet;
  $("#camInput",back).onchange=async e=>{ const file=e.target.files[0]; if(!file) return; const lbl=back.querySelector('label[for="camInput"]'); lbl.textContent=t("processing");
    try{ const dataUrl=await fileToResizedDataUrl(file);
      const album=DB.get(K.album,[]); album.unshift({id:"p"+Date.now(),userEmail:State.user.email,spotId:spot.id,place:L(spot.title),dataUrl,caption:`${L(spot.title)} — Antigua, Guatemala 🌋 #MiAmigo #Antigua`,createdAt:Date.now()}); DB.set(K.album,album);
      const all=DB.get(K.stamps,{}); all[State.user.email]={...(all[State.user.email]||{}),[spot.id]:true}; DB.set(K.stamps,all);
      const justCleared=stageComplete(DATA.stages[0]);
      closeSheet(); toast(justCleared?t("stage_unlocked_toast"):t("ck_done")); render();
    }catch{ toast(t("ck_fail")); lbl.textContent=t("ck_take"); }
  };
}

/* ---------- 音声ガイド（再生中の文章を前面に表示＋ハイライト） ---------- */
function viewGuide(){
  const g=DATA.guide;
  const wrap=el(`<div><div class="topbar"><h1>${esc(L(g.route.title))}</h1><p class="sub">${t("guide_sub")}</p><div id="gLang"></div></div>
    <div class="pad"><p class="muted" style="font-size:13px;margin:0 0 16px">${esc(L(g.route.intro))}</p>
      <div class="section-title">${t("walk_route")}（${g.route.stops.length}）</div><div class="route" id="route"></div>
      <div class="section-title">${t("listen_history")}</div><div id="history"></div>
      <p class="hint" style="text-align:center;margin-top:18px">${t("tts_note")}</p></div></div>`);
  $("#gLang",wrap).appendChild(langSeg(()=>render()));
  const route=$("#route",wrap);
  g.route.stops.forEach((s,i)=>{
    const item=el(`<div class="route-item"><div class="route-num">${i+1}</div>
      <div class="card" style="flex:1;margin:0 0 14px"><div class="card-body">
        <div class="row" style="align-items:flex-start"><div class="ava">${s.emoji}</div>
        <div style="flex:1"><strong>${esc(L(s.title))}</strong><p class="muted" style="font-size:13px;margin:6px 0 0">${esc(L(s.text))}</p></div></div>
        <button class="btn teal sm" style="width:100%;margin-top:12px">${t("play")}</button></div></div></div>`);
    $("button",item).onclick=()=>openPlayer(s);
    route.appendChild(item);
  });
  const hist=$("#history",wrap);
  g.history.forEach(h=>{
    const item=el(`<div class="card"><div class="card-body"><div class="row" style="align-items:flex-start"><div class="ava">${h.emoji}</div>
      <div style="flex:1"><strong>${esc(L(h.title))}</strong>${h.sensitive?`<div style="margin-top:4px"><span class="badge food">⚠️ ${State.lang==="ja"?"取り扱い注意・下書き":"draft"}</span></div>`:""}
      <p class="muted" style="font-size:13px;margin:8px 0 0">${esc(L(h.text))}</p></div></div>
      <button class="btn teal sm" style="width:100%;margin-top:12px">${t("play")}</button></div></div>`);
    $("button",item).onclick=()=>openPlayer(h);
    hist.appendChild(item);
  });
  return wrap;
}

// 再生プレイヤー：読み上げ文を大きく前面に。読み上げ位置をハイライトして自動スクロール。
function openPlayer(item){
  const text=L(item.text);
  // 文単位に分割（日本語の「。」・欧文の .!? と改行）
  const parts=text.match(/[^。．.!?！？\n]+[。．.!?！？]?/g) || [text];
  const sentences=parts.map(p=>p.trim()).filter(Boolean);
  let offs=[]; { let pos=0; sentences.forEach(s=>{ const idx=text.indexOf(s,pos); offs.push(idx<0?pos:idx); pos=(idx<0?pos:idx)+s.length; }); }
  const spans=sentences.map((s,i)=>`<span class="sent" data-i="${i}">${esc(s)} </span>`).join("");
  const back=openSheet(`<div class="player">
    <div class="row" style="align-items:center"><div class="ava" style="font-size:26px">${item.emoji}</div><h2 style="margin:0 0 0 6px;flex:1">${esc(L(item.title))}</h2></div>
    <div class="player-text" id="ptext">${spans}</div>
    <div class="player-ctl"><button class="btn teal" id="pToggle">${t("stop")}</button><button class="btn secondary" id="pClose">${t("close")}</button></div>
  </div>`);
  const textBox=$("#ptext",back); const spanEls=[...textBox.querySelectorAll(".sent")];
  const highlight=(i)=>{ spanEls.forEach((e,j)=>e.classList.toggle("active",j===i)); const a=spanEls[i]; if(a) a.scrollIntoView({block:"center",behavior:"smooth"}); };
  const sentenceForChar=(ci)=>{ let idx=0; for(let i=0;i<offs.length;i++){ if(ci>=offs[i]) idx=i; else break; } return idx; };
  let toggled=true;
  function start(){
    if(!("speechSynthesis" in window)){ toast(t("no_tts")); highlight(0); return; }
    speechSynthesis.cancel();
    const u=new SpeechSynthesisUtterance(text); u.lang=LANG_CODE[State.lang]||"ja-JP"; u.rate=0.97;
    State.speakingId=item.id; highlight(0);
    u.onboundary=(e)=>{ if(e.charIndex!=null) highlight(sentenceForChar(e.charIndex)); };
    u.onend=()=>{ State.speakingId=null; toggled=false; const b=$("#pToggle",back); if(b) b.textContent=t("replay"); spanEls.forEach(e=>e.classList.remove("active")); };
    speechSynthesis.speak(u);
  }
  $("#pToggle",back).onclick=()=>{ if(toggled){ stopSpeak(); toggled=false; $("#pToggle",back).textContent=t("replay"); spanEls.forEach(e=>e.classList.remove("active")); } else { toggled=true; $("#pToggle",back).textContent=t("stop"); start(); } };
  $("#pClose",back).onclick=()=>{ stopSpeak(); closeSheet(); };
  back.addEventListener("click",e=>{ if(e.target===back) stopSpeak(); });
  start();
}

/* ---------- マップ（GPS＋Googleマップ） ---------- */
function gmapsDir(lat,lng){ const o=State.geo?`&origin=${State.geo.lat},${State.geo.lng}`:""; return `https://www.google.com/maps/dir/?api=1${o}&destination=${lat},${lng}`; }
function gmapsView(lat,lng,label){ return `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`; }
function distKm(a,b){ const R=6371,dLat=(b.lat-a.lat)*Math.PI/180,dLng=(b.lng-a.lng)*Math.PI/180,la=a.lat*Math.PI/180,lb=b.lat*Math.PI/180; const x=Math.sin(dLat/2)**2+Math.cos(la)*Math.cos(lb)*Math.sin(dLng/2)**2; return R*2*Math.atan2(Math.sqrt(x),Math.sqrt(1-x)); }
function viewMap(){
  const stops=DATA.guide.route.stops;
  // ルート全体の埋め込み（複数ピンは無料埋め込みでは中心＋検索のみ→代表点で表示）
  const center=stops[0];
  const embed=`https://maps.google.com/maps?q=${center.lat},${center.lng}&z=15&output=embed`;
  const wrap=el(`<div><div class="topbar"><h1>${t("tab_map")}</h1><p class="sub">${t("map_sub")}</p></div>
    <div class="pad">
      <div class="mapbox"><iframe src="${embed}" loading="lazy" referrerpolicy="no-referrer-when-downgrade"></iframe></div>
      <a class="btn secondary" href="${gmapsView(center.lat,center.lng)}" target="_blank" rel="noopener" style="margin:12px 0">${t("all_route")}</a>
      <button class="btn gold" id="geoBtn">${t("enable_loc")}</button>
      <div id="spotList" style="margin-top:10px"></div>
    </div></div>`);
  const render2=()=>{
    let list=stops.map((s,i)=>({s,i}));
    if(State.geo) list.sort((a,b)=>distKm(State.geo,a.s)-distKm(State.geo,b.s));
    const box=$("#spotList",wrap); box.innerHTML="";
    list.forEach(({s,i})=>{
      const dist=State.geo?`<span class="badge stay">${t("away")}${distKm(State.geo,s).toFixed(distKm(State.geo,s)<10?1:0)} ${t("km_away")}</span>`:"";
      const item=el(`<div class="list-item"><div class="ava">${s.emoji}</div>
        <div style="flex:1"><strong>${i+1}. ${esc(L(s.title))}</strong> ${dist}
          <div style="margin-top:8px">
            <a class="btn sm teal" href="${gmapsDir(s.lat,s.lng)}" target="_blank" rel="noopener" style="display:inline-block">${t("go_here")}</a>
          </div></div></div>`);
      box.appendChild(item);
    });
  };
  $("#geoBtn",wrap).onclick=()=>{ const b=$("#geoBtn",wrap); if(!navigator.geolocation){ toast(t("loc_fail")); return; } b.textContent=t("locating"); b.disabled=true;
    navigator.geolocation.getCurrentPosition(p=>{ State.geo={lat:p.coords.latitude,lng:p.coords.longitude}; b.textContent="📍 "+(State.lang==="ja"?"現在地ON（近い順）":State.lang==="es"?"Ubicación activa":"Located"); render2(); },
      ()=>{ toast(t("loc_fail")); b.textContent=t("enable_loc"); b.disabled=false; }, {enableHighAccuracy:true,timeout:8000}); };
  render2();
  return wrap;
}

/* ---------- なかま（グループチャット・位置共有） ---------- */
function allGroups(){ return [...DATA.community.groups, ...DB.get(K.groups,[])]; }
function groupMsgs(gid){
  const g=allGroups().find(x=>x.id===gid);
  const seed=(g&&g.seed||[]).map((m,i)=>({...m, id:"seed"+gid+i, ts:0, seed:true}));
  const mine=DB.get(K.chat,{})[gid]||[];
  return [...seed, ...mine];
}
function addMsg(gid,msg){ const all=DB.get(K.chat,{}); all[gid]=[...(all[gid]||[]), msg]; DB.set(K.chat,all); }

function viewCommunity(){
  if(State.chatGroup) return viewChat(State.chatGroup);
  const wrap=el(`<div><div class="topbar"><h1>${t("tab_community")}</h1><p class="sub">${t("community_sub")}</p></div>
    <div class="pad">
      <div class="row" style="gap:8px;margin-bottom:14px">
        <input id="ngName" placeholder="${t("new_group_ph")}" style="flex:1;padding:12px 14px;border:1.5px solid var(--line);border-radius:12px;font-size:15px" />
        <button class="btn sm" id="ngBtn" style="white-space:nowrap">${t("create_group")}</button>
      </div>
      <div class="section-title" style="margin-top:6px">${t("groups")}</div>
      <div id="glist"></div>
      <p class="hint" style="margin-top:16px">${t("demo_chat_note")}</p>
    </div></div>`);
  const list=$("#glist",wrap);
  allGroups().forEach(g=>{
    const msgs=groupMsgs(g.id); const last=msgs[msgs.length-1];
    const item=el(`<div class="list-item"><div class="ava">${g.emoji}</div>
      <div style="flex:1"><strong>${esc(L(g.name))}</strong>
        <div class="muted" style="font-size:12px;margin-top:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:200px">${last?esc((last.me?t("you")+": ":(last.from?esc(last.from)+": ":""))+(last.text||"")):""}</div></div>
      <button class="btn sm secondary" data-id="${g.id}">${t("open_chat")}</button></div>`);
    $("button",item).onclick=()=>{ State.chatGroup=g.id; render(); };
    list.appendChild(item);
  });
  $("#ngBtn",wrap).onclick=()=>{ const v=$("#ngName",wrap).value.trim(); if(!v) return; const ug=DB.get(K.groups,[]); const id="ug"+Date.now(); ug.push({id,emoji:"🌟",name:v,seed:[]}); DB.set(K.groups,ug); toast(t("group_created")); State.chatGroup=id; render(); };
  return wrap;
}

function viewChat(gid){
  const g=allGroups().find(x=>x.id===gid);
  const wrap=el(`<div class="chat-screen">
    <div class="topbar chat-top"><button class="chat-back" id="cBack">‹</button><div class="ava" style="width:34px;height:34px;font-size:18px">${g?g.emoji:"💬"}</div><div style="flex:1"><h1 style="font-size:18px;margin:0">${esc(L(g?g.name:""))}</h1></div></div>
    <div class="chat-body" id="cbody"></div>
    <div class="chat-bar">
      <button class="btn gold sm" id="here" style="width:auto;white-space:nowrap">${t("share_here")}</button>
      <input id="cmsg" placeholder="${t("msg_ph")}" />
      <button class="btn sm" id="csend" style="width:auto">${t("send")}</button>
    </div>
  </div>`);
  const body=$("#cbody",wrap);
  function paint(){
    body.innerHTML="";
    groupMsgs(gid).forEach(m=>{
      const me=!!m.me;
      const who = me ? userRec() : {name:m.from, emoji:m.emoji};
      const locHtml = m.loc ? `<a href="${gmapsView(m.loc.lat,m.loc.lng)}" target="_blank" rel="noopener" class="loc-chip">🗺️ ${t("loc_link")}</a>` : "";
      const bubble=el(`<div class="msg ${me?"me":""}">
        ${me?"":avatarHTML(who,34)}
        <div class="bubble">${me?"":`<div class="who">${esc(m.from||"")}</div>`}<div class="txt">${esc(m.text||"")}</div>${locHtml}</div>
        ${me?avatarHTML(who,34):""}
      </div>`);
      body.appendChild(bubble);
    });
    body.scrollTop=body.scrollHeight;
  }
  paint();
  $("#cBack",wrap).onclick=()=>{ State.chatGroup=null; render(); };
  const send=()=>{ const inp=$("#cmsg",wrap); const v=inp.value.trim(); if(!v) return; addMsg(gid,{id:"m"+Date.now(),me:true,text:v,ts:Date.now()}); inp.value=""; paint(); };
  $("#csend",wrap).onclick=send;
  $("#cmsg",wrap).addEventListener("keydown",e=>{ if(e.key==="Enter") send(); });
  $("#here",wrap).onclick=()=>{ if(!navigator.geolocation){ toast(t("loc_fail")); return; } const b=$("#here",wrap); b.textContent=t("locating");
    navigator.geolocation.getCurrentPosition(p=>{ const loc={lat:p.coords.latitude,lng:p.coords.longitude}; State.geo=loc; addMsg(gid,{id:"m"+Date.now(),me:true,text:t("here_now"),loc,ts:Date.now()}); toast(t("here_shared")); paint(); b.textContent=t("share_here"); },
      ()=>{ toast(t("loc_fail")); b.textContent=t("share_here"); }, {enableHighAccuracy:true,timeout:8000}); };
  setTimeout(()=>{ body.scrollTop=body.scrollHeight; },50);
  return wrap;
}

function openProfile(){
  const r=userRec(); let avatar=r.avatar||""; let prouds=[...(r.prouds||[])];
  const cOpts=(sel)=>`<option value="">${t("select_ph")}</option>`+DATA.countries.map(c=>`<option value="${c.c}" ${sel===c.c?"selected":""}>${c.f} ${esc(c[State.lang]||c.en)}</option>`).join("");
  const gOpts=`<option value="">${t("select_ph")}</option>`+["m","f","o","na"].map(g=>`<option value="${g}" ${r.gender===g?"selected":""}>${t("g_"+g)}</option>`).join("");
  const back=openSheet(`<h2>${t("edit_profile")}</h2>
    <div style="display:flex;justify-content:center;margin:6px 0 14px"><div id="pAva">${avatarHTML(r,84)}</div></div>
    <label class="btn secondary" for="avaInput">${t("add_photo")}</label>
    <input id="avaInput" type="file" accept="image/*" style="display:none" />
    <div class="field" style="margin-top:14px"><label>${t("amigo_name")}</label><input id="pNick" value="${esc(r.name||"")}" /></div>
    <div class="row" style="gap:12px">
      <div class="field" style="width:120px"><label>${t("age")} <span class="muted">${t("optional")}</span></label><input id="pAge" type="number" inputmode="numeric" value="${r.age!=null?esc(r.age):""}" /></div>
      <div class="field" style="flex:1"><label>${t("gender")} <span class="muted">${t("optional")}</span></label><select id="pGender">${gOpts}</select></div>
    </div>
    <div class="field"><label>${t("from_country")}</label><select id="pCountry">${cOpts(r.country)}</select></div>
    <div class="field"><label>${t("proud")}</label>
      <div class="chips" id="proudChips"></div>
      <div class="row" style="gap:8px;margin-top:8px"><select id="proudSel" style="flex:1">${cOpts("")}</select><button class="btn sm secondary" id="proudAdd" type="button" style="white-space:nowrap">${t("add_country")}</button></div>
      <p class="hint">${t("proud_hint")}</p></div>
    <div class="field"><label>${t("bio")}</label><input id="pBio" value="${esc(r.bio||"")}" placeholder="${t("bio_ph")}" /></div>
    <button class="btn" id="pSave">${t("save")}</button>`);
  const paintChips=()=>{ const box=$("#proudChips",back); box.innerHTML=prouds.length?prouds.map(c=>`<span class="chip" data-c="${c}">${countryFlag(c)} ${esc(countryName(c))} <b>✕</b></span>`).join(""):`<span class="muted" style="font-size:13px">—</span>`; box.querySelectorAll(".chip").forEach(ch=>ch.onclick=()=>{ prouds=prouds.filter(x=>x!==ch.dataset.c); paintChips(); }); };
  paintChips();
  $("#proudAdd",back).onclick=()=>{ const v=$("#proudSel",back).value; if(v&&!prouds.includes(v)){ prouds.push(v); paintChips(); } };
  $("#avaInput",back).onchange=async e=>{ const f=e.target.files[0]; if(!f) return; try{ avatar=await fileToResizedDataUrl(f,400,0.8); $("#pAva",back).innerHTML=avatarHTML({avatar},84); }catch{ toast(t("ck_fail")); } };
  $("#pSave",back).onclick=()=>{ saveProfile({nick:$("#pNick",back).value, avatar, bio:$("#pBio",back).value, age:$("#pAge",back).value?Number($("#pAge",back).value):null, gender:$("#pGender",back).value, country:$("#pCountry",back).value, prouds}); closeSheet(); toast(t("profile_saved")); render(); };
}

/* アミーゴカード（拡散用シェア画像） */
function loadImg(src){ return new Promise((res,rej)=>{ const i=new Image(); i.onload=()=>res(i); i.onerror=rej; i.src=src; }); }
function roundRect(x,a,b,w,h,r){ x.beginPath(); x.moveTo(a+r,b); x.arcTo(a+w,b,a+w,b+h,r); x.arcTo(a+w,b+h,a,b+h,r); x.arcTo(a,b+h,a,b,r); x.arcTo(a,b,a+w,b,r); x.closePath(); }
async function drawAmigoCard(){
  const r=userRec(); const stops=DATA.guide.route.stops; const stamps=DB.get(K.stamps,{})[State.user.email]||{}; const done=stops.filter(s=>stamps[s.id]).length;
  const W=1080,H=1350; const cv=document.createElement("canvas"); cv.width=W; cv.height=H; const x=cv.getContext("2d");
  const g=x.createLinearGradient(0,0,W,H); g.addColorStop(0,"#c0397a"); g.addColorStop(.5,"#c8543b"); g.addColorStop(1,"#e8a93c"); x.fillStyle=g; x.fillRect(0,0,W,H);
  const cols=["#c0397a","#e8a93c","#1d7a73","#c8543b"]; for(let i=0;i<Math.ceil(W/40);i++){ x.fillStyle=cols[i%4]; x.fillRect(i*40,0,40,20); x.fillRect(i*40,H-20,40,20); }
  x.fillStyle="rgba(251,244,232,0.96)"; roundRect(x,70,150,W-140,H-300,40); x.fill();
  x.textAlign="center";
  x.fillStyle="#c8543b"; x.font="800 46px sans-serif"; x.fillText("MI AMIGO", W/2, 250);
  x.fillStyle="#8a7d72"; x.font="600 26px sans-serif"; x.fillText("AMIGO CARD · ANTIGUA", W/2, 296);
  const cx=W/2, cy=450, rad=110;
  x.save(); x.beginPath(); x.arc(cx,cy,rad,0,Math.PI*2); x.closePath(); x.clip();
  if(r.avatar){ try{ const im=await loadImg(r.avatar); x.drawImage(im,cx-rad,cy-rad,rad*2,rad*2);}catch{} } else { x.fillStyle="#f3e4d2"; x.fillRect(cx-rad,cy-rad,rad*2,rad*2); x.fillStyle="#8a5a22"; x.font="800 110px sans-serif"; x.textBaseline="middle"; x.fillText(((r.name||"?").trim()[0]||"?").toUpperCase(),cx,cy); x.textBaseline="alphabetic"; }
  x.restore();
  x.lineWidth=8; x.strokeStyle="#fff"; x.beginPath(); x.arc(cx,cy,rad,0,Math.PI*2); x.stroke();
  x.fillStyle="#2a211c"; x.font="900 58px sans-serif"; x.fillText(r.name||"Amigo", W/2, 660);
  let yy=735; x.font="600 34px sans-serif"; x.fillStyle="#5b4f45";
  if(r.country){ x.fillText(`${t("card_from")}: ${countryFlag(r.country)} ${countryName(r.country)}`, W/2, yy); yy+=56; }
  if(r.prouds&&r.prouds.length){ x.fillText(`${t("card_loves")}: ${r.prouds.slice(0,8).map(countryFlag).join(" ")}`, W/2, yy); yy+=56; }
  if(r.bio){ let bio=r.bio; if(bio.length>26) bio=bio.slice(0,25)+"…"; x.font="400 28px sans-serif"; x.fillStyle="#8a7d72"; x.fillText(bio, W/2, yy); }
  x.fillStyle="#1d7a73"; roundRect(x,W/2-200,1070,400,92,46); x.fill();
  x.fillStyle="#fff"; x.font="800 38px sans-serif"; x.fillText(`🎯 ${t("card_stamps")} ${done}/${stops.length}`, W/2, 1128);
  if(r.refCode){ x.fillStyle="rgba(255,255,255,0.97)"; x.font="800 30px sans-serif"; x.fillText(`🎟️ ${t("card_invite")}: ${r.refCode}`, W/2, H-108); }
  x.fillStyle="rgba(255,255,255,0.95)"; x.font="600 28px sans-serif"; x.fillText("takuha.github.io/mi-amigo", W/2, H-58);
  return cv.toDataURL("image/png");
}
async function openAmigoCard(){
  const back=openSheet(`<h2>${t("amigo_card")}</h2><div class="cardprev" id="cardPrev"><div class="muted" style="padding:50px;text-align:center">…</div></div>
    <button class="btn gold" id="cardSave" style="margin-top:14px">${t("save_card")}</button>
    <button class="btn teal" id="cardShare" style="margin-top:8px">${t("share_card")}</button>`);
  let url; try{ url=await drawAmigoCard(); }catch{ toast(t("ck_fail")); return; }
  $("#cardPrev",back).innerHTML=`<img src="${url}" style="width:100%;border-radius:16px;display:block" />`;
  $("#cardSave",back).onclick=()=>{ const a=document.createElement("a"); a.href=url; a.download="mi_amigo_card.png"; a.click(); toast(t("card_made")); };
  const shareUrl=(userRec().refCode?Org.refUrl(userRec().refCode):(location.origin+location.pathname));
  $("#cardShare",back).onclick=async()=>{ try{ if(navigator.share){ const blob=await (await fetch(url)).blob(); const file=new File([blob],"mi_amigo_card.png",{type:"image/png"}); const p={text:`Mi Amigo — ${t("card_tagline")} 🌋 ${shareUrl}`}; if(navigator.canShare&&navigator.canShare({files:[file]})) p.files=[file]; await navigator.share(p); } else { await navigator.clipboard?.writeText(shareUrl); toast(t("copied")); } }catch{} };
}

/* ---------- アルバム＋5プラットフォーム共有 ---------- */
function viewAlbum(){
  const photos=DB.get(K.album,[]).filter(p=>p.userEmail===State.user.email);
  const wrap=el(`<div><div class="topbar"><h1>${t("tab_album")}</h1><p class="sub">${t("album_sub")}</p></div><div class="pad" id="ab"></div></div>`);
  const body=$("#ab",wrap);
  if(!photos.length){ const es=el(`<div class="empty-state"><div class="big">📸</div><p>${t("album_empty")}</p><button class="btn" id="gq" style="max-width:220px;margin:8px auto 0">${t("go_quest")}</button></div>`); $("#gq",es).onclick=()=>{State.view="quest";render();}; body.appendChild(es); return wrap; }
  const grid=el(`<div class="album-grid"></div>`); photos.forEach(p=>{ const img=el(`<img class="ph" src="${p.dataUrl}" alt="${esc(p.place)}" />`); img.onclick=()=>openPhoto(p); grid.appendChild(img); }); body.appendChild(grid);
  return wrap;
}

const PLATFORMS=[
  { key:"instagram", label:"Instagram", emoji:"📷", bg:"#E1306C" },
  { key:"facebook",  label:"Facebook",  emoji:"👍", bg:"#1877F2" },
  { key:"x",         label:"X",         emoji:"✖️", bg:"#000000" },
  { key:"tiktok",    label:"TikTok",    emoji:"🎵", bg:"#111111" },
  { key:"whatsapp",  label:"WhatsApp",  emoji:"💬", bg:"#25D366" },
];
async function shareToPlatform(plat, caption, photo){
  const url=location.origin+location.pathname;
  const txt=encodeURIComponent(caption+"\n"+url);
  const open=(u)=>window.open(u,"_blank","noopener");
  if(plat==="x") return open(`https://twitter.com/intent/tweet?text=${txt}`);
  if(plat==="facebook") return open(`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}&quote=${encodeURIComponent(caption)}`);
  if(plat==="whatsapp") return open(`https://wa.me/?text=${txt}`);
  // Instagram / TikTok は Web投稿APIが無い → 写真つきネイティブ共有を試し、無ければキャプションをコピーしてアプリを開く
  try{
    if(navigator.share){ const blob=await (await fetch(photo.dataUrl)).blob(); const file=new File([blob],"miamigo.jpg",{type:"image/jpeg"});
      if(navigator.canShare&&navigator.canShare({files:[file]})){ await navigator.share({text:caption,files:[file]}); return; } }
  }catch{}
  try{ await navigator.clipboard?.writeText(caption); }catch{}
  toast(t("copied"));
  open(plat==="instagram"?"https://www.instagram.com/":"https://www.tiktok.com/upload");
}
function openPhoto(p){
  const d=new Date(p.createdAt);
  const platBtns=PLATFORMS.map(pl=>`<button class="plat" data-k="${pl.key}" style="background:${pl.bg}"><span>${pl.emoji}</span><span>${pl.label}</span></button>`).join("");
  const back=openSheet(`<h2>📸 ${esc(p.place)}</h2>
    <img src="${p.dataUrl}" style="width:100%;border-radius:16px;margin-bottom:12px" />
    <div class="field"><label>${t("caption")}</label><input id="cap" value="${esc(p.caption)}" /></div>
    <p class="muted" style="font-size:12px;margin:-6px 2px 12px">${d.getFullYear()}/${d.getMonth()+1}/${d.getDate()} ${t("taken")}</p>
    <div class="section-title" style="margin-top:0">${t("share_to")}</div>
    <div class="plat-grid">${platBtns}</div>
    <button class="btn secondary" id="save" style="margin-top:14px">${t("save_photo")}</button>
    <button class="btn ghost" id="other" style="margin-top:8px">${t("other_share")}</button>
    <button class="btn ghost" id="del" style="margin-top:4px;color:var(--danger)">${t("delete_photo")}</button>`);
  back.querySelectorAll(".plat").forEach(b=>b.onclick=()=>shareToPlatform(b.dataset.k, $("#cap",back).value, p));
  $("#save",back).onclick=()=>{ const a=document.createElement("a"); a.href=p.dataUrl; a.download=`miamigo_${p.spotId||"photo"}.jpg`; a.click(); };
  $("#other",back).onclick=async()=>{ try{ if(navigator.share){ const blob=await (await fetch(p.dataUrl)).blob(); const file=new File([blob],"miamigo.jpg",{type:"image/jpeg"}); const pl={text:$("#cap",back).value}; if(navigator.canShare&&navigator.canShare({files:[file]})) pl.files=[file]; await navigator.share(pl); toast(t("shared")); } else { await navigator.clipboard?.writeText($("#cap",back).value); toast(t("copied")); } }catch{} };
  $("#del",back).onclick=()=>{ DB.set(K.album, DB.get(K.album,[]).filter(x=>x.id!==p.id)); closeSheet(); toast(t("deleted")); render(); };
}

/* ---------- 企業向け：広告掲載ページ（広告主を募る） ---------- */
function viewBusiness(){
  const members=Org.count();
  const langPick=el(`<div></div>`); langPick.appendChild(langSeg(()=>render()));
  const products=[ "biz_p1","biz_p2","biz_p3","biz_p4" ].map(k=>`<li>${t(k)}</li>`).join("");
  const wrap=el(`<div>
    <div class="auth-hero" style="height:auto;min-height:170px;padding:20px 24px 22px">
      <h1 style="font-size:30px">${t("biz_title")}</h1>
      <p style="font-size:15px;margin-top:8px">${t("biz_hero")}</p>
    </div>
    <div class="weave"></div>
    <div class="pad">
      <div id="bizLang" style="margin-bottom:6px"></div>
      <div class="card" style="background:#f3ece0;border:none"><div class="card-body" style="text-align:center">
        <div class="muted" style="font-size:13px">${t("biz_members")}</div>
        <div style="font-size:40px;font-weight:900;color:var(--terra)">${members.toLocaleString()}<span style="font-size:18px"> ${t("biz_people")}</span></div>
      </div></div>

      <div class="section-title">${t("biz_audience")}</div>
      <div class="card"><div class="card-body"><ul class="clean2">
        <li>📱 ${t("biz_a1")}</li><li>🎯 ${t("biz_a2")}</li><li>🔥 ${t("biz_a3")}</li></ul></div></div>

      <div class="section-title">${t("biz_products")}</div>
      <div class="card"><div class="card-body"><ul class="clean2">${products}</ul></div></div>

      <div class="section-title">${t("biz_inquiry")}</div>
      <div class="field"><label>${t("biz_company")}</label><input id="bC" /></div>
      <div class="field"><label>${t("biz_person")}</label><input id="bP" /></div>
      <div class="field"><label>${t("biz_contact")}</label><input id="bM" /></div>
      <div class="field"><label>${t("biz_budget")}</label><input id="bB" /></div>
      <div class="field"><label>${t("biz_message")}</label><input id="bMsg" /></div>
      <button class="btn" id="bSend">${t("biz_send")}</button>
      <p class="hint" style="margin-top:12px">${t("biz_note")}</p>
      <button class="btn ghost" id="bBack" style="margin-top:10px">${t("biz_back")}</button>
    </div></div>`);
  $("#bizLang",wrap).appendChild(langSeg(()=>render()));
  $("#bSend",wrap).onclick=async ()=>{
    const company=$("#bC",wrap).value, person=$("#bP",wrap).value, contact=$("#bM",wrap).value, budget=$("#bB",wrap).value, msg=$("#bMsg",wrap).value;
    if(Cloud.ready && await Cloud.submit("biz", { company:company||"", person:person||"", contact:contact||"", budget:budget||"", msg:msg||"" })){ toast(t("sub_sent")); return; }
    const subject=encodeURIComponent(`[Mi Amigo 広告掲載] ${company||""}`);
    const bodyTxt=`${t("biz_company")}: ${company}\n${t("biz_person")}: ${person}\n${t("biz_contact")}: ${contact}\n${t("biz_budget")}: ${budget}\n${t("biz_message")}: ${msg}\n\n— Mi Amigo (${location.origin+location.pathname})`;
    window.location.href=`mailto:${BIZ_EMAIL}?subject=${subject}&body=${encodeURIComponent(bodyTxt)}`;
    toast(t("biz_sent"));
  };
  $("#bBack",wrap).onclick=()=>{ State.business=false; if(location.hash) history.replaceState(null,"",location.pathname); render(); };
  return wrap;
}

/* ---------- 世界遺産ステージ＋軽量地球儀 ---------- */
// 粗い大陸ポリゴン（[経度,緯度]）。地球儀の見た目用。正確さより回転の自然さ重視。
const CONTINENTS=[
  [[-165,60],[-140,68],[-120,68],[-100,66],[-82,62],[-66,50],[-70,42],[-80,30],[-97,18],[-105,22],[-120,33],[-127,48],[-150,58]],
  [[-78,8],[-60,8],[-50,-2],[-42,-22],[-55,-34],[-70,-50],[-74,-40],[-80,-18],[-81,-2]],
  [[-16,28],[8,36],[32,32],[44,12],[50,-8],[38,-30],[20,-35],[12,-18],[8,2],[-12,12],[-17,20]],
  [[-9,38],[2,50],[12,54],[28,58],[40,60],[42,46],[28,40],[14,40],[2,42]],
  [[42,46],[55,62],[80,70],[110,72],[140,68],[165,62],[150,48],[122,35],[108,18],[92,8],[78,8],[62,28],[48,38]],
  [[114,-22],[132,-11],[146,-16],[152,-34],[138,-38],[120,-34]],
];
function antiguaStops(){ return DATA.guide.route.stops; }
function stageProgress(stage){
  if(stage.questSource==="antigua"){ const stamps=DB.get(K.stamps,{})[State.user?.email]||{}; const stops=antiguaStops(); return {done:stops.filter(s=>stamps[s.id]).length, total:stops.length}; }
  return {done:0, total:0};
}
// クリア条件：全スポットの70%（10個中7個）。
function stageClearMin(stage){ const p=stageProgress(stage); return Math.ceil(p.total*0.7); }
function stageComplete(stage){ const p=stageProgress(stage); return p.total>0 && p.done>=stageClearMin(stage); }
// 開拓投票ヘルパ。Firebase設定があれば全ユーザー合算（Cloud）、無ければ端末内デモ（localStorage）。
// 表示票数 ＝ VOTE_SEED（初期の盛り上がり）＋ クラウドの実投票数。
function cloudUid(){ let id=DB.get("ma_uid",null); if(!id){ id="u_"+randSalt(); DB.set("ma_uid",id); } return id; }
let VoteWatch=null; // 投票シートが開いている間、他ユーザーの票をライブ反映するフック {root,paint}
function onCloudVotesChanged(){
  if(VoteWatch){ if(document.body.contains(VoteWatch.root)){ try{ VoteWatch.paint(); }catch{} } else VoteWatch=null; }
  try{ render(); }catch{}
}
// クラウド投票エンジン（Firestoreの votes コレクションを全員で共有・リアルタイム購読）
const Cloud = {
  ready:false, db:null, auth:null, messaging:null, uid:null, counts:{}, mine:new Set(), loaded:false,
  init(){
    try{
      if(!window.FIREBASE_CONFIG || !window.firebase || !firebase.initializeApp) return;
      firebase.initializeApp(window.FIREBASE_CONFIG);
      this.db=firebase.firestore(); this.uid=cloudUid(); this.ready=true;
      try{ if(firebase.auth){ this.auth=firebase.auth(); this.auth.useDeviceLanguage(); } }catch(e){ this.auth=null; }
      try{ if(firebase.messaging){ this.messaging=firebase.messaging(); this.messaging.onMessage(p=>{ const n=(p&&p.notification)||{}; pushNotif([n.title,n.body].filter(Boolean).join("：")||"📣"); }); } }catch(e){ this.messaging=null; }
      console.log("[Cloud] Firebase 接続OK:", window.FIREBASE_CONFIG.projectId, "auth:", !!this.auth, "msg:", !!this.messaging);
      this.watch();
      // 組織ツリーの読取はルール上ログイン必須。ログイン状態が確定してから購読を開始する。
      if(this.auth){ this.auth.onAuthStateChanged(u=>{ if(u) this.watchOrg(); }); }
    }catch(e){ console.warn("[Cloud] init失敗（端末内デモで継続）", e); this.ready=false; }
  },
  // 組織ツリー（全員共有）を Firestore の単一ドキュメント org/tree で購読・ミラー（ログイン後に呼ぶ）
  watchOrg(){
    if(this._orgUnsub) return;            // 二重購読を防止
    Org.cloud=true;
    this._orgUnsub=this.db.collection("org").doc("tree").onSnapshot(snap=>{
      Org._tree = snap.exists ? snap.data() : orgEmptyTree();
      if(!Org._tree.members) Org._tree.members={};
      if(!Org._tree.codeIndex) Org._tree.codeIndex={};
      syncMyOrg().finally(()=>{ try{ render(); }catch{} });
    }, err=>{ console.warn("[Org] tree購読エラー（ローカルに切替）", err); Org.cloud=false; this._orgUnsub=null; try{ render(); }catch{} });
  },
  watch(){
    this.db.collection("votes").onSnapshot(snap=>{
      const counts={}, mine=new Set();
      snap.forEach(d=>{ const x=d.data()||{}; const s=x.stage; if(!s) return; counts[s]=(counts[s]||0)+1; if(x.uid===this.uid) mine.add(s); });
      this.counts=counts; this.mine=mine; this.loaded=true; onCloudVotesChanged();
    }, err=>console.warn("[Cloud] votes購読エラー", err));
  },
  async setVote(stageId,on){
    if(!this.ready) return;
    const ref=this.db.collection("votes").doc(stageId+"__"+this.uid);
    try{ if(on) await ref.set({stage:stageId, uid:this.uid, ts:firebase.firestore.FieldValue.serverTimestamp()}); else await ref.delete(); }
    catch(e){ console.warn("[Cloud] 投票の保存に失敗", e); }
  },
  // 申込・問い合わせをFirestoreの submissions に保存（TAKUHAがオンライン一覧で確認）
  async submit(type, data){
    if(!this.ready) return false;
    try{ await this.db.collection("submissions").add({type, ...data, uid:this.uid, lang:State.lang, ts:firebase.firestore.FieldValue.serverTimestamp()}); return true; }
    catch(e){ console.warn("[Cloud] submit失敗", e); return false; }
  },
  // 申込・問い合わせ一覧をリアルタイム購読（admin用）。unsubscribe関数を返す
  subscribeSubmissions(cb){
    if(!this.ready){ cb(null); return ()=>{}; }
    return this.db.collection("submissions").orderBy("ts","desc").limit(50)
      .onSnapshot(snap=>cb(snap.docs.map(d=>({id:d.id, ...d.data()}))), err=>{ console.warn("[Cloud] submissions購読エラー", err); cb(null); });
  }
};
function seedVotes(){ if(!DB.get(K.votes,null)) DB.set(K.votes,{...VOTE_SEED}); }
function stageVotes(id){ if(Cloud.ready) return (VOTE_SEED[id]||0)+(Cloud.counts[id]||0); seedVotes(); return DB.get(K.votes,{})[id]||0; }
function hasVoted(id){ if(Cloud.ready) return Cloud.mine.has(id); return !!DB.get(K.myvotes,{})[id]; }
function toggleVote(id){
  if(Cloud.ready){
    const now=!Cloud.mine.has(id);
    if(now){ Cloud.mine.add(id); Cloud.counts[id]=(Cloud.counts[id]||0)+1; } else { Cloud.mine.delete(id); Cloud.counts[id]=Math.max(0,(Cloud.counts[id]||1)-1); }
    Cloud.setVote(id,now); return stageVotes(id);
  }
  seedVotes(); const v=DB.get(K.votes,{}), mine=DB.get(K.myvotes,{});
  if(mine[id]){ delete mine[id]; v[id]=Math.max(0,(v[id]||1)-1); } else { mine[id]=true; v[id]=(v[id]||0)+1; }
  DB.set(K.votes,v); DB.set(K.myvotes,mine); return v[id];
}
function stagePioneered(stage){ return stageVotes(stage.id)>=VOTE_UNLOCK; }
// TAKUHA（会員番号1番＝ルート＝admin）だけが制作レイヤーを見られる
function isAdmin(){ const u=userRec(); return !!u && (u.member_id===1 || u.role==="admin"); }
// 通知（アプリ内お知らせ＋Webプッシュ）。※全ユーザーへのクロス端末配信は本番でバックエンド/FCMが必要
function requestNotify(){ if(!("Notification" in window)){ toast(t("notif_unsupported")); return; }
  Notification.requestPermission().then(p=>{ toast(p==="granted"?t("notif_on"):t("notif_off")); render(); }); }
// 本物のWebプッシュ購読（FCM）。VAPIDキーがあれば全端末へ届くトークンをFirestoreに保存。
// 揃っていない時はローカル通知（同端末のみ）にフォールバック。
async function enablePush(){
  if(!("Notification" in window)){ toast(t("notif_unsupported")); return; }
  if(Cloud.ready && Cloud.messaging && window.FIREBASE_VAPID_KEY){
    try{
      const perm=await Notification.requestPermission();
      if(perm!=="granted"){ toast(t("notif_off")); render(); return; }
      const reg=await navigator.serviceWorker.register("firebase-messaging-sw.js",{ scope:"./fcm/" });
      const token=await Cloud.messaging.getToken({ vapidKey:window.FIREBASE_VAPID_KEY, serviceWorkerRegistration:reg });
      if(token){ await Cloud.db.collection("pushTokens").doc(token).set({ token, uid:Cloud.uid, lang:State.lang, ts:firebase.firestore.FieldValue.serverTimestamp() }); }
      toast(t("notif_on")); render(); return;
    }catch(e){ console.warn("[Push] FCM購読失敗→ローカル通知にフォールバック", e); }
  }
  Notification.requestPermission().then(p=>{ toast(p==="granted"?t("notif_on"):t("notif_off")); render(); });
}
function pushNotif(text){ const list=DB.get(K.notifs,[]); list.unshift({text, ts:Date.now()}); if(list.length>30) list.length=30; DB.set(K.notifs,list);
  toast(text);
  try{ if("Notification" in window && Notification.permission==="granted"){
    if(navigator.serviceWorker && navigator.serviceWorker.ready) navigator.serviceWorker.ready.then(r=>r.showNotification("Mi Amigo",{body:text,icon:"img/icon-192.png"})).catch(()=>{ new Notification("Mi Amigo",{body:text}); });
    else new Notification("Mi Amigo",{body:text});
  } }catch(e){}
}
function notifyPioneer(stage){ const nm=L(stage.name);
  pushNotif(isAdmin()? `🔧 ${t("nt_decided")}：${nm}${t("nt_publish_suffix")}` : `🎉 ${nm}${t("nt_unlocked_suffix")}`); }
function timeAgo(ts){ const s=Math.max(0,Math.floor((Date.now()-ts)/1000)); if(s<60)return t("ta_now"); const m=Math.floor(s/60); if(m<60)return m+t("ta_min"); const h=Math.floor(m/60); if(h<24)return h+t("ta_hour"); return Math.floor(h/24)+t("ta_day"); }
// idx0=アンティグア（done/open）。他は 10票到達=pioneered（開拓決定）／アンティグア制覇済みなら voting（投票受付）／未制覇は locked。
function stageStatus(stage, idx, stages){
  if(idx===0) return stageComplete(stage)?"done":"open";
  if(stagePioneered(stage)) return "pioneered";
  if(stageComplete(stages[0])) return "voting";
  return "locked";
}
let _globeRAF=0;
function mountGlobe(canvas, stages, onPick){
  if(!canvas) return;
  cancelAnimationFrame(_globeRAF);
  const ctx=canvas.getContext("2d"), D2R=Math.PI/180;
  let lon0=stages[0].lng, lat0=14, dragging=false, moved=false, lastX=0, lastY=0, lastInteract=0;
  function project(lat,lng,cx,cy,R){ const lam=(lng-lon0)*D2R, phi=lat*D2R, p0=lat0*D2R;
    const cosc=Math.sin(p0)*Math.sin(phi)+Math.cos(p0)*Math.cos(phi)*Math.cos(lam);
    const x=R*Math.cos(phi)*Math.sin(lam), y=R*(Math.cos(p0)*Math.sin(phi)-Math.sin(p0)*Math.cos(phi)*Math.cos(lam));
    return {x:cx+x, y:cy-y, front:cosc>0}; }
  function front(lat,lng){ const lam=(lng-lon0)*D2R, phi=lat*D2R, p0=lat0*D2R; return (Math.sin(p0)*Math.sin(phi)+Math.cos(p0)*Math.cos(phi)*Math.cos(lam))>0; }
  function size(){ const r=canvas.getBoundingClientRect(), dpr=Math.min(window.devicePixelRatio||1,2); canvas.width=Math.round(r.width*dpr); canvas.height=Math.round(r.height*dpr); ctx.setTransform(dpr,0,0,dpr,0,0); return {w:r.width,h:r.height}; }
  function color(st){ return st==="open"?"#e8a33d": (st==="done"||st==="pioneered")?"#2c8c84": st==="voting"?"#e8a33d":"#8a8f98"; }
  function pin(cx,cy,c,scale,alpha,pulse){ ctx.save(); ctx.globalAlpha=alpha; const r=7*scale;
    if(pulse){ ctx.beginPath(); ctx.arc(cx,cy-r*2.8,10+8*pulse,0,7); ctx.strokeStyle=c; ctx.globalAlpha=alpha*(1-pulse); ctx.lineWidth=2; ctx.stroke(); ctx.globalAlpha=alpha; }
    ctx.beginPath(); ctx.moveTo(cx,cy);
    ctx.bezierCurveTo(cx-r*0.9,cy-r*1.6, cx-r,cy-r*2.4, cx-r,cy-r*2.8);
    ctx.arc(cx,cy-r*2.8,r,Math.PI,0);
    ctx.bezierCurveTo(cx+r,cy-r*2.4, cx+r*0.9,cy-r*1.6, cx,cy);
    ctx.closePath(); ctx.fillStyle=c; ctx.fill();
    ctx.beginPath(); ctx.arc(cx,cy-r*2.8,r*0.42,0,7); ctx.fillStyle="#fff"; ctx.fill(); ctx.restore(); }
  function draw(){
    if(!canvas.isConnected){ return; }
    const {w,h}=size(), cx=w/2, cy=h/2, R=Math.min(w,h)/2-10;
    ctx.clearRect(0,0,w,h);
    const g=ctx.createRadialGradient(cx-R*0.35,cy-R*0.35,R*0.1, cx,cy,R);
    g.addColorStop(0,"#5aa0d8"); g.addColorStop(0.6,"#3d7ab8"); g.addColorStop(1,"#235a92");
    ctx.beginPath(); ctx.arc(cx,cy,R,0,7); ctx.fillStyle=g; ctx.fill();
    ctx.save(); ctx.beginPath(); ctx.arc(cx,cy,R,0,7); ctx.clip();
    ctx.fillStyle="#5b9c6a";
    for(const poly of CONTINENTS){ let cl=0,cg=0; for(const p of poly){cg+=p[0];cl+=p[1];} if(!front(cl/poly.length,cg/poly.length)) continue;
      ctx.beginPath(); poly.forEach((p,i)=>{ const q=project(p[1],p[0],cx,cy,R); i?ctx.lineTo(q.x,q.y):ctx.moveTo(q.x,q.y); }); ctx.closePath(); ctx.globalAlpha=0.82; ctx.fill(); ctx.globalAlpha=1; }
    ctx.strokeStyle="rgba(255,255,255,0.16)"; ctx.lineWidth=0.7;
    for(let lng=-150;lng<=180;lng+=30){ ctx.beginPath(); let s=false; for(let lat=-80;lat<=80;lat+=5){ const q=project(lat,lng,cx,cy,R); if(q.front){ s?ctx.lineTo(q.x,q.y):ctx.moveTo(q.x,q.y); s=true; } else s=false; } ctx.stroke(); }
    for(let lat=-60;lat<=60;lat+=30){ ctx.beginPath(); let s=false; for(let lng=-180;lng<=180;lng+=5){ const q=project(lat,lng,cx,cy,R); if(q.front){ s?ctx.lineTo(q.x,q.y):ctx.moveTo(q.x,q.y); s=true; } else s=false; } ctx.stroke(); }
    ctx.restore();
    ctx.beginPath(); ctx.arc(cx,cy,R,0,7); ctx.strokeStyle="rgba(255,255,255,0.35)"; ctx.lineWidth=1; ctx.stroke();
    const pulse=(Date.now()%1500)/1500;
    stages.forEach((st,i)=>{ const ss=stageStatus(st,i,stages), q=project(st.lat,st.lng,cx,cy,R); st._vis=q.front; st._sx=q.x; st._sy=q.y; if(!q.front) return;
      const big=(ss==="open"||ss==="done"||ss==="pioneered"), alpha=big?1:ss==="voting"?0.75:0.4;
      pin(q.x,q.y,color(ss),big?1.18:0.98,alpha,ss==="open"?pulse:0); });
    if(!dragging && Date.now()-lastInteract>3500) lon0+=0.06;
    _globeRAF=requestAnimationFrame(draw);
  }
  function xy(e){ const r=canvas.getBoundingClientRect(), t=e.touches&&e.touches[0]?e.touches[0]:(e.changedTouches&&e.changedTouches[0]?e.changedTouches[0]:e); return {x:t.clientX-r.left, y:t.clientY-r.top}; }
  function down(e){ dragging=true; moved=false; const p=xy(e); lastX=p.x; lastY=p.y; lastInteract=Date.now(); }
  function move(e){ if(!dragging)return; const p=xy(e), dx=p.x-lastX, dy=p.y-lastY; if(Math.abs(dx)+Math.abs(dy)>4) moved=true; lon0-=dx*0.35; lat0=Math.max(-80,Math.min(80,lat0+dy*0.3)); lastX=p.x; lastY=p.y; lastInteract=Date.now(); if(e.cancelable)e.preventDefault(); }
  function up(e){ if(!dragging)return; dragging=false; lastInteract=Date.now(); if(moved)return; const p=xy(e); let best=null,bd=26; stages.forEach((st,i)=>{ if(!st._vis||st._sx==null)return; const d=Math.hypot(p.x-st._sx,p.y-(st._sy-20)); if(d<bd){bd=d;best={st,i};} }); if(best) onPick(best.st,best.i); }
  canvas.addEventListener("mousedown",down); canvas.addEventListener("mousemove",move); canvas.addEventListener("mouseup",up); canvas.addEventListener("mouseleave",()=>{dragging=false;});
  canvas.addEventListener("touchstart",down,{passive:true}); canvas.addEventListener("touchmove",move,{passive:false}); canvas.addEventListener("touchend",up);
  draw();
}
// 次の目的地ガイド申込ボックス（観光客→メール→TAKUHA→愛ちゃん下書き）
function openGuideRequest(prefill){
  const opts=DATA.stages.filter(s=>s.questSource!=="antigua").map(s=>`<option value="${esc(L(s.name))}"${prefill&&prefill.id===s.id?" selected":""}>${s.flag} ${esc(L(s.name))}（${esc(L(s.country))}）</option>`).join("");
  const back=openSheet(`<h2>🧭 ${t("gr_title")}</h2>
    <p class="muted" style="font-size:13px;margin:2px 0 14px">${t("gr_sub")}</p>
    <div class="field"><label>${t("gr_dest")}</label>
      <select id="grDest">${opts}<option value="__other">${t("gr_other")}</option></select>
      <input id="grOther" placeholder="${t("gr_other_ph")}" style="display:none;margin-top:8px" /></div>
    <div class="row" style="gap:10px">
      <div class="field" style="flex:1"><label>${t("gr_from")}</label><input id="grFrom" type="date" /></div>
      <div class="field" style="flex:1"><label>${t("gr_to")}</label><input id="grTo" type="date" /></div></div>
    <div class="field"><label>${t("gr_name")}</label><input id="grName" value="${esc(userRec().name||"")}" /></div>
    <div class="field"><label>${t("gr_msg")}</label><textarea id="grMsg" rows="3" placeholder="${t("gr_msg_ph")}" style="width:100%;padding:13px 14px;font-size:16px;border:1.5px solid var(--line);border-radius:12px;background:#fff;color:var(--ink);font-family:inherit;resize:vertical"></textarea></div>
    <button class="btn gold" id="grSend">${t("gr_send")}</button>
    <p class="muted" style="font-size:12px;text-align:center;margin-top:10px">${t("contact_to")}：<a href="mailto:${CONTACT_EMAIL}" style="color:var(--teal)">${CONTACT_EMAIL}</a></p>`);
  const sel=$("#grDest",back), other=$("#grOther",back);
  sel.onchange=()=>{ other.style.display = sel.value==="__other"?"block":"none"; };
  $("#grSend",back).onclick=async ()=>{
    const dest = sel.value==="__other" ? (other.value||"").trim() : sel.value;
    if(!dest){ toast(t("gr_need_dest")); return; }
    const from=$("#grFrom",back).value, to=$("#grTo",back).value, name=$("#grName",back).value, msg=$("#grMsg",back).value;
    if(Cloud.ready && await Cloud.submit("guide", { dest, period:`${from||"-"} 〜 ${to||"-"}`, name:name||"", msg:msg||"", contact:userRec().phone||userRec().email||"" })){ closeSheet(); toast(t("sub_sent")); return; }
    const subject=`[Mi Amigo ガイド申込] ${dest}`;
    const body=`${t("gr_mail_intro")}\n\n■ ${t("gr_dest")}: ${dest}\n■ ${t("gr_period")}: ${from||"-"} 〜 ${to||"-"}\n■ ${t("gr_name")}: ${name||"-"}\n■ ${t("gr_msg")}: ${msg||"-"}\n\n— Mi Amigo / ${userRec().phone||userRec().email||""}`;
    window.location.href=`mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
    closeSheet(); toast(t("gr_sent"));
  };
}
// なんでも言いたいボックス（ご意見・お問い合わせ → 同じ問い合わせ先に集約）
function openFeedback(){
  const back=openSheet(`<h2>💬 ${t("fb_title")}</h2>
    <p class="muted" style="font-size:13px;margin:2px 0 14px">${t("fb_sub")}</p>
    <div class="field"><label>${t("gr_name")}</label><input id="fbName" value="${esc(userRec().name||"")}" /></div>
    <div class="field"><label>${t("fb_msg")}</label><textarea id="fbMsg" rows="4" placeholder="${t("fb_msg_ph")}" style="width:100%;padding:13px 14px;font-size:16px;border:1.5px solid var(--line);border-radius:12px;background:#fff;color:var(--ink);font-family:inherit;resize:vertical"></textarea></div>
    <button class="btn gold" id="fbSend">${t("fb_send")}</button>
    <p class="muted" style="font-size:12px;text-align:center;margin-top:10px">${t("contact_to")}：<a href="mailto:${CONTACT_EMAIL}" style="color:var(--teal)">${CONTACT_EMAIL}</a></p>`);
  $("#fbSend",back).onclick=async ()=>{
    const name=$("#fbName",back).value, msg=$("#fbMsg",back).value;
    if(!(msg||"").trim()){ toast(t("fb_need")); return; }
    if(Cloud.ready && await Cloud.submit("feedback", { name:name||"", msg:msg||"", contact:userRec().phone||userRec().email||"" })){ closeSheet(); toast(t("sub_sent")); return; }
    const subject=`[Mi Amigo ご意見・お問い合わせ] ${name||""}`.trim();
    const body=`${t("fb_msg")}:\n${msg}\n\n■ ${t("gr_name")}: ${name||"-"}\n— Mi Amigo / ${userRec().phone||userRec().email||""}`;
    window.location.href=`mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
    closeSheet(); toast(t("gr_sent"));
  };
}
// 開拓投票ボックス（アンティグア制覇後に出る"隠しボックス"）。10票でその場所が開拓される
function openVoteBox(){
  const cands=DATA.stages.filter(s=>s.questSource!=="antigua");
  const bar=(v,pio)=>`<div style="height:9px;border-radius:5px;background:rgba(150,150,150,.25);margin-top:8px;overflow:hidden"><div style="height:100%;width:${Math.min(100,Math.round(v/VOTE_UNLOCK*100))}%;background:${pio?"#2c8c84":"#e8a33d"}"></div></div>`;
  const rowHtml=s=>{ const v=stageVotes(s.id), pio=v>=VOTE_UNLOCK, voted=hasVoted(s.id);
    return `<div class="card" style="margin-bottom:8px"><div class="card-body" style="padding:12px">
      <div class="row" style="align-items:center;gap:8px">
        <span style="font-size:20px">${s.flag}</span>
        <div style="flex:1"><strong>${esc(L(s.name))}</strong><div class="muted" style="font-size:11px">${esc(L(s.country))}</div></div>
        ${pio?`<span class="badge stay">${t("vote_pioneered")}</span>`:`<button class="btn sm ${voted?"secondary":""}" data-vote="${s.id}">${voted?t("voted"):t("vote_btn")}</button>`}
      </div>${bar(v,pio)}
      <div class="muted" style="font-size:12px;margin-top:5px">${v} / ${VOTE_UNLOCK} ${t("votes_unit")}${pio?" ・ "+t("vote_pioneered_note"):" ・ "+Math.max(0,VOTE_UNLOCK-v)+t("votes_left")}</div>
    </div></div>`; };
  const back=openSheet(`<h2>🗳️ ${t("vote_title")}</h2>
    <p class="muted" style="font-size:13px;margin:2px 0 14px">${t("vote_sub")}</p>
    <div id="voteList"></div>`);
  const paint=()=>{ const list=$("#voteList",back); list.innerHTML=cands.map(rowHtml).join("");
    list.querySelectorAll("[data-vote]").forEach(b=>b.onclick=()=>{ const nv=toggleVote(b.dataset.vote); if(nv>=VOTE_UNLOCK) notifyPioneer(DATA.stages.find(s=>s.id===b.dataset.vote)); paint(); }); };
  paint();
  VoteWatch={root:back, paint}; // 他ユーザーの投票がリアルタイムで反映される
}
// 次ダンジョンのガイド＆謎解きプレビュー（TAKUHA専用・一般ユーザー非公開）
function openDungeonPreview(stage){
  if(!isAdmin()){ toast(t("admin_only")); return; }
  const c=stage.content; if(!c){ toast(t("no_content")); return; }
  const stopsHtml=c.stops.map((s,i)=>`<div class="card" style="margin-bottom:8px"><div class="card-body" style="padding:12px">
    <div class="row" style="align-items:center;gap:8px"><span style="font-size:20px">${s.emoji}</span><strong>${i+1}. ${esc(L(s.title))}</strong></div>
    <p class="muted" style="font-size:12px;margin:8px 0 4px"><strong style="color:var(--teal)">🎧 ${t("dp_guide")}：</strong>${esc(L(s.narration))}</p>
    <p class="muted" style="font-size:12px;margin:0"><strong style="color:var(--terra)">🔍 ${t("dp_quest")}：</strong>${esc(L(s.riddle))}</p>
  </div></div>`).join("");
  const histHtml=(c.history||[]).map(h=>`<div class="card" style="margin-bottom:8px"><div class="card-body" style="padding:12px"><strong>${h.emoji} ${esc(L(h.title))}</strong><p class="muted" style="font-size:12px;margin:6px 0 0">${esc(L(h.body))}</p></div></div>`).join("");
  openSheet(`<h2>🔧 ${stage.flag} ${esc(L(stage.name))}</h2>
    <p class="muted" style="font-size:12px;margin:2px 0 10px">${t("dp_admin_note")}</p>
    <p style="font-size:13px;margin:0 0 12px">${esc(L(c.intro))}</p>
    <div class="section-title">🎧🔍 ${t("dp_stops")}（${c.stops.length}）</div>
    ${stopsHtml}
    ${histHtml?`<div class="section-title">📜 ${t("dp_history")}</div>${histHtml}`:""}
    <p class="muted" style="font-size:12px;margin-top:8px">${t("dp_publish_hint")}</p>`);
}
function openStageSheet(stage, idx){
  const stages=DATA.stages, st=stageStatus(stage,idx,stages), p=stageProgress(stage), pct=p.total?Math.round(p.done/p.total*100):0;
  if(st==="open"||st==="done"){
    const back=openSheet(`<h2>${stage.flag} ${esc(L(stage.name))}</h2>
      <p class="muted" style="font-size:13px;margin:2px 0 12px">${esc(L(stage.country))} ・ ${t("st_stage")} ${stage.order} ・ ${st==="done"?t("stage_done"):t("you_are_here")}</p>
      <div class="card"><div class="card-body">
        <div class="row"><strong>${t("progress")} ${p.done} / ${p.total}</strong></div>
        <div style="height:10px;border-radius:5px;background:rgba(150,150,150,.25);margin-top:8px;overflow:hidden"><div style="height:100%;width:${pct}%;background:#2c8c84"></div></div>
      </div></div>
      <button class="btn gold" id="stQuest" style="margin-top:6px">${t("to_quest")}</button>
      <button class="btn secondary" id="stGuide" style="margin-top:8px">${t("to_guide")}</button>`);
    $("#stQuest",back).onclick=()=>{ closeSheet(); State.view="quest"; render(); };
    $("#stGuide",back).onclick=()=>{ closeSheet(); State.view="guide"; render(); };
  } else if(st==="pioneered"){
    const v=stageVotes(stage.id);
    const back=openSheet(`<h2>🎉 ${stage.flag} ${esc(L(stage.name))}</h2>
      <p class="muted" style="font-size:13px;margin:2px 0 12px">${esc(L(stage.country))} ・ ${t("st_stage")} ${stage.order} ・ ${t("vote_pioneered")}</p>
      <div class="card"><div class="card-body"><p style="margin:0 0 8px">${t("vote_pioneered_msg")}</p>
        <div style="height:10px;border-radius:5px;background:rgba(150,150,150,.25);overflow:hidden"><div style="height:100%;width:100%;background:#2c8c84"></div></div>
        <div class="muted" style="font-size:12px;margin-top:6px">${v} / ${VOTE_UNLOCK} ${t("votes_unit")}</div></div></div>
      <button class="btn gold" id="stReq" style="margin-top:10px">${t("gr_locked_cta")}</button>`);
    $("#stReq",back).onclick=()=>openGuideRequest(stage);
  } else if(st==="voting"){
    const v=stageVotes(stage.id), voted=hasVoted(stage.id);
    const back=openSheet(`<h2>${stage.flag} ${esc(L(stage.name))}</h2>
      <p class="muted" style="font-size:13px;margin:2px 0 12px">${esc(L(stage.country))} ・ ${t("st_stage")} ${stage.order} ・ ${t("vote_status")}</p>
      <div class="card"><div class="card-body"><p style="margin:0 0 8px">${t("vote_stage_msg")}</p>
        <div style="height:10px;border-radius:5px;background:rgba(150,150,150,.25);overflow:hidden"><div style="height:100%;width:${Math.min(100,Math.round(v/VOTE_UNLOCK*100))}%;background:#e8a33d"></div></div>
        <div class="muted" style="font-size:12px;margin-top:6px">${v} / ${VOTE_UNLOCK} ${t("votes_unit")} ・ ${t("vote_remain1")}${Math.max(0,VOTE_UNLOCK-v)}${t("vote_remain2")}</div></div></div>
      <button class="btn gold" id="stVote" style="margin-top:10px">${voted?t("voted"):t("vote_btn")}</button>
      <button class="btn secondary" id="stReq" style="margin-top:8px">${t("gr_locked_cta")}</button>`);
    $("#stVote",back).onclick=()=>{ const nv=toggleVote(stage.id); if(nv>=VOTE_UNLOCK) notifyPioneer(stage); openStageSheet(stage,idx); };
    $("#stReq",back).onclick=()=>openGuideRequest(stage);
  } else {
    const back=openSheet(`<h2>🔒 ${esc(L(stage.name))}</h2>
      <p class="muted" style="font-size:13px;margin:2px 0 12px">${esc(L(stage.country))} ・ ${t("st_stage")} ${stage.order} ・ ${t("stage_locked")}</p>
      <div class="card"><div class="card-body"><p style="margin:0">${t("locked_msg")}</p></div></div>
      <button class="btn gold" id="stReq" style="margin-top:10px">${t("gr_locked_cta")}</button>
      <button class="btn secondary" id="stGo" style="margin-top:8px">${t("to_quest")}</button>`);
    $("#stReq",back).onclick=()=>openGuideRequest(stage);
    $("#stGo",back).onclick=()=>{ closeSheet(); State.view="quest"; render(); };
  }
}

/* ---------- マイページ（言語変更＋予約一覧） ---------- */
/* 紹介コード・URLを大きく見せるシート（登録直後 / マイページから） */
function showReferralSheet(u, welcome){
  if(!u || !u.refCode) return;
  const url=Org.refUrl(u.refCode);
  const back=openSheet(`<h2>${welcome?orgT("welcome_code"):orgT("invite_title")}</h2>
    <div class="card" style="margin-bottom:12px"><div class="card-body">
      <div class="muted" style="font-size:13px">${orgT("your_no")}</div>
      <div style="font-size:20px;font-weight:700">#${u.member_id}　${esc(u.name||"")}</div>
      <div class="muted" style="font-size:13px;margin-top:12px">${orgT("your_code")}</div>
      <div style="font-size:28px;font-weight:700;letter-spacing:3px;color:var(--terra)">${esc(u.refCode)}</div>
      <div class="muted" style="font-size:12px;margin-top:10px;word-break:break-all">🔗 ${esc(url)}</div>
      <div class="row" style="gap:8px;margin-top:14px">
        <button class="btn sm" id="cpCode">${orgT("copy")}：${orgT("your_code")}</button>
        <button class="btn sm secondary" id="cpUrl">${orgT("copy")}：URL</button>
      </div>
      <button class="btn teal" id="shareRef" style="margin-top:10px;width:100%">${orgT("share")}</button>
    </div></div>`);
  $("#cpCode",back).onclick=()=>copyText(u.refCode);
  $("#cpUrl",back).onclick=()=>copyText(url);
  $("#shareRef",back).onclick=()=>{ if(navigator.share) navigator.share({title:"Mi Amigo", text:`Mi Amigo 招待コード: ${u.refCode}`, url}).catch(()=>{}); else copyText(url); };
}

/* 組織図シート（会員番号1番＝権限者だけが開ける） */
function openOrgSheet(){
  const bt=Org.binaryTree(), ut=Org.unilevelTree(), n=Org.count();
  const cls=r=>r==="admin"?"n-amber":"n-teal";
  const renderBin=node=>{ if(!node) return ""; let kids="";
    if(node.left) kids+=`<li>L: ${renderBin(node.left)}</li>`;
    if(node.right) kids+=`<li>R: ${renderBin(node.right)}</li>`;
    return `<span class="orgnode ${cls(node.role)}">#${node.member_id} ${esc(node.name)}</span>${kids?`<ul class="orgtree">${kids}</ul>`:""}`; };
  const renderUni=node=>{ const c=node.role==="admin"?"n-amber":"n-purple";
    const kids=node.kids.map(k=>`<li>${renderUni(k)}</li>`).join("");
    return `<span class="orgnode ${c}">#${node.member_id} ${esc(node.name)}${node.kids.length?` (${node.kids.length})`:""}</span>${kids?`<ul class="orgtree">${kids}</ul>`:""}`; };
  openSheet(`<h2>${orgT("org_chart")}</h2>
    <p class="muted" style="font-size:13px;margin:-6px 0 10px">${orgT("members")}: <b style="font-size:16px;color:var(--ink)">${n}</b></p>
    <div class="section-title">${orgT("binary")}</div><ul class="orgtree">${bt?`<li>${renderBin(bt)}</li>`:"—"}</ul>
    <div class="section-title" style="margin-top:14px">${orgT("unilevel")}</div><ul class="orgtree">${ut?`<li>${renderUni(ut)}</li>`:"—"}</ul>`);
}

function viewMyPage(){
  const resv=DB.get(K.resv,[]).filter(r=>r.userEmail===State.user.email).sort((a,b)=>b.createdAt-a.createdAt);
  const ur=userRec();
  let refCardHtml="";
  if(ur.member_id){
    const introName = ur.introKey ? (Org.rec(ur.introKey)?.name||"") : "";
    refCardHtml=`<div class="card" style="margin:0 0 6px"><div class="card-body">
      <div class="row" style="align-items:center"><strong style="font-size:15px">🎟️ ${orgT("invite_title")}</strong><span class="spacer"></span><span class="muted" style="font-size:12px">${orgT("your_no")} #${ur.member_id}</span></div>
      <p class="muted" style="font-size:12px;margin:6px 0 8px">${orgT("invite_sub")}</p>
      <div class="muted" style="font-size:12px">${orgT("your_code")}</div>
      <div style="font-size:22px;font-weight:700;letter-spacing:2px;color:var(--terra)">${esc(ur.refCode||"")}</div>
      ${introName?`<div class="muted" style="font-size:12px;margin-top:6px">${orgT("introduced_by")}: ${esc(introName)}</div>`:""}
      <div class="row" style="gap:8px;margin-top:10px">
        <button class="btn sm" id="mpInvite">${orgT("share")}</button>
        <button class="btn sm secondary" id="mpCopy">${orgT("copy")}</button>
        ${ur.member_id===1?`<button class="btn sm ghost" id="mpOrg">${orgT("org_chart")}</button>`:""}
      </div></div></div>`;
  }
  const wrap=el(`<div><div class="topbar"><h1>${t("tab_mypage")}</h1><p class="sub">${esc(userRec().name)}　📱 ${esc(userRec().phone||userRec().email)}</p></div>
    <div class="pad">
      <div class="section-title" style="margin-top:0">${t("language")}</div><div id="myLang"></div>
      <div class="card" style="margin-bottom:6px"><div class="card-body" style="padding:12px">
        <div class="row" style="align-items:center"><strong style="font-size:15px">🌎 ${t("globe_title")}</strong><span class="spacer"></span><span class="muted" style="font-size:11px">${t("drag_hint")}</span></div>
        <p class="muted" style="font-size:12px;margin:4px 0 8px">${t("globe_sub")}</p>
        <canvas id="globe" style="width:100%;height:300px;display:block;touch-action:none"></canvas>
        <div id="stageInfo" style="margin-top:10px"></div>
      </div></div>
      <div class="card" style="margin-bottom:6px"><div class="card-body">
        <div class="row" style="align-items:center">
          ${avatarHTML(userRec(),60)}
          <div style="flex:1;margin-left:4px"><strong style="font-size:18px">${esc(userRec().name||"")}</strong>
            <div class="muted" style="font-size:13px;margin-top:3px">${profileMeta(userRec())||"<span style=\"opacity:.6\">—</span>"}</div></div>
          <button class="btn sm secondary" id="editProfile">${t("edit_profile")}</button>
        </div>
        ${userRec().bio?`<p class="muted" style="font-size:13px;margin:10px 0 0">${esc(userRec().bio)}</p>`:""}
        <button class="btn gold sm" id="makeCard" style="width:100%;margin-top:12px">${t("make_card")}</button>
        <p class="muted" style="font-size:11px;margin:6px 2px 0;text-align:center">${t("card_what")}</p>
      </div></div>
      ${refCardHtml}
      ${resv.length?`<div class="section-title">${t("reservations")}</div><div id="rl"></div>`:""}
      ${isAdmin()?`<div class="section-title">🔧 ${t("admin_section")}</div><div id="adminDungeons"></div>`:""}
      ${isAdmin()?`<div class="section-title">${t("subs_section")}</div><div id="adminSubs"></div>`:""}
      <div class="section-title">🔔 ${t("notif_section")}</div><div id="notifBox"></div>
      <div class="section-title">📣 ${t("community_section")}</div><div id="commBox"></div>
      <div class="section-title">${t("contact_section")}</div>
      <button class="btn gold sm" id="fbOpen" style="width:100%">${t("fb_cta")}</button>
      <p class="muted" style="font-size:12px;margin:8px 2px 0">${t("contact_note")}<br>${t("contact_to")}：<a href="mailto:${CONTACT_EMAIL}" style="color:var(--teal)">${CONTACT_EMAIL}</a></p>
      <button class="btn secondary" id="logout" style="margin-top:16px">${t("logout")}</button>
      <p class="hint" style="text-align:center;margin-top:18px">${t("proto_ver")}</p></div></div>`);
  $("#editProfile",wrap).onclick=openProfile;
  $("#makeCard",wrap).onclick=openAmigoCard;
  if(ur.member_id){
    $("#mpInvite",wrap)?.addEventListener("click",()=>showReferralSheet(userRec(),false));
    $("#mpCopy",wrap)?.addEventListener("click",()=>copyText(userRec().refCode||""));
    $("#mpOrg",wrap)?.addEventListener("click",openOrgSheet);
  }
  $("#myLang",wrap).appendChild(langSeg(()=>render()));
  const list=$("#rl",wrap);
  if(list) resv.forEach(r=>{ const [y,mo,d]=r.dateKey.split("-").map(Number); list.appendChild(el(`<div class="list-item"><div class="ava">${r.emoji}</div><div style="flex:1"><strong>${esc(r.title)}</strong><div class="muted" style="font-size:12px;margin-top:2px">${y}/${mo+1}/${d}・${r.qty}・${fmtUSD(r.total)}</div></div><span class="badge stay">${t("confirmed")}</span></div>`)); });
  $("#logout",wrap).onclick=()=>{ Auth.logout(); State.user=null; render(); };
  $("#fbOpen",wrap)?.addEventListener("click",openFeedback);
  // 管理（TAKUHA専用）：開拓された次ダンジョンの制作・通知・プレビュー
  const ad=$("#adminDungeons",wrap);
  if(ad && isAdmin()){
    const built=DATA.stages.filter(s=>s.content);
    ad.innerHTML=built.map(s=>{ const v=stageVotes(s.id), pio=v>=VOTE_UNLOCK;
      return `<div class="card" style="margin-bottom:8px"><div class="card-body" style="padding:12px">
        <div class="row" style="align-items:center;gap:8px"><span style="font-size:20px">${s.flag}</span>
          <div style="flex:1"><strong>${esc(L(s.name))}</strong><div class="muted" style="font-size:11px">${esc(L(s.country))} ・ ${v}/${VOTE_UNLOCK} ${t("votes_unit")}</div></div>
          <span class="badge ${pio?"stay":"exp"}">${pio?t("vote_pioneered"):t("vote_status")}</span></div>
        ${pio?`<p style="font-size:12px;margin:8px 0 0;color:var(--terra)">🔔 ${t("admin_notify")}</p>`:""}
        <button class="btn gold sm" data-dp="${s.id}" style="width:100%;margin-top:10px">${t("dp_open")}</button>
      </div></div>`; }).join("") || `<p class="muted" style="font-size:12px">${t("admin_empty")}</p>`;
    ad.querySelectorAll("[data-dp]").forEach(b=>b.onclick=()=>{ const st=DATA.stages.find(s=>s.id===b.dataset.dp); openDungeonPreview(st); });
  }
  // 管理（TAKUHA専用）：申込・問い合わせ一覧（Firestoreをリアルタイム購読）
  const subsEl=$("#adminSubs",wrap);
  if(subsEl && isAdmin()){
    if(window._subsUnsub){ window._subsUnsub(); window._subsUnsub=null; }
    subsEl.innerHTML=`<p class="muted" style="font-size:12px">…</p>`;
    window._subsUnsub = Cloud.subscribeSubmissions(rows=>{
      if(!document.body.contains(subsEl)){ if(window._subsUnsub){ window._subsUnsub(); window._subsUnsub=null; } return; }
      if(rows===null){ subsEl.innerHTML=`<p class="muted" style="font-size:12px">${t("subs_offline")}</p>`; return; }
      if(!rows.length){ subsEl.innerHTML=`<p class="muted" style="font-size:12px">${t("subs_empty")}</p>`; return; }
      subsEl.innerHTML=rows.map(r=>{
        const tl = r.type==="guide"?t("t_guide"):r.type==="biz"?t("t_biz"):t("t_feedback");
        const badge = r.type==="guide"?"stay":r.type==="biz"?"exp":"food";
        const when = (r.ts&&r.ts.toDate)?timeAgo(r.ts.toDate().getTime()):"";
        const body = r.type==="guide" ? `${esc(r.dest||"")}${r.period?" ・ "+esc(r.period):""}${r.msg?"<br>"+esc(r.msg):""}`
          : r.type==="biz" ? `${esc(r.company||"")}${r.person?" / "+esc(r.person):""}${r.msg?"<br>"+esc(r.msg):""}`
          : esc(r.msg||"");
        const who = esc(r.name||r.company||"")+(r.contact?" ・ "+esc(r.contact):"");
        return `<div class="card" style="margin-bottom:8px"><div class="card-body" style="padding:12px">
          <div class="row" style="align-items:center;gap:8px"><span class="badge ${badge}">${tl}</span><span class="spacer"></span><span class="muted" style="font-size:11px">${when}</span></div>
          <div style="font-size:13px;margin-top:6px">${body||"—"}</div>
          ${who?`<div class="muted" style="font-size:11px;margin-top:6px">${who}</div>`:""}
        </div></div>`;
      }).join("");
    });
  }
  // お知らせ（アプリ内通知フィード＋Webプッシュ オプトイン）
  const nb=$("#notifBox",wrap);
  if(nb){ const granted=("Notification" in window)&&Notification.permission==="granted"; const list=DB.get(K.notifs,[]);
    nb.innerHTML=(granted?"":`<button class="btn gold sm" id="notifOn" style="width:100%;margin-bottom:8px">🔔 ${t("notif_enable")}</button>`)
      +(list.length? list.slice(0,6).map(n=>`<div class="list-item"><div style="flex:1"><div style="font-size:13px">${esc(n.text)}</div><div class="muted" style="font-size:11px;margin-top:2px">${timeAgo(n.ts)}</div></div></div>`).join("")
        : `<p class="muted" style="font-size:12px">${t("notif_empty")}</p>`);
    $("#notifOn",nb)?.addEventListener("click",enablePush);
  }
  // コミュニティ送客（LINE/WhatsApp/IG）。SNS→アプリ→外部グループの次の入り口
  const cb=$("#commBox",wrap);
  if(cb){ cb.innerHTML=`<p class="muted" style="font-size:12px;margin:0 0 8px">${t("community_note")}</p>`+
    COMMUNITY_LINKS.map(c=>{ const lbl=`${c.emoji} ${esc(c.name)}${c.region?"（"+c.region+"）":""}`;
      return c.url
       ? `<a class="btn gold sm" href="${esc(c.url)}" target="_blank" rel="noopener" style="display:block;width:100%;text-align:center;margin-bottom:8px;text-decoration:none">${lbl}</a>`
       : `<div class="list-item" style="opacity:.65"><div style="flex:1;font-size:14px">${lbl}</div><span class="muted" style="font-size:12px">${t("community_soon")}</span></div>`;
    }).join(""); }
  // 地球儀ヒーロー＋第1ステージ情報
  const aStage=DATA.stages[0], ap=stageProgress(aStage), aclear=stageClearMin(aStage), apct=aclear?Math.round(Math.min(1,ap.done/aclear)*100):0, adone=stageComplete(aStage);
  const si=$("#stageInfo",wrap);
  if(si){ si.innerHTML=`
    <div class="row" style="align-items:center;gap:8px">
      <span style="font-size:20px">${aStage.flag}</span>
      <div style="flex:1"><strong>${esc(L(aStage.name))}</strong><div class="muted" style="font-size:11px">${esc(L(aStage.country))} ・ ${t("st_stage")} 1</div></div>
      <span class="badge ${adone?"stay":"exp"}">${adone?t("stage_done"):t("stage_open")}</span>
    </div>
    <div style="height:10px;border-radius:5px;background:rgba(150,150,150,.25);margin-top:8px;overflow:hidden"><div style="height:100%;width:${apct}%;background:#2c8c84"></div></div>
    <div class="muted" style="font-size:12px;margin-top:6px">${t("progress")} ${ap.done} / ${ap.total} ・ ${adone?"🎉 "+t("stage_done")+"！"+t("vote_open_note"):aclear+t("gr_clear_at")}</div>
    ${adone
      ? `<button class="btn gold sm" id="voteHero" style="width:100%;margin-top:10px">${t("vote_hero_cta")}</button>
         <button class="btn secondary sm" id="grHero" style="width:100%;margin-top:8px">${t("gr_cta")}</button>`
      : `<button class="btn gold sm" id="goQuestHero" style="width:100%;margin-top:10px">${t("to_quest")}</button>`}`;
    $("#goQuestHero",wrap)?.addEventListener("click",()=>{ State.view="quest"; render(); });
    $("#voteHero",wrap)?.addEventListener("click",openVoteBox);
    $("#grHero",wrap)?.addEventListener("click",()=>openGuideRequest());
  }
  requestAnimationFrame(()=>mountGlobe($("#globe",wrap), DATA.stages, (st,i)=>openStageSheet(st,i)));
  return wrap;
}

/* ---------- 起動 ---------- */
// ?reset=1 でこの端末内の登録情報（会員・組織・ログイン）をクリアして真っさらに起動。
// （クラウドの共有組織は消えない＝端末内のテスト残骸だけを消す用）
if(new URLSearchParams(location.search).get("reset")){
  ["ma_users","ma_org","ma_session","ma_pending_ref"].forEach(k=>localStorage.removeItem(k));
  location.replace(location.origin+location.pathname);
}
document.querySelectorAll("#tabbar .tab").forEach(tb=>{ tb.onclick=()=>{ stopSpeak(); State.chatGroup=null; State.view=tb.dataset.view; render(); }; });
State.user=Auth.current();
// 紹介URL ?ref=CODE を取り込み（多段の登録フローをまたいで保持）
State.pendingRef = new URLSearchParams(location.search).get("ref") || localStorage.getItem(K.ref) || null;
if(State.pendingRef) localStorage.setItem(K.ref, State.pendingRef);
// URLに #business / #ads があれば企業向け広告ページを表示（企業に直接リンクを送れる）
if(/^#(business|ads)$/.test(location.hash)) State.business=true;
Cloud.init(); // Firebase接続（設定があればクラウド投票＋共有組織が有効化）
render();
completeRedirectLogins(); // Google（リダイレクト）／メールリンクからの復帰ログインを完了
// 既ログインで組織フィールド未付与なら、クラウド接続を少し待ってから補完（通常はここを通らない）
setTimeout(()=>{ if(State.user && !State.user.member_id){ Org.register(State.user.email, State.user.name, State.pendingRef).then(nu=>{ if(nu){ mergeMyOrg(nu); render(); } }); } }, 1600);
