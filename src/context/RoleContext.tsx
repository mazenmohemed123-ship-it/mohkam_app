import { createContext, useContext, useState, type ReactNode } from 'react';

export type FirmRole = 'owner' | 'partner' | 'lawyer' | 'assistant' | 'secretary' | 'accountant';
export type Tier = 'free' | 'premium' | 'team';

export interface Profile {
  id: string;
  full_name: string;
  phone_number?: string;
  role: FirmRole | 'client';
  tier: Tier;
  office_address?: string;
  avatar_url?: string;
  bio?: string;
  is_emergency_enabled: boolean;
  linked_lawyer_id?: string;
  device_fingerprint?: string;
  started_at?: string;
  expires_at?: string;
  cancelled_at?: string;
  // Manual billing credentials
  vodafone_cash_number?: string;
  instapay_address?: string;
  bank_account_details?: {
    iban?: string;
    bank_name?: string;
    account_holder?: string;
    account_number?: string;
    country?: string;
    [key: string]: any;
  };
}

interface RoleContextType {
  profile: Profile | null;
  setProfile: (p: Profile | null) => void;
  activeRole: FirmRole;
  setActiveRole: (r: FirmRole) => void;
  tier: Tier;
  canDeleteCase: boolean;
  canUploadFiles: boolean;
  canEditJudgment: boolean;
  canViewChat: boolean;
  canViewCaseDetails: boolean;
  canManageBilling: boolean;
  canManageTeam: boolean;
  isTeamLocked: boolean;
}

const RoleContext = createContext<RoleContextType | undefined>(undefined);

export function RoleProvider({ children }: { children: ReactNode }) {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [activeRole, setActiveRole] = useState<FirmRole>('lawyer');

  const tier = profile?.tier || 'free';

  const canDeleteCase = activeRole === 'owner' || activeRole === 'partner';
  const canUploadFiles = activeRole !== 'secretary' && activeRole !== 'accountant';
  const canEditJudgment = activeRole === 'lawyer' || activeRole === 'partner' || activeRole === 'owner';
  const canViewChat = activeRole !== 'accountant';
  const canViewCaseDetails = activeRole !== 'accountant';
  const canManageBilling = activeRole === 'owner' || activeRole === 'partner' || activeRole === 'accountant';
  const canManageTeam = activeRole === 'owner' || activeRole === 'partner';
  const isTeamLocked = tier === 'free';

  return (
    <RoleContext.Provider
      value={{
        profile,
        setProfile,
        activeRole,
        setActiveRole,
        tier,
        canDeleteCase,
        canUploadFiles,
        canEditJudgment,
        canViewChat,
        canViewCaseDetails,
        canManageBilling,
        canManageTeam,
        isTeamLocked,
      }}
    >
      {children}
    </RoleContext.Provider>
  );
}

export function useRole() {
  const ctx = useContext(RoleContext);
  if (!ctx) throw new Error('useRole must be used within RoleProvider');
  return ctx;
}
