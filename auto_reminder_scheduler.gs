/**
 * Auto Reminder Scheduler (Google Apps Script)
 *
 * What it does:
 * - Sends reminders ONLY to roshan.adhikari@masaischool.com
 * - Session/Tutorial reminders:
 *    - 1 day before at 6:00 PM
 *    - On the day at 8:00 AM
 * - Evaluation reminders:
 *    - 2 weeks before at 3:00 PM
 *    - 1 week before at 3:00 PM
 *    - 1 day before at 3:00 PM
 *    - On the day at 12:00 PM
 *
 * Setup:
 * 1) Open script.google.com > New project
 * 2) Paste this file
 * 3) Update CONFIG.CALENDAR_CSV_URLS if needed
 * 4) Run setupReminderTrigger() once
 * 5) Authorize prompts
 *
 * Notes:
 * - Trigger runs hourly and sends if current time matches target window.
 * - Uses ScriptProperties to avoid duplicate sends.
 */

const CONFIG = {
  RECIPIENT: 'roshan.adhikari@masaischool.com',
  TIMEZONE: 'Asia/Kolkata',
  SENT_KEY_RETENTION_DAYS: 45,
  // Same published CSV as the dashboard (IIM Rohtak master sheet):
  CALENDAR_CSV_URLS: [
    'https://docs.google.com/spreadsheets/d/e/2PACX-1vR3yRzBrrekz5925F-qSp0UdOIiytI4ox_mE_bPg42rOWSWyiBqJaa7MjhjH7jeEjnOblo_rcgexpcJ/pub?gid=1986899323&single=true&output=csv',
  ],
};

function setupReminderTrigger() {
  const existing = ScriptApp.getProjectTriggers().filter(t => t.getHandlerFunction() === 'runReminderScheduler');
  existing.forEach(t => ScriptApp.deleteTrigger(t));

  ScriptApp.newTrigger('runReminderScheduler')
    .timeBased()
    .everyHours(1)
    .create();
}

function runReminderScheduler() {
  const now = new Date();
  const props = PropertiesService.getScriptProperties();
  cleanupOldSentKeys_(props, now);

  const events = loadEventsFromCsvUrls_(CONFIG.CALENDAR_CSV_URLS);
  events.forEach(evt => {
    const category = classifyEvent_(evt);
    if (!category) return;

    const targets = buildReminderTargets_(evt.dateOnly, category);
    targets.forEach(target => {
      if (!isInCurrentHourWindow_(now, target.when)) return;

      const key = `sent:${evt.eventId}:${target.code}`;
      if (props.getProperty(key)) return;

      const subject = buildSubject_(evt, category, target);
      const body = buildBody_(evt, category, target);

      MailApp.sendEmail({
        to: CONFIG.RECIPIENT,
        subject: subject,
        body: body,
      });

      props.setProperty(key, formatDateTime_(new Date(), "yyyy-MM-dd'T'HH:mm:ss"));
    });
  });
}

function loadEventsFromCsvUrls_(urls) {
  const out = [];
  urls.forEach(url => {
    const csv = fetchCsvWithRetry_(url, 3);
    if (!csv) return;
    const rows = Utilities.parseCsv(csv || '');
    if (!rows.length) return;

    const header = rows[0].map(h => normalize_(h));
    const idxDate = findHeaderIndex_(header, ['date', 'sessiondate', 'classdate']);
    const idxTitle = findHeaderIndex_(header, ['sessiontitle', 'title', 'topic', 'subject']);
    const idxType = findHeaderIndex_(header, ['type', 'sessiontype', 'category']);
    const idxTime = findHeaderIndex_(header, ['time', 'starttime', 'timing']);
    const idxLink = findHeaderIndex_(header, ['link', 'lmslink', 'zoomlink', 'sessionlink', 'joinlink']);
    const idxProgram = findHeaderIndex_(header, ['program', 'batch', 'cohort']);

    for (let i = 1; i < rows.length; i++) {
      const r = rows[i];
      if (!r || !r.length) continue;

      const rawDate = idxDate >= 0 ? String(r[idxDate] || '').trim() : '';
      const dateOnly = parseDateOnly_(rawDate);
      if (!dateOnly) continue;

      const title = idxTitle >= 0 ? String(r[idxTitle] || '').trim() : 'Session';
      const type = idxType >= 0 ? String(r[idxType] || '').trim() : '';
      const timeText = idxTime >= 0 ? String(r[idxTime] || '').trim() : '';
      const link = idxLink >= 0 ? String(r[idxLink] || '').trim() : '';
      const program = idxProgram >= 0 ? String(r[idxProgram] || '').trim() : '';

      const eventId = makeEventId_(title, type, rawDate, timeText, program, link);
      out.push({
        eventId: eventId,
        title: title || 'Session',
        type: type || '',
        dateOnly: dateOnly,
        timeText: timeText || '',
        link: link || '',
        program: program || '',
      });
    }
  });

  return out;
}

function fetchCsvWithRetry_(url, maxAttempts) {
  let attempt = 0;
  let lastError = null;
  while (attempt < maxAttempts) {
    attempt++;
    try {
      const resp = UrlFetchApp.fetch(url, { muteHttpExceptions: true });
      const code = resp.getResponseCode();
      if (code >= 200 && code < 300) return resp.getContentText();
      lastError = new Error(`HTTP ${code}`);
    } catch (err) {
      lastError = err;
    }
    Utilities.sleep(300 * attempt);
  }
  Logger.log(`Failed to fetch CSV: ${url}. Error: ${lastError}`);
  return '';
}

function classifyEvent_(evt) {
  const txt = `${evt.title} ${evt.type}`.toLowerCase();
  if (txt.includes('evaluation') || txt.includes('exam') || txt.includes('module evaluation')) return 'evaluation';
  if (txt.includes('tutorial')) return 'tutorial';
  if (txt.includes('session') || txt.includes('class') || txt.includes('lecture')) return 'session';
  return null;
}

function buildReminderTargets_(dateOnly, category) {
  if (category === 'evaluation') {
    return [
      { code: 'eval_14d_1500', when: atTime_(addDays_(dateOnly, -14), 15, 0) },
      { code: 'eval_7d_1500', when: atTime_(addDays_(dateOnly, -7), 15, 0) },
      { code: 'eval_1d_1500', when: atTime_(addDays_(dateOnly, -1), 15, 0) },
      { code: 'eval_0d_1200', when: atTime_(dateOnly, 12, 0) },
    ];
  }

  // session/tutorial
  return [
    { code: 'sess_1d_1800', when: atTime_(addDays_(dateOnly, -1), 18, 0) },
    { code: 'sess_0d_0800', when: atTime_(dateOnly, 8, 0) },
  ];
}

function buildSubject_(evt, category, target) {
  const dateStr = formatDateTime_(evt.dateOnly, 'dd MMM yyyy');
  const prefix = category === 'evaluation' ? '[Evaluation Reminder]' : '[Session Reminder]';
  const programTag = evt.program ? ` (${evt.program})` : '';
  return `${prefix}${programTag} ${evt.title} - ${dateStr}`;
}

function buildBody_(evt, category, target) {
  const dateStr = formatDateTime_(evt.dateOnly, 'dd MMM yyyy');
  const scheduleLabel = reminderCodeLabel_(target.code);
  const kind = category === 'evaluation' ? 'Evaluation' : (category === 'tutorial' ? 'Tutorial' : 'Session');

  return [
    'Dear Roshan,',
    '',
    'This is your scheduled reminder for quick reference.',
    '',
    `Reminder Type: ${scheduleLabel}`,
    `Category: ${kind}`,
    `Title: ${evt.title}`,
    `Date: ${dateStr}`,
    `Time: ${evt.timeText || 'N/A'}`,
    `Program/Batch: ${evt.program || 'N/A'}`,
    `Link: ${evt.link || 'N/A'}`,
    '',
    'Please take the required action accordingly.',
    '',
    'Warm Regards,',
    'Auto Reminder Scheduler',
  ].join('\n');
}

function reminderCodeLabel_(code) {
  const map = {
    eval_14d_1500: '2 weeks prior at 3:00 PM',
    eval_7d_1500: '1 week prior at 3:00 PM',
    eval_1d_1500: '1 day prior at 3:00 PM',
    eval_0d_1200: 'On evaluation day at 12:00 PM',
    sess_1d_1800: '1 day prior at 6:00 PM',
    sess_0d_0800: 'On session day at 8:00 AM',
  };
  return map[code] || code;
}

function isInCurrentHourWindow_(now, target) {
  const nowMs = now.getTime();
  const tMs = target.getTime();
  return nowMs >= tMs && nowMs < (tMs + 60 * 60 * 1000);
}

function parseDateOnly_(s) {
  if (!s) return null;
  const str = String(s).trim();

  // dd/mm/yyyy
  let m = str.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (m) return new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1]));

  // dd-mm-yyyy
  m = str.match(/^(\d{1,2})-(\d{1,2})-(\d{4})$/);
  if (m) return new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1]));

  // yyyy-mm-dd
  m = str.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (m) return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));

  // e.g., 5 Apr 2026
  const d = new Date(str);
  if (!isNaN(d.getTime())) return new Date(d.getFullYear(), d.getMonth(), d.getDate());
  return null;
}

function atTime_(dateOnly, hour24, minute) {
  return new Date(
    dateOnly.getFullYear(),
    dateOnly.getMonth(),
    dateOnly.getDate(),
    hour24,
    minute,
    0,
    0
  );
}

function addDays_(dateOnly, days) {
  const d = new Date(dateOnly.getTime());
  d.setDate(d.getDate() + days);
  return d;
}

function findHeaderIndex_(headers, keys) {
  for (let i = 0; i < headers.length; i++) {
    const h = headers[i];
    for (let k = 0; k < keys.length; k++) {
      if (h === keys[k] || h.includes(keys[k])) return i;
    }
  }
  return -1;
}

function normalize_(s) {
  return String(s || '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

function makeEventId_(title, type, rawDate, timeText, program, link) {
  const base = `${title}|${type}|${rawDate}|${timeText}|${program}|${link}`;
  const digest = Utilities.computeDigest(Utilities.DigestAlgorithm.MD5, base);
  return digest.map(b => ('0' + ((b + 256) % 256).toString(16)).slice(-2)).join('');
}

function formatDateTime_(d, fmt) {
  return Utilities.formatDate(d, CONFIG.TIMEZONE, fmt);
}

function cleanupOldSentKeys_(props, now) {
  const all = props.getProperties();
  const threshold = now.getTime() - (CONFIG.SENT_KEY_RETENTION_DAYS * 24 * 60 * 60 * 1000);
  Object.keys(all).forEach(key => {
    if (!key.startsWith('sent:')) return;
    const ts = Date.parse(all[key] || '');
    if (!isNaN(ts) && ts < threshold) {
      props.deleteProperty(key);
    }
  });
}

