import { useState, useEffect, useRef } from 'react';
import { Scale, LogOut, Phone, Calendar, AlertTriangle, Bot, Send, MessageSquare, Users, ChevronDown, CreditCard, Lock, Wallet } from 'lucide-react';
import { Button, Card, Badge, Modal, Field, NotificationUI } from '../atoms';
import { supabase, sendPushToClient } from '../../services/supabase';
import { checkFloodLimit } from '../../services/floodProtection';
import { useNotifications } from '../../hooks/useNotifications';
import { sanitize, sanitizeLike } from '../../services/sanitize';
import { isValidGlobalPhone } from '../../services/phoneValidation';
import { useCase } from '../../context/CaseContext';
import type { Profile } from '../../context/RoleContext';

interface ClientPortalProps {
  user: any;
  profile: Profile;
  onLogout: () => void;
  urlLawyerId?: string;
}

interface ChatMsg {
  id: string;
  from: 'user' | 'bot' | 'lawyer' | 'staff';
  staffName?: string;
  text: string;
  time: string;
  isEmergency?: boolean;
  isSystem?: boolean;
}

interface CaseInfo {
  id: string;
  case_number: string;
  client_name?: string;
  client_phone?: string;
  case_type?: string;
  judgment?: string;
  total_fees: number;
  admin_fees: number;
  lawyer_id: string;
}

/* Team members for Team plan dropdown */
const TEAM_MEMBERS = [
  { id: 'lawyer', label: 'الأستاذ الأساسي', icon: '👨‍⚖️' },
  { id: 'secretary', label: 'السكرتارية', icon: '📋' },
  { id: 'accountant', label: 'الحسابات', icon: '🧮' },
];

/* Days of week for appointment booking - static fallback */
const DAYS_OF_WEEK_STATIC = [
  { id: 'saturday', label: 'السبت' },
  { id: 'sunday', label: 'الأحد' },
  { id: 'monday', label: 'الاثنين' },
  { id: 'tuesday', label: 'الثلاثاء' },
  { id: 'wednesday', label: 'الأربعاء' },
  { id: 'thursday', label: 'الخميس' },
  { id: 'friday', label: 'الجمعة' },
];

/* Paymob payment channels */
const PAYMOB_CHANNELS = [
  { id: 'card', label: 'بطاقة ائتمانية', desc: 'فيزا / ماستركارد', icon: '💳', color: '#635BFF' },
  { id: 'vodafone', label: 'فودافون كاش', desc: 'محفظة فودافون كاش', icon: '📱', color: '#E60000' },
  { id: 'aman', label: 'أمان', desc: 'محفظة أمان الإلكترونية', icon: '🏦', color: '#00B4D8' },
];

export function ClientPortal({ user, profile, onLogout, urlLawyerId }: ClientPortalProps) {
  const [lawyerInfo, setLawyerInfo] = useState<any>(null);
  const [lawyerProfile, setLawyerProfile] = useState<Profile | null>(null);
  const [msgs, setMsgs] = useState<ChatMsg[]>([]);
  const { triggerEmergency } = useCase();
  const [input, setInput] = useState('');
  const [aggregatedCases, setAggregatedCases] = useState<CaseInfo[]>([]);
  const [selectedCase, setSelectedCase] = useState<CaseInfo | null>(null);
  const [showEmg, setShowEmg] = useState(false);
  const [emgText, setEmgText] = useState('');
  const [emgSent, setEmgSent] = useState(false);
  const [emgEnabled, setEmgEnabled] = useState(true);

  /* Chat dropdown state */
  const [showChatDropdown, setShowChatDropdown] = useState(false);
  const [activeChatTarget, setActiveChatTarget] = useState<string>('bot');
  const [activeChatLabel, setActiveChatLabel] = useState<string>('المساعد الذكي');

  /* Appointment dropdown state */
  const [showApptDropdown, setShowApptDropdown] = useState(false);
  const [selectedDay, setSelectedDay] = useState<string>('');
  const [apptSubmitted, setApptSubmitted] = useState(false);

  /* Payment state - Paymob */
  const [showPayment, setShowPayment] = useState(false);
  const [selectedChannel, setSelectedChannel] = useState<string>('');
  const [paymentProcessing, setPaymentProcessing] = useState(false);
  const [paymentDone, setPaymentDone] = useState(false);

  /* Lawyer availability and payment credentials */
  const [availableDays, setAvailableDays] = useState<string[]>([]);
  const [availableSlots, setAvailableSlots] = useState<string[]>([]);
  const [lawyerPaymentInfo, setLawyerPaymentInfo] = useState<{
    vodafone_cash_number?: string;
    instapay_address?: string;
    bank_account_details?: {
      iban?: string;
      bank_name?: string;
      account_holder?: string;
      account_number?: string;
      country?: string;
    };
  } | null>(null);

  const chatDropdownRef = useRef<HTMLDivElement>(null);
  const apptDropdownRef = useRef<HTMLDivElement>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const { list: notifList, push } = useNotifications();

  /* Close dropdowns on outside click */
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (chatDropdownRef.current && !chatDropdownRef.current.contains(e.target as Node)) {
        setShowChatDropdown(false);
      }
      if (apptDropdownRef.current && !apptDropdownRef.current.contains(e.target as Node)) {
        setShowApptDropdown(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  /* Load lawyer info and aggregate cases by phone number */
  useEffect(() => {
    const lawyerId = urlLawyerId || profile?.linked_lawyer_id;
    if (!lawyerId) return;

    supabase.from('profiles')
      .select('id,full_name,avatar_url,phone_number,is_emergency_enabled,tier,vodafone_cash_number,instapay_address,bank_account_details')
      .eq('id', lawyerId).single()
      .then(({ data }) => {
        if (data) {
          setLawyerInfo(data);
          setLawyerProfile(data as Profile);
          setEmgEnabled(data.is_emergency_enabled ?? true);
          // Set payment credentials if available
          if (data.vodafone_cash_number || data.instapay_address || data.bank_account_details) {
            setLawyerPaymentInfo({
              vodafone_cash_number: data.vodafone_cash_number,
              instapay_address: data.instapay_address,
              bank_account_details: data.bank_account_details,
            });
          }
          const lawyerName = data.full_name || 'المحامي';
          setMsgs([{
            id: 'w', from: 'bot',
            text: `مرحباً، أنا مساعد الأستاذ ${lawyerName || 'المحامي'}. كيف أقدر أساعدك؟`,
            time: new Date().toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' }),
          }]);
        }
      });

    // Fetch lawyer availability for dynamic booking
    supabase.from('lawyer_availability')
      .select('available_days,time_slots')
      .eq('lawyer_id', lawyerId)
      .eq('is_active', true)
      .single()
      .then(({ data: availData }) => {
        if (availData) {
          setAvailableDays(availData.available_days || []);
          setAvailableSlots(availData.time_slots || []);
        }
      });

    /* Aggregate all cases for this client by phone number */
    if (profile?.phone_number) {
      supabase.from('cases')
        .select('*')
        .eq('client_phone', profile.phone_number)
        .eq('lawyer_id', lawyerId)
        .then(({ data }) => {
          if (data && data.length > 0) {
            setAggregatedCases(data);
            setSelectedCase(data[0]);
          }
        });
    }
  }, [urlLawyerId, profile?.linked_lawyer_id, profile?.phone_number]);

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [msgs]);

  const botReply = async (text: string) => {
    const t = text.trim();
    const num = t.match(/\b([A-Za-z]{0,5}[\-]?\d{3,})\b/i)?.[1] || t.match(/\b(\d{4,})\b/)?.[1];
    if (num) {
      const safeNum = sanitizeLike(num);
      const { data, error } = await supabase.from('cases').select('*').ilike('case_number', `%${safeNum}%`).limit(1);
      if (!error && data?.length) {
        const c = data[0];
        setSelectedCase(c);
        setAggregatedCases((prev) => prev.some(ac => ac.id === c.id) ? prev : [...prev, c]);
        return `✅ وجدت قضيتك!\n\n📋 الرقم: ${sanitize(c.case_number)}\n👤 الاسم: ${sanitize(c.client_name || '')}\n⚖️ النوع: ${c.case_type || '—'}\n📌 الحكم: ${c.judgment}\n💰 الأتعاب: ${Number(c.total_fees).toLocaleString()} ج\n📊 المصاريف: ${Number(c.admin_fees).toLocaleString()} ج`;
      }
      return `❌ مش لاقي قضية بالرقم "${safeNum}"\nتأكد من الرقم وحاول تاني.`;
    }
    if (/مرحب|أهلاً|هلو|السلام|صباح|مساء/.test(t)) return `وعليكم السلام! 😊\nأرسل رقم قضيتك وهديك كل التفاصيل.`;
    if (/مواعيد|وقت|جلسة/.test(t)) return `مواعيد المكتب: السبت – الخميس ٩ص – ٥م\nللتواصل: ${lawyerInfo?.phone_number || ''}`;
    if (/شكر|جزاك|ربنا/.test(t)) return 'وإياك! ربنا يوفقك 🙏';
    if (/طوارئ|عاجل|مساعدة/.test(t)) return 'اضغط على زر الطوارئ الأحمر وهيوصل طلبك للمحامي فوراً 🆘';
    return 'مش فاهم سؤالك 😅\nجرب:\n• إرسال رقم القضية\n• اكتب "مواعيد" للمواعيد\n• اكتب "طوارئ" للمساعدة';
  };

  const send = async () => {
    if (!input.trim()) return;
    const { allowed } = checkFloodLimit();
    if (!allowed) { push('⚠️ إرسال سريع جداً! انتظر قليلاً', 'warning'); return; }
    const txt = input;
    setMsgs((p) => [...p, { id: 'u' + Date.now(), from: 'user', text: txt, time: new Date().toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' }) }]);
    setInput('');

    if (activeChatTarget !== 'bot' && selectedCase) {
      await supabase.from('messages').insert([{ case_id: selectedCase.id, sender_id: user.id, message_text: sanitize(txt) }]);
      setMsgs((p) => [...p, { id: 's' + Date.now(), from: 'staff', staffName: activeChatLabel, text: 'تم إرسال رسالتك ✓', time: new Date().toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' }) }]);
      return;
    }

    if (selectedCase) await supabase.from('messages').insert([{ case_id: selectedCase.id, sender_id: user.id, message_text: sanitize(txt) }]);
    const reply = await botReply(txt);
    setTimeout(() => setMsgs((p) => [...p, { id: 'b' + Date.now(), from: 'bot', text: reply, time: new Date().toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' }) }]), 420);
  };

  const sendEmergency = async () => {
    const { allowed } = checkFloodLimit();
    if (!allowed) { push('⚠️ تم استخدام زر الطوارئ مرتين في دقيقة واحدة', 'warning'); return; }
    if (selectedCase && emgText.trim()) {
      const success = await triggerEmergency({
        caseId: selectedCase.id,
        createdBy: user.id,
        essentialNeeds: sanitize(emgText),
        emergencyCosts: 0,
      });
      if (success) {
        const lawyerId = urlLawyerId || profile?.linked_lawyer_id;
        if (lawyerId) sendPushToClient(lawyerId, '🆘 طلب طوارئ عاجل!', emgText);
        // Add to local chat for immediate visibility
        setMsgs((p) => [...p, {
          id: 'emg' + Date.now(),
          from: 'user',
          text: `🆘 ${emgText}`,
          time: new Date().toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' }),
          isEmergency: true,
        }]);
      }
    }
    setEmgSent(true); setShowEmg(false);
  };

  const submitAppointment = async (day: string) => {
    if (!selectedCase || !day) { push('اختر يوم الموعد', 'warning'); return; }
    await supabase.from('appointment_requests').insert([{
      case_id: selectedCase.id, client_id: user.id, lawyer_id: lawyerInfo?.id,
      appointment_date: day, appointment_time: 'غيابي', reason: `طلب موعد يوم ${DAYS_OF_WEEK.find(d => d.id === day)?.label}`,
    }]);
    await supabase.from('case_events').insert([{
      case_id: selectedCase.id, event_type: 'APPOINTMENT_REQUESTED',
      event_description: `📅 طلب حجز موعد: يوم ${DAYS_OF_WEEK.find(d => d.id === day)?.label}`,
    }]);
    push('✓ تم إرسال طلب الموعد', 'success');
    setApptSubmitted(true);
    setShowApptDropdown(false);
    setSelectedDay(day);
  };

  const processPayment = () => {
    if (!selectedChannel) { push('اختر طريقة الدفع', 'warning'); return; }
    setPaymentProcessing(true);
    setTimeout(() => {
      setPaymentProcessing(false);
      setPaymentDone(true);
      push('✓ تمت عملية الدفع بنجاح عبر Paymob', 'success');
      setTimeout(() => { setPaymentDone(false); setShowPayment(false); setSelectedChannel(''); }, 2000);
    }, 2500);
  };

  const LAWYER_NAME = lawyerInfo?.full_name || 'المحامي';
  const LAWYER_PHONE = lawyerInfo?.phone_number || '';
  const LAWYER_AVATAR = lawyerInfo?.avatar_url;
  const lawyerTier = lawyerProfile?.tier || 'free';

  const totalFees = selectedCase ? Number(selectedCase.total_fees) || 0 : 0;
  const amountPaid = Math.floor(totalFees * 0.3);
  const amountRemaining = totalFees - amountPaid;

  const handleChatClick = () => {
    if (lawyerTier === 'team') {
      setShowChatDropdown((v) => !v);
    } else {
      setActiveChatTarget('lawyer');
      setActiveChatLabel(LAWYER_NAME);
      setMsgs((p) => [...p, {
        id: 'sys' + Date.now(), from: 'lawyer',
        text: `مرحباً، أنا ${LAWYER_NAME}. كيف أقدر أساعدك؟`,
        time: new Date().toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' }),
      }]);
    }
  };

  const selectTeamMember = (member: typeof TEAM_MEMBERS[0]) => {
    setActiveChatTarget('staff');
    setActiveChatLabel(member.label);
    setShowChatDropdown(false);
    setMsgs((p) => [...p, {
      id: 'sys' + Date.now(), from: 'staff', staffName: member.label,
      text: `مرحباً، أنا ${member.label}. أقدر أساعدك في أي شيء.`,
      time: new Date().toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' }),
    }]);
  };

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)', display: 'flex', flexDirection: 'column' }}>
      <NotificationUI list={notifList} />

      <header style={{ background: 'var(--navy)', color: '#fff', padding: '0 16px', height: 56, display: 'flex', alignItems: 'center', justifyContent: 'space-between', position: 'sticky', top: 0, zIndex: 100 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ width: 32, height: 32, background: 'rgba(255,255,255,.15)', borderRadius: 9, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Scale size={16} color="var(--gold)" />
          </div>
          <div>
            <p style={{ fontWeight: 900, fontSize: 15, fontFamily: "'Tajawal', sans-serif" }}>مُحكَم</p>
            <p style={{ fontSize: 10, opacity: 0.6 }}>بوابة الموكل</p>
          </div>
        </div>
        <button onClick={onLogout} style={{ background: 'rgba(255,255,255,.1)', border: '1px solid rgba(255,255,255,.2)', color: '#fff', padding: '6px 14px', borderRadius: 10, cursor: 'pointer', fontSize: 12, fontFamily: "'Cairo',sans-serif", fontWeight: 700, display: 'flex', alignItems: 'center', gap: 6 }}>
          <LogOut size={12} /> خروج
        </button>
      </header>

      <main style={{ flex: 1, padding: 14, maxWidth: 560, width: '100%', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 14, paddingBottom: 24 }}>
        {/* Lawyer Card */}
        <Card style={{ overflow: 'hidden', padding: 0 }}>
          <div style={{ background: 'linear-gradient(135deg, var(--navy), var(--navy-light))', padding: '16px 18px', color: '#fff', display: 'flex', alignItems: 'center', gap: 14 }}>
            <div style={{ width: 52, height: 52, borderRadius: '50%', background: 'rgba(255,255,255,.15)', border: '2px solid rgba(255,255,255,.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', flexShrink: 0 }}>
              {LAWYER_AVATAR ? <img src={LAWYER_AVATAR} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <span style={{ fontSize: 22 }}>👨‍⚖️</span>}
            </div>
            <div style={{ flex: 1 }}>
              <p style={{ fontSize: 10, opacity: 0.6, fontWeight: 700, textTransform: 'uppercase', marginBottom: 3 }}>محاميك</p>
              <p style={{ fontSize: 18, fontWeight: 900, fontFamily: "'Tajawal', sans-serif" }}>{LAWYER_NAME}</p>
            </div>

            {/* Action Grid */}
            <div style={{ display: 'flex', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
              {LAWYER_PHONE && (
                <a href={`tel:${LAWYER_PHONE}`} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: 'rgba(255,255,255,.18)', color: '#fff', padding: '7px 12px', borderRadius: 10, fontSize: 12, fontWeight: 700, textDecoration: 'none', border: '1px solid rgba(255,255,255,.25)' }}>
                  <Phone size={12} /> اتصال
                </a>
              )}

              {/* Drdsha Button with Dropdown */}
              <div ref={chatDropdownRef} style={{ position: 'relative' }}>
                <button
                  onClick={handleChatClick}
                  style={{
                    display: 'inline-flex', alignItems: 'center', gap: 6,
                    background: 'rgba(255,255,255,.25)', color: '#fff',
                    padding: '7px 12px', borderRadius: 10, fontSize: 12, fontWeight: 700,
                    border: '1px solid rgba(255,255,255,.3)', cursor: 'pointer',
                  }}
                >
                  <MessageSquare size={12} /> دردشة
                  {lawyerTier === 'team' && <ChevronDown size={10} />}
                </button>

                {showChatDropdown && lawyerTier === 'team' && (
                  <div className="scale-in" style={{
                    position: 'absolute', top: '100%', right: 0, left: 0, zIndex: 50,
                    background: '#fff', borderRadius: 12, border: '1px solid var(--border)',
                    boxShadow: '0 8px 32px rgba(15,37,87,.15)', marginTop: 6, overflow: 'hidden', minWidth: 160,
                  }}>
                    {TEAM_MEMBERS.map((member) => (
                      <button key={member.id} onClick={() => selectTeamMember(member)} style={{
                        display: 'flex', alignItems: 'center', gap: 10,
                        padding: '10px 14px', border: 'none', background: 'transparent',
                        cursor: 'pointer', width: '100%', textAlign: 'right',
                        transition: 'background .15s', fontFamily: "'Cairo',sans-serif",
                      }}>
                        <span style={{ fontSize: 18 }}>{member.icon}</span>
                        <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)' }}>{member.label}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {amountRemaining > 0 && (
                <button onClick={() => setShowPayment(true)} style={{
                  display: 'inline-flex', alignItems: 'center', gap: 6,
                  background: 'var(--gold)', color: '#fff',
                  padding: '7px 12px', borderRadius: 10, fontSize: 12, fontWeight: 700,
                  border: 'none', cursor: 'pointer',
                }}>
                  <CreditCard size={12} /> سداد
                </button>
              )}
            </div>
          </div>

          {/* Aggregated Cases Display */}
          {aggregatedCases.length > 0 && (
            <div className="fade-up" style={{ padding: '12px 18px', background: '#F5F8FF', borderTop: '1px solid var(--border)' }}>
              <p style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', marginBottom: 8 }}>قضاياك ({aggregatedCases.length})</p>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {aggregatedCases.map((c) => (
                  <button
                    key={c.id}
                    onClick={() => setSelectedCase(c)}
                    style={{
                      padding: '6px 12px', borderRadius: 8, border: selectedCase?.id === c.id ? '2px solid var(--navy)' : '1px solid var(--border)',
                      background: selectedCase?.id === c.id ? '#fff' : 'transparent',
                      cursor: 'pointer', fontSize: 11, fontWeight: 700,
                      fontFamily: "'Cairo',sans-serif", transition: 'all .15s',
                    }}
                  >
                    {c.case_number}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Selected Case Details */}
          {selectedCase && (
            <div className="fade-up" style={{ padding: '12px 18px', background: '#fff', borderTop: '1px solid var(--border)' }}>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
                <Badge color="navy">{selectedCase.case_number}</Badge>
                <Badge color={/براءة/.test(selectedCase.judgment || '') ? 'green' : /انتظار/.test(selectedCase.judgment || '') ? 'orange' : 'navy'}>{selectedCase.judgment}</Badge>
                {selectedCase.case_type && <Badge color="default">{selectedCase.case_type}</Badge>}
              </div>

              {/* Billing Summary */}
              <div style={{ background: '#F5F8FF', borderRadius: 10, padding: '12px 14px' }}>
                <p style={{ fontSize: 10, fontWeight: 700, color: 'var(--muted)', marginBottom: 8 }}>ملخص الفواتير</p>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                  <span style={{ fontSize: 12, color: 'var(--text)' }}>إجمالي الأتعاب</span>
                  <span style={{ fontSize: 13, fontWeight: 800, color: 'var(--navy)', fontFamily: "'JetBrains Mono', monospace" }}>{totalFees.toLocaleString()} ج</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                  <span style={{ fontSize: 12, color: 'var(--text)' }}>المدفوع</span>
                  <span style={{ fontSize: 13, fontWeight: 800, color: 'var(--success)', fontFamily: "'JetBrains Mono', monospace" }}>{amountPaid.toLocaleString()} ج</span>
                </div>
                <div style={{ height: 1, background: 'var(--border)', margin: '8px 0' }} />
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--danger)' }}>المتبقي</span>
                  <span style={{ fontSize: 15, fontWeight: 900, color: 'var(--danger)', fontFamily: "'JetBrains Mono', monospace" }}>{amountRemaining.toLocaleString()} ج</span>
                </div>
                <div style={{ marginTop: 10, height: 6, borderRadius: 3, background: 'var(--border)', overflow: 'hidden' }}>
                  <div style={{ height: '100%', borderRadius: 3, background: 'var(--success)', width: `${totalFees ? (amountPaid / totalFees) * 100 : 0}%`, transition: 'width .5s ease' }} />
                </div>
              </div>
            </div>
          )}
        </Card>

        {/* Appointment Booking Dropdown - Dynamic from lawyer_availability */}
        {selectedCase && (
          <div ref={apptDropdownRef} style={{ position: 'relative' }}>
            <Button
              variant="gold"
              fullWidth
              onClick={() => setShowApptDropdown((v) => !v)}
              style={{ display: 'flex', alignItems: 'center', gap: 8, justifyContent: 'center' }}
            >
              <Calendar size={16} /> {apptSubmitted ? `✓ موعد يوم ${[...DAYS_OF_WEEK_STATIC].find(d => d.id === selectedDay)?.label || selectedDay}` : 'حجز موعد'}
              <ChevronDown size={12} />
            </Button>

            {showApptDropdown && !apptSubmitted && (
              <div className="scale-in" style={{
                position: 'absolute', top: '100%', right: 0, left: 0, zIndex: 50,
                background: '#fff', borderRadius: 12, border: '1px solid var(--border)',
                boxShadow: '0 8px 32px rgba(15,37,87,.15)', marginTop: 6, overflow: 'hidden',
              }}>
                <div style={{ padding: '8px 14px', borderBottom: '1px solid var(--border)' }}>
                  <p style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)' }}>
                    {availableDays.length > 0 ? 'اختر يوم الموعد (حسب مواعيد المحامي)' : 'اختر يوم الموعد'}
                  </p>
                </div>
                {(availableDays.length > 0 ? availableDays.map(dayId => DAYS_OF_WEEK_STATIC.find(d => d.id === dayId)).filter(Boolean) : DAYS_OF_WEEK_STATIC).map((day) => (
                  <button
                    key={day!.id}
                    onClick={() => submitAppointment(day!.id)}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 10,
                      padding: '10px 14px', border: 'none', background: 'transparent',
                      cursor: 'pointer', width: '100%', textAlign: 'right',
                      transition: 'background .15s', fontFamily: "'Cairo',sans-serif",
                    }}
                  >
                    <Calendar size={14} color="var(--navy)" />
                    <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)' }}>{day!.label}</span>
                    {availableSlots.length > 0 && (
                      <span style={{ fontSize: 10, color: 'var(--muted)', marginRight: 'auto' }}>
                        {availableSlots.slice(0, 3).join(' · ')}{availableSlots.length > 3 ? ' ...' : ''}
                      </span>
                    )}
                  </button>
                ))}
                {availableSlots.length > 0 && (
                  <div style={{ padding: '8px 14px', background: '#F5F8FF', borderTop: '1px solid var(--border)' }}>
                    <p style={{ fontSize: 10, color: 'var(--muted)' }}>
                      ⏰ الأوقات المتاحة: {availableSlots.join(' - ')}
                    </p>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* Payment Credentials Display - طرق الدفع والتحويل البديلة */}
        {lawyerPaymentInfo && (lawyerPaymentInfo.vodafone_cash_number || lawyerPaymentInfo.instapay_address || lawyerPaymentInfo.bank_account_details) && (
          <Card style={{ overflow: 'hidden' }}>
            <div style={{ padding: '12px 16px', background: 'linear-gradient(135deg, #F0F4FC, #E8F0FE)', borderBottom: '1px solid var(--border)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <Wallet size={16} color="var(--navy)" />
                <p style={{ fontSize: 13, fontWeight: 800, color: 'var(--navy)' }}>طرق الدفع والتحويل البديلة</p>
              </div>
              <p style={{ fontSize: 10, color: 'var(--muted)', marginTop: 4 }}>يمكنك استخدام هذه الطرق كبديل للدفع الإلكتروني</p>
            </div>
            <div style={{ padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 12 }}>
              {lawyerPaymentInfo.vodafone_cash_number && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', background: '#FFF0F0', borderRadius: 10, border: '1px solid #FFE0E0' }}>
                  <span style={{ fontSize: 20 }}>📱</span>
                  <div style={{ flex: 1 }}>
                    <p style={{ fontSize: 11, fontWeight: 700, color: '#E60000' }}>فودافون كاش</p>
                    <p style={{ fontSize: 14, fontWeight: 900, color: 'var(--text)', fontFamily: "'JetBrains Mono', monospace", direction: 'ltr', textAlign: 'left' }}>{lawyerPaymentInfo.vodafone_cash_number}</p>
                  </div>
                  <button onClick={() => { navigator.clipboard.writeText(lawyerPaymentInfo.vodafone_cash_number!); push('تم نسخ الرقم', 'success'); }} style={{ background: 'transparent', border: 'none', cursor: 'pointer', padding: 4 }}>
                    <span style={{ fontSize: 14 }}>📋</span>
                  </button>
                </div>
              )}
              {lawyerPaymentInfo.instapay_address && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', background: '#F0F8FF', borderRadius: 10, border: '1px solid #E0F0FF' }}>
                  <span style={{ fontSize: 20 }}>💳</span>
                  <div style={{ flex: 1 }}>
                    <p style={{ fontSize: 11, fontWeight: 700, color: '#0066CC' }}>InstaPay</p>
                    <p style={{ fontSize: 13, fontWeight: 900, color: 'var(--text)', fontFamily: "'JetBrains Mono', monospace", direction: 'ltr', textAlign: 'left' }}>{lawyerPaymentInfo.instapay_address}</p>
                  </div>
                  <button onClick={() => { navigator.clipboard.writeText(lawyerPaymentInfo.instapay_address!); push('تم نسخ العنوان', 'success'); }} style={{ background: 'transparent', border: 'none', cursor: 'pointer', padding: 4 }}>
                    <span style={{ fontSize: 14 }}>📋</span>
                  </button>
                </div>
              )}
              {lawyerPaymentInfo.bank_account_details && (lawyerPaymentInfo.bank_account_details.iban || lawyerPaymentInfo.bank_account_details.account_number) && (
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '12px', background: '#F8FCF8', borderRadius: 10, border: '1px solid #E8F4E8' }}>
                  <span style={{ fontSize: 20 }}>🏦</span>
                  <div style={{ flex: 1 }}>
                    <p style={{ fontSize: 11, fontWeight: 700, color: '#008800', marginBottom: 8 }}>تحويل بنكي</p>
                    {lawyerPaymentInfo.bank_account_details.bank_name && (
                      <p style={{ fontSize: 12, color: 'var(--text)', marginBottom: 4 }}>
                        <span style={{ fontWeight: 700 }}>البنك:</span> {lawyerPaymentInfo.bank_account_details.bank_name}
                      </p>
                    )}
                    {lawyerPaymentInfo.bank_account_details.account_holder && (
                      <p style={{ fontSize: 12, color: 'var(--text)', marginBottom: 4 }}>
                        <span style={{ fontWeight: 700 }}>اسم الحساب:</span> {lawyerPaymentInfo.bank_account_details.account_holder}
                      </p>
                    )}
                    {lawyerPaymentInfo.bank_account_details.iban && (
                      <p style={{ fontSize: 11, color: 'var(--text)', fontFamily: "'JetBrains Mono', monospace", direction: 'ltr', textAlign: 'left', marginBottom: 4 }}>
                        <span style={{ fontWeight: 700 }}>IBAN: </span>{lawyerPaymentInfo.bank_account_details.iban}
                      </p>
                    )}
                    {lawyerPaymentInfo.bank_account_details.account_number && (
                      <p style={{ fontSize: 11, color: 'var(--text)', fontFamily: "'JetBrains Mono', monospace", direction: 'ltr', textAlign: 'left' }}>
                        <span style={{ fontWeight: 700 }}>رقم الحساب: </span>{lawyerPaymentInfo.bank_account_details.account_number}
                      </p>
                    )}
                  </div>
                  <button onClick={() => { navigator.clipboard.writeText(lawyerPaymentInfo.bank_account_details!.iban || lawyerPaymentInfo.bank_account_details!.account_number || ''); push('تم نسخ بيانات الحساب', 'success'); }} style={{ background: 'transparent', border: 'none', cursor: 'pointer', padding: 4 }}>
                    <span style={{ fontSize: 14 }}>📋</span>
                  </button>
                </div>
              )}
            </div>
          </Card>
        )}

        {/* Emergency */}
        {emgEnabled && (!emgSent ? (
          <div style={{ position: 'relative' }}>
            <span className="ping" style={{ position: 'absolute', top: 18, right: 20, width: 13, height: 13, background: 'rgba(255,180,180,.7)', borderRadius: '50%', display: 'block', zIndex: 1 }} />
            <button className="emergency-btn" onClick={() => setShowEmg(true)}>
              <AlertTriangle size={20} style={{ display: 'inline', marginRight: 8, verticalAlign: 'middle' }} />
              زر الطوارئ العاجل<br />
              <span style={{ fontSize: 12, fontWeight: 500, opacity: 0.85 }}>اضغط لإرسال طلب فوري لمحاميك</span>
            </button>
          </div>
        ) : (
          <div className="fade-up" style={{ background: 'var(--success)', borderRadius: 16, padding: 18, color: '#fff', textAlign: 'center' }}>
            <p style={{ fontWeight: 800, fontSize: 15 }}>✅ تم إرسال طلب الطوارئ</p>
            <p style={{ fontSize: 12, opacity: 0.85, marginTop: 4 }}>سيتواصل معك {LAWYER_NAME} في أقرب وقت</p>
          </div>
        ))}

        {/* Chat window */}
        <Card style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden', flex: 1, minHeight: 380 }}>
          <div style={{ background: 'var(--navy)', padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ width: 34, height: 34, background: 'rgba(255,255,255,.15)', borderRadius: 9, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              {activeChatTarget === 'bot' ? <Bot size={16} color="#fff" /> : activeChatTarget === 'lawyer' ? <span style={{ fontSize: 14 }}>👨‍⚖️</span> : <Users size={16} color="#fff" />}
            </div>
            <div>
              <p style={{ fontWeight: 800, color: '#fff', fontSize: 13 }}>
                {activeChatTarget === 'bot' ? `مساعد الأستاذ ${LAWYER_NAME}` : activeChatLabel}
              </p>
              <p style={{ fontSize: 10, color: 'rgba(255,255,255,.5)' }}>
                {activeChatTarget === 'bot' ? 'يعمل محلياً · بدون انترنت · 24/7' : 'شات مباشر · real-time'}
              </p>
            </div>
            <div style={{ marginRight: 'auto', display: 'flex', alignItems: 'center', gap: 5 }}>
              <span className="pulse" style={{ width: 7, height: 7, background: '#4ADE80', borderRadius: '50%', display: 'inline-block' }} />
              <span style={{ fontSize: 10, color: '#4ADE80', fontWeight: 700 }}>نشط</span>
            </div>
          </div>

          <div style={{ flex: 1, overflowY: 'auto', padding: 14, display: 'flex', flexDirection: 'column', gap: 10, background: '#FAFBFE' }}>
            {msgs.map((msg) => {
              const isEmergency = msg.isEmergency || msg.text.includes('🆘') || msg.text.includes('【طلب طوارئ');
              const isSystem = msg.isSystem || msg.text.startsWith('【');
              const chatClass = msg.from === 'user'
                ? (isEmergency ? 'chat-emergency' : 'chat-me')
                : (isSystem ? 'chat-system' : (isEmergency ? 'chat-emergency' : 'chat-other'));
              return (
              <div key={msg.id} className="fade-up" style={{ display: 'flex', justifyContent: msg.from === 'user' ? 'flex-end' : 'flex-start', alignItems: 'flex-end', gap: 7 }}>
                {msg.from !== 'user' && (
                  <div style={{ width: 26, height: 26, background: isEmergency ? '#C41E3A' : msg.from === 'staff' ? 'var(--gold)' : 'var(--navy)', borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, flexShrink: 0, color: '#fff' }}>
                    {isEmergency ? '🆘' : msg.from === 'bot' ? '🤖' : msg.from === 'staff' ? '📋' : '👨‍⚖️'}
                  </div>
                )}
                <div className={chatClass} style={{ maxWidth: '78%', padding: '10px 14px', fontSize: 13, lineHeight: 1.75, whiteSpace: 'pre-line', direction: 'rtl' }}>
                  {msg.staffName && msg.from === 'staff' && <p style={{ fontSize: 10, fontWeight: 800, color: isEmergency || isSystem ? '#fff' : 'var(--gold)', marginBottom: 4 }}>{msg.staffName}</p>}
                  {msg.text}
                  <p style={{ fontSize: 9, marginTop: 4, opacity: isEmergency || isSystem ? 0.7 : 0.45, textAlign: 'left', fontFamily: "'JetBrains Mono', monospace" }}>{msg.time}</p>
                </div>
              </div>
            );})}
            <div ref={endRef} />
          </div>

          <div style={{ padding: '10px 12px', borderTop: '1px solid var(--border)', display: 'flex', gap: 8, background: '#fff' }}>
            <input value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && send()} placeholder="اكتب رسالتك للأستاذ..." dir="rtl" maxLength={2000} style={{ flex: 1, padding: '10px 14px', border: '1.5px solid var(--border)', borderRadius: 10, fontSize: 13, fontFamily: "'Cairo',sans-serif", outline: 'none' }} onFocus={(e) => { (e.currentTarget as HTMLInputElement).style.border = '1.5px solid var(--navy-mid)'; }} onBlur={(e) => { (e.currentTarget as HTMLInputElement).style.border = '1.5px solid var(--border)'; }} />
            <Button onClick={send} style={{ padding: '10px 16px' }}><Send size={16} /></Button>
          </div>
        </Card>
      </main>

      {/* Emergency Modal */}
      {showEmg && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.72)', backdropFilter: 'blur(6px)', zIndex: 999, display: 'flex', alignItems: 'flex-end', justifyContent: 'center', padding: 16 }}>
          <Card className="slide-up" style={{ width: '100%', maxWidth: 500, padding: 26 }}>
            <div style={{ textAlign: 'center', marginBottom: 20 }}>
              <div style={{ fontSize: 50, marginBottom: 10 }}>🆘</div>
              <h3 style={{ fontSize: 21, fontWeight: 900, color: 'var(--danger)', marginBottom: 6 }}>طلب طوارئ عاجل</h3>
              <p style={{ fontSize: 13, color: 'var(--muted)' }}>سيصل طلبك فوراً إلى {LAWYER_NAME}</p>
            </div>
            <textarea value={emgText} onChange={(e) => setEmgText(e.target.value)} rows={3} maxLength={500} placeholder={'اكتب احتياجاتك...'} style={{ width: '100%', padding: 14, border: '1.5px solid var(--border)', borderRadius: 12, fontSize: 13, resize: 'none', fontFamily: "'Cairo',sans-serif", outline: 'none', direction: 'rtl', marginBottom: 16, lineHeight: 1.7 }} />
            <div style={{ display: 'flex', gap: 10 }}>
              <Button variant="danger" fullWidth style={{ padding: '14px 24px', fontSize: 15 }} onClick={sendEmergency}>🚨 إرسال الطلب الآن</Button>
              <Button variant="ghost" onClick={() => setShowEmg(false)}>إلغاء</Button>
            </div>
          </Card>
        </div>
      )}

      {/* Paymob Checkout Modal */}
      {showPayment && (
        <Modal onClose={() => { if (!paymentProcessing) setShowPayment(false); }} style={{ maxWidth: 480 }}>
          <div style={{ padding: '18px 20px', borderBottom: '1px solid var(--border)' }}>
            <h3 style={{ fontWeight: 800, color: 'var(--navy)', fontSize: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
              <Wallet size={18} /> الدفع عبر Paymob
            </h3>
          </div>

          {paymentDone ? (
            <div className="fade-up" style={{ padding: 32, textAlign: 'center' }}>
              <div style={{ fontSize: 48, marginBottom: 12 }}>✅</div>
              <p style={{ fontWeight: 900, fontSize: 18, color: 'var(--success)', marginBottom: 8 }}>تمت عملية الدفع بنجاح</p>
              <p style={{ fontSize: 13, color: 'var(--muted)' }}>سيتم تحديث الفاتورة تلقائياً</p>
            </div>
          ) : (
            <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 16 }}>
              {/* Amount summary */}
              <div style={{ background: '#FFFBEB', borderRadius: 10, padding: '12px 16px', textAlign: 'center' }}>
                <p style={{ fontSize: 11, color: 'var(--muted)', fontWeight: 700 }}>المبلغ المتبقي</p>
                <p style={{ fontSize: 28, fontWeight: 900, color: 'var(--gold)', fontFamily: "'JetBrains Mono', monospace", marginTop: 4 }}>{amountRemaining.toLocaleString()} ج</p>
              </div>

              {/* Paymob Channels */}
              <p style={{ fontSize: 12, fontWeight: 700, color: 'var(--muted)' }}>اختر طريقة الدفع</p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {PAYMOB_CHANNELS.map((ch) => (
                  <button
                    key={ch.id}
                    onClick={() => setSelectedChannel(ch.id)}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 12,
                      padding: '12px 16px', borderRadius: 12,
                      border: selectedChannel === ch.id ? `2px solid ${ch.color}` : '1.5px solid var(--border)',
                      background: selectedChannel === ch.id ? `${ch.color}08` : '#fff',
                      cursor: 'pointer', transition: 'all .15s', textAlign: 'right',
                    }}
                  >
                    <span style={{ fontSize: 20, flexShrink: 0 }}>{ch.icon}</span>
                    <div style={{ flex: 1 }}>
                      <p style={{ fontSize: 13, fontWeight: 800, color: 'var(--text)' }}>{ch.label}</p>
                      <p style={{ fontSize: 11, color: 'var(--muted)' }}>{ch.desc}</p>
                    </div>
                    {selectedChannel === ch.id && (
                      <div style={{ width: 20, height: 20, borderRadius: '50%', background: ch.color, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                        <span style={{ color: '#fff', fontSize: 12, fontWeight: 900 }}>✓</span>
                      </div>
                    )}
                  </button>
                ))}
              </div>

              {/* Security notice */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 12px', background: '#F5F8FF', borderRadius: 8 }}>
                <Lock size={12} color="var(--navy)" />
                <span style={{ fontSize: 11, color: 'var(--muted)' }}>معاملات Paymob مشفرة ومحمية</span>
              </div>

              {/* Pay button */}
              <Button
                variant="gold"
                fullWidth
                disabled={!selectedChannel || paymentProcessing}
                onClick={processPayment}
                style={{ padding: '14px 24px', fontSize: 15, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}
              >
                {paymentProcessing ? <><span className="spin" style={{ display: 'inline-block', width: 16, height: 16, border: '2.5px solid rgba(255,255,255,.3)', borderTopColor: '#fff', borderRadius: '50%' }} /> جاري المعالجة...</> : <><CreditCard size={16} /> ادفع {amountRemaining.toLocaleString()} ج</>}
              </Button>
            </div>
          )}
        </Modal>
      )}
    </div>
  );
}
