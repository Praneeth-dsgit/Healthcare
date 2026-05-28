/**
 * Reports & Analytics Component
 * View reports and analytics for the practice
 */

import React, { useState, useEffect } from 'react';
import { BarChart3, TrendingUp, Calendar, FileText, ArrowUp } from 'lucide-react';
import { appointmentService, Appointment } from '../../services/appointmentService';
import { doctorService } from '../../services/doctorService';
import {
  BarChart,
  Bar,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
} from 'recharts';
import { getApiBaseUrl } from '../../utils/apiBase';

const ReportsAnalytics: React.FC = () => {
  const [stats, setStats] = useState({
    totalAppointments: 0,
    upcomingAppointments: 0,
    completedAppointments: 0,
    totalPrescriptions: 0,
  });
  const [loading, setLoading] = useState(true);
  const [dateRange, setDateRange] = useState<'week' | 'month' | 'year'>('month');
  const [, setAppointments] = useState<Appointment[]>([]);
  const [, setPrescriptions] = useState<any[]>([]);
  const [appointmentsChartData, setAppointmentsChartData] = useState<any[]>([]);
  const [prescriptionsChartData, setPrescriptionsChartData] = useState<any[]>([]);
  const [appointmentsByStatus, setAppointmentsByStatus] = useState<any[]>([]);
  const [generatingReport, setGeneratingReport] = useState(false);

  useEffect(() => {
    loadAnalytics();
  }, [dateRange]);

  const getDateRange = () => {
    const today = new Date();
    const ranges = {
      week: 7,
      month: 30,
      year: 365,
    };
    const days = ranges[dateRange];
    const startDate = new Date(today);
    startDate.setDate(today.getDate() - days);
    return { startDate, endDate: today };
  };

  const processAppointmentsData = (appointments: Appointment[]) => {
    const { startDate, endDate } = getDateRange();
    const filtered = appointments.filter((apt) => {
      const aptDate = new Date(apt.appointment_date);
      return aptDate >= startDate && aptDate <= endDate;
    });

    // Group by date
    const byDate: Record<string, number> = {};
    filtered.forEach((apt) => {
      const date = new Date(apt.appointment_date).toLocaleDateString('en-US', {
        month: dateRange === 'year' ? 'short' : 'numeric',
        day: 'numeric',
        year: dateRange === 'year' ? '2-digit' : undefined,
      });
      byDate[date] = (byDate[date] || 0) + 1;
    });

    const chartData = Object.entries(byDate)
      .map(([date, count]) => ({ date, count }))
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

    // Group by status
    const statusCounts: Record<string, number> = {};
    filtered.forEach((apt) => {
      const status = apt.status || 'scheduled';
      statusCounts[status] = (statusCounts[status] || 0) + 1;
    });

    const statusData = Object.entries(statusCounts).map(([name, value]) => ({
      name: name.charAt(0).toUpperCase() + name.slice(1),
      value,
    }));

    setAppointmentsChartData(chartData);
    setAppointmentsByStatus(statusData);
  };

  const processPrescriptionsData = (prescriptions: any[]) => {
    const { startDate, endDate } = getDateRange();
    const filtered = prescriptions.filter((pres) => {
      // Prescriptions might have visit_date or created_at
      const presDate = new Date(pres.visit_date || pres.created_at);
      return presDate >= startDate && presDate <= endDate;
    });

    // Group by date
    const byDate: Record<string, number> = {};
    filtered.forEach((pres) => {
      const dateStr = pres.visit_date || pres.created_at;
      if (!dateStr) return;
      
      const date = new Date(dateStr).toLocaleDateString('en-US', {
        month: dateRange === 'year' ? 'short' : 'numeric',
        day: 'numeric',
        year: dateRange === 'year' ? '2-digit' : undefined,
      });
      byDate[date] = (byDate[date] || 0) + 1;
    });

    const chartData = Object.entries(byDate)
      .map(([date, count]) => ({ date, count }))
      .sort((a, b) => {
        // Sort by date properly
        const dateA = new Date(a.date);
        const dateB = new Date(b.date);
        return dateA.getTime() - dateB.getTime();
      });

    setPrescriptionsChartData(chartData);
  };

  const handleExport = (type: 'appointments' | 'prescriptions' | 'all') => {
    try {
      let data: any = {};
      let filename = '';

      if (type === 'appointments' || type === 'all') {
        data.appointments = appointmentsChartData.map(item => ({
          date: item.date,
          count: item.count
        }));
        data.appointmentsByStatus = appointmentsByStatus;
      }

      if (type === 'prescriptions' || type === 'all') {
        data.prescriptions = prescriptionsChartData.map(item => ({
          date: item.date,
          count: item.count
        }));
      }

      if (type === 'all') {
        filename = `analytics_export_${new Date().toISOString().split('T')[0]}.json`;
      } else {
        filename = `${type}_export_${new Date().toISOString().split('T')[0]}.json`;
      }

      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (error) {
      console.error('Error exporting data:', error);
      alert('Failed to export data. Please try again.');
    }
  };

  const handleGenerateReport = async () => {
    setGeneratingReport(true);
    try {
      // Prepare analytics data for AI
      const analyticsData = {
        dateRange: dateRange,
        statistics: stats,
        appointments: {
          overview: appointmentsChartData,
          byStatus: appointmentsByStatus
        },
        prescriptions: {
          trend: prescriptionsChartData
        }
      };

      // Call backend API to generate AI report
      const { authenticatedFetch, getAuthHeaders } = await import('../../services/authService');
      const response = await authenticatedFetch(`${getApiBaseUrl()}/api/doctors/generate-report`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({ analyticsData })
      });

      const result = await response.json();
      
      if (result.success && result.report) {
        if (result.format === 'pdf') {
          // Download the AI-generated PDF report
          const pdfData = atob(result.report); // Decode base64
          const bytes = new Uint8Array(pdfData.length);
          for (let i = 0; i < pdfData.length; i++) {
            bytes[i] = pdfData.charCodeAt(i);
          }
          const blob = new Blob([bytes], { type: 'application/pdf' });
          const url = window.URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = `ai_analytics_report_${new Date().toISOString().split('T')[0]}.pdf`;
          document.body.appendChild(a);
          a.click();
          window.URL.revokeObjectURL(url);
          document.body.removeChild(a);
        } else {
          // Fallback to text file if format is not PDF
          const blob = new Blob([result.report], { type: 'text/plain' });
          const url = window.URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = `ai_analytics_report_${new Date().toISOString().split('T')[0]}.txt`;
          document.body.appendChild(a);
          a.click();
          window.URL.revokeObjectURL(url);
          document.body.removeChild(a);
        }
      } else {
        throw new Error(result.error || 'Failed to generate report');
      }
    } catch (error) {
      console.error('Error generating AI report:', error);
      alert('Failed to generate AI report. Please try again.');
    } finally {
      setGeneratingReport(false);
    }
  };


  const loadAnalytics = async () => {
    setLoading(true);
    try {
      const [appointmentsResult, prescriptionsResult] = await Promise.all([
        appointmentService.getAppointments(),
        doctorService.getPrescriptions(),
      ]);

      if (appointmentsResult.success && appointmentsResult.appointments) {
        const appointmentsData = appointmentsResult.appointments;
        setAppointments(appointmentsData);
        const today = new Date().toISOString().split('T')[0];
        
        setStats({
          totalAppointments: appointmentsData.length,
          upcomingAppointments: appointmentsData.filter(
            (apt) => apt.appointment_date >= today && apt.status !== 'completed' && apt.status !== 'cancelled'
          ).length,
          completedAppointments: appointmentsData.filter((apt) => apt.status === 'completed').length,
          totalPrescriptions: prescriptionsResult.success && prescriptionsResult.prescriptions
            ? prescriptionsResult.prescriptions.length
            : 0,
        });

        processAppointmentsData(appointmentsData);
      }

      if (prescriptionsResult.success && prescriptionsResult.prescriptions) {
        setPrescriptions(prescriptionsResult.prescriptions);
        processPrescriptionsData(prescriptionsResult.prescriptions);
      }
    } catch (error) {
      console.error('Error loading analytics:', error);
    } finally {
      setLoading(false);
    }
  };

  const statCards = [
    {
      title: 'Total Appointments',
      value: stats.totalAppointments,
      icon: Calendar,
      color: 'bg-blue-500',
      change: '+12%',
    },
    {
      title: 'Upcoming',
      value: stats.upcomingAppointments,
      icon: TrendingUp,
      color: 'bg-green-500',
      change: '+5%',
    },
    {
      title: 'Completed',
      value: stats.completedAppointments,
      icon: CheckCircle,
      color: 'bg-purple-500',
      change: '+8%',
    },
    {
      title: 'Prescriptions',
      value: stats.totalPrescriptions,
      icon: FileText,
      color: 'bg-orange-500',
      change: '+15%',
    },
  ];

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-white rounded-lg shadow p-6">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between">
          <div>
            <h2 className="text-2xl font-bold text-gray-900">Reports & Analytics</h2>
            <p className="text-sm text-gray-600 mt-1">Practice overview and insights</p>
          </div>
          <div className="mt-4 md:mt-0 flex gap-2 flex-wrap items-center">
            <div className="relative">
              <select
                value={dateRange}
                onChange={(e) => setDateRange(e.target.value as 'week' | 'month' | 'year')}
                className="appearance-none px-4 py-2 pr-10 rounded-lg text-sm font-medium bg-white border border-gray-300 text-gray-700 hover:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors cursor-pointer"
              >
                <option value="week">Week</option>
                <option value="month">Month</option>
                <option value="year">Year</option>
              </select>
              <div className="absolute inset-y-0 right-0 flex items-center pr-3 pointer-events-none">
                <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </div>
            </div>
            <button 
              onClick={handleGenerateReport}
              disabled={generatingReport}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm font-medium flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <FileText size={18} />
              {generatingReport ? 'Generating...' : 'Generate AI Report'}
              {generatingReport && (
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {statCards.map((stat, index) => {
          const Icon = stat.icon;
          return (
            <div key={index} className="bg-white rounded-lg shadow p-6">
              <div className="flex items-center justify-between mb-4">
                <div className={`${stat.color} p-3 rounded-lg`}>
                  <Icon className="text-white" size={24} />
                </div>
                <span className="text-sm text-green-600 font-medium">{stat.change}</span>
              </div>
              <h3 className="text-sm font-medium text-gray-600 mb-1">{stat.title}</h3>
              <p className="text-3xl font-bold text-gray-900">{stat.value}</p>
            </div>
          );
        })}
      </div>

      {/* Charts Section */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Appointments Overview Chart */}
        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-gray-900">Appointments Overview</h3>
            <button 
              onClick={() => handleExport('appointments')}
              className="text-blue-600 hover:text-blue-800 flex items-center space-x-1"
            >
              <ArrowUp size={16} />
              <span className="text-sm">Export</span>
            </button>
          </div>
          {appointmentsChartData.length > 0 ? (
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={appointmentsChartData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis 
                  dataKey="date" 
                  angle={-45}
                  textAnchor="end"
                  height={80}
                  tick={{ fontSize: 10 }}
                />
                <YAxis tick={{ fontSize: 10 }} />
                <Tooltip 
                  contentStyle={{ 
                    backgroundColor: '#fff', 
                    border: '1px solid #e5e7eb',
                    borderRadius: '8px'
                  }}
                />
                <Legend />
                <Bar dataKey="count" fill="#3b82f6" name="Appointments" radius={[8, 8, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-64 flex items-center justify-center text-gray-500">
              <div className="text-center">
                <BarChart3 size={48} className="mx-auto mb-2 text-gray-400" />
                <p className="text-sm">No appointment data available</p>
              </div>
            </div>
          )}
        </div>

        {/* Appointments by Status Pie Chart */}
        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-gray-900">Appointments by Status</h3>
            <button 
              onClick={() => handleExport('appointments')}
              className="text-blue-600 hover:text-blue-800 flex items-center space-x-1"
            >
              <ArrowUp size={16} />
              <span className="text-sm">Export</span>
            </button>
          </div>
           {appointmentsByStatus.length > 0 ? (
             <ResponsiveContainer width="100%" height={300}>
               <PieChart>
                 <Pie
                   data={appointmentsByStatus}
                   cx="50%"
                   cy="50%"
                   labelLine={false}
                   label={({ percent }) => {
                     return percent && percent > 0.05 ? `${(percent * 100).toFixed(0)}%` : '';
                   }}
                   outerRadius={70}
                   fill="#8884d8"
                   dataKey="value"
                 >
                   {appointmentsByStatus.map((_, index) => {
                     const colors = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6'];
                     return <Cell key={`cell-${index}`} fill={colors[index % colors.length]} />;
                   })}
                 </Pie>
                 <Tooltip 
                   contentStyle={{ 
                     backgroundColor: '#fff', 
                     border: '1px solid #e5e7eb',
                     borderRadius: '8px'
                   }}
                   formatter={(value: any, name: any) => [`${value} (${((value / appointmentsByStatus.reduce((sum, item) => sum + item.value, 0)) * 100).toFixed(1)}%)`, name]}
                 />
                 <Legend 
                   verticalAlign="bottom" 
                   height={50}
                   wrapperStyle={{ fontSize: '11px', paddingTop: '10px' }}
                   iconType="circle"
                 />
               </PieChart>
             </ResponsiveContainer>
           ) : (
            <div className="h-64 flex items-center justify-center text-gray-500">
              <div className="text-center">
                <BarChart3 size={48} className="mx-auto mb-2 text-gray-400" />
                <p className="text-sm">No status data available</p>
              </div>
            </div>
          )}
        </div>

        {/* Prescriptions Trend Chart */}
        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-gray-900">Prescriptions Trend</h3>
            <button 
              onClick={() => handleExport('appointments')}
              className="text-blue-600 hover:text-blue-800 flex items-center space-x-1"
            >
              <ArrowUp size={16} />
              <span className="text-sm">Export</span>
            </button>
          </div>
          {prescriptionsChartData.length > 0 ? (
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={prescriptionsChartData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis 
                  dataKey="date" 
                  angle={-45}
                  textAnchor="end"
                  height={80}
                  tick={{ fontSize: 10 }}
                />
                <YAxis tick={{ fontSize: 10 }} />
                <Tooltip 
                  contentStyle={{ 
                    backgroundColor: '#fff', 
                    border: '1px solid #e5e7eb',
                    borderRadius: '8px'
                  }}
                />
                <Legend />
                <Line 
                  type="monotone" 
                  dataKey="count" 
                  stroke="#f59e0b" 
                  strokeWidth={3}
                  name="Prescriptions"
                  dot={{ fill: '#f59e0b', r: 4 }}
                  activeDot={{ r: 6 }}
                />
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-64 flex items-center justify-center text-gray-500">
              <div className="text-center">
                <TrendingUp size={48} className="mx-auto mb-2 text-gray-400" />
                <p className="text-sm">No prescription data available</p>
              </div>
            </div>
          )}
        </div>
      </div>

    </div>
  );
};

// Add missing import
const CheckCircle = ({ size, className }: { size: number; className?: string }) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
  >
    <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
    <polyline points="22 4 12 14.01 9 11.01" />
  </svg>
);

export default ReportsAnalytics;

