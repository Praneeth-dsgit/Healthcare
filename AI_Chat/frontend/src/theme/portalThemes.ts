import {
  LayoutDashboard,
  Stethoscope,
  Scan,
  TestTube,
  Users,
  type LucideIcon,
} from 'lucide-react';

export type PortalId = 'patient' | 'doctor' | 'radiology' | 'lab' | 'frontdesk';

export interface PortalTheme {
  id: PortalId;
  label: string;
  accent: string;
  accentLight: string;
  accentMuted: string;
  gradientFrom: string;
  gradientTo: string;
  icon: LucideIcon;
  textClass: string;
  bgClass: string;
  subtitle: string;
}

export const PORTAL_THEMES: Record<PortalId, PortalTheme> = {
  patient: {
    id: 'patient',
    label: 'Patient Portal',
    accent: '#2dd4bf',
    accentLight: '#5eead4',
    accentMuted: 'rgba(45, 212, 191, 0.14)',
    gradientFrom: '#0f766e',
    gradientTo: '#164e63',
    icon: LayoutDashboard,
    textClass: 'text-teal-300',
    bgClass: 'bg-teal-500/15',
    subtitle: 'Manage your health, appointments, and records',
  },
  doctor: {
    id: 'doctor',
    label: 'General Practitioner',
    accent: '#38bdf8',
    accentLight: '#7dd3fc',
    accentMuted: 'rgba(56, 189, 248, 0.14)',
    gradientFrom: '#0284c7',
    gradientTo: '#312e81',
    icon: Stethoscope,
    textClass: 'text-sky-300',
    bgClass: 'bg-sky-500/15',
    subtitle: 'Manage appointments, prescriptions, and patient care',
  },
  radiology: {
    id: 'radiology',
    label: 'Radiology Assistant',
    accent: '#818cf8',
    accentLight: '#a5b4fc',
    accentMuted: 'rgba(129, 140, 248, 0.14)',
    gradientFrom: '#4f46e5',
    gradientTo: '#312e81',
    icon: Scan,
    textClass: 'text-indigo-300',
    bgClass: 'bg-indigo-500/15',
    subtitle: 'Interpret imaging and assist with radiology workflows',
  },
  lab: {
    id: 'lab',
    label: 'Lab Assistant',
    accent: '#34d399',
    accentLight: '#6ee7b7',
    accentMuted: 'rgba(52, 211, 153, 0.14)',
    gradientFrom: '#059669',
    gradientTo: '#134e4a',
    icon: TestTube,
    textClass: 'text-emerald-300',
    bgClass: 'bg-emerald-500/15',
    subtitle: 'Interpret lab results and assist with laboratory workflows',
  },
  frontdesk: {
    id: 'frontdesk',
    label: 'Frontdesk',
    accent: '#fbbf24',
    accentLight: '#fcd34d',
    accentMuted: 'rgba(251, 191, 36, 0.14)',
    gradientFrom: '#d97706',
    gradientTo: '#7c2d12',
    icon: Users,
    textClass: 'text-amber-300',
    bgClass: 'bg-amber-500/15',
    subtitle: 'Manage patient communications and reception operations',
  },
};

export function getPortalTheme(portal: PortalId): PortalTheme {
  return PORTAL_THEMES[portal];
}

export function capabilityToPortal(capability: string | null): PortalId {
  switch (capability) {
    case 'general':
      return 'doctor';
    case 'radiology':
      return 'radiology';
    case 'lab':
      return 'lab';
    case 'engagement':
      return 'frontdesk';
    default:
      return 'patient';
  }
}
