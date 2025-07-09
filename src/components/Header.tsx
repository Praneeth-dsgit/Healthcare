import React, { useState } from 'react';
import { Activity, Trash2 } from 'lucide-react';
import AboutModal from './AboutModal';
import PrivacyModal from './PrivacyModal';
import HelpModal from './HelpModal';

interface HeaderProps {
  sessions: any[];
  currentSessionId: string | null;
  showDropdown: boolean;
  setShowDropdown: (show: boolean) => void;
  dropdownRef: React.RefObject<HTMLDivElement>;
  getSessionTopic: (session: any) => string;
  handleSessionSwitch: (sessionId: string) => void;
  handleDeleteSession: (sessionId: string) => void;
  handleNewSession: () => void;
}

const Header: React.FC<HeaderProps> = ({
  sessions,
  currentSessionId,
  showDropdown,
  setShowDropdown,
  dropdownRef,
  getSessionTopic,
  handleSessionSwitch,
  handleDeleteSession,
  handleNewSession
}) => {
  const [showAboutModal, setShowAboutModal] = useState(false);
  const [showPrivacyModal, setShowPrivacyModal] = useState(false);
  const [showHelpModal, setShowHelpModal] = useState(false);

  return (
    <>
      <header className="bg-white shadow-sm">
        <div className="container mx-auto px-4 py-3 max-w-7xl">
          <div className="flex items-center justify-between">
            <div className="flex items-center">
              <div className="flex items-center space-x-4 min-w-[180px]">
                <Activity className="h-6 w-6 text-primary-500" />
                <span className="font-bold text-2xl text-indigo-800">MedChat</span>
              </div>
              {/* Session Dropdown and New Session Button aligned with chat window */}
              <div className="flex-grow flex items-center" style={{ marginLeft: 0 }}>
                <div className="relative" ref={dropdownRef}>
                  <div className="inline-block relative">
                    <button
                      className="px-3 py-1 rounded text-sm font-medium border bg-gray-100 text-gray-700 focus:outline-none focus:ring-2 focus:ring-primary-500 flex items-center"
                      type="button"
                      onClick={() => setShowDropdown(!showDropdown)}
                    >
                      Sessions
                      <svg className="ml-2 w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" /></svg>
                    </button>
                    {showDropdown && (
                      <div className="absolute left-0 mt-1 w-64 bg-white border border-gray-200 rounded shadow-lg z-10">
                        {sessions.map((session) => (
                          <div key={session.id} className={`flex items-center justify-between px-3 py-2 cursor-pointer hover:bg-primary-50 ${currentSessionId === session.id ? 'bg-primary-100' : ''}`}
                            onClick={() => handleSessionSwitch(session.id)}
                          >
                            <span className="truncate max-w-xs">{getSessionTopic(session)}</span>
                            {sessions.length > 1 && (
                              <button
                                className="ml-2 p-1 text-gray-400 hover:text-red-600"
                                onClick={e => { e.stopPropagation(); handleDeleteSession(session.id); }}
                                title="Delete session"
                              >
                                <Trash2 size={16} />
                              </button>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
                <button
                  className="ml-2 px-3 py-1 rounded text-sm font-medium bg-green-500 text-white hover:bg-green-600"
                  onClick={handleNewSession}
                >
                  + New Session
                </button>
              </div>
            </div>
            <nav>
              <ul className="flex space-x-4">
                <li>
                  <button 
                    onClick={() => setShowAboutModal(true)}
                    className="text-sm text-gray-600 hover:text-primary-500 transition-colors"
                  >
                    About
                  </button>
                </li>
                <li>
                  <button 
                    onClick={() => setShowPrivacyModal(true)}
                    className="text-sm text-gray-600 hover:text-primary-500 transition-colors"
                  >
                    Privacy
                  </button>
                </li>
                <li>
                  <button 
                    onClick={() => setShowHelpModal(true)}
                    className="text-sm text-gray-600 hover:text-primary-500 transition-colors"
                  >
                    Help
                  </button>
                </li>
              </ul>
            </nav>
          </div>
        </div>
      </header>

      {showAboutModal && <AboutModal onClose={() => setShowAboutModal(false)} />}
      {showPrivacyModal && <PrivacyModal onClose={() => setShowPrivacyModal(false)} />}
      {showHelpModal && <HelpModal onClose={() => setShowHelpModal(false)} />}
    </>
  );
};

export default Header;