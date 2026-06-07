import { useState, useEffect } from 'react';
import { Crown, Zap, Users, Lock, Check, MapPin } from 'lucide-react';
import { Button, Card, Badge, Spinner } from '../atoms';
import { supabase } from '../../services/supabase';
import { useRole, type Tier } from '../../context/RoleContext';

interface SubScreenProps {
  profile: any;
  onUpdateProfile: (p: any) => void;
  push: (msg: string, type: 'success' | 'warning' | 'danger') => void;
  caseCount?: number;
}

interface TierInfo {
  id: Tier;
  name: string;
  priceLocal: number;
  priceIntl: number;
  currency: string;
  icon: typeof Crown;
  color: string;
  badge?: string;
  features: string[];
}

const TIERS: TierInfo[] = [
  {
    id: 'free', name: 'مجاني', priceLocal: 0, priceIntl: 0, currency: 'EGP',
    icon: Zap, color: 'var(--muted)', badge: undefined,
    features: ['3 قضايا فقط', 'تسجيل صوتي أساسي', 'بوابة الموكل'],
  },
  {
    id: 'premium', name: 'احترافي', priceLocal: 500, priceIntl: 20, currency: 'EGP',
    icon: Crown, color: 'var(--navy)', badge: 'الأكثر شعبية',
    features: ['قضايا غير محدودة', 'شات real-time', 'إشعارات FCM', 'رابط دعوة', 'تحليل صوتي'],
  },
  {
    id: 'team', name: 'فريق', priceLocal: 800, priceIntl: 50, currency: 'EGP',
    icon: Users, color: 'var(--gold)', badge: 'مكاتب المحامين',
    features: ['كل ميزات الاحترافي', 'حتى 10 محامين', 'تقارير مالية', 'دعم أولوية', 'سكرتير ومحاسب'],
  },
];

function detectLocale(): 'local' | 'intl' {
  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (tz.startsWith('Africa/Cairo') || tz.includes('Egypt')) return 'local';
    const lang = navigator.language || (navigator as any).userLanguage;
    if (lang?.startsWith('ar-EG')) return 'local';
    return 'intl';
  } catch {
    return 'local';
  }
}

export function SubScreen({ profile, onUpdateProfile, push, caseCount = 0 }: SubScreenProps) {
  const [upgrading, setUpgrading] = useState<string | null>(null);
  const [locale, setLocale] = useState<'local' | 'intl'>('local');
  const { isTeamLocked, tier } = useRole();

  useEffect(() => {
    setLocale(detectLocale());
  }, []);

  const isOutsideEgypt = locale === 'intl';

  const upgrade = async (tierToSet: Tier) => {
    setUpgrading(tierToSet);
    const { error } = await supabase.from('profiles').update({
      tier: tierToSet,
      started_at: new Date().toISOString(),
      expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
    }).eq('id', profile.id);

    if (!error) {
      const updated = { ...profile, tier: tierToSet, started_at: new Date().toISOString(), expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString() };
      onUpdateProfile(updated);
      push(`✓ تمت الترقية إلى ${tierToSet === 'premium' ? 'الاحترافي' : 'الفريق'}`, 'success');
    } else {
      push('خطأ: ' + error.message, 'danger');
    }
    setUpgrading(null);
  };

  const formatPrice = (t: TierInfo) => {
    if (isOutsideEgypt) return `$${t.priceIntl}`;
    return `${t.priceLocal.toLocaleString('ar-EG')} ج`;
  };

  const isFreeTierLocked = tier === 'free' && caseCount >= 3;

  return (
    <div className="fade-up" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h3 style={{ fontWeight: 800, color: 'var(--navy)', fontSize: 18 }}>الباقات والاشتراكات</h3>
          <p style={{ fontSize: 13, color: 'var(--muted)', marginTop: 4 }}>
            باقتك الحالية: <strong>{profile?.tier === 'free' ? 'مجاني' : profile?.tier === 'premium' ? 'احترافي' : 'فريق'}</strong>
          </p>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 12px', background: '#F5F8FF', borderRadius: 8 }}>
          <MapPin size={12} color={isOutsideEgypt ? 'var(--gold)' : 'var(--success)'} />
          <span style={{ fontSize: 11, color: 'var(--muted)', fontWeight: 600 }}>
            {isOutsideEgypt ? 'دولي (USD)' : 'مصر (EGP)'}
          </span>
        </div>
      </div>

      {isFreeTierLocked && (
        <div style={{ background: '#FDECEF', borderRadius: 10, padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 10 }}>
          <Lock size={16} color="var(--danger)" />
          <div>
            <p style={{ fontSize: 13, fontWeight: 800, color: 'var(--danger)' }}>تم الوصول للحد الأقصى</p>
            <p style={{ fontSize: 11, color: 'var(--muted)' }}>باقة المجاني تسمح بـ 3 قضايا فقط. قم بالترقية لإضافة المزيد.</p>
          </div>
        </div>
      )}

      {/* Tier Cards - Responsive Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {TIERS.map((t) => {
          const isCur = (profile?.tier || 'free') === t.id;
          const isLocked = t.id === 'team' && isTeamLocked;
          const Icon = t.icon;

          return (
            <Card
              key={t.id}
              style={{
                padding: 24, position: 'relative', overflow: 'hidden',
                border: isCur ? `2px solid ${t.color}` : '1px solid var(--border)',
                boxShadow: isCur ? `0 4px 20px ${t.color}22` : 'var(--shadow)',
                transition: 'all .3s',
              }}
              className={isLocked ? 'lock-overlay' : ''}
            >
              {/* Badge */}
              {t.badge && (
                <div style={{
                  position: 'absolute', top: -1, left: 0, right: 0, height: 3,
                  background: t.color, borderRadius: '14px 14px 0 0',
                }} />
              )}

              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
                <div style={{
                  width: 40, height: 40, borderRadius: 10,
                  background: t.color + '15', display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  <Icon size={20} color={t.color} />
                </div>
                <div>
                  <p style={{ fontWeight: 900, fontSize: 17, color: 'var(--text)' }}>{t.name}</p>
                  {t.badge && <Badge color={t.id === 'team' ? 'gold' : 'navy'}>{t.badge}</Badge>}
                </div>
              </div>

              <div style={{ display: 'flex', alignItems: 'baseline', gap: 3, marginBottom: 16 }}>
                <span style={{ fontSize: 32, fontWeight: 900, color: t.color, fontFamily: "'JetBrains Mono', monospace" }}>
                  {formatPrice(t)}
                </span>
                <span style={{ fontSize: 12, color: 'var(--muted)' }}>/شهر</span>
              </div>

              <ul style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 20 }}>
                {t.features.map((f) => (
                  <li key={f} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'var(--text)' }}>
                    <div style={{
                      width: 18, height: 18, borderRadius: '50%',
                      background: t.color + '20', color: t.color,
                      display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                    }}>
                      <Check size={10} />
                    </div>
                    {f}
                  </li>
                ))}
              </ul>

              <Button
                variant={isCur ? 'secondary' : t.id === 'team' ? 'gold' : 'primary'}
                disabled={isCur || upgrading === t.id || isLocked}
                onClick={() => !isLocked && upgrade(t.id)}
                fullWidth
                style={{ background: isCur ? undefined : t.color }}
              >
                {upgrading === t.id ? <><Spinner /> جاري الترقية...</> : isCur ? '✓ خطتك الحالية' : 'ترقية الآن'}
              </Button>

              {/* Monetization Lock overlay */}
              {isLocked && (
                <div style={{
                  position: 'absolute', inset: 0,
                  background: 'rgba(255,255,255,.7)', backdropFilter: 'blur(4px)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  borderRadius: 'var(--radius)', zIndex: 10,
                }}>
                  <Badge color="gold" >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                      <Lock size={10} /> الميزة مقفلة - برجاء الترقية لباقة الفريق (800 ج)
                    </div>
                  </Badge>
                </div>
              )}

              {/* Subscription metadata */}
              {isCur && isOutsideEgypt && (
                <div style={{ marginTop: 12, padding: '8px 12px', background: '#F5F8FF', borderRadius: 8, fontSize: 10, color: 'var(--muted)', fontFamily: "'JetBrains Mono', monospace" }}>
                  started_at: {profile?.started_at || '—'} | expires_at: {profile?.expires_at || '—'} | cancelled_at: {profile?.cancelled_at || 'null'}
                </div>
              )}
            </Card>
          );
        })}
      </div>
    </div>
  );
}
