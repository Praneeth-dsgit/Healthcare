import React, { useState } from 'react';
import {
  ArrowUp,
  AlertCircle,
  Upload,
  FileText,
  Image as ImageIcon,
  PlusCircle,
  Trash2,
  Stethoscope,
  Square,
  UserRound,
  X,
} from 'lucide-react';
import ChatMessage from '../ChatMessage';
import { findReferenceImageForAssistantMessage } from '../../utils/staffReportPdf';
import LoadingDots from '../LoadingDots';
import FaqDropdown from '../FaqDropdown';
import VoiceInput from '../VoiceInput';
import { Message } from '../../types';
import type { Capability } from '../../services/roleService';
import type { PortalId } from '../../theme/portalThemes';
import { getPortalTheme } from '../../theme/portalThemes';
import type { LinkedPatientState } from './StaffPatientPanel.types';
import StaffPatientsRecordsTab from './StaffPatientsRecordsTab';
import { linkPatientFromDatabase } from '../../utils/staffLinkPatient';
import {
  formatPatientInputTag,
  isStaffPatientDragEvent,
  readStaffPatientDragData,
} from '../../utils/staffPatientDrag';

interface CapabilityInfo {
  name: string;
  color: string;
  bgColor: string;
  subtitle?: string;
}

interface StaffChatLayoutProps {
  portal: PortalId;
  capability: Capability;
  capabilityInfo: CapabilityInfo;
  sessions: Array<{ id: string }>;
  currentSessionId: string | null;
  messages: Message[];
  input: string;
  setInput: (value: string) => void;
  isLoading: boolean;
  uploading: boolean;
  analyzing: boolean;
  uploadProgress: number;
  showFileTypeModal: boolean;
  setShowFileTypeModal: (show: boolean) => void;
  pendingFileType: 'pdf' | 'image' | null;
  setPendingFileType: (type: 'pdf' | 'image' | null) => void;
  isDragActive: boolean;
  isVoiceRecording: boolean;
  placeholderText: string;
  previewFile: { url: string; type: string; name: string } | null;
  setPreviewFile: (file: null) => void;
  zoom: number;
  isPanning: boolean;
  panOffset: { x: number; y: number };
  messagesEndRef: React.RefObject<HTMLDivElement | null>;
  inputRef: React.RefObject<HTMLTextAreaElement | null>;
  getSessionTopic: (session: { id: string }) => string;
  getSessionCapability?: (sessionId: string) => string;
  handleNewSession: () => void;
  handleSessionSwitch: (sessionId: string) => void;
  handleDeleteSession: (sessionId: string) => void;
  handleSubmit: (e: React.FormEvent) => void;
  handleStopGeneration: () => void;
  handleQuickPrompt: (prompt: string) => void;
  handleFileTypeSelect: (type: 'pdf' | 'image') => void;
  handleFileUpload: (e: React.ChangeEvent<HTMLInputElement>) => void;
  handlePreviewClick: (fileUrl: string, fileType: string, fileName: string) => void;
  handleDragOver: (e: React.DragEvent) => void;
  handleDragLeave: (e: React.DragEvent) => void;
  handleDrop: (e: React.DragEvent) => void;
  handleVoiceTextGenerated: (text: string) => void;
  handleZoomIn: () => void;
  handleZoomOut: () => void;
  handleResetZoom: () => void;
  handleMouseDown: (e: React.MouseEvent) => void;
  handleMouseMove: (e: React.MouseEvent) => void;
  handleMouseUp: () => void;
  handleWheel: (e: React.WheelEvent) => void;
  setEditingMessageId: (id: string | null) => void;
  welcomeMessage: string;
  dragDropMessage: string;
  uploadLabel: string;
  uploadModalLabel: string;
  uploadAccept: 'pdf' | 'image';
  linkedPatient: LinkedPatientState | null;
  onLinkedPatientChange: (patient: LinkedPatientState | null) => void;
}

const StaffChatLayout: React.FC<StaffChatLayoutProps> = ({
  portal,
  capability,
  capabilityInfo,
  sessions,
  currentSessionId,
  messages,
  input,
  setInput,
  isLoading,
  uploading,
  analyzing,
  uploadProgress,
  showFileTypeModal,
  setShowFileTypeModal,
  pendingFileType,
  setPendingFileType,
  isDragActive,
  isVoiceRecording,
  placeholderText,
  previewFile,
  setPreviewFile,
  zoom,
  isPanning,
  panOffset,
  messagesEndRef,
  inputRef,
  getSessionTopic,
  getSessionCapability,
  handleNewSession,
  handleSessionSwitch,
  handleDeleteSession,
  handleSubmit,
  handleStopGeneration,
  handleQuickPrompt,
  handleFileTypeSelect,
  handleFileUpload,
  handlePreviewClick,
  handleDragOver,
  handleDragLeave,
  handleDrop,
  handleVoiceTextGenerated,
  handleZoomIn,
  handleZoomOut,
  handleResetZoom,
  handleMouseDown,
  handleMouseMove,
  handleMouseUp,
  handleWheel,
  setEditingMessageId,
  welcomeMessage,
  dragDropMessage,
  uploadLabel,
  uploadModalLabel,
  uploadAccept,
  linkedPatient,
  onLinkedPatientChange,
}) => {
  const theme = getPortalTheme(portal);
  const ThemeIcon = theme.icon;
  const [patientDropActive, setPatientDropActive] = useState(false);

  const handlePatientDragOver = (e: React.DragEvent) => {
    if (!isStaffPatientDragEvent(e.dataTransfer)) return;
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = 'link';
    setPatientDropActive(true);
  };

  const handlePatientDragLeave = (e: React.DragEvent) => {
    if (!isStaffPatientDragEvent(e.dataTransfer)) return;
    const related = e.relatedTarget as Node | null;
    if (related && e.currentTarget.contains(related)) return;
    setPatientDropActive(false);
  };

  const handlePatientDrop = async (e: React.DragEvent) => {
    if (!isStaffPatientDragEvent(e.dataTransfer)) return;
    e.preventDefault();
    e.stopPropagation();
    setPatientDropActive(false);

    const payload = readStaffPatientDragData(e.dataTransfer);
    if (!payload) return;

    const { state } = await linkPatientFromDatabase(
      payload.patient_id,
      payload.first_name,
      payload.last_name,
      capability,
      payload.date_of_birth
    );
    if (!state) return;

    onLinkedPatientChange(state);
    const tag = formatPatientInputTag(state.displayName, state.patientId);
    setInput(input.trim() ? `${input.trim()} ${tag}` : tag);
    inputRef.current?.focus();
  };

  return (
    <main className="flex min-h-0 flex-1 flex-col overflow-hidden px-3 py-3 sm:px-4">
      <div className="mx-auto flex min-h-0 w-full max-w-[100rem] flex-1 gap-3">
        <div className="premium-card flex w-64 shrink-0 flex-col overflow-hidden">
          <div className="border-b border-slate-700/50 p-3">
            <button
              type="button"
              onClick={handleNewSession}
              className="portal-accent-button flex w-full items-center justify-center gap-2 px-3 py-2.5 text-sm"
            >
              <PlusCircle size={18} />
              New Session
            </button>
          </div>
          <div className="flex min-h-0 flex-1 flex-col overflow-y-auto hide-scrollbar">
            <h2 className="section-heading border-b border-slate-700/50 px-3 py-2 text-sm text-slate-300">
              Session History
            </h2>
            <div className="flex-1 p-2">
              {sessions.map((session) => (
                <div
                  key={session.id}
                  className={`mb-1 flex cursor-pointer items-center justify-between gap-2 rounded-xl px-3 py-2 transition-colors hover:bg-slate-800/50 ${
                    currentSessionId === session.id ? 'chat-sidebar-session-active' : ''
                  }`}
                  onClick={() => handleSessionSwitch(session.id)}
                >
                  <div className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold text-slate-100">
                      {getSessionTopic(session)}
                    </span>
                    {getSessionCapability && (
                      <span className="truncate text-xs text-slate-500">
                        {getSessionCapability(session.id)}
                      </span>
                    )}
                  </div>
                  {sessions.length > 1 && (
                    <button
                      type="button"
                      className="shrink-0 p-1 text-slate-500 hover:text-red-400"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDeleteSession(session.id);
                      }}
                      title="Delete session"
                    >
                      <Trash2 size={14} />
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="flex min-h-0 min-w-0 flex-1 flex-col">
          <div className="premium-card relative flex h-full flex-col performance-optimized">
            <div className="flex-1 space-y-4 overflow-y-auto p-4 hide-scrollbar chat-container smooth-scroll tab-content-fade">
              {messages.length === 0 && !showFileTypeModal ? (
                <div className="flex h-full flex-col items-center justify-center space-y-5 text-center text-slate-400 animate-fade-in-up">
                  <div
                    className="flex h-16 w-16 items-center justify-center rounded-2xl shadow-lg animate-professional-pulse"
                    style={{
                      background: `linear-gradient(135deg, ${theme.gradientFrom}, ${theme.gradientTo})`,
                    }}
                  >
                    <ThemeIcon size={32} className="text-white" />
                  </div>
                  <div>
                    <div
                      className={`mb-3 inline-block rounded-full px-3 py-1 text-sm font-semibold ${capabilityInfo.bgColor} ${capabilityInfo.color}`}
                    >
                      {capabilityInfo.name}
                    </div>
                    <p className="text-lg font-bold text-slate-100">
                      Welcome to Your AI Medical Assistant
                    </p>
                    <p className="mx-auto mt-2 max-w-md text-sm leading-6">{welcomeMessage}</p>
                  </div>
                  <div className="flex items-center space-x-2 text-amber-400/90">
                    <AlertCircle size={16} />
                    <span className="text-sm">For healthcare professionals only.</span>
                  </div>
                </div>
              ) : (
                messages.map((message) => (
                  <ChatMessage
                    key={message.id}
                    variant="staff"
                    reportType={
                      capability === 'radiology' || capability === 'lab' ? capability : 'general'
                    }
                    referenceImage={
                      message.role === 'assistant' && capability === 'radiology'
                        ? findReferenceImageForAssistantMessage(messages, message.id)
                        : undefined
                    }
                    message={message}
                    onPreviewClick={handlePreviewClick}
                    onEdit={(id) => {
                      setEditingMessageId(id);
                      const msg = messages.find((m) => m.id === id);
                      if (msg) setInput(msg.content);
                      inputRef.current?.focus();
                    }}
                    showUploadProgress={
                      uploading &&
                      messages.length > 0 &&
                      messages[messages.length - 1].id === message.id &&
                      message.role === 'user' &&
                      !!(message as Message & { fileUrl?: string }).fileUrl
                    }
                    uploadProgress={uploadProgress}
                    analyzing={
                      analyzing &&
                      messages.length > 0 &&
                      messages[messages.length - 1].id === message.id &&
                      message.role === 'user'
                    }
                  />
                ))
              )}
              {(isLoading || analyzing) && (
                <div className="flex items-start space-x-3">
                  <div
                    className="flex-shrink-0 rounded-full p-3 shadow-lg"
                    style={{
                      background: `linear-gradient(135deg, ${theme.gradientFrom}, ${theme.gradientTo})`,
                    }}
                  >
                    <Stethoscope size={24} className="text-white" />
                  </div>
                  <div className="max-w-[85%] rounded-lg rounded-tl-none border border-slate-700/50 bg-slate-800/95 p-4 shadow-md">
                    <LoadingDots tone="dark" />
                  </div>
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>

            <div
              className="chat-glass-input sticky bottom-0 p-2"
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
            >
              {linkedPatient && (
                <div className="mb-2 flex items-center justify-between gap-2 rounded-lg border border-[var(--portal-accent)]/35 bg-[color-mix(in_srgb,var(--portal-accent)_12%,transparent)] px-3 py-2">
                  <div className="flex min-w-0 items-center gap-2 text-xs text-slate-200">
                    <UserRound size={14} className="shrink-0 text-[var(--portal-accent)]" />
                    <span className="truncate">
                      <span className="font-semibold">{linkedPatient.displayName}</span>
                      <span className="ml-1 font-mono text-slate-400">· {linkedPatient.patientId}</span>
                      <span className="ml-1 text-slate-500">
                        ({linkedPatient.records.length} record
                        {linkedPatient.records.length === 1 ? '' : 's'} linked — ask to
                        &quot;analyze the report&quot; to use stored imaging/lab files)
                      </span>
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => onLinkedPatientChange(null)}
                    className="shrink-0 rounded p-1 text-slate-400 hover:bg-slate-800 hover:text-slate-200"
                    title="Unlink patient from chat"
                    aria-label="Unlink patient"
                  >
                    <X size={14} />
                  </button>
                </div>
              )}

              {isDragActive && (
                <div
                  className="pointer-events-none absolute inset-0 z-50 flex items-center justify-center rounded-lg border-2 border-dashed shadow-lg"
                  style={{
                    background: theme.accentMuted,
                    borderColor: theme.accent,
                  }}
                >
                  <div className="flex flex-col items-center font-semibold" style={{ color: theme.accent }}>
                    <div
                      className="mb-4 flex h-16 w-16 items-center justify-center rounded-full shadow-lg animate-professional-pulse"
                      style={{
                        background: `linear-gradient(135deg, ${theme.gradientFrom}, ${theme.gradientTo})`,
                      }}
                    >
                      <Upload size={32} className="text-white" />
                    </div>
                    <p className="text-center">{dragDropMessage}</p>
                  </div>
                </div>
              )}

              <form onSubmit={handleSubmit} className="relative flex items-center gap-2">
                <label
                  className="flex cursor-pointer items-center"
                  title={uploadLabel}
                  onClick={(e) => {
                    e.preventDefault();
                    setShowFileTypeModal(true);
                  }}
                >
                  <span
                    className={`rounded-full p-2 transition-colors ${
                      uploading ? 'bg-slate-300' : `${theme.bgClass} hover:opacity-90`
                    }`}
                  >
                    <Upload size={20} className={theme.textClass} />
                  </span>
                </label>

                <div>
                  <VoiceInput
                    onTextGenerated={handleVoiceTextGenerated}
                    disabled={uploading || analyzing || isVoiceRecording}
                  />
                </div>

                <textarea
                  ref={inputRef}
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  placeholder={placeholderText}
                  className={`form-field hide-scrollbar w-full resize-none rounded-xl border-slate-700/60 bg-slate-900/50 p-3 pr-24 text-slate-100 placeholder:text-slate-500 focus:border-transparent focus:outline-none focus:ring-2 focus:ring-[var(--portal-accent)] ${
                    patientDropActive
                      ? 'ring-2 ring-[var(--portal-accent)] border-[var(--portal-accent)] bg-sky-500/10'
                      : ''
                  }`}
                  rows={1}
                  disabled={uploading || analyzing}
                  onDragOver={handlePatientDragOver}
                  onDragLeave={handlePatientDragLeave}
                  onDrop={handlePatientDrop}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      handleSubmit(e);
                    }
                  }}
                />

                <div className="absolute right-12 top-1/2 -translate-y-1/2 transform">
                  <FaqDropdown
                    capability={capability}
                    sessionId={currentSessionId}
                    onSelectPrompt={handleQuickPrompt}
                    disabled={uploading || analyzing}
                  />
                </div>

                {isLoading || analyzing ? (
                  <button
                    type="button"
                    onClick={handleStopGeneration}
                    className="absolute right-3 top-1/2 -translate-y-1/2 transform rounded-full bg-red-500 p-1.5 text-white transition-colors hover:bg-red-600"
                    title="Stop generation"
                  >
                    <Square size={20} />
                  </button>
                ) : (
                  <button
                    type="submit"
                    disabled={!input.trim() || uploading || analyzing}
                    className="portal-accent-button absolute right-3 top-1/2 -translate-y-1/2 transform rounded-full p-1.5 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    <ArrowUp size={20} />
                  </button>
                )}
              </form>
            </div>
          </div>
        </div>

        <div className="hidden shrink-0 lg:flex">
          <StaffPatientsRecordsTab
            capability={capability}
            linkedPatient={linkedPatient}
            onLinkedPatientChange={onLinkedPatientChange}
          />
        </div>
      </div>

      {showFileTypeModal && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          aria-labelledby="staff-upload-modal-title"
        >
          <div className="premium-card w-full max-w-sm p-6 animate-fade-in-up">
            <h3 id="staff-upload-modal-title" className="section-heading mb-4 text-lg">
              Select file type to upload
            </h3>
            {!pendingFileType ? (
              <>
                <button
                  type="button"
                  className={`mb-3 flex w-full items-center gap-2 rounded-xl px-4 py-3 font-semibold ${theme.bgClass} ${theme.textClass} hover:opacity-90`}
                  onClick={() => handleFileTypeSelect(uploadAccept)}
                >
                  {uploadAccept === 'pdf' ? <FileText size={20} /> : <ImageIcon size={20} />}
                  {uploadModalLabel}
                </button>
                <button
                  type="button"
                  className="mt-2 w-full text-sm text-slate-400 hover:text-slate-200"
                  onClick={() => setShowFileTypeModal(false)}
                >
                  Cancel
                </button>
              </>
            ) : (
              <>
                <input
                  id="file-upload-input"
                  type="file"
                  accept={pendingFileType === 'pdf' ? '.pdf' : 'image/*'}
                  className="form-field mb-4 block w-full text-sm"
                  onChange={handleFileUpload}
                  disabled={isLoading || uploading || analyzing}
                  autoFocus
                  multiple
                />
                <button
                  type="button"
                  className="text-sm text-slate-400 hover:text-slate-200"
                  onClick={() => setPendingFileType(null)}
                >
                  Back
                </button>
              </>
            )}
          </div>
        </div>
      )}

      {previewFile && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70">
          <div className="premium-card relative flex max-w-2xl w-full flex-col items-center p-4">
            <button
              type="button"
              className="absolute right-2 top-2 rounded-full bg-slate-200 p-1 hover:bg-slate-300"
              onClick={() => setPreviewFile(null)}
              title="Close"
            >
              <X size={22} />
            </button>
            {previewFile.type.startsWith('image/') && (
              <div className="mb-2 flex items-center gap-2">
                <button type="button" onClick={handleZoomOut} className="rounded bg-slate-200 p-1 hover:bg-slate-300">
                  -
                </button>
                <span className="text-sm font-medium">{Math.round(zoom * 100)}%</span>
                <button type="button" onClick={handleZoomIn} className="rounded bg-slate-200 p-1 hover:bg-slate-300">
                  +
                </button>
                <button type="button" onClick={handleResetZoom} className="rounded bg-slate-200 p-1 hover:bg-slate-300">
                  Reset
                </button>
              </div>
            )}
            {previewFile.type.startsWith('image/') ? (
              <div
                className="flex h-[70vh] w-full items-center justify-center overflow-hidden rounded bg-slate-50"
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
                <FileText size={48} className="mb-2 text-primary-400" />
                <span className="mb-2 font-medium text-slate-700">{previewFile.name}</span>
                <a href={previewFile.url} download={previewFile.name} className="text-primary-600 underline">
                  Download PDF
                </a>
              </div>
            ) : null}
          </div>
        </div>
      )}
    </main>
  );
};

export default StaffChatLayout;
