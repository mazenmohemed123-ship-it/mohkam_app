export interface ParsedVoice {
  client_name: string;
  case_number: string;
  case_type: string;
  judgment: string;
  total_fees: string;
  admin_fees: string;
  client_phone: string;
  raw: string;
}

export function parseVoice(text: string): ParsedVoice {
  const t = text.trim();
  const out: ParsedVoice = {
    client_name: '',
    case_number: '',
    case_type: '',
    judgment: '',
    total_fees: '',
    admin_fees: '',
    client_phone: '',
    raw: t,
  };

  // Global phone regex: matches international formats with + prefix or local numbers
  const phone = t.match(/(\+?\d{1,3}[\s\-]?)?[\d\s\-]{7,15}/);
  if (phone) out.client_phone = phone[0].replace(/[\s\-]/g, '');

  const caseNum =
    t.match(/(?:رقم|قضية|قضيه|ملف)[\s:#\-]*(\d{4,})/i) || t.match(/\b(\d{4,10})\b/);
  if (caseNum) out.case_number = caseNum[1];

  const feeRx = /(\d[\d,\.]*)\s*(جنيه|جنية|EGP|ج)/gi;
  const fees: { val: number; ctx: string }[] = [];
  let m;
  while ((m = feeRx.exec(t)) !== null) {
    fees.push({
      val: parseFloat(m[1].replace(/,/g, '')),
      ctx: t.slice(Math.max(0, m.index - 25), m.index + 35),
    });
  }

  fees.forEach((f) => {
    if (/مصاريف|إداري|ادار|مصروف/.test(f.ctx)) out.admin_fees = String(f.val);
    else if (/اتعاب|أتعاب|رسوم|اجر|أجر/.test(f.ctx)) out.total_fees = String(f.val);
    else if (!out.total_fees) out.total_fees = String(f.val);
    else if (!out.admin_fees) out.admin_fees = String(f.val);
  });

  const nameM = t.match(/(?:قضية|قضيه|ملف|موكل)\s+([\u0600-\u06FF\s]{3,30}?)(?:\s+رقم|\s+\d|$)/i);
  if (nameM) out.client_name = nameM[1].trim().replace(/\s+/g, ' ');

  for (const w of [
    'براءة', 'براءه', 'بريء', 'إدانة', 'ادانة',
    'حبس', 'غرامة', 'تأجيل', 'قيد الانتظار', 'انتظار',
  ]) {
    if (t.includes(w)) {
      out.judgment = w;
      break;
    }
  }

  for (const tp of [
    'جنايات', 'جنح', 'مدني', 'أحوال شخصية', 'تجاري',
    'إداري', 'عمالي', 'عقاري', 'تأمين', 'ضرائب',
  ]) {
    if (t.includes(tp)) {
      out.case_type = tp;
      break;
    }
  }

  return out;
}

export interface DetectedIntent {
  type: 'new' | 'update';
  existing: any | null;
  parsed: ParsedVoice;
}

export function detectIntent(text: string, existingCases: any[]): DetectedIntent {
  const t = text.trim();
  const caseNum =
    t.match(/(?:رقم|قضية|قضيه)[\s:#\-]*(\d{4,})/i)?.[1] ||
    t.match(/\b(\d{4,10})\b/)?.[1];
  const nameM = t.match(/(?:قضية|قضيه|موكل)\s+([\u0600-\u06FF\s]{3,25}?)/i)?.[1]?.trim();

  const byNum = caseNum ? existingCases.find((c) => c.case_number === caseNum) : null;
  const byName = nameM
    ? existingCases.find((c) => c.client_name?.includes(nameM.split(' ')[0]))
    : null;
  const existing = byNum || byName;

  return {
    type: existing ? 'update' : 'new',
    existing,
    parsed: parseVoice(text),
  };
}
