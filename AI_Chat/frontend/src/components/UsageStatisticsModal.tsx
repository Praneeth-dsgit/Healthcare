import React, { useState, useEffect } from 'react';
import { X, Activity, DollarSign, BarChart3, TrendingUp, RefreshCw, Download } from 'lucide-react';

interface UsageStatisticsModalProps {
  isOpen: boolean;
  onClose: () => void;
  userEmail: string;
}

interface UsageStats {
  overall_stats: {
    total_requests: number;
    total_input_tokens: number;
    total_output_tokens: number;
    total_cost: number;
    avg_tokens_per_request: number;
    avg_cost_per_request: number;
    total_sessions: number;
  };
  capability_breakdown: {
    [key: string]: {
      requests: number;
      input_tokens: number;
      output_tokens: number;
      cost: number;
    };
  };
  model_breakdown: {
    [key: string]: {
      requests: number;
      input_tokens: number;
      output_tokens: number;
      cost: number;
    };
  };
  current_month: {
    requests: number;
    input_tokens: number;
    output_tokens: number;
    cost: number;
  };
  last_updated: string;
}

const UsageStatisticsModal: React.FC<UsageStatisticsModalProps> = ({ isOpen, onClose, userEmail }) => {
  const [stats, setStats] = useState<UsageStats | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchUsageStats = async () => {
    setLoading(true);
    setError(null);
    
    try {
      const response = await fetch(`http://localhost:5000/api/usage/statistics?user_email=${encodeURIComponent(userEmail)}`);
      const data = await response.json();
      
      if (data.success) {
        setStats(data);
      } else {
        setError(data.error || 'Failed to fetch usage statistics');
      }
    } catch (err) {
      setError('Failed to connect to server');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen && userEmail) {
      fetchUsageStats();
    }
  }, [isOpen, userEmail]);

  const formatNumber = (num: number) => {
    return new Intl.NumberFormat().format(num);
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2,
      maximumFractionDigits: 4
    }).format(amount);
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleString();
  };

  const getCapabilityColor = (capability: string) => {
    const colors = {
      general: 'bg-blue-500',
      radiology: 'bg-purple-500',
      lab: 'bg-green-500',
      engagement: 'bg-orange-500'
    };
    return colors[capability as keyof typeof colors] || 'bg-gray-500';
  };

  const getCapabilityLabel = (capability: string) => {
    const labels = {
      general: 'General',
      radiology: 'Radiology',
      lab: 'Laboratory',
      engagement: 'Frontdesk'
    };
    return labels[capability as keyof typeof labels] || capability;
  };

  const exportStats = () => {
    if (!stats) return;
    
    const csvContent = [
      'Metric,Value',
      `Total Requests,${stats.overall_stats.total_requests}`,
      `Total Input Tokens,${stats.overall_stats.total_input_tokens}`,
      `Total Output Tokens,${stats.overall_stats.total_output_tokens}`,
      `Total Cost,${stats.overall_stats.total_cost}`,
      `Average Tokens per Request,${stats.overall_stats.avg_tokens_per_request}`,
      `Average Cost per Request,${stats.overall_stats.avg_cost_per_request}`,
      `Total Sessions,${stats.overall_stats.total_sessions}`,
      '',
      'Capability Breakdown',
      'Capability,Requests,Input Tokens,Output Tokens,Cost',
      ...Object.entries(stats.capability_breakdown).map(([cap, data]) => 
        `${getCapabilityLabel(cap)},${data.requests},${data.input_tokens},${data.output_tokens},${data.cost}`
      ),
      '',
      'Model Breakdown',
      'Model,Requests,Input Tokens,Output Tokens,Cost',
      ...Object.entries(stats.model_breakdown).map(([model, data]) => 
        `${model},${data.requests},${data.input_tokens},${data.output_tokens},${data.cost}`
      )
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `usage-statistics-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    window.URL.revokeObjectURL(url);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-xl shadow-2xl max-w-4xl w-full max-h-[90vh] overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200">
          <div className="flex items-center space-x-3">
            <Activity className="h-6 w-6 text-blue-600" />
            <h2 className="text-xl font-semibold text-gray-900">Usage Statistics</h2>
          </div>
          <div className="flex items-center space-x-2">
            <button
              onClick={fetchUsageStats}
              disabled={loading}
              className="p-2 text-gray-500 hover:text-gray-700 transition-colors"
              title="Refresh"
            >
              <RefreshCw className={`h-5 w-5 ${loading ? 'animate-spin' : ''}`} />
            </button>
            <button
              onClick={exportStats}
              disabled={!stats}
              className="p-2 text-gray-500 hover:text-gray-700 transition-colors"
              title="Export to CSV"
            >
              <Download className="h-5 w-5" />
            </button>
            <button
              onClick={onClose}
              className="p-2 text-gray-500 hover:text-gray-700 transition-colors"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto max-h-[calc(90vh-120px)]">
          {loading && (
            <div className="flex items-center justify-center py-12">
              <div className="text-center">
                <RefreshCw className="h-8 w-8 animate-spin text-blue-600 mx-auto mb-2" />
                <p className="text-gray-600">Loading usage statistics...</p>
              </div>
            </div>
          )}

          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6">
              <p className="text-red-700">{error}</p>
            </div>
          )}



          {stats && (
            <div className="space-y-6">
              {/* Overall Statistics */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="bg-gradient-to-br from-blue-50 to-blue-100 rounded-lg p-4 border border-blue-200">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-blue-700 font-medium">Total Requests</p>
                      <p className="text-2xl font-bold text-blue-900">{formatNumber(stats.overall_stats.total_requests)}</p>
                    </div>
                    <Activity className="h-8 w-8 text-blue-600" />
                  </div>
                </div>

                <div className="bg-gradient-to-br from-green-50 to-green-100 rounded-lg p-4 border border-green-200">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-green-700 font-medium">Total Tokens</p>
                      <p className="text-2xl font-bold text-green-900">{formatNumber(stats.overall_stats.total_input_tokens + stats.overall_stats.total_output_tokens)}</p>
                    </div>
                    <BarChart3 className="h-8 w-8 text-green-600" />
                  </div>
                </div>

                <div className="bg-gradient-to-br from-purple-50 to-purple-100 rounded-lg p-4 border border-purple-200">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-purple-700 font-medium">Total Cost</p>
                      <p className="text-2xl font-bold text-purple-900">{formatCurrency(stats.overall_stats.total_cost)}</p>
                    </div>
                    <DollarSign className="h-8 w-8 text-purple-600" />
                  </div>
                </div>

                <div className="bg-gradient-to-br from-orange-50 to-orange-100 rounded-lg p-4 border border-orange-200">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-orange-700 font-medium">Sessions</p>
                      <p className="text-2xl font-bold text-orange-900">{formatNumber(stats.overall_stats.total_sessions)}</p>
                    </div>
                    <TrendingUp className="h-8 w-8 text-orange-600" />
                  </div>
                </div>
              </div>

              {/* Capability Breakdown */}
              <div className="bg-white border border-gray-200 rounded-lg p-6">
                <h3 className="text-lg font-semibold text-gray-900 mb-4">Capability Breakdown</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                  {Object.entries(stats.capability_breakdown).map(([capability, data]) => (
                    <div key={capability} className="border border-gray-200 rounded-lg p-4">
                      <div className="flex items-center mb-3">
                        <div className={`w-3 h-3 rounded-full ${getCapabilityColor(capability)} mr-2`}></div>
                        <h4 className="font-medium text-gray-900">{getCapabilityLabel(capability)}</h4>
                      </div>
                      <div className="space-y-1 text-sm">
                        <div className="flex justify-between">
                          <span className="text-gray-600">Requests:</span>
                          <span className="font-medium">{formatNumber(data.requests)}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-gray-600">Tokens:</span>
                          <span className="font-medium">{formatNumber(data.input_tokens + data.output_tokens)}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-gray-600">Cost:</span>
                          <span className="font-medium">{formatCurrency(data.cost)}</span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Model Breakdown */}
              <div className="bg-white border border-gray-200 rounded-lg p-6">
                <h3 className="text-lg font-semibold text-gray-900 mb-4">Model Breakdown</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {Object.entries(stats.model_breakdown).map(([model, data]) => (
                    <div key={model} className="border border-gray-200 rounded-lg p-4">
                      <h4 className="font-medium text-gray-900 mb-3">{model.toUpperCase()}</h4>
                      <div className="space-y-1 text-sm">
                        <div className="flex justify-between">
                          <span className="text-gray-600">Requests:</span>
                          <span className="font-medium">{formatNumber(data.requests)}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-gray-600">Input Tokens:</span>
                          <span className="font-medium">{formatNumber(data.input_tokens)}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-gray-600">Output Tokens:</span>
                          <span className="font-medium">{formatNumber(data.output_tokens)}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-gray-600">Cost:</span>
                          <span className="font-medium">{formatCurrency(data.cost)}</span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Additional Stats */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="bg-white border border-gray-200 rounded-lg p-6">
                  <h3 className="text-lg font-semibold text-gray-900 mb-4">Averages</h3>
                  <div className="space-y-3">
                    <div className="flex justify-between">
                      <span className="text-gray-600">Tokens per Request:</span>
                      <span className="font-medium">{stats.overall_stats.avg_tokens_per_request.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-600">Cost per Request:</span>
                      <span className="font-medium">{formatCurrency(stats.overall_stats.avg_cost_per_request)}</span>
                    </div>
                  </div>
                </div>

                <div className="bg-white border border-gray-200 rounded-lg p-6">
                  <h3 className="text-lg font-semibold text-gray-900 mb-4">Current Month</h3>
                  <div className="space-y-3">
                    <div className="flex justify-between">
                      <span className="text-gray-600">Requests:</span>
                      <span className="font-medium">{formatNumber(stats.current_month.requests)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-600">Tokens:</span>
                      <span className="font-medium">{formatNumber(stats.current_month.input_tokens + stats.current_month.output_tokens)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-600">Cost:</span>
                      <span className="font-medium">{formatCurrency(stats.current_month.cost)}</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Last Updated */}
              <div className="text-center text-sm text-gray-500">
                Last updated: {formatDate(stats.last_updated)}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default UsageStatisticsModal; 