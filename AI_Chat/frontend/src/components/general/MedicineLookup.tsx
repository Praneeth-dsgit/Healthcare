/**
 * Medicine Lookup Component
 * Search and lookup medicines from medicine_kbase.json
 */

import React, { useState, useEffect } from 'react';
import { Search, BookOpen, AlertCircle, Pill } from 'lucide-react';
import { getApiBaseUrl } from '../../utils/apiBase';

interface MedicineData {
  Disease: string;
  Description: string;
  Symptoms: string[];
  Causes: string[];
  'Common Treatments': string[];
}

const MedicineLookup: React.FC = () => {
  const [searchTerm, setSearchTerm] = useState('');
  const [medicineData, setMedicineData] = useState<MedicineData[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedDisease, setSelectedDisease] = useState<MedicineData | null>(null);

  useEffect(() => {
    loadMedicineData();
  }, []);

  const loadMedicineData = async () => {
    setLoading(true);
    try {
      // Try loading from API endpoint first
      const response = await fetch(`${getApiBaseUrl()}/api/medicine_kbase.json`);
      if (response.ok) {
        const data = await response.json();
        setMedicineData(data);
      } else {
        // Fallback: try to load from public folder
        const fallbackResponse = await fetch('/medicine_kbase.json');
        if (fallbackResponse.ok) {
          const data = await fallbackResponse.json();
          setMedicineData(data);
        } else {
          // Last fallback: try direct path
          const directResponse = await fetch('/api/medicine_kbase.json');
          if (directResponse.ok) {
            const data = await directResponse.json();
            setMedicineData(data);
          }
        }
      }
    } catch (error) {
      console.error('Error loading medicine data:', error);
    } finally {
      setLoading(false);
    }
  };

  const filteredData = medicineData
    .filter((item) =>
      item.Disease.toLowerCase().includes(searchTerm.toLowerCase()) ||
      item.Description.toLowerCase().includes(searchTerm.toLowerCase()) ||
      item.Symptoms.some((symptom) => symptom.toLowerCase().includes(searchTerm.toLowerCase())) ||
      item['Common Treatments'].some((treatment) => treatment.toLowerCase().includes(searchTerm.toLowerCase()))
    )
    .sort((a, b) => a.Disease.localeCompare(b.Disease));

  const handleDiseaseClick = (disease: MedicineData) => {
    setSelectedDisease(disease);
  };

  const handleBack = () => {
    setSelectedDisease(null);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (selectedDisease) {
    return (
      <div className="h-full flex flex-col">
        {/* Fixed Back Button */}
        <div className="bg-white rounded-lg shadow p-4 sticky top-0 z-10 mb-4">
          <button
            onClick={handleBack}
            className="text-blue-600 hover:text-blue-800 font-medium flex items-center space-x-2"
          >
            <span>← Back to Search</span>
          </button>
        </div>

        {/* Scrollable Content */}
        <div className="flex-1 overflow-y-auto">
          <div className="bg-white rounded-lg shadow p-6">
            <div className="flex items-center space-x-3 mb-6">
              <Pill className="text-blue-600" size={32} />
              <h2 className="text-2xl font-bold text-gray-900">{selectedDisease.Disease}</h2>
            </div>

            <div className="space-y-6">
              {/* Description */}
              <div>
                <h3 className="text-lg font-semibold text-gray-800 mb-2">Description</h3>
                <p className="text-gray-700 leading-relaxed">{selectedDisease.Description}</p>
              </div>

              {/* Symptoms */}
              <div>
                <h3 className="text-lg font-semibold text-gray-800 mb-3">Symptoms</h3>
                <ul className="list-disc list-inside space-y-2 text-gray-700">
                  {selectedDisease.Symptoms.map((symptom, index) => (
                    <li key={index}>{symptom}</li>
                  ))}
                </ul>
              </div>

              {/* Causes */}
              <div>
                <h3 className="text-lg font-semibold text-gray-800 mb-3">Causes</h3>
                <ul className="list-disc list-inside space-y-2 text-gray-700">
                  {selectedDisease.Causes.map((cause, index) => (
                    <li key={index}>{cause}</li>
                  ))}
                </ul>
              </div>

              {/* Common Treatments */}
              <div>
                <h3 className="text-lg font-semibold text-gray-800 mb-3">Common Treatments</h3>
                <div className="bg-blue-50 rounded-lg p-4">
                  <ul className="list-disc list-inside space-y-2 text-gray-700">
                    {selectedDisease['Common Treatments'].map((treatment, index) => (
                      <li key={index} className="font-medium">{treatment}</li>
                    ))}
                  </ul>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col">
      {/* Fixed Search Header */}
      <div className="bg-white rounded-lg shadow p-6 sticky top-0 z-10 mb-4">
        <div className="flex items-center space-x-3 mb-4">
          <BookOpen className="text-blue-600" size={28} />
          <h2 className="text-xl font-semibold text-gray-900">Medicine & Condition Lookup</h2>
        </div>

        <div className="relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" size={20} />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search by disease name, symptoms, or treatments..."
            className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            autoFocus
          />
        </div>
      </div>

      {/* Scrollable Results */}
      <div className="flex-1 overflow-y-auto">
        <div className="bg-white rounded-lg shadow overflow-hidden">
        {filteredData.length === 0 ? (
          <div className="text-center py-12">
            <AlertCircle className="mx-auto text-gray-400" size={48} />
            <p className="mt-4 text-gray-600">
              {searchTerm ? 'No results found' : 'Start typing to search for diseases and treatments'}
            </p>
          </div>
        ) : (
          <div className="divide-y divide-gray-200">
            {filteredData.map((item, index) => (
              <button
                key={index}
                onClick={() => handleDiseaseClick(item)}
                className="w-full text-left p-6 hover:bg-gray-50 transition-colors"
              >
                <div className="flex items-start space-x-4">
                  <div className="flex-shrink-0">
                    <Pill className="text-blue-600" size={24} />
                  </div>
                  <div className="flex-1">
                    <h3 className="text-lg font-semibold text-gray-900 mb-2">{item.Disease}</h3>
                    <p className="text-sm text-gray-600 line-clamp-2">{item.Description}</p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {item['Common Treatments'].slice(0, 3).map((treatment, idx) => (
                        <span
                          key={idx}
                          className="px-2 py-1 bg-blue-100 text-blue-800 text-xs rounded-full"
                        >
                          {treatment}
                        </span>
                      ))}
                      {item['Common Treatments'].length > 3 && (
                        <span className="px-2 py-1 bg-gray-100 text-gray-600 text-xs rounded-full">
                          +{item['Common Treatments'].length - 3} more
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </button>
            ))}
          </div>
        )}
        </div>
      </div>
    </div>
  );
};

export default MedicineLookup;

