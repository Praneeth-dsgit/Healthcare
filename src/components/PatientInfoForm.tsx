import { type FC, useRef, useState } from 'react';
import { PatientInfo } from '../types';

interface PatientInfoFormProps {
  patientInfo: PatientInfo;
  onPatientInfoChange: (info: PatientInfo) => void;
  onSubmitPatientInfo: (info: PatientInfo) => void;
  isLoading?: boolean;
}


const PatientInfoForm: FC<PatientInfoFormProps> = ({ patientInfo, onPatientInfoChange, onSubmitPatientInfo, isLoading }) => {
  const [errors, setErrors] = useState<{ [key: string]: string }>({});
  const fieldRefs = {
    age: useRef<HTMLInputElement>(null),
    weight: useRef<HTMLInputElement>(null),
    height: useRef<HTMLInputElement>(null),
    gender: useRef<HTMLSelectElement>(null),
    bloodPressure: useRef<HTMLInputElement>(null),
    allergies: useRef<HTMLInputElement>(null),
    medications: useRef<HTMLInputElement>(null),
    medicalHistory: useRef<HTMLTextAreaElement>(null),
  };

  const fieldOrder = [
    'age',
    'weight',
    'height',
    'gender',
    'bloodPressure',
    'allergies',
    'medications',
    'medicalHistory',
  ] as const;

  const validate = () => {
    const newErrors: { [key: string]: string } = {};
    if (!patientInfo.age || patientInfo.age <= 0) newErrors.age = 'Enter a valid age';
    if (!patientInfo.weight || patientInfo.weight <= 0) newErrors.weight = 'Enter a valid weight';
    if (!patientInfo.gender) newErrors.gender = 'Select gender';
    // Add more validations as needed
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>
  ) => {
    const { name, value } = e.target;
    onPatientInfoChange({
      ...patientInfo,
      [name]: name === 'age' || name === 'weight' || name === 'height' ? Number(value) : value,
    });
    // Real-time validation
    setErrors((prev) => ({ ...prev, [name]: '' }));
  };

  const handleKeyDown = (e: React.KeyboardEvent, fieldName: string) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      const currentIndex = fieldOrder.indexOf(fieldName as typeof fieldOrder[number]);
      const nextField = fieldOrder[currentIndex + 1];
      if (nextField && fieldRefs[nextField].current) {
        fieldRefs[nextField].current?.focus();
      }
    }
  };

  const handleClear = () => {
    onPatientInfoChange({
      age: 0,
      weight: 0,
      gender: 'other',
      height: 0,
      bloodPressure: '',
      allergies: '',
      medications: '',
      medicalHistory: ''
    });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;
    onSubmitPatientInfo(patientInfo);
  };

  return (
    <form onSubmit={handleSubmit} className="w-64 bg-white rounded-lg shadow-md p-4 space-y-4">
      <div className="space-y-3">
        {fieldOrder.map((field) => {
          const label = {
            age: 'Age (years)',
            weight: 'Weight (kg)',
            height: 'Height (cm)',
            gender: 'Gender',
            bloodPressure: 'Blood Pressure',
            allergies: 'Allergies',
            medications: 'Current Medications',
            medicalHistory: 'Medical History',
          }[field];

          const isTextarea = field === 'medicalHistory';
          const isSelect = field === 'gender';

          return (
            <div key={field}>
              <label htmlFor={field} className="block text-sm font-medium text-blue-700 mb-1">
                {label}
              </label>

              {isTextarea ? (
                <textarea
                  ref={fieldRefs[field]}
                  id={field}
                  name={field}
                  value={patientInfo[field] || ''}
                  onChange={handleChange}
                  onKeyDown={(e) => handleKeyDown(e, field)}
                  rows={2}
                  placeholder="Brief medical history or existing conditions"
                  className="w-full p-1 border border-blue-300 rounded-md placeholder:text-sm focus:ring-primary-500 focus:border-primary-500 resize-none"
                />
              ) : isSelect ? (
                <select
                  ref={fieldRefs[field]}
                  id={field}
                  name={field}
                  value={patientInfo.gender}
                  onChange={handleChange}
                  onKeyDown={(e) => handleKeyDown(e, field)}
                  className="w-full p-1 border border-blue-300 rounded-md placeholder:text-sm focus:ring-primary-500 focus:border-primary-500"
                >
                  <option value="">Select gender</option>
                  <option value="male">Male</option>
                  <option value="female">Female</option>
                  <option value="other">Other</option>
                </select>
              ) : (
                <input
                  ref={fieldRefs[field]}
                  type={field === 'age' || field === 'weight' || field === 'height' ? 'number' : 'text'}
                  id={field}
                  name={field}
                  value={patientInfo[field] || ''}
                  onChange={handleChange}
                  onKeyDown={(e) => handleKeyDown(e, field)}
                  placeholder={
                    field === 'bloodPressure'
                      ? 'e.g., 120/80'
                      : field === 'allergies'
                      ? 'List any known allergies'
                      : field === 'medications'
                      ? 'List current medications'
                      : ''
                  }
                  className="w-full p-1 border border-blue-300 rounded-md placeholder:text-sm focus:ring-primary-500 focus:border-primary-500"
                />
              )}
              {errors[field] && (
                <div className="text-xs text-red-600 mt-1">{errors[field]}</div>
              )}
            </div>
          );
        })}
      </div>

      <div className="flex justify-between pt-4 border-t border-gray-200">
        <button
          type="button"
          onClick={handleClear}
          className="text-sm px-4 py-2 rounded-md bg-red-100 text-red-700 hover:bg-red-200 transition"
        >
          Clear
        </button>
        <button
          type="submit"
          className="text-sm px-4 py-2 rounded-md bg-blue-600 text-white hover:bg-blue-700 transition flex items-center justify-center min-w-[120px]"
          disabled={isLoading}
        >
          {isLoading ? (
            <svg className="animate-spin h-4 w-4 mr-2 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"></path>
            </svg>
          ) : null}
          Treatment Plan
        </button>
      </div>
    </form>
  );
};

export default PatientInfoForm;
