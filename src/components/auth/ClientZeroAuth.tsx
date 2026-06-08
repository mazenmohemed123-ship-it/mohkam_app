import { useState } from 'react';
import { Phone, Shield, Fingerprint, Users, Scale } from 'lucide-react';
import { Button, Field, Card, Spinner, Badge } from '../atoms';
import { supabase, generateDeviceFingerprint } from '../../services/supabase';
import { isValidGlobalPhone } from '../../services/phoneValidation';
import type { Profile } from '../../context/RoleContext';

interface ClientZeroAuthProps {
  lawyerId: string;
  inviteToken?: string;
  onAuth: (user: any, profile: Profile) => void;
  onBack: () => void;
}

interface AggregatedCase {
  id: string;
  case_number: string;
  client_name?: string;
  lawyer_id: string;
  lawyer_name?: string;
}

interface ClientSession {
  userId: string;
  phoneNumber: string;
  linkedLawyerId: string;
  clientName: string;
  createdAt: string;
}

const SESSION_KEY = 'mohkam_client_session';

export function ClientZeroAuth({ lawyerId, inviteToken, onAuth, onBack }: ClientZeroAuthProps) {
  const [phone, setPhone] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [verified, setVerified] = useState(false);
  const [aggregatedCases, setAggregatedCases] = useState<AggregatedCase[]>([]);
  const [showAggregated, setShowAggregated] = useState(false);

  const handleSubmit = async () => {
    setLoading(true);
    setError('');
    const phoneValidation = isValidGlobalPhone(phone);
    if (!phoneValidation.valid) {
      setError(phoneValidation.error || 'رقم الهاتف غير صالح');
      setLoading(false);
      return;
    }

    try {
      // Look up all cases for this phone number (unified Zero-Auth)
      const { data: existingCases } = await supabase
        .from('cases')
        .select('id, case_number, client_name, lawyer_id')
        .eq('client_phone', phone);

      if (existingCases && existingCases.length > 0) {
        // Aggregate cases - get unique lawyers
        const lawyerIds = [...new Set(existingCases.map((c: any) => c.lawyer_id))];
        const { data: lawyers } = await supabase
          .from('profiles')
          .select('id, full_name')
          .in('id', lawyerIds);

        const casesWithLawyer = existingCases.map((c: any) => ({
          ...c,
          lawyer_name: lawyers?.find((l: any) => l.id === c.lawyer_id)?.full_name,
        }));

        setAggregatedCases(casesWithLawyer);

        // If multiple lawyers, show selection
        if (lawyerIds.length > 1) {
          setShowAggregated(true);
          setLoading(false);
          return;
        }

        // Single lawyer - auto-proceed
        const primaryLawyerId = lawyerIds[0];
        await proceedWithAuth(phone, primaryLawyerId, casesWithLawyer);
      } else {
        // No existing cases - use the lawyerId from URL or show error
        if (!lawyerId) {
          setError('لم يتم العثور على قضايا مسجلة بهذا الرقم. تأكد من الرقم أو استخدم رابط الدعوة من محاميك.');
          setLoading(false);
          return;
        }
        await proceedWithAuth(phone, lawyerId, []);
      }
    } catch {
      setError('حدث خطأ في الاتصال. حاول مرة أخرى.');
    }
    setLoading(false);
  };

  const proceedWithAuth = async (phoneNumber: string, linkedLawyerId: string, cases: AggregatedCase[]) => {
    const fingerprint = generateDeviceFingerprint();
    localStorage.setItem('mohkam_device_fp', fingerprint);
    document.cookie = `mohkam_client=1; path=/; max-age=31536000; samesite=strict`;

    let realUserId: string;

    // Try Supabase Anonymous Auth first
    try {
      const { data: authData, error: authError } = await supabase.auth.signInAnonymously();
      if (authError || !authData.user) {
        throw new Error('Auth failed');
      }
      realUserId = authData.user.id;
    } catch {
      // DEVELOPMENT FALLBACK: Create local UUID if Supabase auth unavailable
      console.warn('Supabase auth unavailable, using local session fallback');
      realUserId = 'client_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 11);
    }

    const clientName = cases[0]?.client_name || 'موكل ' + phoneNumber.slice(-4);

    // Store session in localStorage for persistence
    const session: ClientSession = {
      userId: realUserId,
      phoneNumber,
      linkedLawyerId,
      clientName,
      createdAt: new Date().toISOString(),
    };
    localStorage.setItem(SESSION_KEY, JSON.stringify(session));

    // Get lawyer info
    const { data: lawyer } = await supabase
      .from('profiles')
      .select('id, full_name, avatar_url, phone_number, is_emergency_enabled')
      .eq('id', linkedLawyerId)
      .single();

    if (lawyer) {
      // Create or update profile in database with real UUID
      const profile: Profile = {
        id: realUserId,
        full_name: clientName,
        phone_number: phoneNumber,
        role: 'client',
        tier: 'free',
        is_emergency_enabled: lawyer.is_emergency_enabled ?? true,
        linked_lawyer_id: linkedLawyerId,
        device_fingerprint: fingerprint,
      };

      // Upsert profile to ensure it exists in database
      await supabase.from('profiles').upsert([{
        id: realUserId,
        full_name: clientName,
        phone_number: phoneNumber,
        role: 'client',
        tier: 'free',
        is_emergency_enabled: lawyer.is_emergency_enabled ?? true,
        linked_lawyer_id: linkedLawyerId,
        device_fingerprint: fingerprint,
      }], { onConflict: 'id' });

      setVerified(true);
      setTimeout(() => onAuth({ id: realUserId }, profile), 800);
    }
  };

  const handleSelectLawyer = async (selectedLawyerId: string) => {
    setLoading(true);
    await proceedWithAuth(phone, selectedLawyerId, aggregatedCases);
    setLoading(false);
  };

  return (
    <div style={{
      minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'linear-gradient(160deg, #0F2557, #1E3A8A)', padding: 20,
    }}>
      <div style={{
        position: 'absolute', inset: 0,
        backgroundImage: 'linear-gradient(rgba(255,255,255,.02) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.02) 1px, transparent 1px)',
        backgroundSize: '60px 60px', pointerEvents: 'none',
      }} />

      <Card style={{ maxWidth: 440, width: '100%', padding: 32, position: 'relative', zIndex: 1 }}>
        <button onClick={onBack} style={{
          background: 'none', border: 'none', color: 'var(--navy)', fontWeight: 700,
          cursor: 'pointer', marginBottom: 16, fontSize: 13, fontFamily: "'Cairo',sans-serif",
          display: 'flex', alignItems: 'center', gap: 6,
        }}>
          → رجوع
        </button>

        {verified ? (
          <div className="fade-up" style={{ textAlign: 'center', padding: '20px 0' }}>
            <div style={{ width: 64, height: 64, borderRadius: '50%', background: '#E6F7EF', margin: '0 auto 16px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Shield size={28} color="var(--success)" />
            </div>
            <h3 style={{ fontSize: 20, fontWeight: 900, color: 'var(--success)', marginBottom: 8 }}>تم التحقق بنجاح</h3>
            <p style={{ fontSize: 13, color: 'var(--muted)' }}>جاري تحويلك إلى بوابة الموكل...</p>
          </div>
        ) : showAggregated ? (
          <div className="fade-up">
            <div style={{ textAlign: 'center', marginBottom: 20 }}>
              <div style={{
                width: 56, height: 56, borderRadius: '50%', margin: '0 auto 12px',
                background: 'rgba(59,95,192,.1)', border: '2px solid var(--navy-mid)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                <Users size={24} color="var(--navy)" />
              </div>
              <h2 style={{ fontSize: 18, fontWeight: 900, color: 'var(--navy)', marginBottom: 4 }}>تم العثور على قضايا متعددة</h2>
              <p style={{ fontSize: 12, color: 'var(--muted)' }}>لديك قضايا لدى {aggregatedCases.reduce((acc, c) => acc.add(c.lawyer_id), new Set()).size} محامين. اختر من ترغب في التواصل معه:</p>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {Object.entries(aggregatedCases.reduce((acc, c) => {
                if (!acc[c.lawyer_id]) acc[c.lawyer_id] = { lawyer_name: c.lawyer_name, cases: [] };
                acc[c.lawyer_id].cases.push(c);
                return acc;
              }, {} as Record<string, { lawyer_name?: string; cases: AggregatedCase[] }>)).map(([lid, data]) => (
                <button
                  key={lid}
                  onClick={() => handleSelectLawyer(lid)}
                  disabled={loading}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 12,
                    padding: '14px 16px', borderRadius: 12,
                    border: '1.5px solid var(--border)',
                    background: '#fff', cursor: 'pointer',
                    transition: 'all .2s', textAlign: 'right',
                  }}
                >
                  <div style={{
                    width: 40, height: 40, borderRadius: 10,
                    background: 'var(--navy)', display: 'flex',
                    alignItems: 'center', justifyContent: 'center',
                  }}>
                    <Scale size={18} color="var(--gold)" />
                  </div>
                  <div style={{ flex: 1 }}>
                    <p style={{ fontWeight: 800, fontSize: 14, color: 'var(--text)' }}>{data.lawyer_name || 'محامي'}</p>
                    <p style={{ fontSize: 11, color: 'var(--muted)' }}>{data.cases.length} قضية</p>
                  </div>
                  <Badge color="navy">{data.cases.map((c) => c.case_number).slice(0, 2).join(', ')}</Badge>
                </button>
              ))}
            </div>

            <Button variant="ghost" fullWidth onClick={() => setShowAggregated(false)} style={{ marginTop: 16 }}>
              رجوع
            </Button>
          </div>
        ) : (
          <>
            <div style={{ textAlign: 'center', marginBottom: 24 }}>
              <div style={{
                width: 64, height: 64, borderRadius: '50%', margin: '0 auto 16px',
                background: 'rgba(200,149,42,.1)', border: '2px solid var(--gold)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                <Fingerprint size={28} color="var(--gold)" />
              </div>
              <h2 style={{ fontSize: 22, fontWeight: 900, color: 'var(--navy)', marginBottom: 4 }}>التحقق من الهوية</h2>
              <p style={{ fontSize: 13, color: 'var(--muted)' }}>أدخل رقم هاتفك للدخول بدون كلمة مرور</p>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div style={{ position: 'relative' }}>
                <Phone size={16} color="var(--muted)" style={{ position: 'absolute', right: 12, top: 36 }} />
                <Field label="رقم الهاتف" value={phone} onChange={setPhone} type="tel" placeholder="+20 123 456 7890" mono />
              </div>

              {error && (
                <p style={{ fontSize: 12, color: 'var(--danger)', background: '#FDECEF', padding: '9px 13px', borderRadius: 9 }}>
                  ❌ {error}
                </p>
              )}

              <Button variant="gold" fullWidth onClick={handleSubmit} disabled={loading} style={{ marginTop: 4 }}>
                {loading ? <><Spinner /> جاري التحقق...</> : '🔐 دخول بالهاتف'}
              </Button>

              <div style={{
                display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px',
                background: '#F5F8FF', borderRadius: 10, fontSize: 11, color: 'var(--muted)',
              }}>
                <Shield size={14} />
                <span>بصمة الجهاز تُحفظ تلقائياً للدخول المريح مستقبلاً</span>
              </div>
            </div>

            {inviteToken && (
              <div style={{ marginTop: 12 }}>
                <Badge color="gold">🔗 دعوة محامي</Badge>
              </div>
            )}
          </>
        )}
      </Card>
    </div>
  );
}
