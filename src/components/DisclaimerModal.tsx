import React from 'react';

interface DisclaimerModalProps {
  onClose: () => void;
}

const DisclaimerModal: React.FC<DisclaimerModalProps> = ({ onClose }) => {
  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-xl shadow-xl max-w-6xl w-[90%] mx-auto">
        <div className="p-6 space-y-6">
          <div className="flex items-center justify-between border-b border-gray-200 pb-3">
            <h2 className="text-2xl font-semibold text-gray-800">
              Healthcare Chatbot Disclaimer
            </h2>
          </div>
          
          <div className="grid grid-cols-2 gap-6 text-gray-700">
            <div className="space-y-4">
              <div>
                <h3 className="font-semibold text-lg mb-2">Important Notice</h3>
                <p className="leading-relaxed">
                  This healthcare chatbot is designed to provide general health information and is not a substitute for professional medical advice, diagnosis, or treatment. It just assists medical professionals in taking informed decisions.
                </p>
              </div>
              
              <div>
                <h3 className="font-semibold text-lg mb-2">System Limitations</h3>
                <ul className="list-disc pl-5 space-y-2">
                  <li>The AI model operates locally on your device and has limited knowledge cutoff</li>
                  <li>It may not have access to the latest medical research or guidelines</li>
                  <li>It cannot diagnose conditions or prescribe medications</li>
                  <li>It has not been IMC approved for clinical use</li>
                  <li>Your conversations are stored locally and not shared with healthcare providers</li>
                </ul>
              </div>
            </div>

            <div className="space-y-4">
              <div>
                <h3 className="font-semibold text-lg mb-2">Emergency Situations</h3>
                <p className="leading-relaxed">
                  <strong>In Case of Emergency:</strong> Always call your local emergency services (108 in case of India). Do not rely on this chatbot for emergency medical situations.
                </p>
              </div>
              
              <div>
                <h3 className="font-semibold text-lg mb-2">Medical Advice</h3>
                <p className="leading-relaxed">
                  <strong>For Medical Concerns:</strong> Always consult with a qualified healthcare professional. This tool is for informational purposes only and should not be used to make medical decisions.
                </p>
              </div>

              <div>
                <h3 className="font-semibold text-lg mb-2">Privacy Notice</h3>
                <p className="leading-relaxed">
                  While your conversations are stored locally, please be mindful of the personal health information you share. Do not enter sensitive personal or medical information that you wouldn't want stored on your device.
                </p>
              </div>
            </div>
          </div>

          <div className="flex justify-end pt-4 border-t border-gray-200">
            <button
              onClick={onClose}
              className="px-6 py-2.5 bg-primary-500 hover:bg-primary-600 text-white rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2"
            >
              I Understand and Accept
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default DisclaimerModal;