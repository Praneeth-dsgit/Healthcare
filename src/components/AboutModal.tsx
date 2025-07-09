import React from 'react';

interface AboutModalProps {
  onClose: () => void;
}

const AboutModal: React.FC<AboutModalProps> = ({ onClose }) => {
  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-xl shadow-xl max-w-6xl w-[90%] mx-auto h-[80vh] overflow-y-auto">
        <div className="p-6 space-y-6">
          <div className="flex items-center justify-between border-b border-gray-200 pb-3">
            <h2 className="text-2xl font-semibold text-gray-800">
              About MedChat
            </h2>
          </div>
          
          <div className="space-y-4 text-gray-700">
            <div>
              <h3 className="font-semibold text-lg mb-2">Overview</h3>
              <p className="leading-relaxed">
                MedChat is an AI-powered healthcare assistant designed to provide general health information and support medical professionals in making informed decisions. Our platform combines advanced language models with comprehensive medical knowledge to deliver reliable health-related information.
              </p>
            </div>
            
            <div>
              <h3 className="font-semibold text-lg mb-2">Key Features</h3>
              <ul className="list-disc pl-5 space-y-2">
                <li>Comprehensive health information and guidance</li>
                <li>Patient information management</li>
                <li>Quick access to common medical queries</li>
                <li>Local data processing for enhanced privacy</li>
                <li>Export functionality for chat history</li>
                <li>User-friendly interface with markdown support</li>
              </ul>
            </div>

            <div>
              <h3 className="font-semibold text-lg mb-2">Our Mission</h3>
              <p className="leading-relaxed">
                Our mission is to make reliable health information more accessible while maintaining the highest standards of medical accuracy and user privacy. We aim to support, not replace, healthcare professionals by providing a tool that facilitates informed discussions about health-related topics.
              </p>
            </div>

            <div>
              <h3 className="font-semibold text-lg mb-2">Development</h3>
              <p className="leading-relaxed">
                MedChat is developed using modern web technologies including React, TypeScript, and Tailwind CSS for the frontend, with a Python Flask backend powered by advanced language models. We continuously update our system to improve accuracy and user experience while maintaining strict privacy standards.
              </p>
            </div>
          </div>

          <div className="flex justify-end pt-4 border-t border-gray-200">
            <button
              onClick={onClose}
              className="px-6 py-2.5 bg-primary-500 hover:bg-primary-600 text-white rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AboutModal; 