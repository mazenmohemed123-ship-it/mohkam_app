import { useState, useEffect } from 'react';
import { Crown, Zap, Users, Lock, Check, MapPin, Wallet, CreditCard, Shield, ArrowRight, Globe, DollarSign } from 'lucide-react';
import { Button, Card, Badge, Spinner } from '../atoms';
import { supabase } from '../../services/supabase';
import { useRole, type Tier } from '../../context/RoleContext';

interface SubScreenProps {
  profile: any;
  onUpdateProfile: (p: any) => void;
  push: (msg: string, type: 'success' | 'warning' | 'danger') => void;
  caseCount?: number;
}

/* Currency conversion rates (USD base) */
const CURRENCY_RATES: Record<string, { rate: number; symbol: string; name: string; nameAr: string }> = {
  USD: { rate: 1, symbol: '$', name: 'US Dollar', nameAr: 'دولار أمريكي' },
  EGP: { rate: 48.5, symbol: 'ج', name: 'Egyptian Pound', nameAr: 'جنيه مصري' },
  SAR: { rate: 3.75, symbol: 'ر.س', name: 'Saudi Riyal', nameAr: 'ريال سعودي' },
  AED: { rate: 3.67, symbol: 'د.إ', name: 'UAE Dirham', nameAr: 'درهم إماراتي' },
};

/* Base prices in USD */
const BASE_PRICES: Record<string, { monthly: number; name: string; nameAr: string }> = {
  free: { monthly: 0, name: 'Free', nameAr: 'مجاني' },
  premium: { monthly: 20, name: 'Pro', nameAr: 'احترافي' },
  team: { monthly: 50, name: 'Team', nameAr: 'فريق' },
};

/* Translations */
const TRANSLATIONS = {
  ar: {
    subscription: 'الباقات والاشتراكات',
    currentPlan: 'باقتك الحالية',
    month: 'شهر',
    features: {
      free: ['3 قضايا فقط', 'تسجيل صوتي أساسي', 'بوابة الموكل'],
      premium: ['قضايا غير محدودة', 'شات real-time', 'إشعارات FCM', 'رابط دعوة', 'تحليل صوتي'],
      team: ['كل ميزات الاحترافي', 'حتى 10 محامين', 'تقارير مالية', 'دعم أولوية', 'سكرتير ومحاسب'],
    },
    subscribeNow: 'اشترك الآن',
    currentPlanBtn: 'خطتك الحالية',
    popular: 'الأكثر شعبية',
    lawFirms: 'مكاتب المحامين',
    checkoutTitle: 'صفحة دفع',
    securePayment: 'دفع آمن',
    selectPayment: 'اختر طريقة الدفع',
    amountDue: 'المبلغ المطلوب',
    monthly: 'شهرياً',
    payNow: 'ادفع الآن',
    processing: 'جاري المعالجة...',
    paymentSuccess: 'تم الدفع بنجاح!',
    cardDetails: 'بيانات البطاقة',
    cardName: 'اسم حامل البطاقة',
    cardNumber: 'رقم البطاقة',
    expiry: 'تاريخ الانتهاء',
    cvv: 'CVV',
    card: 'بطاقة ائتمانية',
    cardDesc: 'فيزا / ماستركارد / Meeza',
    terms: 'بالضغط على "ادفع" فإنك توافق على شروط الاستخدام وسياسة الخصوصية.',
  },
  en: {
    subscription: 'Subscriptions & Plans',
    currentPlan: 'Your current plan',
    month: 'month',
    features: {
      free: ['3 cases only', 'Basic voice recording', 'Client Portal'],
      premium: ['Unlimited cases', 'Real-time chat', 'FCM notifications', 'Invite link', 'Voice analysis'],
      team: ['All Pro features', 'Up to 10 lawyers', 'Financial reports', 'Priority support', 'Secretary & accountant'],
    },
    subscribeNow: 'Subscribe Now',
    currentPlanBtn: 'Your Current Plan',
    popular: 'Most Popular',
    lawFirms: 'Law Firms',
    checkoutTitle: 'Checkout',
    securePayment: 'Secure Payment',
    selectPayment: 'Select payment method',
    amountDue: 'Amount Due',
    monthly: 'monthly',
    payNow: 'Pay Now',
    processing: 'Processing...',
    paymentSuccess: 'Payment Successful!',
    cardDetails: 'Card Details',
    cardName: 'Cardholder Name',
    cardNumber: 'Card Number',
    expiry: 'Expiry Date',
    cvv: 'CVV',
    card: 'Credit Card',
    cardDesc: 'Visa / Mastercard / Meeza',
    terms: 'By clicking "Pay Now", you agree to the Terms of Service and Privacy Policy.',
  },
};

interface TierInfo {
  id: Tier;
  priceUSD: number;
  icon: typeof Crown;
  color: string;
  badge?: { ar: string; en: string };
}

const TIERS: TierInfo[] = [
  { id: 'free', priceUSD: 0, icon: Zap, color: 'var(--muted)' },
  { id: 'premium', priceUSD: 20, icon: Crown, color: 'var(--navy)', badge: { ar: 'الأكثر شعبية', en: 'Most Popular' } },
  { id: 'team', priceUSD: 50, icon: Users, color: 'var(--gold)', badge: { ar: 'مكاتب المحامين', en: 'Law Firms' } },
];

/* Payment channels */
const PAYMENT_CHANNELS = [
  { id: 'card', icon: '💳', color: '#635BFF' },
];

function detectCurrency(): string {
  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    const lang = navigator.language || '';
    if (tz.includes('Cairo') || tz.includes('Egypt') || lang === 'ar-EG') return 'EGP';
    if (tz.includes('Riyadh') || tz.includes('Saudi') || lang === 'ar-SA') return 'SAR';
    if (tz.includes('Dubai') || tz.includes('Abu') || lang === 'ar-AE') return 'AED';
    return 'USD';
  } catch { return 'USD'; }
}

function detectLang(): 'ar' | 'en' {
  const navLang = navigator.language || '';
  if (navLang.startsWith('ar')) return 'ar';
  if (navLang.startsWith('en')) return 'en';
  return 'ar';
}

export function SubScreen({ profile, onUpdateProfile, push, caseCount = 0 }: SubScreenProps) {
  const [upgrading, setUpgrading] = useState<string | null>(null);
  const [currency, setCurrency] = useState<string>('USD');
  const [lang, setLang] = useState<'ar' | 'en'>('ar');
  const { isTeamLocked, tier } = useRole();

  /* Checkout modal state */
  const [showCheckout, setShowCheckout] = useState(false);
  const [selectedTier, setSelectedTier] = useState<TierInfo | null>(null);
  const [processing, setProcessing] = useState(false);
  const [paymentSuccess, setPaymentSuccess] = useState(false);

  /* Cardholder form state */
  const [cardName, setCardName] = useState('');
  const [cardNumber, setCardNumber] = useState('');
  const [cardExpiry, setCardExpiry] = useState('');
  const [cardCVV, setCardCVV] = useState('');

  useEffect(() => {
    setCurrency(detectCurrency());
    setLang(detectLang());
  }, []);

  const t = TRANSLATIONS[lang];
  const curr = CURRENCY_RATES[currency];

  const convertPrice = (usd: number) => {
    const converted = usd * curr.rate;
    if (currency === 'USD') return `$${converted.toFixed(0)}`;
    return `${converted.toFixed(0)} ${curr.symbol}`;
  };

  const isCurTier = (tierId: string) => (profile?.tier || 'free') === tierId;
  const isFreeTierLocked = tier === 'free' && caseCount >= 3;

  const openCheckout = (tierInfo: TierInfo) => {
    if (tierInfo.id === 'free') return;
    setSelectedTier(tierInfo);
    setCardName('');
    setCardNumber('');
    setCardExpiry('');
    setCardCVV('');
    setPaymentSuccess(false);
    setShowCheckout(true);
  };

  const closeCheckout = () => {
    if (processing) return;
    setShowCheckout(false);
    setSelectedTier(null);
  };

  const processPayment = async () => {
    if (!selectedTier || !cardName || !cardNumber || cardNumber.length < 15) return;

    setProcessing(true);

    try {
      /* Invoke Edge Function for checkout session */
      const { data, error } = await supabase.functions.invoke('create-checkout-session', {
        body: {
          tier: selectedTier.id,
          amount: selectedTier.priceUSD,
          currency: currency.toLowerCase(),
          cardholder: {
            name: cardName,
            last4: cardNumber.slice(-4),
          },
        },
      });

      if (error) throw error;

      /* Update profile on success */
      const { error: updateError } = await supabase.from('profiles').update({
        tier: selectedTier.id,
        started_at: new Date().toISOString(),
        expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
      }).eq('id', profile.id);

      if (updateError) throw updateError;

      setPaymentSuccess(true);
      const updated = {
        ...profile,
        tier: selectedTier.id,
        started_at: new Date().toISOString(),
        expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()
      };
      onUpdateProfile(updated);
      push(lang === 'ar' ? `✓ تمت الترقية بنجاح!` : `✓ Upgrade successful!`, 'success');

      setTimeout(() => {
        setShowCheckout(false);
        setSelectedTier(null);
      }, 2000);
    } catch (err: any) {
      push(lang === 'ar' ? 'خطأ في الدفع: ' + err.message : 'Payment error: ' + err.message, 'danger');
    }

    setProcessing(false);
  };

  return (
    <div className="fade-up" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Header with language/currency selector */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h3 style={{ fontWeight: 800, color: 'var(--navy)', fontSize: 18 }}>{t.subscription}</h3>
          <p style={{ fontSize: 13, color: 'var(--muted)', marginTop: 4 }}>
            {t.currentPlan}: <strong>{BASE_PRICES[profile?.tier || 'free'].nameAr}</strong>
          </p>
        </div>

        <div style={{ display: 'flex', gap: 8 }}>
          {/* Language toggle */}
          <button onClick={() => setLang(lang === 'ar' ? 'en' : 'ar')} style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '6px 10px', background: '#F5F8FF', borderRadius: 6, border: '1px solid var(--border)', cursor: 'pointer' }}>
            <Globe size={12} color="var(--navy)" />
            <span style={{ fontSize: 11, fontWeight: 700 }}>{lang === 'ar' ? 'EN' : 'ع'}</span>
          </button>

          {/* Currency selector */}
          <select value={currency} onChange={(e) => setCurrency(e.target.value)} style={{ padding: '6px 10px', borderRadius: 6, border: '1px solid var(--border)', fontSize: 11, fontWeight: 700, background: '#fff' }}>
            {Object.keys(CURRENCY_RATES).map((c) => (
              <option key={c} value={c}>{CURRENCY_RATES[c].symbol} {c}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Free tier locked warning */}
      {isFreeTierLocked && (
        <div style={{ background: '#FDECEF', borderRadius: 10, padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 10 }}>
          <Lock size={16} color="var(--danger)" />
          <div>
            <p style={{ fontSize: 13, fontWeight: 800, color: 'var(--danger)' }}>{lang === 'ar' ? 'تم الوصول للحد الأقصى' : 'Limit Reached'}</p>
            <p style={{ fontSize: 11, color: 'var(--muted)' }}>{lang === 'ar' ? 'باقة المجاني تسمح بـ 3 قضايا فقط' : 'Free plan allows only 3 cases'}</p>
          </div>
        </div>
      )}

      {/* VERTICAL STACKED TIER CARDS - Mobile Optimized */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        {TIERS.map((tierInfo) => {
          const isCur = isCurTier(tierInfo.id);
          const isLocked = tierInfo.id === 'team' && isTeamLocked;
          const Icon = tierInfo.icon;

          return (
            <Card
              key={tierInfo.id}
              style={{
                padding: 20, position: 'relative', overflow: 'hidden',
                border: isCur ? `2px solid ${tierInfo.color}` : '1px solid var(--border)',
                boxShadow: isCur ? `0 4px 20px ${tierInfo.color}22` : 'var(--shadow)',
                transition: 'all .3s',
              }}
            >
              {/* Badge strip */}
              {tierInfo.badge && (
                <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 3, background: tierInfo.color }} />
              )}

              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
                <div style={{ width: 48, height: 48, borderRadius: 12, background: tierInfo.color + '18', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Icon size={24} color={tierInfo.color} />
                </div>
                <div style={{ flex: 1 }}>
                  <p style={{ fontWeight: 900, fontSize: 20, color: 'var(--text)' }}>
                    {lang === 'ar' ? BASE_PRICES[tierInfo.id].nameAr : BASE_PRICES[tierInfo.id].name}
                  </p>
                  {tierInfo.badge && <Badge color={tierInfo.id === 'team' ? 'gold' : 'navy'}>{lang === 'ar' ? tierInfo.badge.ar : tierInfo.badge.en}</Badge>}
                </div>
                {tierInfo.priceUSD > 0 && (
                  <div style={{ textAlign: lang === 'ar' ? 'right' : 'left' }}>
                    <p style={{ fontSize: 24, fontWeight: 900, color: tierInfo.color, fontFamily: "'JetBrains Mono', monospace" }}>
                      {convertPrice(tierInfo.priceUSD)}
                    </p>
                    <p style={{ fontSize: 10, color: 'var(--muted)' }}>/ {t.month}</p>
                  </div>
                )}
              </div>

              {/* Features list */}
              <ul style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 16, paddingLeft: lang === 'en' ? 18 : 0 }}>
                {t.features[tierInfo.id].map((f) => (
                  <li key={f} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'var(--text)' }}>
                    <div style={{ width: 18, height: 18, borderRadius: '50%', background: tierInfo.color + '20', color: tierInfo.color, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                      <Check size={10} />
                    </div>
                    {f}
                  </li>
                ))}
              </ul>

              {/* Subscribe button */}
              <Button
                variant={isCur ? 'secondary' : tierInfo.id === 'team' ? 'gold' : 'primary'}
                disabled={isCur || upgrading === tierInfo.id || isLocked}
                onClick={() => !isLocked && openCheckout(tierInfo)}
                fullWidth
                style={{ background: isCur ? undefined : tierInfo.color }}
              >
                {upgrading === tierInfo.id ? <><Spinner /> {t.processing}</> : isCur ? t.currentPlanBtn : t.subscribeNow}
              </Button>

              {/* Lock overlay */}
              {isLocked && (
                <div style={{ position: 'absolute', inset: 0, background: 'rgba(255,255,255,.7)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 'var(--radius)', zIndex: 10 }}>
                  <Badge color="gold"><Lock size={10} style={{ marginRight: 4 }} /> {lang === 'ar' ? 'مقفلة' : 'Locked'}</Badge>
                </div>
              )}
            </Card>
          );
        })}
      </div>

      {/* ==================== CHECKOUT MODAL ==================== */}
      {showCheckout && selectedTier && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(10,20,60,.85)', backdropFilter: 'blur(8px)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
          <Card className="slide-up" style={{ width: '100%', maxWidth: 440, overflow: 'hidden' }}>
            {/* Header */}
            <div style={{ background: 'linear-gradient(135deg, var(--navy), var(--navy-light))', padding: '18px 20px', color: '#fff' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div>
                  <p style={{ fontSize: 16, fontWeight: 900 }}>{t.checkoutTitle}</p>
                  <p style={{ fontSize: 11, opacity: 0.7 }}>{t.securePayment}</p>
                </div>
                {!processing && (
                  <button onClick={closeCheckout} style={{ background: 'rgba(255,255,255,.15)', border: 'none', color: '#fff', width: 32, height: 32, borderRadius: 8, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    ×
                  </button>
                )}
              </div>
            </div>

            {paymentSuccess ? (
              <div className="fade-up" style={{ padding: 32, textAlign: 'center' }}>
                <div style={{ width: 64, height: 64, borderRadius: '50%', background: '#E6F7EF', margin: '0 auto 12px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Check size={32} color="var(--success)" />
                </div>
                <p style={{ fontSize: 18, fontWeight: 900, color: 'var(--success)', marginBottom: 6 }}>{t.paymentSuccess}</p>
                <p style={{ fontSize: 13, color: 'var(--muted)' }}>{t.subscription}</p>
              </div>
            ) : (
              <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 16 }}>
                {/* Amount Display */}
                <div style={{ background: 'linear-gradient(135deg, #FFFBEB, #FEF3C7)', borderRadius: 14, padding: 16, textAlign: 'center', border: '2px solid var(--gold)' }}>
                  <p style={{ fontSize: 11, color: 'var(--muted)', fontWeight: 700, marginBottom: 4 }}>{t.amountDue}</p>
                  <p style={{ fontSize: 36, fontWeight: 900, color: 'var(--gold)', fontFamily: "'JetBrains Mono', monospace" }}>
                    {convertPrice(selectedTier.priceUSD)}
                  </p>
                  <p style={{ fontSize: 10, color: 'var(--muted)' }}>{t.monthly}</p>
                </div>

                {/* Cardholder Details Form */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  <p style={{ fontSize: 12, fontWeight: 800, color: 'var(--navy)' }}>{t.cardDetails}</p>

                  <input
                    type="text"
                    value={cardName}
                    onChange={(e) => setCardName(e.target.value)}
                    placeholder={t.cardName}
                    style={{ padding: '12px 14px', border: '1.5px solid var(--border)', borderRadius: 10, fontSize: 13, fontFamily: "'Cairo',sans-serif", width: '100%' }}
                  />

                  <input
                    type="text"
                    value={cardNumber}
                    onChange={(e) => setCardNumber(e.target.value.replace(/\D/g, '').slice(0, 16))}
                    placeholder={t.cardNumber}
                    style={{ padding: '12px 14px', border: '1.5px solid var(--border)', borderRadius: 10, fontSize: 13, fontFamily: "'JetBrains Mono', monospace", width: '100%', direction: 'ltr' }}
                  />

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                    <input
                      type="text"
                      value={cardExpiry}
                      onChange={(e) => setCardExpiry(e.target.value)}
                      placeholder={t.expiry}
                      style={{ padding: '12px 14px', border: '1.5px solid var(--border)', borderRadius: 10, fontSize: 13, fontFamily: "'JetBrains Mono', monospace" }}
                    />
                    <input
                      type="text"
                      value={cardCVV}
                      onChange={(e) => setCardCVV(e.target.value.replace(/\D/g, '').slice(0, 4))}
                      placeholder={t.cvv}
                      style={{ padding: '12px 14px', border: '1.5px solid var(--border)', borderRadius: 10, fontSize: 13, fontFamily: "'JetBrains Mono', monospace" }}
                    />
                  </div>
                </div>

                {/* Security Notice */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', background: '#F5F8FF', borderRadius: 8 }}>
                  <Shield size={14} color="var(--navy)" />
                  <p style={{ fontSize: 10, color: 'var(--muted)' }}>{lang === 'ar' ? 'دفع آمن ومشفر 256-bit' : '256-bit encrypted secure payment'}</p>
                </div>

                {/* Pay Button */}
                <Button
                  variant="gold"
                  fullWidth
                  disabled={!cardName || cardNumber.length < 15 || processing}
                  onClick={processPayment}
                  style={{ padding: '14px 20px', fontSize: 15, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}
                >
                  {processing ? <><Spinner /> {t.processing}</> : <><Wallet size={16} /> {t.payNow}</>}
                </Button>

                <p style={{ fontSize: 9, color: 'var(--muted)', textAlign: 'center', lineHeight: 1.5 }}>{t.terms}</p>
              </div>
            )}
          </Card>
        </div>
      )}
    </div>
  );
}
