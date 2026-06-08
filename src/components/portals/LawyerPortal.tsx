import { useState, useEffect } from 'react';
import { Scale, Mic, LogOut, ClipboardList, MessageSquare, User as UserIcon, Crown, Settings, FileText, Bell, Calculator, Lock, AlertTriangle, Calendar, Zap, CreditCard as Edit3, Clock, Plus, X, Check, Wallet, CreditCard, Phone } from 'lucide-react';
import { Button, Card, NotificationUI, Badge, Field } from '../atoms';
import { CasesTable } from '../tables/CasesTable';
import { CaseTimeline } from '../cases/CaseTimeline';
import { RealtimeChat } from '../chat/RealtimeChat';
import { SubScreen } from '../pricing/SubScreen';
import { VoicePanel } from '../voice/VoicePanel';
import { useNotifications } from '../../hooks/useNotifications';
import { useRole, type Profile } from '../../context/RoleContext';
import { useCase } from '../../context/CaseContext';
import { supabase, registerPush } from '../../services/supabase';
import { sanitize } from '../../services/sanitize';

const DEFAULT_COLS = [
  { key: 'case_number', label: 'رقم القضية', type: 'text' },
  { key: 'client_name', label: 'اسم الموكل', type: 'text' },
  { key: 'client_phone', label: 'رقم الهاتف', type: 'tel' },
  { key: 'case_type', label: 'نوع القضية', type: 'text' },
  { key: 'judgment', label: 'الحكم', type: 'text' },
  { key: 'total_fees', label: 'الأتعاب', type: 'number' },
  { key: 'admin_fees', label: 'المصاريف الإدارية', type: 'number' },
];

const WORKING_DAYS = [
  { id: 'saturday', label: 'السبت' },
  { id: 'sunday', label: 'الأحد' },
  { id: 'monday', label: 'الاثنين' },
  { id: 'tuesday', label: 'الثلاثاء' },
  { id: 'wednesday', label: 'الأربعاء' },
  { id: 'thursday', label: 'الخميس' },
  { id: 'friday', label: 'الجمعة' },
];

interface LawyerAvailabilityData {
  id?: string;
  lawyer_id?: string;
  available_days: string[];
  time_slots: string[];
  is_active: boolean;
}

interface LawyerPortalProps {
  user: any;
  profile: Profile;
  onLogout: () => void;
}

export function LawyerPortal({ user, profile: initProfile, onLogout }: LawyerPortalProps) {
  const [profile, setProfile] = useState<Profile>(initProfile);
  const [tab, setTab] = useState('cases');
  const [showVoice, setShowVoice] = useState(false);
  const [cols, setCols] = useState(DEFAULT_COLS);
  const [emergencies, setEmergencies] = useState<any[]>([]);
  const [pendingAppointments, setPendingAppointments] = useState<any[]>([]);
  const [emergencyEnabled, setEmergencyEnabled] = useState(initProfile.is_emergency_enabled ?? true);
  const [flashAlert, setFlashAlert] = useState<{ type: 'emergency' | 'appointment'; data: any } | null>(null);

  // Availability state - simplified with work_from/work_to
  const [availability, setAvailability] = useState<LawyerAvailabilityData>({
    available_days: ['saturday', 'sunday', 'monday', 'tuesday', 'wednesday', 'thursday'],
    time_slots: ['09:00', '10:00', '11:00', '12:00', '13:00', '14:00', '15:00', '16:00', '17:00'],
    is_active: true,
  });
  const [workFrom, setWorkFrom] = useState('09:00');
  const [workTo, setWorkTo] = useState('17:00');
  const [savingAvailability, setSavingAvailability] = useState(false);

  // Payment credentials state
  const [vodafoneCash, setVodafoneCash] = useState(initProfile.vodafone_cash_number || '');
  const [instapayAddress, setInstapayAddress] = useState(initProfile.instapay_address || '');
  const [instapayQRUrl, setInstapayQRUrl] = useState<string | null>(null);
  const [bankDetails, setBankDetails] = useState(initProfile.bank_account_details || {});
  const [savingPayment, setSavingPayment] = useState(false);

  const { list: notifList, push } = useNotifications();
  const { canViewChat, canViewCaseDetails, canManageBilling, tier, activeRole } = useRole();
  const {
    cases, loadCases, addCase, updateCase, deleteCase,
    selectedCase, setSelectedCase, loadEvents, loadAppointments, appointments,
  } = useCase();

  const isFreeTierLocked = tier === 'free' && cases.length >= 3;

  useEffect(() => { loadCases(user.id); loadAppointments(user.id); }, [user.id, loadCases, loadAppointments]);

  // Load availability
  useEffect(() => {
    const loadAvailabilityData = async () => {
      const { data } = await supabase
        .from('lawyer_availability')
        .select('*')
        .eq('lawyer_id', user.id)
        .single();
      if (data) {
        setAvailability({
          available_days: data.available_days || ['saturday', 'sunday', 'monday', 'tuesday', 'wednesday', 'thursday'],
          time_slots: data.time_slots || [],
          is_active: data.is_active ?? true,
          id: data.id,
          lawyer_id: data.lawyer_id,
        });
        // Extract work hours from time_slots
        if (data.time_slots?.length > 0) {
          const sorted = [...data.time_slots].sort();
          setWorkFrom(sorted[0] || '09:00');
          setWorkTo(sorted[sorted.length - 1] || '17:00');
        }
      }
      // Load QR code from storage
      const { data: qrData } = await supabase.storage.from('documents').list(`qr-codes/${user.id}`);
      if (qrData && qrData.length > 0) {
        const { data: urlData } = supabase.storage.from('documents').getPublicUrl(`qr-codes/${user.id}/${qrData[0].name}`);
        if (urlData?.publicUrl) setInstapayQRUrl(urlData.publicUrl);
      }
    };
    loadAvailabilityData();
  }, [user.id]);

  // Real-time subscription for cases
  useEffect(() => {
    const ch = supabase
      .channel('cases:' + user.id)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'cases', filter: `lawyer_id=eq.${user.id}` }, () => loadCases(user.id))
      .subscribe();
    return () => { ch.unsubscribe(); };
  }, [user.id, loadCases]);

  // Real-time subscription for emergencies - HIGH PRIORITY ALERT
  useEffect(() => {
    const ch = supabase
      .channel('emergencies_alerts:' + user.id)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'case_emergencies' }, async (payload) => {
        const emg = payload.new;
        const { data: caseData } = await supabase.from('cases').select('lawyer_id,client_name,client_phone').eq('id', emg.case_id).single();
        if (caseData?.lawyer_id === user.id) {
          const newEmergency = { ...emg, client_name: caseData.client_name, client_phone: caseData.client_phone };
          setEmergencies((prev) => [newEmergency, ...prev]);
          setFlashAlert({ type: 'emergency', data: newEmergency });
          push(`🆘 طلب طوارئ عاجل من ${caseData.client_name || 'موكل'}`, 'danger');
          setTimeout(() => setFlashAlert(null), 10000);
        }
      })
      .subscribe();
    return () => { ch.unsubscribe(); };
  }, [user.id, push]);

  // Real-time subscription for appointment requests with sound alert
  useEffect(() => {
    const ch = supabase
      .channel('appointments_alerts:' + user.id)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'appointment_requests', filter: `lawyer_id=eq.${user.id}` }, (payload) => {
        const appt = payload.new;
        if (appt.status === 'pending') {
          setPendingAppointments((prev) => [appt, ...prev]);
          setFlashAlert({ type: 'appointment', data: appt });
          push(`📅 طلب موعد جديد: ${appt.appointment_date}`, 'warning');
          // Play notification sound
          try {
            const audio = new Audio('data:audio/wav;base64,UklGRnoGAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQoGAACBhYqFbF1fdJivrJBhNjVgodDbq2EcBj+a2teleQwAPLHd+ZdxOQA4qt/7oHEsADu08vufWSgAN67p/KlcFgA0p+n6s10AADGi4/qjUgAIX5zc9qVJAP9YfNj0oUkA/1Z52fOkSwD/WoXS8qRQAP9fg9PxolEA/1qB0/GmVQD/YIDS86dWAP9cgNLwpVYA/1d/0vCmVwD/V3/S8KZZAP9YfNLwp1kA/1h80vCnWQD/WH3S8KdZAP9YfNLwp1kA/1h80vCnWQD//w==');
            audio.volume = 0.8;
            audio.play().catch(() => {});
          } catch {}
          setTimeout(() => setFlashAlert(null), 15000);
        }
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'appointment_requests', filter: `lawyer_id=eq.${user.id}` }, (payload) => {
        loadAppointments(user.id);
      })
      .subscribe();
    return () => { ch.unsubscribe(); };
  }, [user.id, push, loadAppointments]);

  // Handle appointment approval
  const handleAppointmentAction = async (apptId: string, action: 'accepted' | 'rejected' | 'rescheduled', alternativeTime?: string) => {
    const { error } = await supabase
      .from('appointment_requests')
      .update({
        status: action,
        alternative_time: alternativeTime || null,
        responded_by: user.id,
        responded_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', apptId);

    if (!error) {
      setPendingAppointments((prev) => prev.filter((a) => a.id !== apptId));
      push(action === 'accepted' ? '✓ تم قبول الموعد' : action === 'rejected' ? 'تم رفض الموعد' : 'تم اقتراح موعد بديل', action === 'accepted' ? 'success' : 'warning');
    }
  };

  useEffect(() => {
    setPendingAppointments(appointments.filter((a) => a.status === 'pending'));
  }, [appointments]);

  const handleAddEmptyCase = async () => {
    if (isFreeTierLocked) {
      push('⚠️ انتهت حدود الباقة المجانية - قم بالترقية لإضافة المزيد', 'warning');
      return;
    }
    const payload = {
      case_number: 'MHK-' + Date.now().toString().slice(-5),
      case_type: '', client_name: '', client_phone: '',
      judgment: 'قيد الانتظار', total_fees: 0, admin_fees: 0,
      lawyer_id: user.id,
    };
    const newCase = await addCase(payload);
    if (newCase) push('✨ تم إضافة قضية جديدة', 'success');
    else push('خطأ في الإضافة', 'danger');
  };

  const handleUpdateCase = async (id: string, patch: Record<string, any>) => {
    const safePatch: Record<string, any> = {};
    for (const [k, v] of Object.entries(patch)) {
      safePatch[k] = typeof v === 'string' ? sanitize(v) : v;
    }
    const ok = await updateCase(id, safePatch);
    if (ok) {
      if (safePatch.judgment) {
        const c = cases.find((c) => c.id === id);
        if (c?.client_id) {
          await supabase.from('case_events').insert([{
            case_id: id, event_type: 'JUDGMENT_UPDATED',
            event_description: `⚖️ تم تحديث قرار المحكمة إلى ${sanitize(safePatch.judgment)}`,
          }]);
        }
      }
      push('تم حفظ التغيير', 'success');
    } else push('خطأ في الحفظ', 'danger');
  };

  const handleDeleteCase = async (id: string) => {
    const ok = await deleteCase(id);
    if (ok) push('تم حذف القضية', 'warning');
    else push('خطأ في الحذف', 'danger');
  };

  const handleRowClick = (row: any) => {
    setSelectedCase(row);
    loadEvents(row.id);
  };

  const handleGenerateInvoiceLink = (row: any) => {
    const fee = Number(row.total_fees) || 0;
    const link = `${origin}/pay/${user.id}/${row.case_number}?amount=${fee}`;
    navigator.clipboard?.writeText(link);
    push(`✓ تم نسخ رابط الدفع لقضية ${row.client_name || row.case_number}`, 'success');
  };

  const toggleEmergencyAlerts = async () => {
    const newValue = !emergencyEnabled;
    const { error } = await supabase.from('profiles').update({ is_emergency_enabled: newValue }).eq('id', user.id);
    if (!error) {
      setEmergencyEnabled(newValue);
      setProfile((p) => p ? { ...p, is_emergency_enabled: newValue } : p);
      push(newValue ? '✓ تم تفعيل استقبال طلبات الطوارئ' : 'تم إيقاف استقبال طلبات الطوارئ', 'success');
    }
  };

  const toggleDay = async (dayId: string) => {
    const newDays = availability.available_days.includes(dayId)
      ? availability.available_days.filter((d) => d !== dayId)
      : [...availability.available_days, dayId];
    setAvailability((prev) => ({ ...prev, available_days: newDays }));

    // Instant save to database
    await supabase
      .from('lawyer_availability')
      .upsert({
        lawyer_id: user.id,
        available_days: newDays,
        time_slots: generateTimeSlots(workFrom, workTo),
        is_active: availability.is_active,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'lawyer_id' });
  };

  const generateTimeSlots = (from: string, to: string) => {
    const slots: string[] = [];
    const [fromH] = from.split(':').map(Number);
    const [toH] = to.split(':').map(Number);
    for (let h = fromH; h <= toH; h++) {
      slots.push(`${h.toString().padStart(2, '0')}:00`);
    }
    return slots;
  };

  const saveAvailability = async () => {
    setSavingAvailability(true);
    const timeSlots = generateTimeSlots(workFrom, workTo);
    const { error } = await supabase
      .from('lawyer_availability')
      .upsert({
        lawyer_id: user.id,
        available_days: availability.available_days,
        time_slots: timeSlots,
        is_active: availability.is_active,
        notes: `${workFrom} - ${workTo}`,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'lawyer_id' });
    if (!error) {
      setAvailability((prev) => ({ ...prev, time_slots: timeSlots }));
      push('✓ تم حفظ جدول العمل', 'success');
    } else {
      push('خطأ في حفظ الجدول', 'danger');
    }
    setSavingAvailability(false);
  };

  const uploadQRCode = async (file: File) => {
    const path = `qr-codes/${user.id}/${Date.now()}_${file.name}`;
    const { error } = await supabase.storage.from('documents').upload(path, file, { upsert: true });
    if (!error) {
      const { data } = supabase.storage.from('documents').getPublicUrl(path);
      if (data?.publicUrl) setInstapayQRUrl(data.publicUrl);
      push('✓ تم رفع صورة QR', 'success');
    }
  };

  const savePaymentCredentials = async () => {
    setSavingPayment(true);
    const { error } = await supabase
      .from('profiles')
      .update({
        vodafone_cash_number: vodafoneCash || null,
        instapay_address: instapayAddress || null,
        bank_account_details: bankDetails,
      })
      .eq('id', user.id);
    if (!error) {
      setProfile((p) => p ? {
        ...p,
        vodafone_cash_number: vodafoneCash,
        instapay_address: instapayAddress,
        bank_account_details: bankDetails,
      } : p);
      push('✓ تم حفظ بيانات الدفع', 'success');
    } else {
      push('خطأ في حفظ البيانات', 'danger');
    }
    setSavingPayment(false);
  };

  const allTabs = [
    { id: 'cases', icon: ClipboardList, label: 'القضايا' },
    ...(canViewChat ? [{ id: 'chat', icon: MessageSquare, label: 'الشات' }] : []),
    ...(canViewCaseDetails ? [{ id: 'timeline', icon: FileText, label: 'التايملاين' }] : []),
    { id: 'sub', icon: Crown, label: 'الباقة' },
    ...(canManageBilling ? [{ id: 'billing', icon: Calculator, label: 'الفواتير' }] : []),
    { id: 'settings', icon: Settings, label: 'الإعدادات' },
  ];

  const stats = [
    { label: 'إجمالي القضايا', val: cases.length, color: 'var(--navy)' },
    { label: 'إجمالي الأتعاب', val: cases.reduce((s, c) => s + (Number(c.total_fees) || 0), 0).toLocaleString() + ' ج', color: 'var(--gold)' },
    { label: 'المصاريف الإدارية', val: cases.reduce((s, c) => s + (Number(c.admin_fees) || 0), 0).toLocaleString() + ' ج', color: 'var(--success)' },
    { label: 'قيد الانتظار', val: cases.filter((c) => /انتظار|قيد/.test(c.judgment || '')).length, color: 'var(--warning)' },
  ];

  const hasAlerts = (emergencyEnabled && emergencies.length > 0) || pendingAppointments.length > 0;
  const origin = window.location.origin;

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)', display: 'flex', flexDirection: 'column' }}>
      <NotificationUI list={notifList} />

      {flashAlert && (
        <div className="flash-pulse" style={{
          position: 'fixed', top: 0, left: 0, right: 0, zIndex: 9999,
          background: flashAlert.type === 'emergency'
            ? 'linear-gradient(90deg, #C41E3A, #8B0000)'
            : 'linear-gradient(90deg, #D97706, #B45309)',
          color: '#fff', padding: '14px 20px',
          display: 'flex', alignItems: 'center', gap: 12,
          boxShadow: '0 4px 20px rgba(0,0,0,.4)',
        }}>
          <span className="ping" style={{ width: 14, height: 14, background: '#fff', borderRadius: '50%', display: 'inline-block' }} />
          {flashAlert.type === 'emergency' ? (
            <>
              <AlertTriangle size={22} />
              <div style={{ flex: 1 }}>
                <p style={{ fontWeight: 900, fontSize: 15 }}>🆘 طلب طوارئ عاجل!</p>
                <p style={{ fontSize: 12, opacity: 0.9 }}>
                  من: {flashAlert.data.client_name || 'موكل'} | {flashAlert.data.essential_needs?.slice(0, 50)}...
                </p>
              </div>
              <Badge style={{ background: 'rgba(255,255,255,.25)', color: '#fff', border: 'none' }}>عاجل</Badge>
            </>
          ) : (
            <>
              <Calendar size={22} />
              <div style={{ flex: 1 }}>
                <p style={{ fontWeight: 900, fontSize: 15 }}>📅 طلب موعد جديد!</p>
                <p style={{ fontSize: 12, opacity: 0.9 }}>
                  {flashAlert.data.appointment_date} | {flashAlert.data.appointment_time} | {flashAlert.data.reason?.slice(0, 30)}...
                </p>
              </div>
              {/* Accept/Reject buttons for appointments */}
              <button onClick={() => handleAppointmentAction(flashAlert.data.id, 'accepted')} style={{ background: '#22C55E', border: 'none', color: '#fff', padding: '8px 14px', borderRadius: 8, cursor: 'pointer', fontSize: 14, fontWeight: 900, display: 'flex', alignItems: 'center', gap: 4 }}>✓ صح</button>
              <button onClick={() => handleAppointmentAction(flashAlert.data.id, 'rejected')} style={{ background: '#EF4444', border: 'none', color: '#fff', padding: '8px 14px', borderRadius: 8, cursor: 'pointer', fontSize: 14, fontWeight: 900, display: 'flex', alignItems: 'center', gap: 4 }}>✕ خطأ</button>
            </>
          )}
          <button onClick={() => setFlashAlert(null)} style={{
            background: 'rgba(255,255,255,.2)', border: 'none', color: '#fff',
            padding: '4px 10px', borderRadius: 6, cursor: 'pointer', fontSize: 11,
          }}>إغلاق</button>
        </div>
      )}

      {hasAlerts && !flashAlert && (
        <Card style={{
          position: 'sticky', top: 0, zIndex: 200,
          background: '#FFF5F5', borderRadius: 0, borderLeft: `4px solid var(--danger)`,
          padding: '10px 20px', margin: 0,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <Bell size={18} color="var(--danger)" className="pulse" />
            <span style={{ fontWeight: 800, fontSize: 13, color: 'var(--danger)' }}>إشعارات عاجلة:</span>
            {emergencies.length > 0 && emergencyEnabled && (
              <Badge color="red">{emergencies.length} طوارئ</Badge>
            )}
            {pendingAppointments.length > 0 && (
              <Badge color="orange">{pendingAppointments.length} موعد معلق</Badge>
            )}
          </div>
        </Card>
      )}

      <header style={{
        background: 'var(--navy)', color: '#fff', padding: '0 20px', height: 56,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        position: 'sticky', top: hasAlerts && !flashAlert ? 40 : 0, zIndex: 100,
        boxShadow: '0 2px 20px rgba(15,37,87,.3)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ width: 34, height: 34, background: 'rgba(255,255,255,.12)', borderRadius: 9, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Scale size={18} color="var(--gold)" />
          </div>
          <div>
            <p style={{ fontWeight: 900, fontSize: 15, fontFamily: "'Tajawal', sans-serif" }}>مُحكَم</p>
            <p style={{ fontSize: 10, opacity: 0.6 }}>مرحباً {profile?.full_name}</p>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <Button size="sm" onClick={() => setShowVoice(true)} style={{ background: 'rgba(255,255,255,.12)', color: '#fff', border: '1px solid rgba(255,255,255,.2)' }}>
            <Mic size={14} /> إضافة قضية
          </Button>
          <button onClick={onLogout} style={{ background: 'rgba(255,255,255,.1)', border: '1px solid rgba(255,255,255,.2)', color: '#fff', padding: '6px 14px', borderRadius: 10, cursor: 'pointer', fontSize: 12, fontFamily: "'Cairo',sans-serif", fontWeight: 700, display: 'flex', alignItems: 'center', gap: 6 }}>
            <LogOut size={12} /> خروج
          </button>
        </div>
      </header>

      <div style={{ background: '#fff', borderBottom: '1px solid var(--border)', display: 'flex', padding: '0 20px', gap: 2, overflowX: 'auto' }}>
        {allTabs.map(({ id, icon: Icon, label }) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            style={{
              padding: '12px 16px', border: 'none', background: 'none', cursor: 'pointer',
              fontWeight: 700, fontSize: 13, fontFamily: "'Cairo',sans-serif",
              color: tab === id ? 'var(--navy)' : 'var(--muted)',
              borderBottom: tab === id ? '2.5px solid var(--navy)' : '2.5px solid transparent',
              display: 'flex', alignItems: 'center', gap: 6, transition: 'all .15s', whiteSpace: 'nowrap',
            }}
          >
            <Icon size={14} /> {label}
          </button>
        ))}
      </div>

      <main style={{ flex: 1, padding: 20, maxWidth: 1200, width: '100%', margin: '0 auto' }}>
        {tab === 'cases' && (
          <div className="fade-up" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
              {stats.map((s) => (
                <Card key={s.label} style={{ padding: '12px 18px', display: 'flex', flexDirection: 'column', gap: 4, flex: '1 1 150px' }}>
                  <p style={{ fontSize: 11, color: 'var(--muted)', fontWeight: 600 }}>{s.label}</p>
                  <p style={{ fontSize: 22, fontWeight: 900, color: s.color, fontFamily: "'Tajawal', sans-serif" }}>{s.val}</p>
                </Card>
              ))}
            </div>
            <CasesTable
              cases={cases}
              columns={cols}
              onUpdate={handleUpdateCase}
              onAdd={handleAddEmptyCase}
              onDelete={handleDeleteCase}
              onAddCol={(name) => { const key = 'col_' + name.replace(/\s+/g, '_') + Date.now(); setCols((p) => [...p, { key, label: name, type: 'text' }]); }}
              onDelCol={(key) => setCols((p) => p.filter((c) => c.key !== key))}
              onRowClick={handleRowClick}
              selectedId={selectedCase?.id}
              onGenerateInvoiceLink={handleGenerateInvoiceLink}
            />
            <p style={{ fontSize: 11, color: 'var(--muted)', textAlign: 'center' }}>💡 انقر مرتين على أي خلية لتعديلها · اضغط على صف لعرض التفاصيل</p>
          </div>
        )}

        {tab === 'chat' && canViewChat && (
          <div style={{ height: 'calc(100vh - 200px)' }}>
            <RealtimeChat cases={cases} userId={user.id} push={push} />
          </div>
        )}

        {tab === 'timeline' && canViewCaseDetails && selectedCase && (
          <CaseTimeline
            caseId={selectedCase.id}
            lawyerId={user.id}
            userId={user.id}
            activeRole={activeRole}
            userName={profile?.full_name}
            push={push}
          />
        )}
        {tab === 'timeline' && canViewCaseDetails && !selectedCase && (
          <Card style={{ padding: 40, textAlign: 'center' }}>
            <FileText size={40} color="var(--border)" style={{ margin: '0 auto 12px' }} />
            <p style={{ fontWeight: 700, color: 'var(--muted)', fontSize: 14 }}>اختر قضية لعرض التايملاين</p>
          </Card>
        )}

        {tab === 'sub' && (
          <SubScreen profile={profile} onUpdateProfile={setProfile} push={push} caseCount={cases.length} />
        )}

        {tab === 'billing' && canManageBilling && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {/* Summary Cards */}
            <Card style={{ padding: 24 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20 }}>
                <Calculator size={20} color="var(--gold)" />
                <h3 style={{ fontWeight: 800, color: 'var(--navy)', fontSize: 16 }}>الفواتير والأتعاب</h3>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12 }}>
                <Card style={{ padding: 16, background: '#FFFBEB' }}>
                  <p style={{ fontSize: 11, color: 'var(--muted)', fontWeight: 700 }}>إجمالي الأتعاب</p>
                  <p style={{ fontSize: 24, fontWeight: 900, color: 'var(--gold)', fontFamily: "'JetBrains Mono', monospace" }}>{cases.reduce((s, c) => s + (Number(c.total_fees) || 0), 0).toLocaleString()} ج</p>
                </Card>
                <Card style={{ padding: 16, background: '#E6F7EF' }}>
                  <p style={{ fontSize: 11, color: 'var(--muted)', fontWeight: 700 }}>المصاريف الإدارية</p>
                  <p style={{ fontSize: 24, fontWeight: 900, color: 'var(--success)', fontFamily: "'JetBrains Mono', monospace" }}>{cases.reduce((s, c) => s + (Number(c.admin_fees) || 0), 0).toLocaleString()} ج</p>
                </Card>
                <Card style={{ padding: 16, background: '#F5F8FF' }}>
                  <p style={{ fontSize: 11, color: 'var(--muted)', fontWeight: 700 }}>صافي الإيرادات</p>
                  <p style={{ fontSize: 24, fontWeight: 900, color: 'var(--navy)', fontFamily: "'JetBrains Mono', monospace" }}>
                    {(cases.reduce((s, c) => s + (Number(c.total_fees) || 0), 0) - cases.reduce((s, c) => s + (Number(c.admin_fees) || 0), 0)).toLocaleString()} ج
                  </p>
                </Card>
              </div>
            </Card>

            {/* Commission Debt Tracking */}
            <Card style={{ padding: 20, background: 'linear-gradient(135deg, #FDECEF, #FFF5F5)', border: '2px solid var(--danger)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
                <div style={{ width: 44, height: 44, borderRadius: 12, background: 'var(--danger)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Wallet size={20} color="#fff" />
                </div>
                <div style={{ flex: 1 }}>
                  <p style={{ fontSize: 11, color: 'var(--muted)', fontWeight: 700 }}>عمولة المنصة المستحقة</p>
                  <p style={{ fontSize: 28, fontWeight: 900, color: 'var(--danger)', fontFamily: "'JetBrains Mono', monospace" }}>
                    {(profile as any).commission_debt?.toLocaleString() || 0} ج
                  </p>
                </div>
              </div>
              <p style={{ fontSize: 11, color: 'var(--muted)' }}>
                عمولة 5% من كل دفعة مؤكدة تُخصم تلقائياً عند تأكيد استلام المبلغ
              </p>
            </Card>

            {/* Payment Confirmation by Case */}
            <Card style={{ padding: 20 }}>
              <h3 style={{ fontWeight: 800, color: 'var(--navy)', fontSize: 15, marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
                <CreditCard size={16} /> تأكيد استلام المدفوعات
              </h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {cases.filter((c) => Number(c.total_fees) > 0).slice(0, 10).map((c) => {
                  const totalFees = Number(c.total_fees) || 0;
                  const commission = Math.round(totalFees * 0.05);
                  const netAmount = totalFees - commission;
                  return (
                    <div key={c.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px', background: '#FAFBFE', borderRadius: 12, border: '1px solid var(--border)' }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <p style={{ fontSize: 13, fontWeight: 800, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.case_number} - {c.client_name || 'بدون اسم'}</p>
                        <div style={{ display: 'flex', gap: 12, marginTop: 4 }}>
                          <span style={{ fontSize: 11, color: 'var(--muted)' }}>الأتعاب: <strong style={{ color: 'var(--navy)' }}>{totalFees.toLocaleString()} ج</strong></span>
                          <span style={{ fontSize: 11, color: 'var(--danger)' }}>العمولة: <strong>{commission.toLocaleString()} ج</strong></span>
                          <span style={{ fontSize: 11, color: 'var(--success)' }}>الصافي: <strong>{netAmount.toLocaleString()} ج</strong></span>
                        </div>
                      </div>
                      <Button
                        size="sm"
                        variant="gold"
                        onClick={async () => {
                          const { error } = await supabase.rpc('increment_commission_debt', { amount: commission, lawyer_id: user.id });
                          if (!error) {
                            const currentDebt = (profile as any).commission_debt || 0;
                            setProfile((p) => p ? { ...p, commission_debt: currentDebt + commission } : p);
                            push(`✓ تم تأكيد استلام ${totalFees.toLocaleString()} ج (عمولة: ${commission.toLocaleString()} ج)`, 'success');
                          } else {
                            push('خطأ في تأكيد الدفعة', 'danger');
                          }
                        }}
                      >
                        تأكيد استلام المبلغ
                      </Button>
                    </div>
                  );
                })}
                {cases.filter((c) => Number(c.total_fees) > 0).length === 0 && (
                  <p style={{ textAlign: 'center', color: 'var(--muted)', padding: 20 }}>لا توجد قضايا بأتعاب مسجلة</p>
                )}
              </div>
            </Card>
          </div>
        )}

        {tab === 'settings' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16, maxWidth: 560 }}>
            {/* Profile Card */}
            <Card style={{ padding: 22 }}>
              <h3 style={{ fontWeight: 800, marginBottom: 16, color: 'var(--navy)', display: 'flex', alignItems: 'center', gap: 8 }}>
                <UserIcon size={18} /> الملف الشخصي
              </h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 8 }}>
                  <div style={{ position: 'relative' }}>
                    <div style={{ width: 64, height: 64, borderRadius: '50%', background: 'var(--bg)', border: '2px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
                      {profile.avatar_url ? <img src={profile.avatar_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <span style={{ fontSize: 24 }}>👨‍⚖️</span>}
                    </div>
                    <label style={{
                      position: 'absolute', bottom: -4, right: -4,
                      width: 24, height: 24, borderRadius: '50%',
                      background: 'var(--navy)', color: '#fff',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      cursor: 'pointer', fontSize: 10,
                      boxShadow: '0 2px 8px rgba(0,0,0,.2)',
                    }}>
                      <Edit3 size={10} />
                      <input
                        type="file"
                        accept="image/*"
                        onChange={async (e) => {
                          const file = e.target.files?.[0];
                          if (file) {
                            const reader = new FileReader();
                            reader.onloadend = async () => {
                              const avatar_url = reader.result as string;
                              const { error } = await supabase.from('profiles').update({ avatar_url }).eq('id', user.id);
                              if (!error) {
                                setProfile((p) => p ? { ...p, avatar_url } : p);
                                push('✓ تم تحديث الصورة الشخصية', 'success');
                              }
                            };
                            reader.readAsDataURL(file);
                          }
                        }}
                        style={{ display: 'none' }}
                      />
                    </label>
                  </div>
                  <div style={{ flex: 1 }}>
                    <p style={{ fontWeight: 800, fontSize: 16 }}>{profile.full_name}</p>
                    <p style={{ fontSize: 12, color: 'var(--muted)' }}>{profile.phone_number}</p>
                  </div>
                </div>
                <div style={{ marginTop: 8 }}>
                  <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', display: 'block', marginBottom: 6 }}>نبذة شخصية</label>
                  <textarea
                    defaultValue={profile.bio || ''}
                    placeholder="اكتب نبذة عنك..."
                    rows={3}
                    onBlur={async (e) => {
                      const bio = e.target.value;
                      const { error } = await supabase.from('profiles').update({ bio }).eq('id', user.id);
                      if (!error) {
                        setProfile((p) => p ? { ...p, bio } : p);
                      }
                    }}
                    style={{
                      width: '100%', padding: '10px 14px',
                      border: '1.5px solid var(--border)', borderRadius: 10,
                      fontSize: 13, fontFamily: "'Cairo',sans-serif",
                      resize: 'none', direction: 'rtl',
                    }}
                  />
                </div>
              </div>
            </Card>

            {/* Notifications Card */}
            <Card style={{ padding: 22 }}>
              <h3 style={{ fontWeight: 800, marginBottom: 14, color: 'var(--navy)', display: 'flex', alignItems: 'center', gap: 8 }}>
                <Bell size={18} /> تفعيل الإشعارات
              </h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                <Button variant="secondary" fullWidth onClick={async () => {
                  const token = await registerPush(user.id);
                  if (token) push('✓ تم تفعيل الإشعارات', 'success');
                  else push('تعذّر تفعيل الإشعارات', 'warning');
                }}>🔔 تفعيل الإشعارات</Button>

                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', background: '#F5F8FF', borderRadius: 10 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <AlertTriangle size={16} color={emergencyEnabled ? 'var(--danger)' : 'var(--muted)'} />
                    <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)' }}>استقبال طلبات الطوارئ</span>
                  </div>
                  <button
                    onClick={toggleEmergencyAlerts}
                    style={{
                      width: 48, height: 26, borderRadius: 99, border: 'none', cursor: 'pointer',
                      background: emergencyEnabled ? 'var(--danger)' : 'var(--border)', transition: 'background .2s',
                      position: 'relative',
                    }}
                  >
                    <div style={{
                      width: 20, height: 20, borderRadius: '50%', background: '#fff',
                      position: 'absolute', top: 3, transition: 'right .2s',
                      right: emergencyEnabled ? 3 : 25,
                      boxShadow: '0 1px 4px rgba(0,0,0,.2)',
                    }} />
                  </button>
                </div>
              </div>
            </Card>

            {/* Availability Configuration */}
            <Card style={{ padding: 22 }}>
              <h3 style={{ fontWeight: 800, marginBottom: 14, color: 'var(--navy)', display: 'flex', alignItems: 'center', gap: 8 }}>
                <Clock size={18} /> جدول العمل
              </h3>
              <p style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 12 }}>حدد الأيام والساعات المتاحة لحجز المواعيد</p>

              {/* Work Hours - Simplified */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
                <div>
                  <p style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', marginBottom: 6 }}>من الساعة</p>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px', background: '#F5F8FF', borderRadius: 10, border: '1.5px solid var(--border)' }}>
                    <Clock size={14} color="var(--navy)" />
                    <input type="time" value={workFrom} onChange={(e) => setWorkFrom(e.target.value)} onBlur={saveAvailability} style={{ flex: 1, border: 'none', background: 'transparent', fontSize: 14, fontFamily: "'JetBrains Mono', monospace" }} />
                  </div>
                </div>
                <div>
                  <p style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', marginBottom: 6 }}>إلى الساعة</p>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px', background: '#F5F8FF', borderRadius: 10, border: '1.5px solid var(--border)' }}>
                    <Clock size={14} color="var(--navy)" />
                    <input type="time" value={workTo} onChange={(e) => setWorkTo(e.target.value)} onBlur={saveAvailability} style={{ flex: 1, border: 'none', background: 'transparent', fontSize: 14, fontFamily: "'JetBrains Mono', monospace" }} />
                  </div>
                </div>
              </div>

              {/* Working Days Chips */}
              <div style={{ marginBottom: 16 }}>
                <p style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', marginBottom: 8 }}>الأيام المتاحة</p>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                  {WORKING_DAYS.map((day) => {
                    const isActive = availability.available_days.includes(day.id);
                    return (
                      <button
                        key={day.id}
                        onClick={() => toggleDay(day.id)}
                        style={{
                          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                          padding: '8px 16px', borderRadius: 99,
                          border: isActive ? '2px solid var(--navy)' : '1px solid var(--border)',
                          background: isActive ? 'var(--navy)' : '#fff',
                          cursor: 'pointer', transition: 'all .15s',
                          fontFamily: "'Cairo',sans-serif",
                          minWidth: 70,
                        }}
                      >
                        <span style={{ fontSize: 12, fontWeight: 700, color: isActive ? '#fff' : 'var(--muted)' }}>{day.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              <p style={{ fontSize: 10, color: 'var(--success)', display: 'flex', alignItems: 'center', gap: 4 }}>
                <Check size={12} /> يتم الحفظ تلقائياً عند أي تغيير
              </p>
            </Card>

            {/* Payment Credentials */}
            <Card style={{ padding: 22 }}>
              <h3 style={{ fontWeight: 800, marginBottom: 14, color: 'var(--navy)', display: 'flex', alignItems: 'center', gap: 8 }}>
                <Wallet size={18} /> بيانات الدفع البديلة
              </h3>
              <p style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 16 }}>أضف بياناتك ليتمكن الموكلون من التحويل إليك مباشرة</p>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                {/* Vodafone Cash */}
                <div style={{ padding: '14px', background: '#FFF5F5', borderRadius: 12, border: '1px solid #FFE0E0' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
                    <div style={{ width: 36, height: 36, borderRadius: 8, background: '#E60000', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><span style={{ color: '#fff', fontSize: 16 }}>📱</span></div>
                    <div style={{ flex: 1 }}><p style={{ fontSize: 13, fontWeight: 800, color: '#E60000' }}>فودافون كاش</p><p style={{ fontSize: 10, color: 'var(--muted)' }}>رقم المحفظة</p></div>
                  </div>
                  <input
                    type="tel"
                    value={vodafoneCash}
                    onChange={(e) => setVodafoneCash(e.target.value)}
                    placeholder="01xxxxxxxxx"
                    style={{
                      width: '100%', padding: '10px 14px',
                      border: '1.5px solid var(--border)', borderRadius: 10,
                      fontSize: 14, fontFamily: "'JetBrains Mono', monospace",
                      direction: 'ltr', textAlign: 'left',
                    }}
                  />
                </div>

                {/* InstaPay */}
                <div style={{ padding: '14px', background: '#F5F8FF', borderRadius: 12, border: '1px solid #E0E8FF' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
                    <div style={{ width: 36, height: 36, borderRadius: 8, background: '#635BFF', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><span style={{ color: '#fff', fontSize: 16 }}>💳</span></div>
                    <div style={{ flex: 1 }}><p style={{ fontSize: 13, fontWeight: 800, color: '#635BFF' }}>InstaPay</p><p style={{ fontSize: 10, color: 'var(--muted)' }}>عنوان أو معرّف InstaPay</p></div>
                  </div>
                  <input
                    type="text"
                    value={instapayAddress}
                    onChange={(e) => setInstapayAddress(e.target.value)}
                    placeholder="username@instapay"
                    style={{
                      width: '100%', padding: '10px 14px',
                      border: '1.5px solid var(--border)', borderRadius: 10,
                      fontSize: 13, fontFamily: "'JetBrains Mono', monospace",
                      direction: 'ltr', textAlign: 'left', marginBottom: 10,
                    }}
                  />
                  {/* QR Code Upload */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    {instapayQRUrl && (
                      <img src={instapayQRUrl} alt="QR Code" style={{ width: 60, height: 60, borderRadius: 8, objectFit: 'cover', border: '1px solid var(--border)' }} />
                    )}
                    <label style={{ flex: 1, cursor: 'pointer' }}>
                      <input
                        type="file"
                        accept="image/*"
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file) uploadQRCode(file);
                        }}
                        style={{ display: 'none' }}
                      />
                      <div style={{ padding: '10px 14px', background: '#E0E8FF', borderRadius: 8, textAlign: 'center' }}>
                        <p style={{ fontSize: 11, fontWeight: 700, color: '#635BFF' }}>{instapayQRUrl ? '📷 تغيير صورة QR' : '📷 رفع صورة QR'}</p>
                        <p style={{ fontSize: 9, color: 'var(--muted)' }}>التقط صورة لـ QR Code من InstaPay</p>
                      </div>
                    </label>
                  </div>
                </div>

                {/* Bank Account */}
                <div style={{ padding: '14px', background: '#F8FCF8', borderRadius: 12, border: '1px solid #E8F4E8' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
                    <div style={{ width: 36, height: 36, borderRadius: 8, background: '#008800', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><span style={{ color: '#fff', fontSize: 16 }}>🏦</span></div>
                    <div style={{ flex: 1 }}><p style={{ fontSize: 13, fontWeight: 800, color: '#008800' }}>الحساب البنكي</p><p style={{ fontSize: 10, color: 'var(--muted)' }}>بيانات التحويل البنكي</p></div>
                  </div>
                  <div style={{ display: 'grid', gap: 8 }}>
                    <input
                      type="text"
                      value={bankDetails.iban || ''}
                      onChange={(e) => setBankDetails((p) => ({ ...p, iban: e.target.value }))}
                      placeholder="IBAN"
                      style={{ padding: '10px 14px', border: '1.5px solid var(--border)', borderRadius: 10, fontSize: 12, fontFamily: "'JetBrains Mono', monospace", direction: 'ltr', textAlign: 'left' }}
                    />
                    <input
                      type="text"
                      value={bankDetails.bank_name || ''}
                      onChange={(e) => setBankDetails((p) => ({ ...p, bank_name: e.target.value }))}
                      placeholder="اسم البنك"
                      style={{ padding: '10px 14px', border: '1.5px solid var(--border)', borderRadius: 10, fontSize: 13, fontFamily: "'Cairo',sans-serif" }}
                    />
                    <input
                      type="text"
                      value={bankDetails.account_holder || ''}
                      onChange={(e) => setBankDetails((p) => ({ ...p, account_holder: e.target.value }))}
                      placeholder="اسم صاحب الحساب"
                      style={{ padding: '10px 14px', border: '1.5px solid var(--border)', borderRadius: 10, fontSize: 13, fontFamily: "'Cairo',sans-serif" }}
                    />
                  </div>
                </div>
              </div>

              <Button fullWidth onClick={savePaymentCredentials} disabled={savingPayment} style={{ marginTop: 16 }}>
                {savingPayment ? 'جاري الحفظ...' : 'حفظ بيانات الدفع'}
              </Button>
            </Card>

            {/* Invite Links */}
            <Card style={{ padding: 22 }}>
              <h3 style={{ fontWeight: 800, marginBottom: 14, color: 'var(--navy)' }}>🔗 روابط دعوة الموكلين</h3>
              {cases.map((c) => {
                const link = `${origin}/?join_lawyer=${user.id}&client_invite_token=${c.case_number}`;
                return (
                  <div key={c.id} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                    <code style={{ flex: 1, fontSize: 10, background: 'var(--bg)', padding: '6px 10px', borderRadius: 8, color: 'var(--navy)', fontFamily: "'JetBrains Mono', monospace", overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{link}</code>
                    <Button size="sm" variant="secondary" onClick={() => { navigator.clipboard?.writeText(link); push('تم نسخ الرابط', 'success'); }}>نسخ</Button>
                  </div>
                );
              })}
            </Card>
          </div>
        )}
      </main>

      {showVoice && <VoicePanel cases={cases} lawyerId={user.id} onDone={() => loadCases(user.id)} onClose={() => setShowVoice(false)} push={push} />}
    </div>
  );
}
