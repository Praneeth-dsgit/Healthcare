import type {
  NetworkProfile,
  NetworkConnection,
  NetworkMessage,
  FeedPost,
  NetworkGroup,
} from '../../services/doctorNetworkService';

export const FIXTURE_PROFILE: NetworkProfile = {
  doctorId: 1,
  name: 'Dr. Ananya Sharma',
  headline: 'General Physician | Telehealth & Preventive Care',
  specialty: 'General Medicine',
  credentials: 'MBBS, MD (General Medicine)',
  hospital: 'Acufore Central Clinic',
  experienceYears: 12,
  verified: true,
  endorsements: [
    { skill: 'Patient Communication', count: 24 },
    { skill: 'Telemedicine', count: 18 },
    { skill: 'Chronic Disease Management', count: 31 },
  ],
  visibility: 'connections',
};

export const FIXTURE_CONNECTIONS: NetworkConnection[] = [
  {
    id: 'conn-1',
    doctorId: 201,
    name: 'Dr. Vikram Reddy',
    specialty: 'Cardiology',
    hospital: 'HeartCare Institute',
    status: 'connected',
    mutualConnections: 12,
  },
  {
    id: 'conn-2',
    doctorId: 202,
    name: 'Dr. Meera Iyer',
    specialty: 'Neurology',
    hospital: 'NeuroCare Center',
    status: 'connected',
    mutualConnections: 8,
  },
  {
    id: 'conn-suggest-1',
    doctorId: 301,
    name: 'Dr. Rahul Verma',
    specialty: 'Pulmonology',
    hospital: 'Lung Health Center',
    status: 'suggested',
    mutualConnections: 5,
  },
  {
    id: 'conn-suggest-2',
    doctorId: 302,
    name: 'Dr. Kavitha Sundaram',
    specialty: 'Rheumatology',
    hospital: 'Joint & Autoimmune Clinic',
    status: 'suggested',
    mutualConnections: 3,
  },
];

export const FIXTURE_MESSAGES: NetworkMessage[] = [
  {
    id: 'thread-1',
    participantName: 'Dr. Vikram Reddy',
    participantId: 201,
    lastMessage: 'Thanks for the referral — I reviewed the ECG and will see the patient tomorrow.',
    lastAt: new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString(),
    unread: 1,
    messages: [
      {
        id: 'm1',
        sender: 'me',
        text: 'Hi Vikram, referring Lakshmi Devi for cardiac evaluation. ECG attached in referral.',
        at: new Date(Date.now() - 5 * 60 * 60 * 1000).toISOString(),
      },
      {
        id: 'm2',
        sender: 'them',
        text: 'Thanks for the referral — I reviewed the ECG and will see the patient tomorrow.',
        at: new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString(),
      },
    ],
  },
  {
    id: 'thread-2',
    participantName: 'Dr. Meera Iyer',
    participantId: 202,
    lastMessage: 'Are you attending the neurology conference next month?',
    lastAt: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
    unread: 0,
    messages: [
      {
        id: 'm3',
        sender: 'them',
        text: 'Are you attending the neurology conference next month?',
        at: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
      },
    ],
  },
];

export const FIXTURE_FEED: FeedPost[] = [
  {
    id: 'post-1',
    author: 'Dr. Vikram Reddy',
    authorSpecialty: 'Cardiology',
    content:
      'New ACC guidelines on hypertension management emphasize earlier combination therapy. Happy to discuss cases with colleagues.',
    type: 'publication',
    likes: 42,
    comments: 8,
    at: new Date(Date.now() - 6 * 60 * 60 * 1000).toISOString(),
  },
  {
    id: 'post-2',
    author: 'Dr. Meera Iyer',
    authorSpecialty: 'Neurology',
    content:
      'Interesting case discussion: 58F with transient visual disturbances — posterior circulation TIA vs migraine aura. What would you rule out first?',
    type: 'case',
    likes: 28,
    comments: 15,
    at: new Date(Date.now() - 18 * 60 * 60 * 1000).toISOString(),
  },
  {
    id: 'post-3',
    author: 'Acufore Medical Network',
    authorSpecialty: 'Admin',
    content:
      'Join us for the Annual Telehealth Summit on March 15. CME credits available for all specialties.',
    type: 'event',
    likes: 67,
    comments: 12,
    at: new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString(),
  },
];

export const FIXTURE_GROUPS: NetworkGroup[] = [
  {
    id: 'grp-1',
    name: 'Telehealth Practitioners',
    members: 1240,
    description: 'Best practices, tools, and case discussions for virtual care.',
    joined: false,
  },
  {
    id: 'grp-2',
    name: 'Hyderabad Physicians Network',
    members: 856,
    description: 'Local referral network and continuing medical education.',
    joined: true,
  },
  {
    id: 'grp-3',
    name: 'Chronic Care Management',
    members: 2103,
    description: 'Diabetes, hypertension, and long-term patient management.',
    joined: false,
  },
];
