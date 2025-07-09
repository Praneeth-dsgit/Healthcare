import * as React from 'react';
import { useState, useMemo } from 'react';
import { PlusCircle, ChevronDown, ChevronUp } from 'lucide-react';

interface QuickPromptsProps {
  onSelectPrompt: (prompt: string) => void;
}

const QuickPrompts: React.FC<QuickPromptsProps> = ({ onSelectPrompt }: QuickPromptsProps) => {
  const [isExpanded, setIsExpanded] = useState(false);

  const prompts = [
    "What are the symptoms of diabetes?",
    "How can I lower my blood pressure?",
    "What causes frequent headaches?",
    "What should I do if I have a fever?",
    "What are the side effects of paracetamol?",
    "How do I know if I have COVID-19?",
    "What is a normal heart rate?",
    "How much sleep do adults need?",
    "What are the signs of a heart attack?",
    "How can I treat a cold at home?",
    "Can I take ibuprofen on an empty stomach?",
    "How do I reduce anxiety naturally?",
    "What foods are good for weight loss?",
    "How much water should I drink each day?",
    "What causes fatigue and low energy?",
    "What is the difference between a cold and the flu?",
    "How do I treat a sprained ankle?",
    "When should I see a doctor for a sore throat?",
    "What is BMI and how is it calculated?",
    "Are multivitamins necessary?",
    "What are the symptoms of high cholesterol?",
    "How can I improve my immune system?",
    "What should I do in case of a minor burn?",
    "How can I manage stress effectively?",
    "Is it normal to feel dizzy sometimes?",
    "What is insulin and how does it work?",
    "How do I know if I'm dehydrated?",
    "What causes muscle cramps?",
    "Can allergies cause a sore throat?",
    "What is the best treatment for acne?",
    "What are the early signs of pregnancy?",
    "How often should I get a medical check-up?",
    "What vaccines do adults need?",
    "Is it safe to exercise every day?",
    "How do antibiotics work?",
    "What are probiotics and should I take them?",
    "How do I treat constipation naturally?",
    "What causes high blood sugar?",
    "What is the best way to quit smoking?",
    "When should I get a flu shot?",
    "Can stress cause physical symptoms?",
    "What should I eat before a workout?",
    "How is high blood pressure diagnosed?",
    "What is sleep apnea?",
    "Are headaches a symptom of COVID-19?",
    "What should I do if I have chest pain?",
    "How can I tell if I have food poisoning?",
    "Is it okay to drink coffee every day?",
    "What are good ways to boost mental health?",
    "Can dehydration cause headaches?"
  ];

  // Shuffle array using Fisher-Yates algorithm
  const shuffleArray = (array: string[]) => {
    const shuffled = [...array];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled;
  };

  // Memoize the shuffled prompts so they don't reshuffle on every re-render
  const shuffledPrompts = useMemo(() => shuffleArray(prompts), []);

  // Display only first 6 prompts when not expanded
  const visiblePrompts = isExpanded ? shuffledPrompts : shuffledPrompts.slice(0, 3);

  return (
    <div className="mb-2">
      <div className="flex justify-between items-center mb-1">
        <h3 className="text-sm font-medium text-indigo-700">FAQ:</h3>
        <button
          onClick={() => setIsExpanded(!isExpanded)}
          className="text-sm text-primary-600 hover:text-primary-700 flex items-center"
        >
          {isExpanded ? (
            <>Show less <ChevronUp size={10} className="ml-1" /></>
          ) : (
            <>Show more <ChevronDown size={16} className="ml-1" /></>
          )}
        </button>
      </div>
      <div
        className={`flex flex-wrap gap-1 transition-all duration-300 ${
          isExpanded ? 'max-h-[400px]' : 'max-h-9'
        } overflow-y-auto pr-1 hide-scrollbar`}
      >
        {shuffledPrompts.map((prompt) => (
          <button
            key={prompt}
            onClick={() => onSelectPrompt(prompt)}
            className="px-2 py-1.5 bg-blue-100 border border-blue-300 rounded-full text-sm text-blue-800 hover:bg-blue-200 hover:text-blue-900 transition-colors flex items-center"
          >
            <PlusCircle size={14} className="mr-1.5 flex-shrink-0" />
            {prompt}
          </button>
        ))}
      </div>
    </div>
  );
};

export default QuickPrompts;