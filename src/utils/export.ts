import { Message } from '../types';
import { formatDate, formatTime } from './date';

export function exportChatHistory(messages: Message[]): void {
  if (messages.length === 0) {
    alert('There is no chat history to export.');
    return;
  }

  const fileName = `medical-chat-history-${new Date().toISOString().slice(0, 10)}.txt`;
  
  let content = 'MedChat - Healthcare Chatbot Conversation\n';
  content += `Exported on: ${new Date().toLocaleString()}\n\n`;
  content += '-------------------------------------------\n\n';
  
  messages.forEach((message) => {
    const timestamp = formatDate(message.timestamp) + ' at ' + formatTime(message.timestamp);
    const sender = message.role === 'user' ? 'You' : 'Healthcare Assistant';
    
    content += `[${timestamp}] ${sender}:\n`;
    content += `${message.content}\n\n`;
  });
  
  content += '-------------------------------------------\n';
  content += 'DISCLAIMER: This information is for educational purposes only and is not a substitute for professional medical advice, diagnosis, or treatment.';
  
  const blob = new Blob([content], { type: 'text/plain' });
  const url = URL.createObjectURL(blob);
  
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  link.click();
  
  URL.revokeObjectURL(url);
}