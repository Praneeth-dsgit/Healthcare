import { type FC, useState, useEffect, useRef } from 'react';
import { ArrowUp, Bot, FileDown, UserCircle, Trash2, AlertCircle, Upload, FileText, Image as ImageIcon, Loader2, X } from 'lucide-react';
import ChatMessage from './components/ChatMessage';
import LoadingDots from './components/LoadingDots';
import DisclaimerModal from './components/DisclaimerModal';
import PatientInfoForm from './components/PatientInfoForm';
import { Message, PatientInfo } from './types';
import {
  getInitialMessages,
  saveMessages,
  clearMessages,
  saveSessions,
  getSessions,
  setCurrentSessionId,
  getCurrentSessionId,
  removeSession
} from './utils/storage';
import { exportChatHistory } from './utils/export';
import Header from './components/Header';
import QuickPrompts from './components/QuickPrompts';
import { v4 as uuidv4 } from 'uuid';
import { GlobalWorkerOptions, getDocument } from 'pdfjs-dist';
import workerUrl from 'pdfjs-dist/build/pdf.worker.mjs?url';
GlobalWorkerOptions.workerSrc = workerUrl;

function shouldResetContext(input: string): boolean {
  const trimmed = input.trim().toLowerCase();
  const resetPhrases = [
    "okay", "ok", "leave it", "thanks", "thank you", "new topic", "start over", "ignore", "cancel"
  ];
  return (
    trimmed.length < 5 ||
    resetPhrases.includes(trimmed)
  );
}

const App: FC = () => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [showDisclaimer, setShowDisclaimer] = useState(true);
  const [patientInfo, setPatientInfo] = useState<PatientInfo>({
    age: 0,
    weight: 0,
    gender: 'other',
    height: 0,
    bloodPressure: '',
    allergies: '',
    medications: '',
    medicalHistory: ''
  });
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const [sessions, setSessions] = useState<any[]>([]);
  const [currentSessionId, setCurrentSessionIdState] = useState<string | null>(null);
  const [showDropdown, setShowDropdown] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const [uploading, setUploading] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [showFileTypeModal, setShowFileTypeModal] = useState(false);
  const [selectedFileType, setSelectedFileType] = useState<'pdf' | 'image' | null>(null);
  const [pendingFileType, setPendingFileType] = useState<'pdf' | 'image' | null>(null);
  const [analyzeTimer, setAnalyzeTimer] = useState(0);
  const analyzeTimerRef = useRef<number | null>(null);
  const [previewFile, setPreviewFile] = useState<{ url: string; type: string; name: string } | null>(null);
  const [zoom, setZoom] = useState(1);
  const [isPanning, setIsPanning] = useState(false);
  const [panStart, setPanStart] = useState<{ x: number; y: number } | null>(null);
  const [panOffset, setPanOffset] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [isDragActive, setIsDragActive] = useState(false);
  const [lastUploadedFile, setLastUploadedFile] = useState<{
    fileName: string;
    fileType: string;
    fileUrl: string;
  } | null>(null);
  const [lastFileFindings, setLastFileFindings] = useState<string | null>(null);
  const [lastAiMessage, setLastAiMessage] = useState<string | null>(null);

  // Timer for analyzing
  useEffect(() => {
    if (analyzing) {
      setAnalyzeTimer(0);
      analyzeTimerRef.current = setInterval(() => {
        setAnalyzeTimer((t) => t + 1);
      }, 1000);
    } else if (analyzeTimerRef.current) {
      clearInterval(analyzeTimerRef.current);
    }
    return () => {
      if (analyzeTimerRef.current) clearInterval(analyzeTimerRef.current);
    };
  }, [analyzing]);

  // Handle file type selection
  const handleFileTypeSelect = (type: 'pdf' | 'image') => {
    setPendingFileType(type);
  };

  // Close dropdown when clicking outside
  useEffect(() => {
    if (!showDropdown) return;
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setShowDropdown(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showDropdown]);

  // Load sessions and current session on mount
  useEffect(() => {
    const loadedSessions = getSessions();
    let sessionId = getCurrentSessionId();
    if (!loadedSessions.length) {
      // Create initial session
      const newId = uuidv4();
      const initialSession = { id: newId, name: 'Session 1', messages: [] };
      saveSessions([initialSession]);
      setSessions([initialSession]);
      setCurrentSessionId(newId);
      setCurrentSessionIdState(newId);
      setMessages([]);
    } else {
      setSessions(loadedSessions);
      if (!sessionId) sessionId = loadedSessions[0].id;
      setCurrentSessionIdState(sessionId);
      setCurrentSessionId(sessionId || loadedSessions[0].id);
      const found = loadedSessions.find(s => s.id === sessionId);
      setMessages(found ? found.messages : []);
    }
  }, []);

  // Save messages to the current session
  useEffect(() => {
    if (!currentSessionId) return;
    const updatedSessions = sessions.map(s =>
      s.id === currentSessionId ? { ...s, messages } : s
    );
    setSessions(updatedSessions);
    saveSessions(updatedSessions);
    saveMessages(messages); // legacy, can be removed later
  }, [messages]);

  // Handle session switch
  const handleSessionSwitch = (sessionId: string) => {
    setCurrentSessionIdState(sessionId);
    setCurrentSessionId(sessionId);
    const found = sessions.find(s => s.id === sessionId);
    setMessages(found ? found.messages : []);
  };

  // Create new session
  const handleNewSession = () => {
    const newId = uuidv4();
    const newSession = {
      id: newId,
      name: `Session ${sessions.length + 1}`,
      messages: []
    };
    const updatedSessions = [...sessions, newSession];
    setSessions(updatedSessions);
    saveSessions(updatedSessions);
    setCurrentSessionIdState(newId);
    setCurrentSessionId(newId);
    setMessages([]);
  };

  // Handle session delete
  const handleDeleteSession = (sessionId: string) => {
    if (sessions.length === 1) return; // Prevent deleting the last session
    const updatedSessions = sessions.filter(s => s.id !== sessionId);
    setSessions(updatedSessions);
    saveSessions(updatedSessions);
    removeSession(sessionId);
    // If the deleted session was current, switch to another
    if (currentSessionId === sessionId) {
      const nextSession = updatedSessions[0];
      setCurrentSessionIdState(nextSession.id);
      setCurrentSessionId(nextSession.id);
      setMessages(nextSession.messages);
    }
  };

  const handlePatientSubmit = async (info: PatientInfo) => {
    const messageContent = "Please provide a treatment plan based on the entered patient information.";

    const userMessage: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: messageContent,
      timestamp: new Date().toISOString(),
      patientInfo: info,
    };

    setMessages(prev => [...prev, userMessage]);
    setIsLoading(true);

    const tempMessageId = 'assistant-' + Date.now().toString();
    const tempMessage: Message = {
      id: tempMessageId,
      role: 'assistant',
      content: '',
      timestamp: new Date().toISOString(),
    };
    setMessages(prev => [...prev, tempMessage]);

    try {
      const resetContext = shouldResetContext(userMessage.content);
      const isFollowUp = !resetContext;
      const resetMessage = resetContext ? userMessage.content.trim().toLowerCase() : null;
      const response = await fetch('http://localhost:5000/api/chat/stream', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          message: userMessage.content,
          patientInfo: info,
          fileContext: resetContext ? null : lastUploadedFile,
          fileFindings: resetContext ? null : lastFileFindings,
          previousAiMessage: isFollowUp ? lastAiMessage : null,
          resetMessage,
        }),
      });

      const reader = response.body?.getReader();
      if (!reader) throw new Error('No reader available');

      let assistantContent = '';
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = new TextDecoder().decode(value);
        const lines = chunk.split('\n');
        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const content = line.slice(6);
            const processedContent = content.replace(/\\n/g, '\n');
            assistantContent += processedContent;
            setMessages(prev =>
              prev.map(msg =>
                msg.id === tempMessageId
                  ? { ...msg, content: (msg.content || '') + processedContent }
                  : msg
              )
            );
          }
        }
      }
      setLastAiMessage(assistantContent);
    } catch (error) {
      setMessages(prev =>
        prev.map(msg =>
          msg.id === tempMessageId
            ? {
                ...msg,
                content: 'An error occurred while generating the treatment plan.',
                isError: true,
              }
            : msg
        )
      );
      setLastAiMessage(null);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    clearMessages();
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  useEffect(() => {
    saveMessages(messages);
  }, [messages]);

  useEffect(() => {
    if (inputRef.current) {
      inputRef.current.style.height = 'auto';
      inputRef.current.style.height = `${inputRef.current.scrollHeight}px`;
    }
  }, [input]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isLoading) return;

    const userMessage: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: input.trim(),
      timestamp: new Date().toISOString(),
      patientInfo: patientInfo
    };

    setMessages(prev => [...prev, userMessage]);
    setInput('');
    setIsLoading(true);

    const tempMessageId = (Date.now() + 1).toString();
    const tempMessage: Message = {
      id: tempMessageId,
      role: 'assistant',
      content: '',
      timestamp: new Date().toISOString(),
    };
    setMessages(prev => [...prev, tempMessage]);

    try {
      const resetContext = shouldResetContext(userMessage.content);
      const isFollowUp = !resetContext;
      const resetMessage = resetContext ? userMessage.content.trim().toLowerCase() : null;
      const response = await fetch('http://localhost:5000/api/chat/stream', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          message: userMessage.content,
          patientInfo: patientInfo,
          fileContext: resetContext ? null : lastUploadedFile,
          fileFindings: resetContext ? null : lastFileFindings,
          previousAiMessage: isFollowUp ? lastAiMessage : null,
          resetMessage,
        }),
      });

      if (!response.ok) throw new Error('Failed to get response from server');

      const reader = response.body?.getReader();
      if (!reader) throw new Error('No reader available');

      let assistantContent = '';
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = new TextDecoder().decode(value);
        const lines = chunk.split('\n');
        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const content = line.slice(6);
            if (content.startsWith('[ERROR]')) {
              throw new Error(content.slice(8));
            }

            const processedContent = content.replace(/\\n/g, '\n');

            assistantContent += processedContent;
            setMessages(prev => prev.map(msg =>
              msg.id === tempMessageId
                ? {
                    ...msg,
                    content: (msg.content || '') + processedContent
                  }
                : msg
            ));
          }
        }
      }
      setLastAiMessage(assistantContent);

    } catch (error) {
      console.error('Error:', error);
      const errorMessage: Message = {
        id: tempMessageId,
        role: 'assistant',
        content: "I'm sorry, I encountered an error processing your request. Please try again later.",
        timestamp: new Date().toISOString(),
        isError: true,
      };

      setMessages(prev => prev.map(msg =>
        msg.id === tempMessageId ? errorMessage : msg
      ));
      setLastAiMessage(null);
    } finally {
      setIsLoading(false);
    }
  };

  const handleQuickPrompt = (prompt: string) => {
    setInput(prompt);
    if (inputRef.current) inputRef.current.focus();
  };

  const clearChat = () => {
    if (window.confirm('Are you sure you want to clear the chat history?')) {
      setMessages([]);
    }
  };

  // Helper to generate PDF thumbnail
  const generatePdfThumbnail = async (file: File): Promise<string | null> => {
    try {
      const arrayBuffer = await file.arrayBuffer();
      const pdf = await getDocument({ data: arrayBuffer }).promise;
      const page = await pdf.getPage(1);
      const viewport = page.getViewport({ scale: 1 });
      const canvas = document.createElement('canvas');
      canvas.width = viewport.width;
      canvas.height = viewport.height;
      const context = canvas.getContext('2d');
      if (!context) return null;
      await page.render({ canvasContext: context, viewport }).promise;
      return canvas.toDataURL('image/png');
    } catch (e) {
      return null;
    }
  };

  // Handle file upload with progress (updated to close modal after file selection)
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;
    setShowFileTypeModal(false);
    setSelectedFileType(pendingFileType);
    setPendingFileType(null);
    for (const file of files) {
      setUploading(true);
      setUploadProgress(0);
      setAnalyzing(false);
      // Create preview URL or PDF thumbnail
      let fileUrl = '';
      let pdfThumbnail: string | undefined = undefined;
      if (file.type.startsWith('image/')) {
        fileUrl = URL.createObjectURL(file);
      } else if (file.type === 'application/pdf') {
        fileUrl = URL.createObjectURL(file);
        const thumb = await generatePdfThumbnail(file);
        pdfThumbnail = thumb || undefined;
      }
      // Show a message in chat for the uploaded file with preview
      const fileMessage: Message & { fileUrl?: string; fileType?: string; fileName?: string; pdfThumbnail?: string } = {
        id: Date.now().toString(),
        role: 'user',
        content: '',
        timestamp: new Date().toISOString(),
        patientInfo: patientInfo,
        fileUrl: fileUrl,
        fileType: file.type,
        fileName: file.name,
        pdfThumbnail: pdfThumbnail
      };
      setMessages(prev => [...prev, fileMessage]);
      setLastUploadedFile({
        fileName: file.name,
        fileType: file.type,
        fileUrl: fileUrl,
      });
      // Upload to backend with progress
      const formData = new FormData();
      formData.append('file', file);
      formData.append('sessionId', currentSessionId || '');
      try {
        await new Promise<void>((resolve, reject) => {
          const xhr = new XMLHttpRequest();
          xhr.open('POST', 'http://localhost:5000/api/upload');
          xhr.upload.onprogress = (event) => {
            if (event.lengthComputable) {
              setUploadProgress(Math.round((event.loaded / event.total) * 100));
            }
          };
          xhr.onload = () => {
            setUploading(false);
            setUploadProgress(100);
            setAnalyzing(true);
            setTimeout(() => setUploadProgress(0), 500);
            try {
              const data = JSON.parse(xhr.responseText);
              setMessages(prev => [...prev, {
                id: Date.now().toString() + '-ai',
                role: 'assistant',
                content: data.result || 'No interpretation available.',
                timestamp: new Date().toISOString(),
              }]);
              setLastFileFindings(data.result || null); // <-- store findings
              setLastAiMessage(data.result || null);
            } catch (err) {
              setMessages(prev => [...prev, {
                id: Date.now().toString() + '-err',
                role: 'assistant',
                content: 'Error uploading or interpreting the file.',
                timestamp: new Date().toISOString(),
                isError: true,
              }]);
              setLastFileFindings(null);
              setLastAiMessage(null);
            }
            setAnalyzing(false);
            resolve();
          };
          xhr.onerror = () => {
            setUploading(false);
            setAnalyzing(false);
            setMessages(prev => [...prev, {
              id: Date.now().toString() + '-err',
              role: 'assistant',
              content: 'Error uploading or interpreting the file.',
              timestamp: new Date().toISOString(),
              isError: true,
            }]);
            reject();
          };
          xhr.send(formData);
        });
      } catch (error) {
        setUploading(false);
        setAnalyzing(false);
        setMessages(prev => [...prev, {
          id: Date.now().toString() + '-err',
          role: 'assistant',
          content: 'Error uploading or interpreting the file.',
          timestamp: new Date().toISOString(),
          isError: true,
        }]);
        setLastAiMessage(null);
      }
    }
  };

  // Handler for preview click from ChatMessage
  const handlePreviewClick = (fileUrl: string, fileType: string, fileName: string) => {
    setPreviewFile({ url: fileUrl, type: fileType, name: fileName });
    setZoom(1);
    setPanOffset({ x: 0, y: 0 });
  };

  // Zoom controls
  const handleZoomIn = () => setZoom((z) => Math.min(z + 0.25, 4));
  const handleZoomOut = () => setZoom((z) => Math.max(z - 0.25, 0.5));
  const handleResetZoom = () => { setZoom(1); setPanOffset({ x: 0, y: 0 }); };

  // Pan controls
  const handleMouseDown = (e: React.MouseEvent) => {
    setIsPanning(true);
    setPanStart({ x: e.clientX - panOffset.x, y: e.clientY - panOffset.y });
  };
  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isPanning || !panStart) return;
    setPanOffset({ x: e.clientX - panStart.x, y: e.clientY - panStart.y });
  };
  const handleMouseUp = () => setIsPanning(false);

  // Mouse wheel zoom for image preview
  const handleWheel = (e: React.WheelEvent) => {
    if (!previewFile || !previewFile.type.startsWith('image/')) return;
    e.preventDefault();
    setZoom((z) => {
      let next = z + (e.deltaY < 0 ? 0.1 : -0.1);
      return Math.max(0.5, Math.min(4, Math.round(next * 100) / 100));
    });
  };

  // Drag & drop handlers
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragActive(true);
  };
  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragActive(false);
  };
  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragActive(false);
    const files = Array.from(e.dataTransfer.files);
    if (files.length > 0) {
      // For now, just handle the first file (multi-file will be next)
      const file = files[0];
      // Determine type for modal logic
      if (file.type === 'application/pdf') {
        setPendingFileType('pdf');
      } else if (file.type.startsWith('image/')) {
        setPendingFileType('image');
      } else {
        // Show error or ignore unsupported file
        return;
      }
      setShowFileTypeModal(false); // Hide modal if open
      // Simulate file input selection
      setTimeout(() => {
        // Create a synthetic event for file upload handler
        const dt = new DataTransfer();
        dt.items.add(file);
        const input = document.createElement('input');
        input.type = 'file';
        input.files = dt.files;
        handleFileUpload({ target: { files: dt.files } } as any);
      }, 100);
    }
  };

  // Replace session name with topic (first user message or fallback)
  function getSessionTopic(session: any): string {
    if (session.messages && session.messages.length > 0) {
      const firstUserMsg = session.messages.find((m: any) => m.role === 'user');
      if (firstUserMsg && firstUserMsg.content) {
        return firstUserMsg.content.length > 30
          ? firstUserMsg.content.slice(0, 30) + '...'
          : firstUserMsg.content;
      }
    }
    return 'New Session';
  }

  return (
    <div className="flex flex-col h-screen overflow-hidden bg-gray-50">
      <Header
        sessions={sessions}
        currentSessionId={currentSessionId}
        showDropdown={showDropdown}
        setShowDropdown={setShowDropdown}
        dropdownRef={dropdownRef}
        getSessionTopic={getSessionTopic}
        handleSessionSwitch={handleSessionSwitch}
        handleDeleteSession={handleDeleteSession}
        handleNewSession={handleNewSession}
      />

      {showDisclaimer && (
        <DisclaimerModal onClose={() => setShowDisclaimer(false)} />
      )}

      <main className="flex-1 flex px-4 py-4 overflow-hidden max-w-7xl w-full mx-auto">
        <div className="flex gap-2 flex-1 min-h-0">
          {/* Left Column - Patient Info */}
          <div className="w-65 flex-shrink-0 overflow-y-auto hide-scrollbar">
            <div className="h-full flex flex-col">
              <h2 className="text-lg font-medium text-blue-900 mb-2">Patient Information</h2>
              <div className="flex-1">
                <PatientInfoForm
                  patientInfo={patientInfo}
                  onPatientInfoChange={setPatientInfo}
                  onSubmitPatientInfo={handlePatientSubmit}
                  isLoading={isLoading}
                />
              </div>
            </div>
          </div>

          {/* Right Column - Chat */}
          <div className="flex-1 flex flex-col overflow-hidden">
            <div className="bg-white rounded-lg shadow-md flex flex-col h-full relative">
              <div className="flex-1 overflow-y-auto p-4 space-y-4 hide-scrollbar">
                {messages.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-full text-center text-gray-500 space-y-4">
                    <Bot size={48} className="text-primary-500" />
                    <div>
                      <p className="text-lg font-medium">Welcome to the Healthcare Assistant</p>
                      <p className="max-w-md mx-auto mt-2">
                        Ask me questions about health conditions, symptoms, treatments, or general health advice.
                      </p>
                    </div>
                    <div className="flex items-center space-x-2 text-amber-600">
                      <AlertCircle size={16} />
                      <span className="text-sm">For informational purposes only, not medical advice.</span>
                    </div>
                  </div>
                ) : (
                  messages.map((message) => (
                    <ChatMessage key={message.id} message={message} onPreviewClick={handlePreviewClick} />
                  ))
                )}
                {isLoading && (
                  <div className="flex items-start space-x-3">
                    <div className="flex-shrink-0 bg-primary-100 rounded-full p-2">
                      <Bot size={24} className="text-primary-600" />
                    </div>
                    <div className="p-3 bg-primary-50 rounded-lg rounded-tl-none max-w-[85%]">
                      <LoadingDots />
                    </div>
                  </div>
                )}
                <div ref={messagesEndRef} />
              </div>

              {/* Quick Prompts */}
              <QuickPrompts onSelectPrompt={handleQuickPrompt} />
              {/* Fixed Input */}
              <div className="sticky bottom-0 bg-white p-1 border-t border-gray-200"
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
              >
                {/* Drag & Drop Overlay */}
                {isDragActive && (
                  <div className="absolute inset-0 z-50 flex items-center justify-center bg-primary-100 bg-opacity-80 rounded-lg border-2 border-primary-500 border-dashed pointer-events-none">
                    <div className="text-primary-700 text-lg font-semibold flex flex-col items-center">
                      <Upload size={36} className="mb-2" />
                      Drop your PDF or image here to upload
                    </div>
                  </div>
                )}
                {/* File Type Selection Modal */}
                {showFileTypeModal && (
                  <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-30">
                    <div className="bg-white rounded-lg shadow-lg p-6 w-80 flex flex-col items-center">
                      <h3 className="text-lg font-semibold mb-4">Select file type to upload</h3>
                      {!pendingFileType && <>
                        <button
                          className="w-full flex items-center gap-2 px-4 py-2 mb-3 rounded bg-primary-100 hover:bg-primary-200 text-primary-700 font-medium"
                          onClick={() => handleFileTypeSelect('pdf')}
                        >
                          <FileText size={20} /> Lab Report (PDF)
                        </button>
                        <button
                          className="w-full flex items-center gap-2 px-4 py-2 rounded bg-primary-100 hover:bg-primary-200 text-primary-700 font-medium"
                          onClick={() => handleFileTypeSelect('image')}
                        >
                          <ImageIcon size={20} /> Radiology Image (JPG/PNG)
                        </button>
                        <button
                          className="mt-4 text-sm text-gray-500 hover:underline"
                          onClick={() => setShowFileTypeModal(false)}
                        >Cancel</button>
                      </>}
                      {pendingFileType && (
                        <>
                          <input
                            id="file-upload-input"
                            type="file"
                            accept={pendingFileType === 'pdf' ? '.pdf' : 'image/*'}
                            className="block w-full text-sm text-gray-700 mb-4"
                            onChange={handleFileUpload}
                            disabled={isLoading || uploading || analyzing}
                            autoFocus
                            multiple
                          />
                          <button
                            className="mt-2 text-sm text-gray-500 hover:underline"
                            onClick={() => setPendingFileType(null)}
                          >Back</button>
                        </>
                      )}
                    </div>
                  </div>
                )}
                <form onSubmit={handleSubmit} className="relative flex items-center">
                  {/* Upload Button */}
                  <label className="flex items-center cursor-pointer mr-2" title="Upload PDF or Image" onClick={e => { e.preventDefault(); setShowFileTypeModal(true); }}>
                    <span className={`p-2 rounded-full ${uploading ? 'bg-gray-300' : 'bg-primary-100 hover:bg-primary-200'} transition-colors`}>
                      <Upload size={20} className="text-primary-600" />
                    </span>
                  </label>
                  {/* Upload Progress Bar */}
                  {uploading && (
                    <div className="w-32 h-2 bg-gray-200 rounded-full overflow-hidden mr-2">
                      <div className="h-full bg-primary-500 transition-all" style={{ width: `${uploadProgress}%` }} />
                    </div>
                  )}
                  {/* Analyzing Indicator */}
                  {analyzing && (
                    <div className="flex items-center gap-1 text-primary-600 font-medium mr-2">
                      <Loader2 className="animate-spin" size={18} />
                      <span>Analyzing... {analyzeTimer}s</span>
                    </div>
                  )}
                  <textarea
                    ref={inputRef}
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    placeholder="Ask about symptoms, conditions, or health information..."
                    className="w-full p-3 pr-12 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent resize-none hide-scrollbar"
                    rows={1}
                    disabled={isLoading || uploading || analyzing}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault();
                        handleSubmit(e);
                      }
                    }}
                  />
                  <button
                    type="submit"
                    disabled={!input.trim() || isLoading || uploading || analyzing}
                    className="absolute right-3 bottom-3 p-1.5 rounded-full bg-primary-500 text-white disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors hover:bg-primary-600"
                  >
                    <ArrowUp size={20} />
                  </button>
                </form>
              </div>
            </div>
          </div>
        </div>
      </main>

      {/* File Preview Modal */}
      {previewFile && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-70">
          <div className="relative bg-white rounded-lg shadow-lg p-4 max-w-2xl w-full flex flex-col items-center">
            <button
              className="absolute top-2 right-2 p-1 rounded-full bg-gray-200 hover:bg-gray-300"
              onClick={() => setPreviewFile(null)}
              title="Close"
            >
              <X size={22} />
            </button>
            {previewFile.type.startsWith('image/') && (
              <div className="flex items-center mb-2 gap-2">
                <button onClick={handleZoomOut} className="p-1 rounded bg-gray-200 hover:bg-gray-300" title="Zoom out">-</button>
                <span className="text-sm font-medium">{Math.round(zoom * 100)}%</span>
                <button onClick={handleZoomIn} className="p-1 rounded bg-gray-200 hover:bg-gray-300" title="Zoom in">+</button>
                <button onClick={handleResetZoom} className="p-1 rounded bg-gray-200 hover:bg-gray-300" title="Reset zoom">Reset</button>
              </div>
            )}
            {previewFile.type.startsWith('image/') ? (
              <div
                className="overflow-hidden flex items-center justify-center w-full h-[70vh] bg-gray-50 rounded"
                style={{ cursor: isPanning ? 'grabbing' : zoom > 1 ? 'grab' : 'default' }}
                onMouseDown={handleMouseDown}
                onMouseMove={handleMouseMove}
                onMouseUp={handleMouseUp}
                onMouseLeave={handleMouseUp}
                onWheel={handleWheel}
              >
                <img
                  src={previewFile.url}
                  alt={previewFile.name}
                  style={{
                    transform: `scale(${zoom}) translate(${panOffset.x / zoom}px, ${panOffset.y / zoom}px)`,
                    transition: isPanning ? 'none' : 'transform 0.2s',
                    maxHeight: '70vh',
                    maxWidth: '100%',
                    userSelect: 'none',
                    pointerEvents: 'all',
                  }}
                  draggable={false}
                />
              </div>
            ) : previewFile.type === 'application/pdf' ? (
              <div className="flex flex-col items-center">
                <FileText size={48} className="text-primary-400 mb-2" />
                <span className="mb-2 font-medium text-gray-700">{previewFile.name}</span>
                <a href={previewFile.url} download={previewFile.name} className="text-primary-600 underline">Download PDF</a>
              </div>
            ) : null}
          </div>
        </div>
      )}

      <footer className="py-3 px-4 text-center text-sm text-gray-500 border-t border-gray-200">
        <p>© 2025 Healthcare Chatbot. Assistance For Professional Medical Advice.</p>
      </footer>
    </div>
  );
};

export default App;
