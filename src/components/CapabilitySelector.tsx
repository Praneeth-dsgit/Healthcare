import React, { useState, useRef, useEffect } from 'react';
import { Bot, Brain, FileText, Stethoscope, Users, Shield, Award, Activity } from 'lucide-react';
import AboutModal from './AboutModal';
import PrivacyModal from './PrivacyModal';
import HelpModal from './HelpModal';

export type Capability = 'general' | 'radiology' | 'lab' | 'engagement';

interface CapabilitySelectorProps {
  onSelectCapability: (capability: Capability) => void;
}

const CapabilitySelector: React.FC<CapabilitySelectorProps> = ({ onSelectCapability }) => {
  const [showAboutModal, setShowAboutModal] = useState(false);
  const [showPrivacyModal, setShowPrivacyModal] = useState(false);
  const [showHelpModal, setShowHelpModal] = useState(false);
  const [showMoreOptionsDropdown, setShowMoreOptionsDropdown] = useState(false);
  const moreOptionsDropdownRef = useRef<HTMLDivElement>(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    if (!showMoreOptionsDropdown) return;
    function handleClickOutside(event: MouseEvent) {
      if (moreOptionsDropdownRef.current && !moreOptionsDropdownRef.current.contains(event.target as Node)) {
        setShowMoreOptionsDropdown(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showMoreOptionsDropdown]);

  const capabilities = [
    {
      id: 'general' as Capability,
      title: 'General Assistance',
      description: 'Get comprehensive medical guidance, general health information, and treatment recommendations.',
      icon: Stethoscope,
      color: 'bg-blue-500 hover:bg-blue-600',
      cardHover: 'hover:border-blue-300 hover:shadow-blue-100',
      textHover: 'group-hover:text-blue-900',
      features: [
        'Differential diagnosis support',
        'Treatment recommendations',
        'Drug dosages',
        'Clinical decision',
        'Consultation support' 
      ]
    },
    {
      id: 'radiology' as Capability,
      title: 'Radiology Assistance',
      description: 'Specialized support for medical imaging interpretation, radiological findings analysis.',
      icon: Brain,
      color: 'bg-purple-500 hover:bg-purple-600',
      cardHover: 'hover:border-purple-300 hover:shadow-purple-100',
      textHover: 'group-hover:text-purple-900',
      features: [
        'Medical image interpretation',
        'Radiological findings analysis',
        'Imaging technique recommendations',
        'Differential diagnosis from imaging',
        'Follow-up imaging suggestions'
      ]
    },
    {
      id: 'lab' as Capability,
      title: 'Lab Report Interpretation',
      description: 'Expert analysis of laboratory results, clinical correlation, further testing and follow-up.',
      icon: FileText,
      color: 'bg-green-500 hover:bg-green-600',
      cardHover: 'hover:border-green-300 hover:shadow-green-100',
      textHover: 'group-hover:text-green-900',
      features: [
        'Lab result interpretation',
        'Critical value alerts',
        'Clinical correlation guidance',
        'Follow-up testing recommendations',
        'Reference range analysis'
      ]
    },
         {
       id: 'engagement' as Capability,
       title: 'Patient Engagement',
       description: 'Comprehensive support for patient communication and care coordination to enhance patient experience.',
       icon: Users,
       color: 'bg-orange-500 hover:bg-orange-600',
       cardHover: 'hover:border-orange-300 hover:shadow-orange-100',
       textHover: 'group-hover:text-orange-900',
       features: [
         'Chat with your data',
         'Treatment adherence support',
         'Care plan communication',
         'Follow-up coordination',
         'Patient satisfaction enhancement'
       ]
     }

  ];

  return (
    <>
      <div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center p-8 z-50">
        <div className="bg-white rounded-3xl shadow-2xl max-w-6xl w-full h-[99vh] mx-auto transform scale-x-100 scale-y-80 border border-gray-100 
          transform-gpu perspective-1000 rotate-x-2 rotate-y-1 
          hover:rotate-x-0 hover:rotate-y-0 transition-all duration-700 ease-out
          shadow-[0_20px_40px_rgba(0,0,0,0.1),0_10px_20px_rgba(0,0,0,0.05)]
          hover:shadow-[0_30px_60px_rgba(0,0,0,0.15),0_15px_30px_rgba(0,0,0,0.1)] relative">
          
          {/* Three-dots menu in top right corner */}
          <div className="absolute top-8 right-6 z-10">
            <div ref={moreOptionsDropdownRef} className="relative">
              <button
                onClick={() => setShowMoreOptionsDropdown(!showMoreOptionsDropdown)}
                className="flex items-center justify-center w-10 h-10 rounded-full bg-gray-100 hover:bg-gray-200 transition-colors shadow-md"
                title="More options"
              >
                <svg className="w-5 h-5 text-gray-600" fill="currentColor" viewBox="0 0 20 20">
                  <path d="M10 6a2 2 0 110-4 2 2 0 010 4zM10 12a2 2 0 110-4 2 2 0 010 4zM10 18a2 2 0 110-4 2 2 0 010 4z" />
                </svg>
              </button>
              
              {showMoreOptionsDropdown && (
                <div className="absolute right-0 mt-2 w-48 bg-white border border-gray-200 rounded-lg shadow-lg z-50">
                  <button
                    onClick={() => {
                      setShowMoreOptionsDropdown(false);
                      setShowAboutModal(true);
                    }}
                    className="w-full flex items-center px-4 py-3 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
                  >
                    <svg className="w-4 h-4 mr-3 text-gray-400" fill="none" stroke="blue" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    About
                  </button>
                  <button
                    onClick={() => {
                      setShowMoreOptionsDropdown(false);
                      setShowPrivacyModal(true);
                    }}
                    className="w-full flex items-center px-4 py-3 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
                  >
                    <svg className="w-4 h-4 mr-3 text-gray-400" fill="none" stroke="red" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                    </svg>
                    Privacy
                  </button>
                  <button
                    onClick={() => {
                      setShowMoreOptionsDropdown(false);
                      setShowHelpModal(true);
                    }}
                    className="w-full flex items-center px-4 py-3 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
                  >
                    <svg className="w-4 h-4 mr-3 text-gray-400" fill="none" stroke="green" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    Help
                  </button>
                </div>
              )}
            </div>
          </div>

          <div className="p-8">
            <div className="text-center mb-8">
              <div className="flex items-center justify-center mb-6">
                <div className="relative">
                  <div className="bg-gradient-to-br from-blue-600 to-blue-800 rounded-2xl p-4 mr-4 shadow-xl">
                    <Stethoscope size={28} className="text-white" />
                  </div>
                  <div className="absolute -top-2 -right-2 w-6 h-6 bg-green-500 rounded-full border-2 border-white animate-pulse"></div>
                </div>
                <div>
                  <h1 className="text-4xl font-bold bg-gradient-to-r from-blue-600 to-blue-800 bg-clip-text text-transparent">
                    MedChat Pro
                  </h1>
                  <p className="text-sm text-gray-500 font-medium">Healthcare AI Assistant</p>
                </div>
              </div>
              <p className="text-gray-600 text-base max-w-2xl mx-auto">
                Choose your specialized medical assistance mode.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              {capabilities.map((capability) => {
                const IconComponent = capability.icon;
                return (
                  <div
                    key={capability.id}
                    className={`bg-white border border-gray-200 rounded-2xl p-4 h-[295px] 
                      transform-gpu perspective-1000 
                      hover:shadow-[0_25px_50px_rgba(0,0,0,0.15),0_10px_20px_rgba(0,0,0,0.1)]
                      hover:-translate-y-3 hover:rotate-x-2 hover:rotate-y-1 
                      transition-all duration-500 ease-out cursor-pointer group 
                      hover:bg-gradient-to-br hover:from-white hover:to-gray-50 
                      ${capability.cardHover} flex flex-col
                      shadow-[0_8px_16px_rgba(0,0,0,0.1),0_4px_8px_rgba(0,0,0,0.05)]
                      hover:scale-105`}
                    onClick={() => onSelectCapability(capability.id)}
                  >
                    <div className="text-center mb-3 flex-shrink-0">
                      <div className={`inline-flex items-center justify-center w-10 h-10 rounded-2xl ${capability.color} text-white mb-3 
                        group-hover:scale-110 group-hover:rotate-3 transition-all duration-300 
                        shadow-lg group-hover:shadow-xl transform-gpu`}>
                        <IconComponent size={26} />
                      </div>
                      <h3 className={`text-lg font-semibold text-gray-800 mb-2 transition-colors ${capability.textHover}`}>
                        {capability.title}
                      </h3>
                      <p className="text-gray-600 text-xs leading-relaxed group-hover:text-gray-700 transition-colors">
                        {capability.description}
                      </p>
                    </div>

                    <div className="space-y-1.5 flex-grow">
                      <h4 className="font-medium text-gray-700 text-xs group-hover:text-gray-800 transition-colors">Key Features:</h4>
                      <ul className="space-y-0.5">
                        {capability.features.map((feature, index) => (
                          <li key={index} className="text-xs text-gray-600 flex items-center group-hover:text-gray-700 transition-colors">
                            <div className="w-1 h-1 bg-gray-400 rounded-full mr-2 flex-shrink-0 group-hover:bg-gray-500 transition-colors"></div>
                            {feature}
                          </li>
                        ))}
                      </ul>
                    </div>

                    <div className="mt-auto pt-3">
                      <button className={`w-full px-3 py-2.5 rounded-xl text-white font-medium transition-all duration-300 text-sm ${capability.color}
                        transform-gpu hover:scale-105 hover:-translate-y-1 
                        shadow-md hover:shadow-lg active:scale-95`}>
                        Select {capability.id === 'engagement' ? 'Engagement' : capability.title.split(' ')[0]} Mode
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

            <div className="mt-8 text-center px-8">
                <div className="flex items-center justify-center mb-1">
                  <span className="font-medium text-amber-800 text-sm">Professional Use Only</span>
                </div>
                <p className="text-amber-700 text-xs animate-breathing animate-pulse">
                  This AI assistant is designed for healthcare professionals to support clinical decision-making. 
                  It is not a replacement for professional medical judgment or patient examination.
                </p>
            </div>
          
        </div>
      </div>

      {/* Modals */}
      {showAboutModal && <AboutModal onClose={() => setShowAboutModal(false)} />}
      {showPrivacyModal && <PrivacyModal onClose={() => setShowPrivacyModal(false)} />}
      {showHelpModal && <HelpModal onClose={() => setShowHelpModal(false)} />}
    </>
  );
};

export default CapabilitySelector; 