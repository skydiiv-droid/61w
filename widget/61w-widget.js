// 61w duty widget for Scriptable iOS (v4)
//
// SETUP:
// 1. Scriptable 앱 → + → 새 스크립트, 이름 `61w`
// 2. 이 코드 전체 복사 → 붙여넣기
// 3. 홈 화면 + → Scriptable 위젯 → L/M/S 선택
// 4. 위젯 길게 → Edit Widget → Script: 61w → Parameter에 본인 이름
//
// v4 변경:
// - 인수인계/라인업 팀 판별을 앱과 동일하게 (helper팀 > 그 달 팀). 셀에 저장된 옛 팀값 무시
// - 휴직/퇴사자 인계·라인업 제외
// - 인계 이름이 많으면(A팀 3명+) 잘리지 않고 2줄로 줄바꿈
// - 정렬을 앱 연명부 순서(rosterOrder) → 총 연차 순으로 통일

const FIREBASE_URL = `https://duty-db3c7-default-rtdb.asia-southeast1.firebasedatabase.app`;
const WEB_URL = `https://skydiiv-droid.github.io/61w/schedule.html`;
const MY_NAME = (args.widgetParameter || ``).trim();
const CACHE_FILE = `61w-widget-cache.json`;
const REQUEST_TIMEOUT = 15;

const TEAMS = [`main`, `A`, `B`, `C`, `D`, `S-616`, `S-617`, `S-act`, `이송`];
const SHIFT_LABELS = {
  D: `Day`, E: `Evening`, N: `Night`, O: `Off`, M: `Mid`, V: `반차`, T: `Top`
};
const CLINIC_LABELS = { full: `오전·오후`, morning: `오전만`, closed: `휴진` };
const DOW_KR = [`일`, `월`, `화`, `수`, `목`, `금`, `토`];
const ROLE_CELL = { front: `앞`, back: `뒤`, act: `액`, total: `all` };

const BUILTIN_HOLIDAYS = {
  [`2026-01-01`]: `신정`,
  [`2026-02-16`]: `설날`, [`2026-02-17`]: `설날`, [`2026-02-18`]: `설날`,
  [`2026-03-01`]: `삼일절`, [`2026-03-02`]: `삼일절 대체`,
  [`2026-05-05`]: `어린이날`,
  [`2026-05-24`]: `부처님오신날`, [`2026-05-25`]: `부처님오신날 대체`,
  [`2026-06-06`]: `현충일`,
  [`2026-08-15`]: `광복절`, [`2026-08-17`]: `광복절 대체`,
  [`2026-09-24`]: `추석`, [`2026-09-25`]: `추석`, [`2026-09-26`]: `추석`, [`2026-09-28`]: `추석 대체`,
  [`2026-10-03`]: `개천절`, [`2026-10-05`]: `개천절 대체`,
  [`2026-10-09`]: `한글날`,
  [`2026-12-25`]: `성탄절`,
  [`2027-01-01`]: `신정`,
  [`2027-02-06`]: `설날`, [`2027-02-07`]: `설날`, [`2027-02-08`]: `설날`, [`2027-02-09`]: `설날 대체`,
  [`2027-03-01`]: `삼일절`,
  [`2027-05-05`]: `어린이날`,
  [`2027-05-13`]: `부처님오신날`,
  [`2027-06-06`]: `현충일`, [`2027-06-07`]: `현충일 대체`,
  [`2027-08-15`]: `광복절`, [`2027-08-16`]: `광복절 대체`,
  [`2027-09-14`]: `추석`, [`2027-09-15`]: `추석`, [`2027-09-16`]: `추석`,
  [`2027-10-03`]: `개천절`, [`2027-10-04`]: `개천절 대체`,
  [`2027-10-09`]: `한글날`, [`2027-10-11`]: `한글날 대체`,
  [`2027-12-25`]: `성탄절`,
};

function dyn(light, dark) {
  return Color.dynamic(new Color(light), new Color(dark));
}
// [수정4] 배경: 라이트 = 흰색, 다크 = 회색 계열 (보라끼 제거)
// 근무색: 다크모드 명암/채도 조정 (배경은 더 차분하게, 텍스트는 밝고 선명하게)
const C = {
  bg: dyn(`#FFFFFF`, `#2B2D31`),
  bgGrad: dyn(`#F5F6F7`, `#232529`),
  text: dyn(`#2F3542`, `#E8EAED`),
  sub: dyn(`#6B7280`, `#9BA1A8`),
  faint: dyn(`#C0BBB2`, `#5C6066`),
  divider: dyn(`#EAEAEA`, `#3A3D42`),
  me: dyn(`#4B7BEC`, `#7BA0F0`),
  warn: dyn(`#E57373`, `#E89490`),
  today: dyn(`#4B7BEC`, `#7BA0F0`),
  sat: dyn(`#5B8DEF`, `#7BA0F0`),
  // 근무색 — 라이트는 메인앱 팔레트, 다크는 채도 낮춘 배경 + 밝은 텍스트
  D: { bg: dyn(`#8ECDF0`, `#2C4A63`), text: dyn(`#0E3A5F`, `#A9D8F5`) },
  E: { bg: dyn(`#A9D8B8`, `#2E4A37`), text: dyn(`#1F4A2E`, `#B5E5C5`) },
  N: { bg: dyn(`#E6CC68`, `#5A4D26`), text: dyn(`#4A3500`, `#F0DC95`) },
  O: { bg: dyn(`#C6AFE8`, `#3F3658`), text: dyn(`#2E1857`, `#D5C5F0`) },
  M: { bg: dyn(`#EAB59D`, `#5A3A2C`), text: dyn(`#5A2818`, `#F0C5B0`) },
  V: { bg: dyn(`#C6AFE8`, `#3F3658`), text: dyn(`#2E1857`, `#D5C5F0`) },
  T: { bg: dyn(`#EAB59D`, `#5A3A2C`), text: dyn(`#5A2818`, `#F0C5B0`) },
  // 빈 셀 배경 (월간/주간 캘린더)
  emptyCell: dyn(`#F0F1F3`, `#34373C`),
  lineupCell: dyn(`#EEF0F3`, `#3A3D44`),
  lineupMeText: dyn(`#FFFFFF`, `#FFFFFF`),
  teamBgs: {
    [`main`]:  dyn(`#EFC5DA`, `#46243C`),
    [`A`]:     dyn(`#F4C5B0`, `#4A2515`),
    [`B`]:     dyn(`#DDBFA0`, `#3F2D18`),
    [`C`]:     dyn(`#E5D29B`, `#473820`),
    [`D`]:     dyn(`#E5C3B0`, `#472618`),
    [`S-616`]: dyn(`#B5D6E0`, `#1F3B45`),
    [`S-617`]: dyn(`#B5DFD0`, `#1F3D33`),
    [`S-act`]: dyn(`#DDEFF0`, `#324F50`),
  },
  teamTxts: {
    [`main`]:  dyn(`#3D1428`, `#F2D2E0`),
    [`A`]:     dyn(`#421B0A`, `#FAD5C5`),
    [`B`]:     dyn(`#2D1A0A`, `#E5D2BC`),
    [`C`]:     dyn(`#3A2A06`, `#F0E2B5`),
    [`D`]:     dyn(`#3A1B0F`, `#F0D5C5`),
    [`S-616`]: dyn(`#0F2D38`, `#C5DCE5`),
    [`S-617`]: dyn(`#0F3830`, `#C5E5D5`),
    [`S-act`]: dyn(`#385C5C`, `#D5EAEA`),
  },
};

function pad2(n) { return String(n).padStart(2, `0`); }
function isoOf(d) { return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`; }
function monthKeyOf(d) { return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}`; }
function shiftedDate(base, n) {
  return new Date(base.getFullYear(), base.getMonth(), base.getDate() + n);
}
function normalizeDuty(v) {
  if (!v) return null;
  if (typeof v === `string`) return { shift: v };
  return v;
}
function getDutyAt(duties, mk, sabun, day) {
  return normalizeDuty(duties?.[mk]?.[sabun]?.[pad2(day)]);
}

// 그 달 기준 팀 (앱 teamForMonth와 동일 — pendingTeam 예약 반영)
function teamForMonth(user, mk) {
  if (!user) return null;
  const p = user.pendingTeam;
  if (p && p.team && p.fromMonth && mk >= p.fromMonth) return p.team;
  return user.team;
}
// 그 달 근무표에 표시되는지 (앱 isActiveInMonth와 동일 — 휴직/퇴사 제외)
function isActiveInMonth(user, mk) {
  if (!user) return false;
  const s = user.status;
  if (!s || !s.type) return true;
  if (s.type === `resigned`) return !s.from || mk < s.from;
  if (s.type === `leave`) {
    if (!s.from || !s.to) return true;
    return !(mk >= s.from && mk <= s.to);
  }
  return true;
}
// 실효 팀 = helper팀 > 그 달 팀.
// 셀에 저장된 duty.team은 입력 당시 값이라 팀 변경 후엔 틀릴 수 있어 쓰지 않음 (앱과 동일)
function effTeam(duty, user, mk) {
  if (duty?.helper?.team) return duty.helper.team;
  return teamForMonth(user, mk);
}
function effRole(duty) {
  if (duty?.helper) return duty.helper.role || null;
  return duty?.role || null;
}
function isHelper(duty) { return !!duty?.helper; }

function getClinicStatus(iso, dow, clinic, holidays) {
  if (clinic?.[iso]) return clinic[iso];
  if (holidays?.[iso] || BUILTIN_HOLIDAYS[iso]) return `closed`;
  if (dow === 0) return `closed`;
  if (dow === 6) return `morning`;
  return `full`;
}
function getDisplayShift(shift, iso, dow, clinic, holidays) {
  if (shift !== `V`) return shift;
  return getClinicStatus(iso, dow, clinic, holidays) === `morning` ? `O` : shift;
}

function handoverConfig(myShift) {
  if (myShift === `D`) return {
    prev: { off: -1, sh: `N`, label: `어제 N` },
    next: { off: 0,  sh: `E`, label: `오늘 E` }
  };
  if (myShift === `E`) return {
    prev: { off: 0,  sh: `D`, label: `오늘 D` },
    next: { off: 0,  sh: `N`, label: `오늘 N` }
  };
  if (myShift === `N`) return {
    prev: { off: 0,  sh: `E`, label: `오늘 E` },
    next: { off: 1,  sh: `D`, label: `내일 D` }
  };
  return null;
}

function peopleWithShift(duties, mk, day, iso, dow, clinic, holidays, targetShift) {
  const md = duties[mk] || {};
  const out = [];
  for (const sabun of Object.keys(md)) {
    const d = getDutyAt(duties, mk, sabun, day);
    if (!d) continue;
    const disp = getDisplayShift(d.shift, iso, dow, clinic, holidays);
    if (disp === targetShift) out.push(sabun);
  }
  return out;
}

// 연차 = 입사 연도부터 1월 1일마다 +1, 총 연차 = 연차 + 입사 전 경력(seniority)
function yearsOfService(hireDate) {
  if (!hireDate) return 0;
  const y = parseInt(String(hireDate).split(/[-./]/)[0], 10);
  if (!y || isNaN(y)) return 0;
  return new Date().getFullYear() - y + 1;
}
function totalYears(sabun, user, seniority) {
  const exp = seniority?.[sabun];
  return yearsOfService(user.hireDate) + (typeof exp === `number` ? exp : 0);
}
function buildOrderMap(rosterOrder) {
  const arr = Array.isArray(rosterOrder) ? rosterOrder
    : (rosterOrder && typeof rosterOrder === `object` ? Object.values(rosterOrder) : []);
  const m = {};
  arr.forEach((sb, i) => { if (sb != null && m[sb] == null) m[sb] = i; });
  return m;
}
// 앱 compareUsersBySeniority와 동일: 연명부 수동 순서 → 총 연차 → 입사일 → 사번
function compareSeniority(a, b, data) {
  const ua = data.users[a], ub = data.users[b];
  if (!ua || !ub) return 0;
  const om = data.orderMap || {};
  const ra = om[a], rb = om[b];
  const ha = ra != null, hb = rb != null;
  if (ha && hb && ra !== rb) return ra - rb;
  if (ha !== hb) return ha ? -1 : 1;
  const ta = totalYears(a, ua, data.seniority), tb = totalYears(b, ub, data.seniority);
  if (ta !== tb) return tb - ta;
  const dc = (ua.hireDate || ``).localeCompare(ub.hireDate || ``);
  if (dc !== 0) return dc;
  return String(a).localeCompare(String(b));
}

function sortByTeamSeniority(sabuns, data, mk, day) {
  const teamIdx = (s) => {
    const t = effTeam(getDutyAt(data.duties, mk, s, day), data.users[s], mk);
    const i = TEAMS.indexOf(t);
    return i === -1 ? TEAMS.length : i;
  };
  return sabuns.slice().sort((a, b) => {
    const ta = teamIdx(a), tb = teamIdx(b);
    if (ta !== tb) return ta - tb;
    return compareSeniority(a, b, data);
  });
}

function buildLineup(targetShift, mk, day, iso, dow, data) {
  const { duties, users, clinic, holidays } = data;
  const md = duties[mk] || {};
  const direct = peopleWithShift(duties, mk, day, iso, dow, clinic, holidays, targetShift)
    .filter(s => isActiveInMonth(users[s], mk));
  let extras = [];
  if (targetShift === `D` || targetShift === `E`) {
    for (const sabun of Object.keys(md)) {
      const d = getDutyAt(duties, mk, sabun, day);
      if (!d) continue;
      const u = users[sabun];
      if (!u || !isActiveInMonth(u, mk)) continue;
      const t = effTeam(d, u, mk);
      if (t !== `main` && t !== `이송`) continue; // main/이송은 M·V로 D/E 라인업 합류
      const disp = getDisplayShift(d.shift, iso, dow, clinic, holidays);
      if (disp === `M`) extras.push(sabun);
      else if (targetShift === `D` && disp === `V`) extras.push(sabun);
    }
  }
  return Array.from(new Set([...direct, ...extras]));
}

// 인계 대상: 그 시프트 + 내 실효 팀 + 재직 중. 데이터 없는 달이면 null
function getHandoverPeople(date, targetShift, data, myTeam) {
  const iso = isoOf(date);
  const dow = date.getDay();
  const mk = monthKeyOf(date);
  const day = date.getDate();
  if (!data.duties[mk]) return null;

  const list = peopleWithShift(data.duties, mk, day, iso, dow, data.clinic, data.holidays, targetShift)
    .filter(s => {
      const u = data.users[s];
      if (!u || !isActiveInMonth(u, mk)) return false;
      return effTeam(getDutyAt(data.duties, mk, s, day), u, mk) === myTeam;
    });
  list.sort((a, b) => compareSeniority(a, b, data));
  return list.map(s => {
    const r = effRole(getDutyAt(data.duties, mk, s, day));
    return { sabun: s, label: data.users[s].name + (r ? ROLE_CELL[r] : ``) };
  });
}

function findNextWorkDay(mySabun, today, data) {
  for (let i = 1; i <= 14; i++) {
    const d = shiftedDate(today, i);
    const iso = isoOf(d);
    const dow = d.getDay();
    const mk = monthKeyOf(d);
    const duty = getDutyAt(data.duties, mk, mySabun, d.getDate());
    if (!duty) continue;
    const disp = getDisplayShift(duty.shift, iso, dow, data.clinic, data.holidays);
    if ([`D`, `E`, `N`].includes(disp)) return { date: d, shift: disp };
  }
  return null;
}

function getCachePath() {
  const fm = FileManager.local();
  return fm.joinPath(fm.documentsDirectory(), CACHE_FILE);
}
function saveCache(data) {
  try { FileManager.local().writeString(getCachePath(), JSON.stringify(data)); } catch (e) {}
}
function loadCache() {
  try {
    const fm = FileManager.local();
    const p = getCachePath();
    if (!fm.fileExists(p)) return null;
    return JSON.parse(fm.readString(p));
  } catch (e) { return null; }
}

async function fetchJSON(path) {
  const url = `${FIREBASE_URL}/${path}.json`;
  const req = new Request(url);
  req.timeoutInterval = REQUEST_TIMEOUT;
  try { return await req.loadJSON(); } catch (e) { return null; }
}

async function fetchAll() {
  const today = new Date();
  const months = new Set([monthKeyOf(today)]);
  months.add(monthKeyOf(shiftedDate(today, -7)));
  months.add(monthKeyOf(shiftedDate(today, 7)));
  months.add(monthKeyOf(shiftedDate(today, 14)));
  const mkList = Array.from(months);

  const fetches = [
    fetchJSON(`users`),
    fetchJSON(`clinicHours`),
    fetchJSON(`holidays`),
    fetchJSON(`seniority`),
    fetchJSON(`rosterOrder`),
    ...mkList.map(mk => fetchJSON(`duties/${mk}`))
  ];
  const results = await Promise.all(fetches);
  const [users, clinic, holidays, seniority, rosterOrder, ...dutyArrays] = results;
  if (!users) return null;
  const duties = {};
  mkList.forEach((mk, i) => { duties[mk] = dutyArrays[i] || {}; });
  return {
    users: users || {}, duties,
    clinic: clinic || {}, holidays: holidays || {}, seniority: seniority || {},
    rosterOrder: rosterOrder || [],
  };
}

function setupGradient(w) {
  const g = new LinearGradient();
  g.colors = [C.bg, C.bgGrad];
  g.locations = [0, 1];
  w.backgroundGradient = g;
}

function buildSetupWidget(message, sub) {
  const w = new ListWidget();
  setupGradient(w);
  w.setPadding(20, 18, 20, 18);
  const t = w.addText(`61w 듀티`);
  t.font = Font.boldSystemFont(16);
  t.textColor = C.text;
  w.addSpacer(8);
  const m = w.addText(message);
  m.font = Font.systemFont(12);
  m.textColor = C.sub;
  if (sub) {
    w.addSpacer(4);
    const g = w.addText(sub);
    g.font = Font.systemFont(10);
    g.textColor = C.sub;
  }
  return w;
}

function shiftPill(stack, shift, size) {
  const sz = size || 52;
  const info = C[shift];
  const p = stack.addStack();
  p.size = new Size(sz, sz);
  p.cornerRadius = Math.round(sz * 0.22);
  p.backgroundColor = info?.bg || C.faint;
  p.layoutHorizontally();
  p.centerAlignContent();
  p.addSpacer();
  const t = p.addText(shift || `·`);
  t.font = Font.boldSystemFont(Math.round(sz * 0.55));
  t.textColor = info?.text || C.sub;
  p.addSpacer();
  return p;
}

function divider(w) {
  const d = w.addStack();
  d.size = new Size(0, 1);
  d.backgroundColor = C.divider;
}

// [수정1] 라인업 인물 셀 — 팀색 제거, 중성 배경 + 이름만 (본인만 강조)
function lineupPersonCell(stack, user, duty, isMe, cellW, cellH, fontSize) {
  const fs = fontSize || 10;

  const cell = stack.addStack();
  cell.size = new Size(cellW, cellH);
  cell.cornerRadius = 5;
  cell.backgroundColor = isMe ? C.me : C.lineupCell;
  cell.layoutHorizontally();
  cell.centerAlignContent();
  cell.setPadding(2, 3, 2, 3);

  let nameTxt = user.name;
  const r = effRole(duty);
  if (r) nameTxt += ROLE_CELL[r];

  cell.addSpacer();
  const t = cell.addText(nameTxt);
  t.font = isMe ? Font.boldSystemFont(fs) : Font.mediumSystemFont(fs);
  t.textColor = isMe ? C.lineupMeText : C.text;
  t.lineLimit = 1;
  t.minimumScaleFactor = 0.55;
  cell.addSpacer();
  return cell;
}

function buildLineupGrid(parent, sabuns, users, duties, mk, day, mySabun, opts) {
  const { cols, rows, cellW, cellH, gap, fontSize } = opts;
  for (let r = 0; r < rows; r++) {
    const rowOuter = parent.addStack();
    rowOuter.layoutHorizontally();
    rowOuter.addSpacer();

    const row = rowOuter.addStack();
    row.layoutHorizontally();
    row.spacing = gap;
    for (let c = 0; c < cols; c++) {
      const idx = r * cols + c;
      if (idx >= sabuns.length) {
        const empty = row.addStack();
        empty.size = new Size(cellW, cellH);
      } else {
        const sabun = sabuns[idx];
        const u = users[sabun];
        const d = getDutyAt(duties, mk, sabun, day);
        if (u) lineupPersonCell(row, u, d, sabun === mySabun, cellW, cellH, fontSize);
      }
    }

    rowOuter.addSpacer();
    if (r < rows - 1) parent.addSpacer(gap);
  }
}

// 인계 칸 너비: 위젯 가용폭 - 시프트 알약 - 시프트 이름 칸. 기기 폭에 맞춰 120~175pt
function handoverWidth(pillSize) {
  let screenW = 390;
  try { screenW = Device.screenSize().width; } catch (e) {}
  const content = screenW - 52 - 24; // 위젯 좌우 여백 + 위젯 padding
  return Math.max(120, Math.min(175, content - pillSize - 8 - 70));
}

// 인계 한 줄: [화살표 + 시간] [이름들 — 길면 2줄로 줄바꿈]
// 이름을 하나의 텍스트로 합쳐야 Scriptable이 줄바꿈함 (개별 텍스트를 가로로 나열하면 잘림)
function handoverLine(parent, arrow, timeLabel, date, targetShift, data, myTeam, width) {
  const people = getHandoverPeople(date, targetShift, data, myTeam);

  const row = parent.addStack();
  row.layoutHorizontally();
  row.topAlignContent();
  row.size = new Size(width, 0);

  const head = row.addStack();
  head.layoutHorizontally();
  head.centerAlignContent();
  head.size = new Size(38, 13);
  const ar = head.addText(arrow);
  ar.font = Font.boldSystemFont(11);
  ar.textColor = C.text;
  head.addSpacer(2);
  const tl = head.addText(timeLabel);
  tl.font = Font.systemFont(8);
  tl.textColor = C.sub;
  tl.lineLimit = 1;
  head.addSpacer();

  row.addSpacer(3);

  const names = row.addText(people && people.length > 0
    ? people.map(p => p.label).join(` · `)
    : `—`);
  names.font = Font.systemFont(10);
  names.textColor = people && people.length > 0 ? C.text : C.faint;
  names.lineLimit = 2;
  names.minimumScaleFactor = 0.75;

  row.addSpacer();
}

// [수정2] 일주일 캘린더 (-2 ~ +4일) — 좌우 spacer로 가운데 정렬
function buildWeekRow(w, today, mySabun, data) {
  const outer = w.addStack();
  outer.layoutHorizontally();
  outer.addSpacer();

  const row = outer.addStack();
  row.layoutHorizontally();
  row.spacing = 3;

  const cellW = 40;
  const cellH = 50;

  for (let off = -2; off <= 4; off++) {
    const d = shiftedDate(today, off);
    const iso = isoOf(d);
    const dow = d.getDay();
    const mk = monthKeyOf(d);
    const day = d.getDate();
    const isToday = off === 0;

    const duty = getDutyAt(data.duties, mk, mySabun, day);
    const disp = duty ? getDisplayShift(duty.shift, iso, dow, data.clinic, data.holidays) : null;

    const cell = row.addStack();
    cell.size = new Size(cellW, cellH);
    cell.layoutVertically();
    cell.spacing = 2;

    let dateColor = C.sub;
    if (dow === 0) dateColor = C.warn;
    else if (dow === 6) dateColor = C.sat;
    if (isToday) dateColor = C.today;

    const dr = cell.addStack();
    dr.layoutHorizontally();
    dr.addSpacer();
    const dt = dr.addText(`${d.getMonth() + 1}.${day}`);
    dt.font = isToday ? Font.boldSystemFont(9) : Font.systemFont(9);
    dt.textColor = dateColor;
    dr.addSpacer();

    const pr = cell.addStack();
    pr.layoutHorizontally();
    pr.addSpacer();
    const info = disp ? C[disp] : null;
    const pill = pr.addStack();
    pill.size = new Size(32, 22);
    pill.cornerRadius = 5;
    pill.backgroundColor = info ? info.bg : C.emptyCell;
    if (isToday) {
      pill.borderWidth = 1.5;
      pill.borderColor = C.today;
    }
    pill.layoutHorizontally();
    pill.centerAlignContent();
    pill.addSpacer();
    const p = pill.addText(disp || `·`);
    p.font = Font.boldSystemFont(11);
    p.textColor = info ? info.text : C.faint;
    pill.addSpacer();
    pr.addSpacer();

    const dwr = cell.addStack();
    dwr.layoutHorizontally();
    dwr.addSpacer();
    const dw = dwr.addText(DOW_KR[dow]);
    dw.font = Font.systemFont(8);
    dw.textColor = dateColor;
    dwr.addSpacer();
  }

  outer.addSpacer(); // 양쪽 spacer로 가운데 정렬
}

// [수정3] 월별 미니 캘린더 — 셀 폭 정확히(L폭 기준 41) + 가운데 정렬 + 콘텐츠 안 삐져나가게
function buildMonthGrid(w, today, mySabun, data) {
  const y = today.getFullYear();
  const m = today.getMonth();
  const firstDow = new Date(y, m, 1).getDay();
  const daysInMonth = new Date(y, m + 1, 0).getDate();
  const mk = `${y}-${pad2(m + 1)}`;

  const cells = [];
  for (let i = 0; i < firstDow; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);
  while (cells.length % 7 !== 0) cells.push(null);
  const numWeeks = cells.length / 7;

  // L 콘텐츠 가용폭 ~305pt. gap 3 × 6 = 18 → 셀 (305-18)/7 ≈ 41
  const cellW = 41;
  const cellH = numWeeks >= 6 ? 18 : 20;
  const gap = 3;

  for (let week = 0; week < numWeeks; week++) {
    const outer = w.addStack();
    outer.layoutHorizontally();
    outer.addSpacer();

    const row = outer.addStack();
    row.layoutHorizontally();
    row.spacing = gap;

    for (let i = 0; i < 7; i++) {
      const day = cells[week * 7 + i];
      const cell = row.addStack();
      cell.size = new Size(cellW, cellH);
      cell.layoutHorizontally();
      cell.centerAlignContent();
      cell.setPadding(0, 4, 0, 4);

      if (day !== null) {
        const iso = `${mk}-${pad2(day)}`;
        const dow = i;
        const duty = getDutyAt(data.duties, mk, mySabun, day);
        const disp = duty ? getDisplayShift(duty.shift, iso, dow, data.clinic, data.holidays) : null;
        const info = disp ? C[disp] : null;
        const isToday = day === today.getDate();

        cell.cornerRadius = 4;
        cell.backgroundColor = info ? info.bg : C.emptyCell;
        if (isToday) {
          cell.borderWidth = 1.5;
          cell.borderColor = C.today;
        }

        let dColor = C.sub;
        if (dow === 0) dColor = C.warn;
        else if (dow === 6) dColor = C.sat;

        // 날짜(좌) + 듀티(우) — cell이 직접 가로 배치, spacer로 양끝 분리
        const dt = cell.addText(String(day));
        dt.font = Font.systemFont(8);
        dt.textColor = info ? info.text : dColor;
        cell.addSpacer();
        if (disp) {
          const s = cell.addText(disp);
          s.font = Font.boldSystemFont(9);
          s.textColor = info.text;
        }
      }
    }

    outer.addSpacer(); // 양쪽 spacer로 가운데 정렬
    if (week < numWeeks - 1) w.addSpacer(2);
  }
}

function finalizeWidget(w) {
  w.url = WEB_URL;
  w.refreshAfterDate = new Date(Date.now() + 30 * 60 * 1000);
  return w;
}

// ============================================================
// L 위젯
// ============================================================
function buildLarge(w, today, mySabun, meData, data, myDuty, myShift, myEffectTeam, clinic, usedCache) {
  w.setPadding(8, 12, 8, 12);

  // [수정1] 헤더 — 이름 옆 팀 색칩 제거, 팀은 작은 회색 텍스트로
  const header = w.addStack();
  header.layoutHorizontally();
  header.centerAlignContent();
  const nameTxt = header.addText(meData.name);
  nameTxt.font = Font.boldSystemFont(13);
  nameTxt.textColor = C.text;
  header.addSpacer(5);
  const teamTxt = header.addText(teamForMonth(meData, monthKeyOf(today)) || ``);
  teamTxt.font = Font.mediumSystemFont(10);
  teamTxt.textColor = C.sub;
  header.addSpacer();
  const dateTxt = header.addText(`${today.getMonth() + 1}.${today.getDate()} (${DOW_KR[today.getDay()]})`);
  dateTxt.font = Font.boldSystemFont(11);
  dateTxt.textColor = C.sub;

  w.addSpacer(6);

  // Hero + 우측 인계
  const heroRow = w.addStack();
  heroRow.layoutHorizontally();
  heroRow.centerAlignContent();

  shiftPill(heroRow, myShift || `·`, 50);
  heroRow.addSpacer(8);

  const infoCol = heroRow.addStack();
  infoCol.layoutVertically();
  infoCol.spacing = 2;
  const fullName = infoCol.addText(myShift ? (SHIFT_LABELS[myShift] || myShift) : `미입력`);
  fullName.font = Font.boldSystemFont(16);
  fullName.textColor = myShift && C[myShift] ? C[myShift].text : C.text;
  fullName.lineLimit = 1;
  const cl = infoCol.addText(CLINIC_LABELS[clinic]);
  cl.font = Font.systemFont(10);
  cl.textColor = C.sub;
  const myRole = effRole(myDuty);
  if (myRole) {
    const r = infoCol.addText(`${ROLE_CELL[myRole]}${isHelper(myDuty) ? ` · helper` : ``}`);
    r.font = Font.systemFont(9);
    r.textColor = C.sub;
  }

  heroRow.addSpacer();

  const showHandover = [`D`, `E`, `N`].includes(myShift) && myEffectTeam !== `main`;
  if (showHandover) {
    const hw = handoverWidth(50);
    const handoverCol = heroRow.addStack();
    handoverCol.layoutVertically();
    handoverCol.spacing = 4;
    const h = handoverConfig(myShift);
    handoverLine(handoverCol, `←`, h.prev.label, shiftedDate(today, h.prev.off), h.prev.sh, data, myEffectTeam, hw);
    handoverLine(handoverCol, `→`, h.next.label, shiftedDate(today, h.next.off), h.next.sh, data, myEffectTeam, hw);
  }

  w.addSpacer(6);
  divider(w);
  w.addSpacer(6);

  // 라인업
  if ([`D`, `E`, `N`].includes(myShift)) {
    const mk = monthKeyOf(today);
    const lineupSabuns = buildLineup(myShift, mk, today.getDate(), isoOf(today), today.getDay(), data);
    const sorted = sortByTeamSeniority(lineupSabuns, data, mk, today.getDate());

    const lhRow = w.addStack();
    lhRow.layoutHorizontally();
    const lh = lhRow.addText(`${myShift} 라인업 (${sorted.length}명)`);
    lh.font = Font.boldSystemFont(10);
    lh.textColor = C.sub;
    lhRow.addSpacer();
    w.addSpacer(3);

    const gridOuter = w.addStack();
    gridOuter.layoutVertically();
    buildLineupGrid(gridOuter, sorted.slice(0, 14), data.users, data.duties,
      mk, today.getDate(), mySabun,
      { cols: 7, rows: 2, cellW: 41, cellH: 23, gap: 3, fontSize: 10 });
  } else {
    const next = findNextWorkDay(mySabun, today, data);
    const msgRow = w.addStack();
    const t = msgRow.addText(
      myShift === `O` ? `Off · 푹 쉬세요.` :
      myShift === `M` ? `Mid 근무 (main)` :
      myShift === `V` ? `반차 (main)` :
      `오늘 듀티 미입력`
    );
    t.font = Font.systemFont(11);
    t.textColor = C.sub;
    msgRow.addSpacer();

    if (next) {
      w.addSpacer(2);
      const nRow = w.addStack();
      const nt = nRow.addText(`다음 근무: ${next.date.getMonth() + 1}/${next.date.getDate()} (${DOW_KR[next.date.getDay()]}) ${next.shift}`);
      nt.font = Font.systemFont(10);
      nt.textColor = C.sub;
      nRow.addSpacer();
    }
  }

  w.addSpacer(6);
  divider(w);
  w.addSpacer(6);

  buildWeekRow(w, today, mySabun, data);

  w.addSpacer(6);
  divider(w);
  w.addSpacer(4);

  buildMonthGrid(w, today, mySabun, data);

  w.addSpacer();

  const footer = w.addStack();
  footer.layoutHorizontally();
  footer.addSpacer();
  if (usedCache) {
    const cTxt = footer.addText(`⚠ 캐시`);
    cTxt.font = Font.systemFont(8);
    cTxt.textColor = C.warn;
    footer.addSpacer(6);
  }
  const ft = footer.addText(`↻ ${pad2(today.getHours())}:${pad2(today.getMinutes())}`);
  ft.font = Font.systemFont(8);
  ft.textColor = C.sub;
}

// ============================================================
// M 위젯 (L에서 월별 캘린더 + 주간 빠짐)
// ============================================================
function buildMedium(w, today, mySabun, meData, data, myDuty, myShift, myEffectTeam, clinic, usedCache) {
  w.setPadding(8, 12, 8, 12);

  const header = w.addStack();
  header.layoutHorizontally();
  header.centerAlignContent();
  const nameTxt = header.addText(meData.name);
  nameTxt.font = Font.boldSystemFont(13);
  nameTxt.textColor = C.text;
  header.addSpacer(5);
  const teamTxt = header.addText(teamForMonth(meData, monthKeyOf(today)) || ``);
  teamTxt.font = Font.mediumSystemFont(10);
  teamTxt.textColor = C.sub;
  header.addSpacer();
  const dateTxt = header.addText(`${today.getMonth() + 1}.${today.getDate()} (${DOW_KR[today.getDay()]})`);
  dateTxt.font = Font.boldSystemFont(11);
  dateTxt.textColor = C.sub;

  w.addSpacer(4);

  const heroRow = w.addStack();
  heroRow.layoutHorizontally();
  heroRow.centerAlignContent();

  shiftPill(heroRow, myShift || `·`, 42);
  heroRow.addSpacer(8);

  const infoCol = heroRow.addStack();
  infoCol.layoutVertically();
  infoCol.spacing = 1;
  const fullName = infoCol.addText(myShift ? (SHIFT_LABELS[myShift] || myShift) : `미입력`);
  fullName.font = Font.boldSystemFont(14);
  fullName.textColor = myShift && C[myShift] ? C[myShift].text : C.text;
  fullName.lineLimit = 1;
  const cl = infoCol.addText(CLINIC_LABELS[clinic]);
  cl.font = Font.systemFont(9);
  cl.textColor = C.sub;

  heroRow.addSpacer();

  const showHandover = [`D`, `E`, `N`].includes(myShift) && myEffectTeam !== `main`;
  if (showHandover) {
    const hw = handoverWidth(42);
    const handoverCol = heroRow.addStack();
    handoverCol.layoutVertically();
    handoverCol.spacing = 3;
    const h = handoverConfig(myShift);
    handoverLine(handoverCol, `←`, h.prev.label, shiftedDate(today, h.prev.off), h.prev.sh, data, myEffectTeam, hw);
    handoverLine(handoverCol, `→`, h.next.label, shiftedDate(today, h.next.off), h.next.sh, data, myEffectTeam, hw);
  }

  w.addSpacer(4);
  divider(w);
  w.addSpacer(4);

  if ([`D`, `E`, `N`].includes(myShift)) {
    const mk = monthKeyOf(today);
    const lineupSabuns = buildLineup(myShift, mk, today.getDate(), isoOf(today), today.getDay(), data);
    const sorted = sortByTeamSeniority(lineupSabuns, data, mk, today.getDate());

    const lhRow = w.addStack();
    const lh = lhRow.addText(`${myShift} 라인업 (${sorted.length}명)`);
    lh.font = Font.boldSystemFont(10);
    lh.textColor = C.sub;
    lhRow.addSpacer();
    w.addSpacer(3);

    const gridOuter = w.addStack();
    gridOuter.layoutVertically();
    buildLineupGrid(gridOuter, sorted.slice(0, 14), data.users, data.duties,
      mk, today.getDate(), mySabun,
      { cols: 7, rows: 2, cellW: 41, cellH: 21, gap: 3, fontSize: 10 });
  } else {
    const next = findNextWorkDay(mySabun, today, data);
    const msgRow = w.addStack();
    const t = msgRow.addText(
      myShift === `O` ? `Off · 푹 쉬세요.` :
      myShift === `M` ? `Mid 근무 (main)` :
      myShift === `V` ? `반차 (main)` :
      `오늘 듀티 미입력`
    );
    t.font = Font.systemFont(11);
    t.textColor = C.sub;
    msgRow.addSpacer();

    if (next) {
      w.addSpacer(2);
      const nRow = w.addStack();
      const nt = nRow.addText(`다음: ${next.date.getMonth() + 1}/${next.date.getDate()} (${DOW_KR[next.date.getDay()]}) ${next.shift}`);
      nt.font = Font.systemFont(10);
      nt.textColor = C.sub;
      nRow.addSpacer();
    }
  }

  w.addSpacer();
}

// ============================================================
// S 위젯
// ============================================================
function buildSmall(w, today, mySabun, meData, data, myDuty, myShift, myEffectTeam, clinic, usedCache) {
  w.setPadding(8, 10, 8, 10);

  const top = w.addStack();
  top.layoutHorizontally();
  top.centerAlignContent();

  shiftPill(top, myShift || `·`, 40);
  top.addSpacer(7);

  const infoCol = top.addStack();
  infoCol.layoutVertically();
  infoCol.spacing = 1;

  const dateTxt = infoCol.addText(`${today.getMonth() + 1}/${today.getDate()}`);
  dateTxt.font = Font.boldSystemFont(13);
  dateTxt.textColor = C.text;

  const dow = infoCol.addText(`${DOW_KR[today.getDay()]}요일`);
  dow.font = Font.systemFont(9);
  dow.textColor = C.sub;

  const showHandover = [`D`, `E`, `N`].includes(myShift) && myEffectTeam !== `main`;
  if (showHandover) {
    const h = handoverConfig(myShift);
    const prevPerson = firstHandoverLabel(shiftedDate(today, h.prev.off), h.prev.sh, data, myEffectTeam);
    const nextPerson = firstHandoverLabel(shiftedDate(today, h.next.off), h.next.sh, data, myEffectTeam);

    if (prevPerson) {
      const r = infoCol.addStack();
      const t = r.addText(`← ${prevPerson}`);
      t.font = Font.systemFont(9);
      t.textColor = C.sub;
      t.lineLimit = 1;
      t.minimumScaleFactor = 0.7;
    }
    if (nextPerson) {
      const r = infoCol.addStack();
      const t = r.addText(`→ ${nextPerson}`);
      t.font = Font.systemFont(9);
      t.textColor = C.sub;
      t.lineLimit = 1;
      t.minimumScaleFactor = 0.7;
    }
  }

  top.addSpacer();

  w.addSpacer(6);

  if ([`D`, `E`, `N`].includes(myShift)) {
    const mk = monthKeyOf(today);
    const lineupSabuns = buildLineup(myShift, mk, today.getDate(), isoOf(today), today.getDay(), data);
    const sorted = sortByTeamSeniority(lineupSabuns, data, mk, today.getDate());

    const gridOuter = w.addStack();
    gridOuter.layoutVertically();
    buildLineupGrid(gridOuter, sorted.slice(0, 16), data.users, data.duties,
      mk, today.getDate(), mySabun,
      { cols: 4, rows: 4, cellW: 30, cellH: 18, gap: 2, fontSize: 9 });
  } else {
    const next = findNextWorkDay(mySabun, today, data);
    const msg = w.addText(
      myShift === `O` ? `Off` :
      myShift === `M` ? `Mid` :
      myShift === `V` ? `반차` :
      `미입력`
    );
    msg.font = Font.systemFont(11);
    msg.textColor = C.sub;

    if (next) {
      w.addSpacer(4);
      const n = w.addText(`다음: ${next.date.getMonth() + 1}/${next.date.getDate()} ${next.shift}`);
      n.font = Font.systemFont(10);
      n.textColor = C.sub;
    }
  }

  w.addSpacer();
}

// S 위젯용: 첫 사람 이름 + 나머지 인원수 (예: "김민지 +2")
function firstHandoverLabel(date, targetShift, data, myTeam) {
  const people = getHandoverPeople(date, targetShift, data, myTeam);
  if (!people || people.length === 0) return null;
  const first = data.users[people[0].sabun].name;
  return people.length > 1 ? `${first} +${people.length - 1}` : first;
}

// ============================================================
// 메인
// ============================================================
async function buildWidget() {
  if (!MY_NAME) {
    return buildSetupWidget(`이름이 설정되지 않았어요`, `위젯 길게 → Edit → Parameter`);
  }

  let data;
  let usedCache = false;
  try {
    data = await fetchAll();
    if (data) saveCache(data);
    else { data = loadCache(); usedCache = true; }
  } catch (e) {
    data = loadCache();
    usedCache = true;
  }

  if (!data) return buildSetupWidget(`데이터 로드 실패`, `네트워크 확인`);
  data.orderMap = buildOrderMap(data.rosterOrder); // 구버전 캐시엔 rosterOrder 없음 → 빈 맵

  const matches = Object.entries(data.users).filter(([_, u]) => u.name === MY_NAME);
  if (matches.length === 0) return buildSetupWidget(`'${MY_NAME}' 미등록`, `정확한 이름 입력`);
  if (matches.length > 1) return buildSetupWidget(`'${MY_NAME}' 동명이인`, `위젯 미지원`);

  const [mySabun, meData] = matches[0];
  const w = new ListWidget();
  setupGradient(w);
  const family = config.widgetFamily || `large`;

  const today = new Date();
  const todayISO = isoOf(today);
  const todayDOW = today.getDay();
  const todayMK = monthKeyOf(today);
  const todayDay = today.getDate();

  const myDuty = getDutyAt(data.duties, todayMK, mySabun, todayDay);
  const rawShift = myDuty?.shift;
  const myShift = rawShift ? getDisplayShift(rawShift, todayISO, todayDOW, data.clinic, data.holidays) : null;
  const myEffectTeam = effTeam(myDuty, meData, todayMK);
  const clinic = getClinicStatus(todayISO, todayDOW, data.clinic, data.holidays);

  if (family === `small`) {
    buildSmall(w, today, mySabun, meData, data, myDuty, myShift, myEffectTeam, clinic, usedCache);
  } else if (family === `medium`) {
    buildMedium(w, today, mySabun, meData, data, myDuty, myShift, myEffectTeam, clinic, usedCache);
  } else {
    buildLarge(w, today, mySabun, meData, data, myDuty, myShift, myEffectTeam, clinic, usedCache);
  }

  return finalizeWidget(w);
}

const widget = await buildWidget();
if (config.runsInWidget) {
  Script.setWidget(widget);
} else {
  const f = config.widgetFamily || `large`;
  if (f === `small`) widget.presentSmall();
  else if (f === `medium`) widget.presentMedium();
  else widget.presentLarge();
}
Script.complete();
