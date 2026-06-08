import { useState, useEffect, useRef } from 'react';
import { Scale, LogOut, Phone, Calendar, AlertTriangle, Bot, Send, MessageSquare, Users, ChevronDown, CreditCard, Lock, Wallet, ArrowRight, Clock, ChevronLeft } from 'lucide-react';
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
  from: 'user' | 'bot' | 'lawyer' | 'staff' | 'system';
  staffName?: string;
  text: string;
  time: string;
  isEmergency?: boolean;
  isSystem?: boolean;
  attachment_url?: string;
  attachment_type?: 'image' | 'video';
  sender_id?: string;
  sender_role?: string;
}

interface AppointmentRequest {
  id: string;
  status: 'pending' | 'accepted' | 'rejected' | 'rescheduled';
  appointment_date: string;
  appointment_time: string;
  alternative_time?: string;
  reason?: string;
}

interface TeamMember {
  id: string;
  full_name: string;
  role: string;
  avatar_url?: string;
}

/* Firm roles for Team plan dropdown */
const FIRM_ROLES: Record<string, { label: string; icon: string }> = {
  lawyer: { label: 'المحامي الأساسي', icon: '👨‍⚖️' },
  secretary: { label: 'السكرتارية', icon: '📋' },
  accountant: { label: 'الحسابات', icon: '🧮' },
  assistant: { label: 'المساعد', icon: '🤝' },
};

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

/* Days of week for appointment booking */
const DAYS_OF_WEEK = [
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

/* CSS for collapsible details */
const detailsStyle = `
  details {
    background: #fff;
    border-radius: 12px;
    border: 1px solid var(--border);
    overflow: hidden;
    margin-bottom: 10px;
  }
  details summary {
    padding: 12px 16px;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: space-between;
    font-weight: 700;
    font-size: 13px;
    color: var(--navy);
    background: linear-gradient(135deg, #F5F8FF, #fff);
    transition: background .15s;
  }
  details summary::-webkit-details-marker { display: none; }
  details[open] summary {
    background: #F5F8FF;
  }
  details .details-content {
    padding: 12px 16px;
    border-top: 1px solid var(--border);
  }
  details summary svg {
    transition: transform .2s;
  }
  details[open] summary svg {
    transform: rotate(180deg);
  }
`;

export function ClientPortal({ user, profile, onLogout, urlLawyerId }: ClientPortalProps) {
  /* Full-screen mobile chat routing state */
  const [currentScreen, setCurrentScreen] = useState<'hub' | 'live_chat'>('hub');

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

  /* Simplified appointment booking state */
  const [showApptDropdown, setShowApptDropdown] = useState(false);
  const [selectedDay, setSelectedDay] = useState<string>('');
  const [timeFrom, setTimeFrom] = useState<string>('09:00');
  const [timeTo, setTimeTo] = useState<string>('17:00');
  const [apptSubmitted, setApptSubmitted] = useState(false);

  /* Payment state - Paymob */
  const [showPayment, setShowPayment] = useState(false);
  const [selectedChannel, setSelectedChannel] = useState<string>('');
  const [paymentProcessing, setPaymentProcessing] = useState(false);
  const [paymentDone, setPaymentDone] = useState(false);

  /* Lawyer availability and payment credentials */
  const [availableDays, setAvailableDays] = useState<string[]>([]);
  const [workHours, setWorkHours] = useState<{ from: string; to: string }>({ from: '09:00', to: '17:00' });
  const [lawyerPaymentInfo, setLawyerPaymentInfo] = useState<{
    vodafone_cash_number?: string;
    instapay_address?: string;
    instapay_qr_url?: string;
    bank_account_details?: {
      iban?: string;
      bank_name?: string;
      account_holder?: string;
      account_number?: string;
      country?: string;
    };
  } | null>(null);

  /* Team members for Team plan */
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([]);

  /* Appointment status tracking */
  const [appointmentStatus, setAppointmentStatus] = useState<AppointmentRequest | null>(null);
  const [showAppointmentStatus, setShowAppointmentStatus] = useState(false);

  /* Draggable bottom sheet state */
  const [sheetOpen, setSheetOpen] = useState(false);
  const [sheetY, setSheetY] = useState(0);
  const sheetRef = useRef<HTMLDivElement>(null);

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
            text: `مرحباً، أنا مساعد الأستاذ ${lawyerName}. كيف أقدر أساعدك؟`,
            time: new Date().toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' }),
          }]);
        }
      });

    // Fetch lawyer availability days and work hours
    supabase.from('lawyer_availability')
      .select('available_days, time_slots, notes')
      .eq('lawyer_id', lawyerId)
      .eq('is_active', true)
      .single()
      .then(({ data: availData }) => {
        if (availData) {
          setAvailableDays(availData.available_days || []);
          if (availData.time_slots?.length > 0) {
            const sorted = [...availData.time_slots].sort();
            setWorkHours({ from: sorted[0], to: sorted[sorted.length - 1] });
          }
        }
      });

    // Fetch lawyer's QR code for InstaPay
    supabase.storage.from('documents').list(`qr-codes/${lawyerId}`).then(({ data: qrData }) => {
      if (qrData && qrData.length > 0) {
        const { data: urlData } = supabase.storage.from('documents').getPublicUrl(`qr-codes/${lawyerId}/${qrData[0].name}`);
        if (urlData?.publicUrl) {
          setLawyerPaymentInfo((prev) => prev ? { ...prev, instapay_qr_url: urlData.publicUrl } : { instapay_qr_url: urlData.publicUrl });
        }
      }
    });

    // Fetch team members if lawyer is on Team plan
    supabase.from('profiles')
      .select('id,full_name,role,avatar_url')
      .eq('master_lawyer_id', lawyerId)
      .in('role', ['lawyer', 'secretary', 'accountant', 'assistant'])
      .then(({ data: teamData }) => {
        if (teamData && teamData.length > 0) {
          setTeamMembers(teamData);
        }
      });

    // Also add main lawyer to team members
    supabase.from('profiles')
      .select('id,full_name,role,avatar_url')
      .eq('id', lawyerId)
      .single()
      .then(({ data: mainLawyer }) => {
        if (mainLawyer) {
          setTeamMembers((prev) => [{ ...mainLawyer, role: 'lawyer' }, ...prev.filter((m) => m.id !== mainLawyer.id)]);
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

  /* REAL-TIME MESSAGES SUBSCRIPTION - Human chat (separate from bot) */
  useEffect(() => {
    if (!selectedCase) return;

    const ch = supabase
      .channel('messages:' + selectedCase.id)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages', filter: `case_id=eq.${selectedCase.id}` }, (payload) => {
        const msg = payload.new as any;
        // Detect system messages (emergency alerts)
        const isSystemMessage = msg.message_text?.startsWith('【') || msg.sender_role === 'system';

        if (msg.sender_id !== user.id || isSystemMessage) {
          setMsgs((prev) => [...prev, {
            id: msg.id,
            from: isSystemMessage ? 'system' : msg.sender_role === 'lawyer' ? 'lawyer' : msg.sender_role === 'staff' || msg.sender_role === 'secretary' || msg.sender_role === 'accountant' ? 'staff' : 'lawyer',
            text: msg.message_text,
            time: new Date(msg.created_at).toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' }),
            attachment_url: msg.attachment_url,
            attachment_type: msg.attachment_type,
            isSystem: isSystemMessage,
            isEmergency: msg.message_text?.includes('طوارئ') || msg.message_text?.includes('🆘'),
            sender_id: msg.sender_id,
            sender_role: msg.sender_role,
          }]);
        }
      })
      .subscribe();

    return () => { ch.unsubscribe(); };
  }, [selectedCase?.id, user.id]);

  /* REAL-TIME APPOINTMENT STATUS SUBSCRIPTION */
  useEffect(() => {
    const ch = supabase
      .channel('appointment_status:' + user.id)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'appointment_requests', filter: `client_id=eq.${user.id}` }, (payload) => {
        const appt = payload.new as AppointmentRequest;
        setAppointmentStatus(appt);
        setShowAppointmentStatus(true);
        if (appt.status === 'accepted') {
          push('✅ تم قبول طلب الموعد!', 'success');
        } else if (appt.status === 'rejected') {
          push('❌ تم رفض طلب الموعد', 'danger');
        } else if (appt.status === 'rescheduled') {
          push(`📅 اقتراح موعد بديل: ${appt.alternative_time}`, 'warning');
        }
      })
      .subscribe();

    return () => { ch.unsubscribe(); };
  }, [user.id, push]);

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [msgs]);

  /* LOCAL BOT PROCESSING - No database inserts for bot inquiries */
  const botReply = async (text: string): Promise<string> => {
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

  const send = async (attachment?: File) => {
    if (!input.trim() && !attachment) return;
    const { allowed } = checkFloodLimit();
    if (!allowed) { push('⚠️ إرسال سريع جداً! انتظر قليلاً', 'warning'); return; }
    const txt = input;
    const userMsgTime = new Date().toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' });

    let attachmentUrl: string | undefined;
    let attachmentType: 'image' | 'video' | undefined;

    // Handle file upload for human chat (not bot)
    if (attachment && selectedCase && activeChatTarget !== 'bot') {
      const path = `chat/${selectedCase.id}/${Date.now()}_${attachment.name}`;
      const { error: uploadErr } = await supabase.storage.from('documents').upload(path, attachment);
      if (!uploadErr) {
        const { data } = supabase.storage.from('documents').getPublicUrl(path);
        attachmentUrl = data?.publicUrl;
        attachmentType = attachment.type.startsWith('image/') ? 'image' : attachment.type.startsWith('video/') ? 'video' : undefined;
      }
    }

    setMsgs((p) => [...p, { id: 'u' + Date.now(), from: 'user', text: txt, time: userMsgTime, attachment_url: attachmentUrl, attachment_type: attachmentType }]);
    setInput('');

    /* LOCAL BOT MODE: Process entirely locally, no DB insert - TEXT ONLY */
    if (activeChatTarget === 'bot') {
      const reply = await botReply(txt);
      setTimeout(() => setMsgs((p) => [...p, { id: 'b' + Date.now(), from: 'bot', text: reply, time: new Date().toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' }) }]), 420);
      return;
    }

    /* REMOTE MODE: Insert to messages table for real-time chat with lawyer/staff */
    if (selectedCase) {
      await supabase.from('messages').insert([{
        case_id: selectedCase.id,
        sender_id: user.id,
        sender_role: 'client',
        message_text: sanitize(txt),
        attachment_url: attachmentUrl,
        attachment_type: attachmentType,
      }]);
    }
  };

  /* Generate Vodafone Cash USSD deep link */
  const getVodafoneUSSD = (amount: number) => {
    const vodafoneNumber = lawyerPaymentInfo?.vodafone_cash_number;
    if (!vodafoneNumber) return null;
    // USSD format: *9*7*NUMBER*AMOUNT#
    const ussd = `*9*7*${vodafoneNumber.replace(/\D/g, '')}*${amount}%23`;
    return `tel:${ussd}`;
  };

  /* Open InstaPay app */
  const openInstaPay = () => {
    window.location.href = 'instapay://';
  };

  /* Copy InstaPay ID */
  const copyInstaPayId = () => {
    if (lawyerPaymentInfo?.instapay_address) {
      navigator.clipboard.writeText(lawyerPaymentInfo.instapay_address);
      push('✓ تم نسخ معرف InstaPay', 'success');
    }
  };

  const sendEmergency = async () => {
    const { allowed } = checkFloodLimit();
    if (!allowed) { push('⚠️ تم استخدام زر الطوارئ مرتين في دقيقة واحدة', 'warning'); return; }
    if (selectedCase && emgText.trim()) {
      const emergencyMessage = `🆘 [طلب طوارئ عاجل]: ${sanitize(emgText)}`;

      const success = await triggerEmergency({
        caseId: selectedCase.id,
        createdBy: user.id,
        essentialNeeds: emergencyMessage,
        emergencyCosts: 0,
      });

      if (success) {
        const lawyerId = urlLawyerId || profile?.linked_lawyer_id;

        // SYSTEM-INFUSED EMERGENCY TRIGGER: Insert styled system message into messages table
        const systemEmergencyText = `【حالة طوارئ عاجلة من الموكل】\n${sanitize(emgText)}`;
        await supabase.from('messages').insert([{
          case_id: selectedCase.id,
          sender_id: user.id,
          sender_role: 'client',
          message_text: systemEmergencyText,
        }]);

        if (lawyerId) sendPushToClient(lawyerId, '🆘 طلب طوارئ عاجل!', emgText);
        setMsgs((p) => [...p, {
          id: 'emg' + Date.now(),
          from: 'user',
          text: emergencyMessage,
          time: new Date().toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' }),
          isEmergency: true,
        }]);
      }
    }
    setEmgSent(true); setShowEmg(false);
  };

  /* SIMPLIFIED BOOKING ENGINE - Submit with time range */
  const submitAppointment = async () => {
    if (!selectedCase || !selectedDay) {
      push('اختر يوم الموعد', 'warning');
      return;
    }
    if (!timeFrom || !timeTo) {
      push('حدد وقت البداية والنهاية', 'warning');
      return;
    }

    const timeRange = `${timeFrom} - ${timeTo}`;
    const dayLabel = DAYS_OF_WEEK.find(d => d.id === selectedDay)?.label || selectedDay;
    const lawyerId = lawyerInfo?.id || urlLawyerId || profile?.linked_lawyer_id;
    const clientName = profile?.full_name || selectedCase.client_name || 'موكل';
    const caseNumber = selectedCase.case_number;

    const { error } = await supabase.from('appointment_requests').insert([{
      case_id: selectedCase.id,
      client_id: user.id,
      lawyer_id: lawyerId,
      appointment_date: selectedDay,
      appointment_time: timeRange,
      reason: `طلب موعد من ${clientName} | قضية: ${caseNumber} | ${dayLabel} (${timeRange})`,
    }]);

    if (error) {
      push('خطأ في إرسال الطلب', 'danger');
      return;
    }

    await supabase.from('case_events').insert([{
      case_id: selectedCase.id,
      event_type: 'APPOINTMENT_REQUESTED',
      event_description: `📅 طلب حجز موعد: ${clientName} (${caseNumber}) - ${dayLabel} (${timeRange})`,
    }]);

    push('✓ تم إرسال طلب الموعد', 'success');
    setApptSubmitted(true);
    setShowApptDropdown(false);
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

  /* TIER-BASED CHAT TRIGGERS */
  /* UNIVERSAL CHAT - Bot always available, team shows all members */
  const handleChatClick = () => {
    // Always show dropdown to let user choose bot or live chat
    setShowChatDropdown((v) => !v);
  };

  const selectTeamMember = (member: typeof TEAM_MEMBERS[0]) => {
    setActiveChatTarget('staff');
    setActiveChatLabel(member.label);
    setShowChatDropdown(false);
    setCurrentScreen('live_chat');
  };

  const selectBotMode = () => {
    setActiveChatTarget('bot');
    setActiveChatLabel(`مساعد الأستاذ ${LAWYER_NAME}`);
    setShowChatDropdown(false);
    setCurrentScreen('live_chat');
  };

  const selectLawyerDirect = () => {
    setActiveChatTarget('lawyer');
    setActiveChatLabel(LAWYER_NAME);
    setShowChatDropdown(false);
    setCurrentScreen('live_chat');
  };

  const exitLiveChat = () => {
    setCurrentScreen('hub');
    setActiveChatTarget('bot');
    setActiveChatLabel('المساعد الذكي');
  };

  /* ==================== FULL-SCREEN LIVE CHAT MODE ==================== */
  if (currentScreen === 'live_chat') {
    return (
      <div style={{ minHeight: '100vh', background: 'var(--bg)', display: 'flex', flexDirection: 'column' }}>
        <NotificationUI list={notifList} />

        <header style={{
          background: 'var(--navy)', color: '#fff', padding: '0 16px', height: 56,
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          position: 'sticky', top: 0, zIndex: 100,
          boxShadow: '0 2px 20px rgba(15,37,87,.3)',
        }}>
          <button onClick={exitLiveChat} style={{ background: 'rgba(255,255,255,.1)', border: '1px solid rgba(255,255,255,.2)', color: '#fff', padding: '6px 14px', borderRadius: 10, cursor: 'pointer', fontSize: 13, fontFamily: "'Cairo',sans-serif", fontWeight: 700, display: 'flex', alignItems: 'center', gap: 6 }}>
            <ArrowRight size={14} /> رجوع للرئيسية
          </button>

          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ width: 36, height: 36, background: 'rgba(255,255,255,.15)', borderRadius: 9, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              {activeChatTarget === 'bot' ? <Bot size={16} color="#fff" /> : activeChatTarget === 'lawyer' ? <span style={{ fontSize: 16 }}>👨‍⚖️</span> : <Users size={16} color="#fff" />}
            </div>
            <div>
              <p style={{ fontWeight: 800, fontSize: 14 }}>{activeChatTarget === 'bot' ? `مساعد الأستاذ ${LAWYER_NAME}` : activeChatLabel}</p>
              <p style={{ fontSize: 10, opacity: 0.6, display: 'flex', alignItems: 'center', gap: 4 }}>
                <span className="pulse" style={{ width: 6, height: 6, background: '#4ADE80', borderRadius: '50%', display: 'inline-block' }} />
                {activeChatTarget === 'bot' ? 'محلي · 24/7' : 'مباشر · real-time'}
              </p>
            </div>
          </div>

          <div style={{ width: 36 }} />
        </header>

        <div style={{ flex: 1, overflowY: 'auto', padding: 14, display: 'flex', flexDirection: 'column', gap: 10, background: '#FAFBFE' }}>
          {msgs.map((msg) => {
            const isEmergency = msg.isEmergency || msg.text.startsWith('🆘') || msg.text.includes('【حالة طوارئ');
            const isSystem = msg.isSystem || msg.from === 'system' || msg.text.startsWith('【');
            const chatClass = msg.from === 'user' ? (isEmergency ? 'chat-emergency' : 'chat-me') : (isSystem ? 'chat-system' : (isEmergency ? 'chat-emergency' : 'chat-other'));
            return (
              <div key={msg.id} className="fade-up" style={{ display: 'flex', justifyContent: msg.from === 'user' ? 'flex-end' : 'flex-start', alignItems: 'flex-end', gap: 7 }}>
                {msg.from !== 'user' && (
                  <div style={{
                    width: 32, height: 32,
                    background: isSystem && isEmergency ? '#C41E3A' : isSystem ? 'var(--navy)' : msg.from === 'staff' ? 'var(--gold)' : 'var(--navy)',
                    borderRadius: 10,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 14, flexShrink: 0, color: '#fff',
                    boxShadow: isEmergency ? '0 0 12px rgba(196,30,58,.4)' : 'none',
                  }}>
                    {isSystem && isEmergency ? '🆘' : isSystem ? '⚠️' : msg.from === 'bot' ? '🤖' : msg.from === 'staff' ? '📋' : '👨‍⚖️'}
                  </div>
                )}
                <div className={chatClass} style={{
                  maxWidth: '85%', padding: '12px 16px', fontSize: 14, lineHeight: 1.8,
                  whiteSpace: 'pre-line', direction: 'rtl',
                  background: isSystem && isEmergency ? 'linear-gradient(135deg, #C41E3A, #8B0000)' : undefined,
                }}>
                  {msg.staffName && msg.from === 'staff' && <p style={{ fontSize: 10, fontWeight: 800, color: isEmergency || isSystem ? '#fff' : 'var(--gold)', marginBottom: 4 }}>{msg.staffName}</p>}
                  {/* Render attachments for human chat only */}
                  {msg.attachment_url && msg.attachment_type === 'image' && activeChatTarget !== 'bot' && (
                    <img src={msg.attachment_url} alt="" style={{ maxWidth: '100%', borderRadius: 8, marginBottom: msg.text ? 8 : 0 }} />
                  )}
                  {msg.attachment_url && msg.attachment_type === 'video' && activeChatTarget !== 'bot' && (
                    <video src={msg.attachment_url} controls style={{ maxWidth: '100%', borderRadius: 8, marginBottom: msg.text ? 8 : 0 }} />
                  )}
                  {msg.text}
                  <p style={{ fontSize: 9, marginTop: 6, opacity: isEmergency || isSystem ? 0.8 : 0.5, textAlign: 'left', fontFamily: "'JetBrains Mono', monospace" }}>{msg.time}</p>
                </div>
              </div>
            );
          })}
          <div ref={endRef} />
        </div>

        <div style={{ padding: '12px 16px', borderTop: '1px solid var(--border)', display: 'flex', gap: 10, background: '#fff', paddingBottom: 'env(safe-area-inset-bottom, 12px)' }}>
          {/* File attachment button - only for human chat */}
          {activeChatTarget !== 'bot' && (
            <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 44, height: 44, background: '#F5F8FF', borderRadius: 12, cursor: 'pointer' }}>
              <input
                type="file"
                accept="image/*,video/*"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) send(file);
                }}
                style={{ display: 'none' }}
              />
              <span style={{ fontSize: 20 }}>📷</span>
            </label>
          )}
          <input value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && send()} placeholder={activeChatTarget === 'bot' ? 'اكتب سؤالك للمساعد...' : 'اكتب رسالتك...'} dir="rtl" maxLength={2000} style={{ flex: 1, padding: '12px 16px', border: '1.5px solid var(--border)', borderRadius: 12, fontSize: 14, fontFamily: "'Cairo',sans-serif", outline: 'none', background: '#FAFBFE' }} onFocus={(e) => { (e.currentTarget as HTMLInputElement).style.border = '1.5px solid var(--navy-mid)'; }} onBlur={(e) => { (e.currentTarget as HTMLInputElement).style.border = '1.5px solid var(--border)'; }} />
          <Button onClick={() => send()} style={{ padding: '12px 20px', minWidth: 56 }}><Send size={18} /></Button>
        </div>
      </div>
    );
  }

  /* ==================== HUB MODE (Default) ==================== */
  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)', display: 'flex', flexDirection: 'column' }}>
      <style>{detailsStyle}</style>
      <NotificationUI list={notifList} />

      <header style={{ background: 'var(--navy)', color: '#fff', padding: '0 16px', height: 56, display: 'flex', alignItems: 'center', justifyContent: 'space-between', position: 'sticky', top: 0, zIndex: 100 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ width: 32, height: 32, background: 'rgba(255,255,255,.15)', borderRadius: 9, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Scale size={16} color="var(--gold)" /></div>
          <div>
            <p style={{ fontWeight: 900, fontSize: 15, fontFamily: "'Tajawal', sans-serif" }}>مُحكَم</p>
            <p style={{ fontSize: 10, opacity: 0.6 }}>بوابة الموكل</p>
          </div>
        </div>
        <button onClick={onLogout} style={{ background: 'rgba(255,255,255,.1)', border: '1px solid rgba(255,255,255,.2)', color: '#fff', padding: '6px 14px', borderRadius: 10, cursor: 'pointer', fontSize: 12, fontFamily: "'Cairo',sans-serif", fontWeight: 700, display: 'flex', alignItems: 'center', gap: 6 }}><LogOut size={12} /> خروج</button>
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

            <div style={{ display: 'flex', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
              {LAWYER_PHONE && <a href={`tel:${LAWYER_PHONE}`} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: 'rgba(255,255,255,.18)', color: '#fff', padding: '7px 12px', borderRadius: 10, fontSize: 12, fontWeight: 700, textDecoration: 'none', border: '1px solid rgba(255,255,255,.25)' }}><Phone size={12} /> اتصال</a>}

              <div ref={chatDropdownRef} style={{ position: 'relative' }}>
                <button onClick={handleChatClick} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: 'rgba(255,255,255,.25)', color: '#fff', padding: '7px 12px', borderRadius: 10, fontSize: 12, fontWeight: 700, border: '1px solid rgba(255,255,255,.3)', cursor: 'pointer' }}><MessageSquare size={12} /> دردشة<ChevronDown size={10} /></button>

                {showChatDropdown && (
                  <div className="scale-in" style={{ position: 'absolute', top: '100%', right: 0, left: 0, zIndex: 50, background: '#fff', borderRadius: 12, border: '1px solid var(--border)', boxShadow: '0 8px 32px rgba(15,37,87,.15)', marginTop: 6, overflow: 'hidden', minWidth: 180 }}>
                    {/* Bot - Universal for ALL tiers */}
                    <button onClick={selectBotMode} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 14px', border: 'none', background: activeChatTarget === 'bot' ? '#F5F8FF' : 'transparent', cursor: 'pointer', width: '100%', textAlign: 'right', transition: 'background .15s', fontFamily: "'Cairo',sans-serif", borderBottom: '1px solid var(--border)' }}>
                      <span style={{ fontSize: 18 }}>🤖</span>
                      <div style={{ flex: 1 }}><p style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)' }}>المساعد الذكي</p><p style={{ fontSize: 10, color: 'var(--muted)' }}>يعمل محلياً بدون انترنت</p></div>
                    </button>

                    {/* Team tier - Show dynamic firm members from database */}
                    {lawyerTier === 'team' && teamMembers.length > 0 && teamMembers.map((member) => {
                      const roleInfo = FIRM_ROLES[member.role] || FIRM_ROLES.lawyer;
                      return (
                        <button key={member.id} onClick={() => {
                          setActiveChatTarget('staff');
                          setActiveChatLabel(member.full_name);
                          setShowChatDropdown(false);
                          setCurrentScreen('live_chat');
                        }} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 14px', border: 'none', background: 'transparent', cursor: 'pointer', width: '100%', textAlign: 'right', transition: 'background .15s', fontFamily: "'Cairo',sans-serif" }}>
                          <div style={{ width: 32, height: 32, borderRadius: '50%', background: 'var(--bg)', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
                            {member.avatar_url ? <img src={member.avatar_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <span style={{ fontSize: 14 }}>{roleInfo.icon}</span>}
                          </div>
                          <div style={{ flex: 1 }}>
                            <p style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)' }}>{member.full_name}</p>
                            <p style={{ fontSize: 10, color: 'var(--muted)' }}>{roleInfo.label}</p>
                          </div>
                        </button>
                      );
                    })}

                    {/* Free/Premium tiers - Direct lawyer chat */}
                    {lawyerTier !== 'team' && (
                      <button onClick={selectLawyerDirect} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 14px', border: 'none', background: 'transparent', cursor: 'pointer', width: '100%', textAlign: 'right', transition: 'background .15s', fontFamily: "'Cairo',sans-serif" }}>
                        <span style={{ fontSize: 18 }}>👨‍⚖️</span><span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)' }}>{LAWYER_NAME}</span>
                      </button>
                    )}
                  </div>
                )}
              </div>

              {amountRemaining > 0 && <button onClick={() => setShowPayment(true)} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: 'var(--gold)', color: '#fff', padding: '7px 12px', borderRadius: 10, fontSize: 12, fontWeight: 700, border: 'none', cursor: 'pointer' }}><CreditCard size={12} /> سداد</button>}
            </div>
          </div>

          {/* Aggregated Cases */}
          {aggregatedCases.length > 0 && (
            <div className="fade-up" style={{ padding: '12px 18px', background: '#F5F8FF', borderTop: '1px solid var(--border)' }}>
              <p style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', marginBottom: 8 }}>قضاياك ({aggregatedCases.length})</p>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {aggregatedCases.map((c) => (
                  <button key={c.id} onClick={() => setSelectedCase(c)} style={{ padding: '6px 12px', borderRadius: 8, border: selectedCase?.id === c.id ? '2px solid var(--navy)' : '1px solid var(--border)', background: selectedCase?.id === c.id ? '#fff' : 'transparent', cursor: 'pointer', fontSize: 11, fontWeight: 700, fontFamily: "'Cairo',sans-serif", transition: 'all .15s' }}>{c.case_number}</button>
                ))}
              </div>
            </div>
          )}

          {/* Selected Case Details + COLLAPSIBLE BILLING ACCORDION */}
          {selectedCase && (
            <div className="fade-up" style={{ padding: '12px 18px', background: '#fff', borderTop: '1px solid var(--border)' }}>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
                <Badge color="navy">{selectedCase.case_number}</Badge>
                <Badge color={/براءة/.test(selectedCase.judgment || '') ? 'green' : /انتظار/.test(selectedCase.judgment || '') ? 'orange' : 'navy'}>{selectedCase.judgment}</Badge>
                {selectedCase.case_type && <Badge color="default">{selectedCase.case_type}</Badge>}
              </div>

              {/* COLLAPSIBLE BILLING ACCORDION */}
              <details>
                <summary style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <CreditCard size={14} color="var(--navy)" />
                  <span>ملخص الفواتير</span>
                  <ChevronLeft size={14} style={{ marginRight: 'auto' }} />
                </summary>
                <div className="details-content">
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
              </details>
            </div>
          )}
        </Card>

        {/* UNIVERSAL APPOINTMENT BOOKING - Swipeable Bottom Sheet */}
        {selectedCase && (
          <>
            <Button variant="gold" fullWidth onClick={() => setSheetOpen(true)} style={{ display: 'flex', alignItems: 'center', gap: 8, justifyContent: 'center' }}>
              <Calendar size={16} /> {apptSubmitted ? `✓ تم إرسال الطلب` : 'حجز موعد'}
            </Button>

            {showAppointmentStatus && appointmentStatus && (
              <div className="fade-up" style={{ padding: '14px 16px', borderRadius: 12, background: appointmentStatus.status === 'accepted' ? '#E6F7EF' : appointmentStatus.status === 'rejected' ? '#FDECEF' : '#FFFBEB', border: `1px solid ${appointmentStatus.status === 'accepted' ? '#22C55E' : appointmentStatus.status === 'rejected' ? '#EF4444' : '#F59E0B'}` }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  {appointmentStatus.status === 'accepted' ? <span style={{ fontSize: 24 }}>✅</span> : appointmentStatus.status === 'rejected' ? <span style={{ fontSize: 24 }}>❌</span> : <span style={{ fontSize: 24 }}>📅</span>}
                  <div style={{ flex: 1 }}>
                    <p style={{ fontWeight: 800, fontSize: 14, color: appointmentStatus.status === 'accepted' ? '#22C55E' : appointmentStatus.status === 'rejected' ? '#EF4444' : '#F59E0B' }}>
                      {appointmentStatus.status === 'accepted' ? 'تم قبول الموعد!' : appointmentStatus.status === 'rejected' ? 'تم رفض الموعد' : 'اقتراح موعد بديل'}
                    </p>
                    <p style={{ fontSize: 12, color: 'var(--muted)' }}>
                      {appointmentStatus.alternative_time || `${appointmentStatus.appointment_date} • ${appointmentStatus.appointment_time}`}
                    </p>
                  </div>
                  <button onClick={() => setShowAppointmentStatus(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 18 }}>×</button>
                </div>
              </div>
            )}
          </>
        )}

        {/* DRAGGABLE BOTTOM SHEET FOR APPOINTMENT */}
        {sheetOpen && (
          <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.5)', zIndex: 1000, display: 'flex', flexDirection: 'column', justifyContent: 'flex-end' }} onClick={() => setSheetOpen(false)}>
            <div
              ref={sheetRef}
              className="slide-up"
              onClick={(e) => e.stopPropagation()}
              style={{
                background: '#fff',
                borderRadius: '20px 20px 0 0',
                padding: '16px 20px 32px',
                maxHeight: '85vh',
                overflowY: 'auto',
                boxShadow: '0 -8px 32px rgba(0,0,0,.15)',
              }}
            >
              {/* Drag Handle */}
              <div style={{ width: 40, height: 4, background: 'var(--border)', borderRadius: 2, margin: '0 auto 16px' }} />

              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
                <h3 style={{ fontSize: 18, fontWeight: 900, color: 'var(--navy)' }}>📅 حجز موعد</h3>
                <button onClick={() => setSheetOpen(false)} style={{ background: 'var(--bg)', border: 'none', borderRadius: '50%', width: 32, height: 32, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>×</button>
              </div>

              {/* Lawyer's working hours info */}
              {availableDays.length > 0 && (
                <div style={{ padding: '10px 14px', background: '#F5F8FF', borderRadius: 10, marginBottom: 16 }}>
                  <p style={{ fontSize: 11, color: 'var(--muted)' }}>أيام العمل: {availableDays.map(d => DAYS_OF_WEEK.find(day => day.id === d)?.label).join(' • ')}</p>
                  <p style={{ fontSize: 11, color: 'var(--muted)' }}>ساعات العمل: {workHours.from} - {workHours.to}</p>
                </div>
              )}

              {/* Day Selection */}
              <div style={{ marginBottom: 16 }}>
                <p style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)', marginBottom: 10 }}>اختر اليوم</p>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                  {(availableDays.length > 0 ? availableDays : DAYS_OF_WEEK.map(d => d.id)).map((dayId) => {
                    const day = DAYS_OF_WEEK.find(d => d.id === dayId);
                    if (!day) return null;
                    return (
                      <button
                        key={day.id}
                        onClick={() => setSelectedDay(day.id)}
                        style={{
                          padding: '10px 16px', borderRadius: 99,
                          border: selectedDay === day.id ? '2px solid var(--navy)' : '1px solid var(--border)',
                          background: selectedDay === day.id ? 'var(--navy)' : '#fff',
                          cursor: 'pointer', fontFamily: "'Cairo',sans-serif",
                          transition: 'all .15s',
                        }}
                      >
                        <span style={{ fontSize: 13, fontWeight: 700, color: selectedDay === day.id ? '#fff' : 'var(--text)' }}>{day.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Time Range */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 20 }}>
                <div>
                  <p style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)', marginBottom: 8 }}>من الساعة</p>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '12px 14px', background: '#F5F8FF', borderRadius: 10, border: '1.5px solid var(--border)' }}>
                    <Clock size={16} color="var(--navy)" />
                    <input type="time" value={timeFrom} onChange={(e) => setTimeFrom(e.target.value)} style={{ flex: 1, border: 'none', background: 'transparent', fontSize: 15, fontFamily: "'JetBrains Mono', monospace" }} />
                  </div>
                </div>
                <div>
                  <p style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)', marginBottom: 8 }}>إلى الساعة</p>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '12px 14px', background: '#F5F8FF', borderRadius: 10, border: '1.5px solid var(--border)' }}>
                    <Clock size={16} color="var(--navy)" />
                    <input type="time" value={timeTo} onChange={(e) => setTimeTo(e.target.value)} style={{ flex: 1, border: 'none', background: 'transparent', fontSize: 15, fontFamily: "'JetBrains Mono', monospace" }} />
                  </div>
                </div>
              </div>

              <Button variant="gold" fullWidth onClick={() => { submitAppointment(); setSheetOpen(false); }} disabled={!selectedDay} style={{ padding: '16px 24px', fontSize: 16 }}>
                {selectedDay ? 'تأكيد الحجز' : 'اختر اليوم أولاً'}
              </Button>
            </div>
          </div>
        )}

        {/* COLLAPSIBLE PAYMENT CREDENTIALS ACCORDION WITH DEEP LINKS */}
        {lawyerPaymentInfo && (lawyerPaymentInfo.vodafone_cash_number || lawyerPaymentInfo.instapay_address || lawyerPaymentInfo.bank_account_details) && (
          <details>
            <summary style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <Wallet size={14} color="var(--navy)" />
              <span>طرق الدفع والتحويل البديلة</span>
              <ChevronLeft size={14} style={{ marginRight: 'auto' }} />
            </summary>
            <div className="details-content" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {/* Vodafone Cash with USSD deep link */}
              {lawyerPaymentInfo.vodafone_cash_number && (
                <div style={{ padding: '12px', background: '#FFF5F5', borderRadius: 12, border: '1px solid #FFE0E0' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
                    <div style={{ width: 40, height: 40, borderRadius: 10, background: '#E60000', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><span style={{ color: '#fff', fontSize: 20 }}>📱</span></div>
                    <div style={{ flex: 1 }}>
                      <p style={{ fontSize: 13, fontWeight: 800, color: '#E60000' }}>فودافون كاش</p>
                      <p style={{ fontSize: 11, color: 'var(--muted)' }}>اضغط للتحويل مباشرة</p>
                    </div>
                  </div>
                  <p style={{ fontSize: 14, fontWeight: 900, color: 'var(--text)', fontFamily: "'JetBrains Mono', monospace", direction: 'ltr', textAlign: 'center', marginBottom: 10 }}>{lawyerPaymentInfo.vodafone_cash_number}</p>
                  {amountRemaining > 0 && (
                    <a href={getVodafoneUSSD(amountRemaining)!} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, background: '#E60000', color: '#fff', padding: '12px 20px', borderRadius: 10, textDecoration: 'none', fontWeight: 800, fontSize: 14 }}>
                      <Phone size={16} /> تحويل {amountRemaining.toLocaleString()} ج
                    </a>
                  )}
                </div>
              )}

              {/* InstaPay with QR and deep link */}
              {lawyerPaymentInfo.instapay_address && (
                <div style={{ padding: '12px', background: '#F5F8FF', borderRadius: 12, border: '1px solid #E0E8FF' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
                    <div style={{ width: 40, height: 40, borderRadius: 10, background: '#635BFF', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><span style={{ color: '#fff', fontSize: 20 }}>💳</span></div>
                    <div style={{ flex: 1 }}>
                      <p style={{ fontSize: 13, fontWeight: 800, color: '#635BFF' }}>InstaPay</p>
                      <p style={{ fontSize: 11, color: 'var(--muted)' }}>نسخ المعرّف أو فتح التطبيق</p>
                    </div>
                  </div>

                  {/* QR Code Image */}
                  {lawyerPaymentInfo.instapay_qr_url && (
                    <div style={{ textAlign: 'center', marginBottom: 10 }}>
                      <img src={lawyerPaymentInfo.instapay_qr_url} alt="InstaPay QR Code" style={{ width: 120, height: 120, borderRadius: 12, border: '2px solid #E0E8FF' }} />
                    </div>
                  )}

                  <p style={{ fontSize: 12, fontWeight: 900, color: 'var(--text)', fontFamily: "'JetBrains Mono', monospace", direction: 'ltr', textAlign: 'center', marginBottom: 10 }}>{lawyerPaymentInfo.instapay_address}</p>

                  <div style={{ display: 'flex', gap: 8 }}>
                    <button onClick={copyInstaPayId} style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, background: '#E0E8FF', color: '#635BFF', padding: '10px 14px', borderRadius: 8, border: 'none', cursor: 'pointer', fontWeight: 700, fontSize: 12 }}>
                      📋 نسخ المعرّف
                    </button>
                    <button onClick={openInstaPay} style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, background: '#635BFF', color: '#fff', padding: '10px 14px', borderRadius: 8, border: 'none', cursor: 'pointer', fontWeight: 700, fontSize: 12 }}>
                      🚀 فتح InstaPay
                    </button>
                  </div>
                </div>
              )}

              {/* Bank Account */}
              {lawyerPaymentInfo.bank_account_details && (lawyerPaymentInfo.bank_account_details.iban || lawyerPaymentInfo.bank_account_details.account_number) && (
                <div style={{ padding: '12px', background: '#F8FCF8', borderRadius: 12, border: '1px solid #E8F4E8' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
                    <div style={{ width: 40, height: 40, borderRadius: 10, background: '#008800', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><span style={{ color: '#fff', fontSize: 20 }}>🏦</span></div>
                    <div style={{ flex: 1 }}>
                      <p style={{ fontSize: 13, fontWeight: 800, color: '#008800' }}>تحويل بنكي</p>
                      <p style={{ fontSize: 11, color: 'var(--muted)' }}>بيانات الحساب البنكي</p>
                    </div>
                  </div>
                  {lawyerPaymentInfo.bank_account_details.bank_name && <p style={{ fontSize: 12, color: 'var(--text)', marginBottom: 4 }}><span style={{ fontWeight: 700 }}>البنك:</span> {lawyerPaymentInfo.bank_account_details.bank_name}</p>}
                  {lawyerPaymentInfo.bank_account_details.account_holder && <p style={{ fontSize: 12, color: 'var(--text)', marginBottom: 4 }}><span style={{ fontWeight: 700 }}>الحساب:</span> {lawyerPaymentInfo.bank_account_details.account_holder}</p>}
                  {lawyerPaymentInfo.bank_account_details.iban && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 8 }}>
                      <p style={{ flex: 1, fontSize: 10, color: 'var(--text)', fontFamily: "'JetBrains Mono', monospace", direction: 'ltr' }}>{lawyerPaymentInfo.bank_account_details.iban}</p>
                      <button onClick={() => { navigator.clipboard.writeText(lawyerPaymentInfo.bank_account_details!.iban!); push('تم نسخ IBAN', 'success'); }} style={{ background: 'transparent', border: 'none', cursor: 'pointer', padding: 4 }}><span style={{ fontSize: 14 }}>📋</span></button>
                    </div>
                  )}
                </div>
              )}
            </div>
          </details>
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
            <h3 style={{ fontWeight: 800, color: 'var(--navy)', fontSize: 16, display: 'flex', alignItems: 'center', gap: 8 }}><Wallet size={18} /> الدفع عبر Paymob</h3>
          </div>

          {paymentDone ? (
            <div className="fade-up" style={{ padding: 32, textAlign: 'center' }}>
              <div style={{ fontSize: 48, marginBottom: 12 }}>✅</div>
              <p style={{ fontWeight: 900, fontSize: 18, color: 'var(--success)', marginBottom: 8 }}>تمت عملية الدفع بنجاح</p>
              <p style={{ fontSize: 13, color: 'var(--muted)' }}>سيتم تحديث الفاتورة تلقائياً</p>
            </div>
          ) : (
            <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div style={{ background: '#FFFBEB', borderRadius: 10, padding: '12px 16px', textAlign: 'center' }}>
                <p style={{ fontSize: 11, color: 'var(--muted)', fontWeight: 700 }}>المبلغ المتبقي</p>
                <p style={{ fontSize: 28, fontWeight: 900, color: 'var(--gold)', fontFamily: "'JetBrains Mono', monospace", marginTop: 4 }}>{amountRemaining.toLocaleString()} ج</p>
              </div>

              <p style={{ fontSize: 12, fontWeight: 700, color: 'var(--muted)' }}>اختر طريقة الدفع</p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {PAYMOB_CHANNELS.map((ch) => (
                  <button key={ch.id} onClick={() => setSelectedChannel(ch.id)} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px', borderRadius: 12, border: selectedChannel === ch.id ? `2px solid ${ch.color}` : '1.5px solid var(--border)', background: selectedChannel === ch.id ? `${ch.color}08` : '#fff', cursor: 'pointer', transition: 'all .15s', textAlign: 'right' }}>
                    <span style={{ fontSize: 20, flexShrink: 0 }}>{ch.icon}</span>
                    <div style={{ flex: 1 }}><p style={{ fontSize: 13, fontWeight: 800, color: 'var(--text)' }}>{ch.label}</p><p style={{ fontSize: 11, color: 'var(--muted)' }}>{ch.desc}</p></div>
                    {selectedChannel === ch.id && <div style={{ width: 20, height: 20, borderRadius: '50%', background: ch.color, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}><span style={{ color: '#fff', fontSize: 12, fontWeight: 900 }}>✓</span></div>}
                  </button>
                ))}
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 12px', background: '#F5F8FF', borderRadius: 8 }}><Lock size={12} color="var(--navy)" /><span style={{ fontSize: 11, color: 'var(--muted)' }}>معاملات Paymob مشفرة ومحمية</span></div>

              <Button variant="gold" fullWidth disabled={!selectedChannel || paymentProcessing} onClick={processPayment} style={{ padding: '14px 24px', fontSize: 15, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
                {paymentProcessing ? <><span className="spin" style={{ display: 'inline-block', width: 16, height: 16, border: '2.5px solid rgba(255,255,255,.3)', borderTopColor: '#fff', borderRadius: '50%' }} /> جاري المعالجة...</> : <><CreditCard size={16} /> ادفع {amountRemaining.toLocaleString()} ج</>}
              </Button>
            </div>
          )}
        </Modal>
      )}
    </div>
  );
}
