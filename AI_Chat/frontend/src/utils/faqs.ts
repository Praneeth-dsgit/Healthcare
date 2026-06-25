/**
 * Shared FAQ defaults and fetch for radiology/lab/general capabilities
 */

import { getApiBaseUrl } from './apiBase';

export function getDefaultFaqs(capability: string): string[] {
  const defaultFaqs: Record<string, string[]> = {
    radiology: [
      'How to interpret a chest X-ray?',
      'What are the signs of pneumonia on imaging?',
      'How to identify fractures on X-ray?',
      'What does a normal CT scan of the brain look like?',
      'How to read an MRI of the spine?',
      'What are the radiological signs of stroke?',
      'How to interpret abdominal ultrasound?',
      'What imaging is best for joint problems?',
      'How to identify kidney stones on CT?',
      'What are the signs of appendicitis on imaging?',
    ],
    lab: [
      'How to interpret CBC results?',
      'What do elevated liver enzymes mean?',
      'How to read lipid panel results?',
      'What are normal kidney function values?',
      'How to interpret thyroid function tests?',
      'What does high CRP indicate?',
      'How to read blood glucose levels?',
      'What are normal electrolyte ranges?',
      'How to interpret cardiac enzyme results?',
      'What does elevated troponin mean?',
    ],
    general: [
      'What are the symptoms of diabetes?',
      'How can I lower my blood pressure?',
      'What causes frequent headaches?',
      'What should I do if I have a fever?',
      'What are the side effects of paracetamol?',
      'How do I know if I have COVID-19?',
      'What is a normal heart rate?',
      'How much sleep do adults need?',
      'What are the signs of a heart attack?',
      'How can I treat a cold at home?',
    ],
  };
  return defaultFaqs[capability] || defaultFaqs.general;
}

export async function fetchFaqs(capability: string, sessionId: string): Promise<string[]> {
  try {
    const response = await fetch(`${getApiBaseUrl()}/api/faqs/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ capability, session_id: sessionId }),
    });
    const data = await response.json();
    if (data.success && data.faqs && Array.isArray(data.faqs)) {
      return data.faqs;
    }
  } catch (e) {
    console.error('Error fetching FAQs:', e);
  }
  return getDefaultFaqs(capability);
}

export function getCapabilityLabel(capability: string | null): string {
  switch (capability) {
    case 'radiology': return 'Radiology';
    case 'lab': return 'Lab Interpretation';
    case 'general':
    default: return 'Medical';
  }
}
