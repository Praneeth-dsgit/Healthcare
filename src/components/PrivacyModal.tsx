import React from 'react';

interface PrivacyModalProps {
  onClose: () => void;
}

const PrivacyModal: React.FC<PrivacyModalProps> = ({ onClose }) => {
  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-xl shadow-xl max-w-6xl w-[90%] mx-auto h-[80vh] overflow-y-auto">
        <div className="p-6 space-y-6">
          <div className="flex items-center justify-between border-b border-gray-200 pb-3">
            <h2 className="text-2xl font-semibold text-gray-800">
              Privacy Policy
            </h2>
          </div>
          
          <div className="space-y-4 text-gray-700">
            <div>
              <h3 className="font-semibold text-lg mb-2">Data Collection & Storage</h3>
              <p className="leading-relaxed">
                MedChat processes all conversations and patient information locally on your device. We do not collect, store, or transmit any personal health information to external servers. Your chat history and patient information are stored in your browser's local storage and can be cleared at any time.
              </p>
            </div>
            
            <div>
              <h3 className="font-semibold text-lg mb-2">Data Security</h3>
              <ul className="list-disc pl-5 space-y-2">
                <li>All processing is done locally on your device</li>
                <li>No data is transmitted to external servers</li>
                <li>Chat history can be exported locally as text files</li>
                <li>Patient information is stored in browser local storage</li>
                <li>You can clear all data at any time</li>
              </ul>
            </div>

            <div>
              <h3 className="font-semibold text-lg mb-2">Your Privacy Rights</h3>
              <p className="leading-relaxed">
                You have complete control over your data. You can:
              </p>
              <ul className="list-disc pl-5 space-y-2 mt-2">
                <li>Clear chat history at any time</li>
                <li>Export your chat history locally</li>
                <li>Delete patient information</li>
                <li>Use the system without providing personal information</li>
              </ul>
            </div>

            <div>
              <h3 className="font-semibold text-lg mb-2">Important Notice</h3>
              <p className="leading-relaxed">
                While we maintain high privacy standards, please be mindful of the personal health information you share. Do not enter sensitive personal or medical information that you wouldn't want stored on your device. For medical emergencies or specific medical advice, always consult with qualified healthcare professionals.
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

export default PrivacyModal; 