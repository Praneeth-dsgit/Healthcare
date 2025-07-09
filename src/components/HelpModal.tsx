import React from 'react';

interface HelpModalProps {
  onClose: () => void;
}

const HelpModal: React.FC<HelpModalProps> = ({ onClose }) => {
  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-xl shadow-xl max-w-6xl w-[90%] mx-auto h-[80vh] overflow-y-auto">
        <div className="p-6 space-y-6">
          <div className="flex items-center justify-between border-b border-gray-200 pb-3">
            <h2 className="text-2xl font-semibold text-gray-800">
              Help & Usage Guide
            </h2>
          </div>
          
          <div className="space-y-4 text-gray-700">
            <div>
              <h3 className="font-semibold text-lg mb-2">Getting Started</h3>
              <p className="leading-relaxed">
                MedChat is designed to be intuitive and easy to use. You can start by:
              </p>
              <ul className="list-disc pl-5 space-y-2 mt-2">
                <li>Filling in the patient information form on the left</li>
                <li>Typing your health-related questions in the chat box</li>
                <li>Using the suggested questions below the chat for quick access</li>
                <li>Reviewing the chat history for previous conversations</li>
              </ul>
            </div>
            
            <div>
              <h3 className="font-semibold text-lg mb-2">Features & Functions</h3>
              <ul className="list-disc pl-5 space-y-2">
                <li><strong>Patient Information:</strong> Enter patient details in the left panel for more contextualized responses</li>
                <li><strong>Chat Interface:</strong> Type questions and receive detailed responses with formatted text</li>
                <li><strong>Quick Prompts:</strong> Click on suggested questions for immediate answers</li>
                <li><strong>Export Chat:</strong> Download your conversation history as a text file</li>
                <li><strong>Clear Chat:</strong> Remove all conversation history with one click</li>
              </ul>
            </div>

            <div>
              <h3 className="font-semibold text-lg mb-2">Tips for Best Results</h3>
              <ul className="list-disc pl-5 space-y-2">
                <li>Be specific with your questions for more accurate responses</li>
                <li>Fill in relevant patient information for contextualized answers</li>
                <li>Use the suggested questions as examples of well-formatted queries</li>
                <li>Review the entire response before taking any action</li>
                <li>Export important conversations for your records</li>
              </ul>
            </div>

            <div>
              <h3 className="font-semibold text-lg mb-2">Important Reminders</h3>
              <ul className="list-disc pl-5 space-y-2">
                <li>MedChat is for informational purposes only</li>
                <li>Always consult healthcare professionals for medical advice</li>
                <li>In case of emergency, call your local emergency services</li>
                <li>Your data is processed locally on your device</li>
                <li>You can clear your data at any time</li>
              </ul>
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

export default HelpModal; 