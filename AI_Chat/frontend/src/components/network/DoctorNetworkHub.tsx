import React, { useEffect, useState, useMemo } from 'react';
import {
  User, Users, MessageSquare, Rss, UsersRound, BadgeCheck, ThumbsUp,
  Send, Shield, Eye, EyeOff, UserPlus, Building2,
} from 'lucide-react';
import SegmentTabs from '../ui/SegmentTabs';
import {
  doctorNetworkService,
  type NetworkProfile,
  type NetworkConnection,
  type NetworkMessage,
  type FeedPost,
  type NetworkGroup,
} from '../../services/doctorNetworkService';

type NetSection = 'profile' | 'connections' | 'messages' | 'feed' | 'groups';

const DoctorNetworkHub: React.FC = () => {
  const [section, setSection] = useState<NetSection>('feed');
  const [profile, setProfile] = useState<NetworkProfile | null>(null);
  const [connections, setConnections] = useState<NetworkConnection[]>([]);
  const [threads, setThreads] = useState<NetworkMessage[]>([]);
  const [activeThread, setActiveThread] = useState<NetworkMessage | null>(null);
  const [messageText, setMessageText] = useState('');
  const [posts, setPosts] = useState<FeedPost[]>([]);
  const [groups, setGroups] = useState<NetworkGroup[]>([]);
  const [toast, setToast] = useState('');

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(''), 2500);
  };

  useEffect(() => {
    doctorNetworkService.getProfile().then((r) => setProfile(r.profile));
    doctorNetworkService.getConnections().then((r) => setConnections(r.connections));
    doctorNetworkService.getMessages().then((r) => setThreads(r.threads));
    doctorNetworkService.getFeed().then((r) => setPosts(r.posts));
    doctorNetworkService.getGroups().then((r) => setGroups(r.groups));
  }, []);

  const handleConnect = async (id: string) => {
    await doctorNetworkService.connect(id);
    const r = await doctorNetworkService.getConnections();
    setConnections(r.connections);
    showToast('Connection request sent');
  };

  const handleSendMessage = async () => {
    if (!activeThread || !messageText.trim()) return;
    await doctorNetworkService.sendMessage(activeThread.id, messageText.trim());
    const r = await doctorNetworkService.getMessages();
    setThreads(r.threads);
    setActiveThread(r.threads.find((t) => t.id === activeThread.id) || null);
    setMessageText('');
  };

  const handleLike = async (postId: string) => {
    await doctorNetworkService.likePost(postId);
    const r = await doctorNetworkService.getFeed();
    setPosts(r.posts);
  };

  const handleJoinGroup = async (groupId: string) => {
    await doctorNetworkService.joinGroup(groupId);
    const r = await doctorNetworkService.getGroups();
    setGroups(r.groups);
    showToast('Joined group');
  };

  const handleVisibility = async (v: 'public' | 'connections') => {
    await doctorNetworkService.updateProfileVisibility(v);
    if (profile) setProfile({ ...profile, visibility: v });
    showToast(`Profile visibility: ${v}`);
  };

  const connected = useMemo(
    () => connections.filter((c) => c.status === 'connected'),
    [connections]
  );
  const available = useMemo(
    () => connections.filter((c) => c.status === 'suggested' || c.status === 'pending'),
    [connections]
  );

  const ConnectionCard: React.FC<{
    connection: NetworkConnection;
    onConnect?: (id: string) => void;
  }> = ({ connection, onConnect }) => (
    <article className="flex h-full flex-col rounded-xl border border-slate-700/50 bg-slate-900/40 p-4 transition-all hover:border-sky-500/30 hover:ring-1 hover:ring-sky-500/20">
      <div className="mb-3 flex items-start justify-between gap-2">
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-sky-500/15">
          <User className="h-6 w-6 text-sky-300" />
        </div>
        {connection.status === 'connected' ? (
          <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] font-bold uppercase text-emerald-300">
            Connected
          </span>
        ) : connection.status === 'pending' ? (
          <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] font-bold uppercase text-amber-300">
            Pending
          </span>
        ) : (
          <span className="rounded-full bg-teal-500/15 px-2 py-0.5 text-[10px] font-bold uppercase text-teal-300">
            Available
          </span>
        )}
      </div>
      <h3 className="font-bold text-slate-100">{connection.name}</h3>
      <p className="mt-1 text-sm text-slate-400">{connection.specialty}</p>
      <p className="mt-2 flex items-center gap-1.5 text-xs text-slate-500">
        <Building2 className="h-3.5 w-3.5 shrink-0" />
        {connection.hospital}
      </p>
      <p className="mt-1 text-xs text-slate-600">
        {connection.mutualConnections} mutual connection
        {connection.mutualConnections !== 1 ? 's' : ''}
      </p>
      <div className="mt-4 flex-1" />
      {connection.status === 'connected' ? (
        <button
          type="button"
          onClick={() => {
            setSection('messages');
            const thread = threads.find((t) => t.participantId === connection.doctorId);
            if (thread) setActiveThread(thread);
          }}
          className="ghost-button w-full rounded-lg py-2 text-xs font-semibold"
        >
          Message
        </button>
      ) : connection.status === 'pending' ? (
        <span className="block text-center text-xs font-semibold text-amber-400">Request sent</span>
      ) : onConnect ? (
        <button
          type="button"
          onClick={() => onConnect(connection.id)}
          className="primary-button flex w-full items-center justify-center gap-1.5 rounded-lg py-2 text-xs font-semibold"
        >
          <UserPlus className="h-3.5 w-3.5" /> Connect
        </button>
      ) : null}
    </article>
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <h2 className="text-lg font-bold text-slate-100">Professional Network</h2>
      </div>

      {toast && (
        <div className="rounded-lg bg-sky-500/15 px-3 py-2 text-sm font-semibold text-sky-300">{toast}</div>
      )}

      <SegmentTabs
        tabs={[
          { id: 'feed', label: 'Feed', icon: Rss },
          { id: 'profile', label: 'Profile', icon: User },
          { id: 'connections', label: 'Connections', icon: Users },
          { id: 'messages', label: 'Messages', icon: MessageSquare },
          { id: 'groups', label: 'Groups', icon: UsersRound },
        ]}
        activeTab={section}
        onChange={(id) => setSection(id as NetSection)}
      />

      {section === 'profile' && profile && (
        <div className="rounded-xl border border-slate-700/50 bg-slate-900/30 p-5">
          <div className="flex items-start gap-4">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-sky-500/15">
              <User className="h-8 w-8 text-sky-300" />
            </div>
            <div className="flex-1">
              <div className="flex items-center gap-2">
                <h3 className="text-xl font-bold text-slate-100">{profile.name}</h3>
                {profile.verified && (
                  <span className="flex items-center gap-1 rounded-full bg-sky-500/15 px-2 py-0.5 text-xs font-semibold text-sky-300" title="Credential verified by hospital admin">
                    <BadgeCheck className="h-3.5 w-3.5" /> Verified
                  </span>
                )}
              </div>
              <p className="text-sm text-slate-400">{profile.headline}</p>
              <p className="mt-1 text-xs text-slate-500">
                {profile.credentials} · {profile.hospital} · {profile.experienceYears} years
              </p>
            </div>
          </div>

          <div className="mt-5">
            <p className="mb-2 text-sm font-semibold text-slate-300">Endorsements</p>
            <div className="flex flex-wrap gap-2">
              {profile.endorsements.map((e) => (
                <span key={e.skill} className="rounded-full bg-slate-800 px-3 py-1 text-xs text-slate-300">
                  {e.skill} · {e.count}
                </span>
              ))}
            </div>
          </div>

          <div className="mt-5 border-t border-slate-700/50 pt-4">
            <p className="mb-2 flex items-center gap-2 text-sm font-semibold text-slate-300">
              <Shield className="h-4 w-4" /> Privacy
            </p>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => handleVisibility('public')}
                className={`flex items-center gap-1 rounded-lg px-3 py-1.5 text-xs font-semibold ${
                  profile.visibility === 'public' ? 'bg-sky-500/20 text-sky-300' : 'text-slate-500'
                }`}
              >
                <Eye className="h-3.5 w-3.5" /> Public
              </button>
              <button
                type="button"
                onClick={() => handleVisibility('connections')}
                className={`flex items-center gap-1 rounded-lg px-3 py-1.5 text-xs font-semibold ${
                  profile.visibility === 'connections' ? 'bg-sky-500/20 text-sky-300' : 'text-slate-500'
                }`}
              >
                <EyeOff className="h-3.5 w-3.5" /> Connections only
              </button>
            </div>
          </div>
        </div>
      )}

      {section === 'connections' && (
        <div className="space-y-6">
          {connections.length === 0 ? (
            <p className="text-sm text-slate-400">No colleagues found in the directory yet.</p>
          ) : (
            <>
              {available.length > 0 && (
                <div>
                  <h3 className="mb-3 text-sm font-bold uppercase tracking-wide text-teal-300">
                    Available doctors
                  </h3>
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
                    {available.map((c) => (
                      <ConnectionCard key={c.id} connection={c} onConnect={handleConnect} />
                    ))}
                  </div>
                </div>
              )}
              {connected.length > 0 && (
                <div>
                  <h3 className="mb-3 text-sm font-bold uppercase tracking-wide text-slate-400">
                    Your connections
                  </h3>
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
                    {connected.map((c) => (
                      <ConnectionCard key={c.id} connection={c} />
                    ))}
                  </div>
                </div>
              )}
              {available.length === 0 && connected.length === 0 && (
                <p className="text-sm text-slate-400">No colleagues in this view.</p>
              )}
            </>
          )}
        </div>
      )}

      {section === 'messages' && (
        <div className="flex min-h-[360px] gap-4">
          <div className="w-1/3 space-y-1 overflow-y-auto rounded-xl border border-slate-700/50 bg-slate-900/30 p-2">
            {threads.length === 0 ? (
              <p className="p-3 text-xs text-slate-500">
                No conversations yet. Messages appear when you refer patients or connect with colleagues.
              </p>
            ) : (
              threads.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => setActiveThread(t)}
                className={`w-full rounded-lg p-3 text-left ${
                  activeThread?.id === t.id ? 'bg-sky-500/15' : 'hover:bg-slate-800/50'
                }`}
              >
                <p className="text-sm font-semibold text-slate-200">{t.participantName}</p>
                <p className="truncate text-xs text-slate-500">{t.lastMessage}</p>
              </button>
              ))
            )}
          </div>
          <div className="flex flex-1 flex-col rounded-xl border border-slate-700/50 bg-slate-900/30">
            {activeThread ? (
              <>
                <div className="flex-1 space-y-2 overflow-y-auto p-4">
                  {activeThread.messages.map((m) => (
                    <div key={m.id} className={`flex ${m.sender === 'me' ? 'justify-end' : 'justify-start'}`}>
                      <div
                        className={`max-w-[80%] rounded-2xl px-3 py-2 text-sm ${
                          m.sender === 'me' ? 'bg-sky-600 text-white' : 'bg-slate-800 text-slate-200'
                        }`}
                      >
                        {m.text}
                      </div>
                    </div>
                  ))}
                </div>
                <div className="flex gap-2 border-t border-slate-700/50 p-3">
                  <input
                    value={messageText}
                    onChange={(e) => setMessageText(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleSendMessage()}
                    placeholder="Write a message…"
                    className="flex-1 rounded-xl border border-slate-600 bg-slate-900 px-3 py-2 text-sm text-slate-100"
                  />
                  <button type="button" onClick={handleSendMessage} className="primary-button rounded-xl px-3 py-2">
                    <Send className="h-4 w-4" />
                  </button>
                </div>
              </>
            ) : (
              <p className="flex flex-1 items-center justify-center text-sm text-slate-500">
                Select a conversation
              </p>
            )}
          </div>
        </div>
      )}

      {section === 'feed' && (
        <div className="space-y-4">
          {posts.length === 0 ? (
            <p className="text-sm text-slate-400">No posts in the feed yet.</p>
          ) : (
            posts.map((post) => (
            <article key={post.id} className="rounded-xl border border-slate-700/50 bg-slate-900/30 p-4">
              <div className="mb-2 flex items-center justify-between">
                <div>
                  <p className="font-semibold text-slate-200">{post.author}</p>
                  <p className="text-xs text-slate-500">
                    {post.authorSpecialty} · {new Date(post.at).toLocaleDateString()}
                  </p>
                </div>
                <span className="rounded-full bg-slate-800 px-2 py-0.5 text-[10px] font-semibold uppercase text-slate-400">
                  {post.type}
                </span>
              </div>
              <p className="text-sm text-slate-300">{post.content}</p>
              <div className="mt-3 flex items-center gap-4">
                <button
                  type="button"
                  onClick={() => handleLike(post.id)}
                  className="flex items-center gap-1 text-xs text-slate-400 hover:text-sky-300"
                >
                  <ThumbsUp className="h-3.5 w-3.5" /> {post.likes}
                </button>
                <span className="text-xs text-slate-500">{post.comments} comments</span>
                <button
                  type="button"
                  onClick={() => showToast('Post reported — moderation team notified')}
                  className="ml-auto text-xs text-slate-500 hover:text-red-300"
                >
                  Report
                </button>
              </div>
            </article>
            ))
          )}
        </div>
      )}

      {section === 'groups' && (
        <div className="space-y-3">
          {groups.length === 0 ? (
            <p className="text-sm text-slate-400">No groups available yet.</p>
          ) : (
            groups.map((g) => (
            <div
              key={g.id}
              className="flex items-center justify-between rounded-xl border border-slate-700/50 bg-slate-900/30 p-4"
            >
              <div>
                <p className="font-semibold text-slate-200">{g.name}</p>
                <p className="text-sm text-slate-400">{g.description}</p>
                <p className="text-xs text-slate-500">{g.members.toLocaleString()} members</p>
              </div>
              {g.joined ? (
                <span className="text-xs font-semibold text-emerald-400">Joined</span>
              ) : (
                <button
                  type="button"
                  onClick={() => handleJoinGroup(g.id)}
                  className="primary-button rounded-lg px-3 py-1.5 text-xs font-semibold"
                >
                  Join
                </button>
              )}
            </div>
            ))
          )}
        </div>
      )}
    </div>
  );
};

export default DoctorNetworkHub;
