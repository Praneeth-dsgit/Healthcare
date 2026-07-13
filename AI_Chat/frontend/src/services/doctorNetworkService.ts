import { getAuthHeaders, authenticatedFetch, getAccessToken } from './authService';
import { getApiRoot } from '../utils/apiBase';
import { doctorService, type Doctor } from './doctorService';
import { DEMO_FEATURES_ENABLED } from '../demo/demoConfig';
import { getDemoState, updateDemoState } from '../demo/demoStorage';
import {
  FIXTURE_PROFILE,
  FIXTURE_CONNECTIONS,
  FIXTURE_MESSAGES,
  FIXTURE_FEED,
  FIXTURE_GROUPS,
} from '../demo/fixtures/doctorNetwork';

const API_BASE = getApiRoot();

export interface NetworkProfile {
  doctorId: number;
  name: string;
  headline: string;
  specialty: string;
  credentials: string;
  hospital: string;
  experienceYears: number;
  verified: boolean;
  endorsements: { skill: string; count: number }[];
  visibility: 'public' | 'connections';
}

export interface NetworkConnection {
  id: string;
  doctorId: number;
  name: string;
  specialty: string;
  hospital: string;
  status: 'connected' | 'suggested' | 'pending';
  mutualConnections: number;
}

export interface NetworkMessage {
  id: string;
  participantName: string;
  participantId: number;
  lastMessage: string;
  lastAt: string;
  unread: number;
  messages: { id: string; sender: 'me' | 'them'; text: string; at: string }[];
}

export interface FeedPost {
  id: string;
  author: string;
  authorSpecialty: string;
  content: string;
  type: 'publication' | 'case' | 'event';
  likes: number;
  comments: number;
  at: string;
  likedByMe?: boolean;
}

export interface NetworkGroup {
  id: string;
  name: string;
  members: number;
  description: string;
  joined: boolean;
}

async function apiFetch<T>(path: string, init?: RequestInit): Promise<T | null> {
  try {
    const response = await authenticatedFetch(`${API_BASE}/doctor-network${path}`, {
      ...init,
      headers: {
        ...getAuthHeaders(),
        ...(init?.headers || {}),
      },
    });
    if (!response.ok) return null;
    return (await response.json()) as T;
  } catch {
    return null;
  }
}

function parseDoctorId(connectionId: string): number | null {
  const direct = Number(connectionId);
  if (!Number.isNaN(direct) && direct > 0) return direct;
  const match = connectionId.match(/(\d+)/);
  return match ? Number(match[1]) : null;
}

function isLoggedIn(): boolean {
  return Boolean(getAccessToken());
}

function profileFromDoctor(d: Doctor): NetworkProfile {
  const specialty = d.specialty_name || d.specialty?.name || 'General Medicine';
  const hospital = d.facility_name || 'Independent practice';
  const bioHeadline = d.bio?.trim().split('\n')[0]?.slice(0, 120);
  return {
    doctorId: d.doctor_id,
    name: `Dr. ${d.first_name} ${d.last_name}`.trim(),
    headline: bioHeadline || `${specialty} | ${hospital}`,
    specialty,
    credentials: d.qualification || 'MD',
    hospital,
    experienceYears: d.experience_years || 0,
    verified: true,
    endorsements: [{ skill: specialty, count: 1 }],
    visibility: 'connections',
  };
}

async function loadCurrentDoctorProfile(): Promise<NetworkProfile | null> {
  const result = await doctorService.getCurrentDoctor();
  if (result.success && result.doctor) {
    return profileFromDoctor(result.doctor);
  }
  return null;
}

class DoctorNetworkService {
  async getProfile(): Promise<{ success: boolean; profile: NetworkProfile; error?: string }> {
    const data = await apiFetch<{ success: boolean; profile: NetworkProfile }>('/profile');
    if (data?.success && data.profile) {
      return { success: true, profile: data.profile };
    }

    const fromDoctor = await loadCurrentDoctorProfile();
    if (fromDoctor) {
      return { success: true, profile: fromDoctor };
    }

    if (DEMO_FEATURES_ENABLED && !isLoggedIn()) {
      return { success: true, profile: FIXTURE_PROFILE };
    }

    return {
      success: false,
      profile: {
        doctorId: 0,
        name: 'Doctor',
        headline: '',
        specialty: '',
        credentials: '',
        hospital: '',
        experienceYears: 0,
        verified: false,
        endorsements: [],
        visibility: 'connections',
      },
      error: 'Could not load profile',
    };
  }

  async updateProfileVisibility(
    visibility: 'public' | 'connections'
  ): Promise<{ success: boolean; error?: string }> {
    const data = await apiFetch<{ success: boolean }>('/profile/visibility', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ visibility }),
    });
    if (data?.success) return { success: true };

    if (DEMO_FEATURES_ENABLED && !isLoggedIn()) {
      FIXTURE_PROFILE.visibility = visibility;
      return { success: true };
    }
    return { success: false, error: 'Failed to update visibility' };
  }

  async getConnections(): Promise<{ success: boolean; connections: NetworkConnection[] }> {
    const data = await apiFetch<{ success: boolean; connections: NetworkConnection[] }>(
      '/connections'
    );
    if (data?.success && data.connections?.length) {
      return { success: true, connections: data.connections };
    }

    if (DEMO_FEATURES_ENABLED) {
      const connectedIds = getDemoState().networkConnections;
      const list = FIXTURE_CONNECTIONS.map((c) =>
        connectedIds.includes(c.id) ? { ...c, status: 'connected' as const } : c
      );
      return { success: true, connections: list };
    }
    return { success: true, connections: data?.connections ?? [] };
  }

  async connect(connectionId: string): Promise<{ success: boolean; error?: string }> {
    const doctorId = parseDoctorId(connectionId);
    const data = await apiFetch<{ success: boolean }>('/connections', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ doctorId, connectionId }),
    });
    if (data?.success) return { success: true };

    if (DEMO_FEATURES_ENABLED) {
      const ids = [...getDemoState().networkConnections];
      if (!ids.includes(connectionId)) ids.push(connectionId);
      updateDemoState({ networkConnections: ids });
      return { success: true };
    }
    return { success: false, error: 'Failed to connect' };
  }

  async getMessages(): Promise<{ success: boolean; threads: NetworkMessage[] }> {
    const data = await apiFetch<{ success: boolean; threads: NetworkMessage[] }>('/messages');
    if (data?.success && data.threads) {
      return { success: true, threads: data.threads };
    }

    if (DEMO_FEATURES_ENABLED && !isLoggedIn()) {
      return { success: true, threads: FIXTURE_MESSAGES };
    }
    return { success: true, threads: [] };
  }

  async sendMessage(threadId: string, text: string): Promise<{ success: boolean; error?: string }> {
    const data = await apiFetch<{ success: boolean }>(
      `/messages/${encodeURIComponent(threadId)}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text }),
      }
    );
    if (data?.success) return { success: true };

    if (DEMO_FEATURES_ENABLED && !isLoggedIn()) {
      const thread = FIXTURE_MESSAGES.find((t) => t.id === threadId);
      if (thread) {
        thread.messages.push({
          id: `msg-${Date.now()}`,
          sender: 'me',
          text,
          at: new Date().toISOString(),
        });
        thread.lastMessage = text;
        thread.lastAt = new Date().toISOString();
      }
      return { success: true };
    }
    return { success: false, error: 'Failed to send message' };
  }

  async getFeed(): Promise<{ success: boolean; posts: FeedPost[] }> {
    const data = await apiFetch<{ success: boolean; posts: FeedPost[] }>('/feed');
    if (data?.success && data.posts) {
      return { success: true, posts: data.posts };
    }

    if (DEMO_FEATURES_ENABLED && !isLoggedIn()) {
      const extra = getDemoState().feedPosts as FeedPost[];
      return { success: true, posts: [...FIXTURE_FEED, ...extra] };
    }
    return { success: true, posts: [] };
  }

  async likePost(postId: string): Promise<{ success: boolean; error?: string }> {
    const data = await apiFetch<{ success: boolean }>(
      `/feed/${encodeURIComponent(postId)}/like`,
      { method: 'POST' }
    );
    if (data?.success) return { success: true };

    if (DEMO_FEATURES_ENABLED && !isLoggedIn()) {
      const post = FIXTURE_FEED.find((p) => p.id === postId);
      if (post) post.likes += 1;
      return { success: true };
    }
    return { success: false, error: 'Failed to like post' };
  }

  async getGroups(): Promise<{ success: boolean; groups: NetworkGroup[] }> {
    const data = await apiFetch<{ success: boolean; groups: NetworkGroup[] }>('/groups');
    if (data?.success && data.groups) {
      return { success: true, groups: data.groups };
    }

    if (DEMO_FEATURES_ENABLED && !isLoggedIn()) {
      const joined = getDemoState().joinedGroups;
      const groups = FIXTURE_GROUPS.map((g) => ({
        ...g,
        joined: joined.includes(g.id) || g.joined,
      }));
      return { success: true, groups };
    }
    return { success: true, groups: [] };
  }

  async joinGroup(groupId: string): Promise<{ success: boolean; error?: string }> {
    const data = await apiFetch<{ success: boolean }>(
      `/groups/${encodeURIComponent(groupId)}/join`,
      { method: 'POST' }
    );
    if (data?.success) return { success: true };

    if (DEMO_FEATURES_ENABLED && !isLoggedIn()) {
      const ids = [...getDemoState().joinedGroups];
      if (!ids.includes(groupId)) ids.push(groupId);
      updateDemoState({ joinedGroups: ids });
      return { success: true };
    }
    return { success: false, error: 'Failed to join group' };
  }
}

export const doctorNetworkService = new DoctorNetworkService();
