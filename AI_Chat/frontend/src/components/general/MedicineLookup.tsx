/**
 * Medicine Lookup Component
 * Search and lookup medicines from merged medicine lookup API.
 */

import React, { useState, useEffect } from 'react';
import { Search, BookOpen, AlertCircle, Pill } from 'lucide-react';
import { getApiBaseUrl } from '../../utils/apiBase';

interface MedicineData {
  entryType?: 'condition' | 'catalog';
  Disease: string;
  Description: string;
  Symptoms: string[];
  Causes: string[];
  'Common Treatments': string[];
  Medicine?: string;
  Molecule?: string;
  Strength?: string;
  Form?: string;
  Company?: string;
  Indications?: string;
  aiReason?: string;
}

export interface LookupMedicineSelection {
  name: string;
  molecule?: string;
  strength?: string;
  form?: string;
  company?: string;
  indications?: string;
}

interface MedicineLookupProps {
  /** When true, hides the in-panel title (used in dashboard sidebar). */
  embedded?: boolean;
  onSelectMedicine?: (selection: LookupMedicineSelection) => void;
  diagnosisQuery?: string;
}

const MedicineLookup: React.FC<MedicineLookupProps> = ({
  embedded = false,
  onSelectMedicine,
  diagnosisQuery,
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [medicineData, setMedicineData] = useState<MedicineData[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedDisease, setSelectedDisease] = useState<MedicineData | null>(null);
  const [aiSuggestions, setAiSuggestions] = useState<MedicineData[]>([]);
  const [loadingAiSuggestions, setLoadingAiSuggestions] = useState(false);

  const getItemKey = (item: MedicineData) =>
    `${item.entryType || 'unknown'}::${(item.Medicine || '').trim()}::${(item.Molecule || '').trim()}::${(item.Disease || '').trim()}`;

  const emitSelectedMedicine = (item: MedicineData) => {
    if (item.entryType !== 'catalog' || !onSelectMedicine) return;
    onSelectMedicine({
      name: item.Medicine || item.Disease || item.Molecule || '',
      molecule: item.Molecule || '',
      strength: item.Strength || '',
      form: item.Form || '',
      company: item.Company || '',
      indications: item.Indications || '',
    });
  };

  useEffect(() => {
    loadMedicineData();
  }, []);

  useEffect(() => {
    const q = (diagnosisQuery || '').trim();
    if (!q) return;
    setSearchTerm(q);
    const timer = setTimeout(async () => {
      if (q.length < 3) {
        setAiSuggestions([]);
        return;
      }
      setLoadingAiSuggestions(true);
      try {
        const res = await fetch(`${getApiBaseUrl()}/api/medicine_lookup/suggest`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ diagnosis: q }),
        });
        const data = await res.json();
        setAiSuggestions(data?.success ? (data.suggestions || []) : []);
      } catch (err) {
        console.error('Error loading AI medicine suggestions:', err);
        setAiSuggestions([]);
      } finally {
        setLoadingAiSuggestions(false);
      }
    }, 450);
    return () => clearTimeout(timer);
  }, [diagnosisQuery]);

  const loadMedicineData = async () => {
    setLoading(true);
    try {
      const response = await fetch(`${getApiBaseUrl()}/api/medicine_lookup.json`);
      if (response.ok) {
        const data = await response.json();
        setMedicineData(data);
      } else {
        const fallbackResponse = await fetch('/api/medicine_lookup.json');
        if (fallbackResponse.ok) {
          const data = await fallbackResponse.json();
          setMedicineData(data);
        } else {
          const directResponse = await fetch(`${getApiBaseUrl()}/api/medicine_kbase.json`);
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

  const filteredBase = medicineData
    .filter(
      (item) =>
        item.Disease.toLowerCase().includes(searchTerm.toLowerCase()) ||
        item.Description.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (item.Medicine || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
        (item.Molecule || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
        (item.Indications || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
        item.Symptoms.some((symptom) => symptom.toLowerCase().includes(searchTerm.toLowerCase())) ||
        item['Common Treatments'].some((treatment) =>
          treatment.toLowerCase().includes(searchTerm.toLowerCase())
        )
    )
    .sort((a, b) => a.Disease.localeCompare(b.Disease));

  const aiSuggestionKeys = new Set(aiSuggestions.map(getItemKey));
  const filteredData = [
    ...aiSuggestions.filter((s) =>
      searchTerm
        ? (s.Disease || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
          (s.Description || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
          (s.Molecule || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
          (s.Indications || '').toLowerCase().includes(searchTerm.toLowerCase())
        : true
    ),
    ...filteredBase.filter((i) => !aiSuggestionKeys.has(getItemKey(i))),
  ];

  if (loading) {
    return (
      <div className="flex h-full min-h-0 items-center justify-center">
        <div className="h-12 w-12 animate-spin rounded-full border-b-2 border-sky-400" />
      </div>
    );
  }

  if (selectedDisease) {
    return (
      <div className="flex h-full min-h-0 flex-col">
        <div className="mb-3 shrink-0">
          <button
            type="button"
            onClick={() => setSelectedDisease(null)}
            className="flex items-center gap-2 text-sm font-medium text-sky-300 transition-colors hover:text-sky-200"
          >
            <span>← Back to Search</span>
          </button>
        </div>

        <div className="hide-scrollbar min-h-0 flex-1 overflow-y-auto">
          <div className="rounded-xl border border-slate-700/50 bg-slate-900/30 p-6">
            <div className="mb-6 flex items-center gap-3">
              <Pill className="text-sky-300" size={32} />
              <h2 className="text-2xl font-bold text-slate-100">{selectedDisease.Disease}</h2>
            </div>

            <div className="space-y-6">
              <div>
                <h3 className="mb-2 text-lg font-semibold text-slate-200">
                  {selectedDisease.entryType === 'catalog' ? 'Summary' : 'Description'}
                </h3>
                <p className="leading-relaxed text-slate-400">{selectedDisease.Description}</p>
                {!!selectedDisease.aiReason && (
                  <p className="mt-2 rounded-md border border-violet-500/30 bg-violet-500/10 px-3 py-2 text-sm text-violet-200">
                    AI rationale: {selectedDisease.aiReason}
                  </p>
                )}
              </div>

              {selectedDisease.entryType !== 'catalog' && (
                <div>
                  <h3 className="mb-3 text-lg font-semibold text-slate-200">Symptoms</h3>
                  <ul className="list-inside list-disc space-y-2 text-slate-400">
                    {selectedDisease.Symptoms.map((symptom, index) => (
                      <li key={index}>{symptom}</li>
                    ))}
                  </ul>
                </div>
              )}

              {selectedDisease.entryType !== 'catalog' && (
                <div>
                  <h3 className="mb-3 text-lg font-semibold text-slate-200">Causes</h3>
                  <ul className="list-inside list-disc space-y-2 text-slate-400">
                    {selectedDisease.Causes.map((cause, index) => (
                      <li key={index}>{cause}</li>
                    ))}
                  </ul>
                </div>
              )}

              {selectedDisease.entryType === 'catalog' && (
                <div className="rounded-lg border border-slate-700/50 bg-slate-900/30 p-4 text-slate-300">
                  {!!selectedDisease.Molecule && <p><span className="font-semibold text-slate-200">Molecule:</span> {selectedDisease.Molecule}</p>}
                  {!!selectedDisease.Strength && <p className="mt-1"><span className="font-semibold text-slate-200">Strength:</span> {selectedDisease.Strength}</p>}
                  {!!selectedDisease.Form && <p className="mt-1"><span className="font-semibold text-slate-200">Form:</span> {selectedDisease.Form}</p>}
                  {!!selectedDisease.Company && <p className="mt-1"><span className="font-semibold text-slate-200">Company:</span> {selectedDisease.Company}</p>}
                  {!!selectedDisease.Indications && <p className="mt-1"><span className="font-semibold text-slate-200">Indications:</span> {selectedDisease.Indications}</p>}
                  <button
                    type="button"
                    onClick={() => emitSelectedMedicine(selectedDisease)}
                    className="mt-3 rounded-lg bg-sky-500/20 px-3 py-1.5 text-sm font-medium text-sky-200 transition-colors hover:bg-sky-500/30"
                  >
                    Use in Prescription
                  </button>
                </div>
              )}

              {selectedDisease.entryType !== 'catalog' && (
                <div>
                  <h3 className="mb-3 text-lg font-semibold text-slate-200">Common Treatments</h3>
                  <div className="rounded-lg border border-sky-500/25 bg-sky-500/10 p-4">
                    <ul className="list-inside list-disc space-y-2 text-slate-300">
                      {selectedDisease['Common Treatments'].map((treatment, index) => (
                        <li key={index} className="font-medium">
                          {treatment}
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="mb-3 shrink-0 space-y-3">
        {!embedded && (
          <div className="flex items-center gap-3">
            <BookOpen className="text-sky-300" size={28} />
            <h2 className="text-xl font-semibold text-slate-100">Medicine & Condition Lookup</h2>
          </div>
        )}

        <div className="relative">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-500"
            size={20}
          />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search by disease name, symptoms, or treatments..."
            className="form-field w-full py-3 pl-10"
            autoFocus={!embedded}
          />
        </div>
        {(loadingAiSuggestions || aiSuggestions.length > 0) && (
          <div className="rounded-lg border border-violet-500/25 bg-violet-500/10 px-3 py-2 text-xs text-violet-200">
            {loadingAiSuggestions
              ? 'AI is generating diagnosis-based medicine suggestions...'
              : `AI suggested ${aiSuggestions.length} medicine option(s) for current diagnosis.`}
          </div>
        )}
      </div>

      <div className="hide-scrollbar min-h-0 flex-1 overflow-y-auto">
        <div className="rounded-xl border border-slate-700/50">
          {filteredData.length === 0 ? (
            <div className="py-12 text-center">
              <AlertCircle className="mx-auto text-slate-500" size={48} />
              <p className="mt-4 text-slate-400">
                {searchTerm
                  ? 'No results found'
                  : 'Start typing to search for diseases and treatments'}
              </p>
            </div>
          ) : (
            <div className="divide-y divide-slate-700/50">
              {filteredData.map((item, index) => (
                <button
                  key={index}
                  type="button"
                  onClick={() => {
                    setSelectedDisease(item);
                    emitSelectedMedicine(item);
                  }}
                  className="w-full p-6 text-left transition-colors hover:bg-slate-800/50"
                >
                  <div className="flex items-start gap-4">
                    <Pill className="shrink-0 text-sky-300" size={24} />
                    <div className="flex-1">
                      <h3 className="mb-2 text-lg font-semibold text-slate-100">{item.Disease}</h3>
                      <p className="line-clamp-2 text-sm text-slate-400">{item.Description}</p>
                      {item.entryType === 'catalog' ? (
                        <div className="mt-3 flex flex-wrap gap-2">
                          {(item.Molecule || '').split('+').slice(0, 2).map((part, idx) => (
                            <span
                              key={idx}
                              className="rounded-full bg-indigo-500/15 px-2 py-1 text-xs text-indigo-300"
                            >
                              {part.trim()}
                            </span>
                          ))}
                        </div>
                      ) : (
                        <div className="mt-3 flex flex-wrap gap-2">
                          {item['Common Treatments'].slice(0, 3).map((treatment, idx) => (
                            <span
                              key={idx}
                              className="rounded-full bg-sky-500/15 px-2 py-1 text-xs text-sky-300"
                            >
                              {treatment}
                            </span>
                          ))}
                          {item['Common Treatments'].length > 3 && (
                            <span className="rounded-full bg-slate-700/50 px-2 py-1 text-xs text-slate-400">
                              +{item['Common Treatments'].length - 3} more
                            </span>
                          )}
                        </div>
                      )}
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
