import { useState, useEffect } from 'react'
import { format, subDays, startOfDay, endOfDay } from 'date-fns'
import { 
  Zap, 
  TrendingUp, 
  Calendar,
  User,
  Filter,
  Download,
  ChevronDown,
  Sparkles,
  MessageSquare,
  Wand2,
  Search
} from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { getTokenUsage } from '../services/api'

const FEATURE_COLORS = {
  'generate-workout': { bg: 'bg-purple-500/20', text: 'text-purple-400', icon: Wand2 },
  'ask-assistant': { bg: 'bg-blue-500/20', text: 'text-blue-400', icon: MessageSquare },
  'autofill': { bg: 'bg-green-500/20', text: 'text-green-400', icon: Sparkles },
  'analyze': { bg: 'bg-orange-500/20', text: 'text-orange-400', icon: Search }
}

export default function UsagePage() {
  const { user } = useAuth()
  const [usage, setUsage] = useState([])
  const [summary, setSummary] = useState(null)
  const [loading, setLoading] = useState(true)
  const [dateRange, setDateRange] = useState('7d')
  const [selectedUser, setSelectedUser] = useState('all')
  const [users, setUsers] = useState([])

  useEffect(() => {
    async function fetchUsage() {
      try {
        const days = dateRange === '7d' ? 7 : dateRange === '30d' ? 30 : 90
        const startDate = subDays(new Date(), days)
        
        const data = await getTokenUsage({
          userId: selectedUser === 'all' ? undefined : selectedUser,
          startDate: startOfDay(startDate).toISOString(),
          endDate: endOfDay(new Date()).toISOString()
        })
        
        setUsage(data.records || [])
        setSummary(data.summary || null)
        setUsers(data.users || [])
      } catch (error) {
        console.error('Error fetching usage:', error)
      } finally {
        setLoading(false)
      }
    }
    fetchUsage()
  }, [dateRange, selectedUser])

  const formatNumber = (num) => {
    if (num >= 1000000) return (num / 1000000).toFixed(1) + 'M'
    if (num >= 1000) return (num / 1000).toFixed(1) + 'K'
    return num.toString()
  }

  const calculateCost = (tokens) => {
    // Approximate cost based on GPT-4 pricing
    const costPer1k = 0.03
    return ((tokens / 1000) * costPer1k).toFixed(2)
  }

  const groupByDate = (records) => {
    const grouped = {}
    records.forEach(record => {
      const date = format(new Date(record.createdAt), 'yyyy-MM-dd')
      if (!grouped[date]) {
        grouped[date] = { records: [], totalTokens: 0 }
      }
      grouped[date].records.push(record)
      grouped[date].totalTokens += record.totalTokens
    })
    return Object.entries(grouped)
      .sort(([a], [b]) => new Date(b) - new Date(a))
  }

  const groupedUsage = groupByDate(usage)

  return (
    <div className="max-w-4xl mx-auto px-4 py-6 pb-24">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-display text-iron-100">Usage</h1>
          <p className="text-iron-500 text-sm mt-1">
            Track AI token consumption
          </p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 mb-6">
        {/* Date Range */}
        <div className="relative">
          <select
            value={dateRange}
            onChange={(e) => setDateRange(e.target.value)}
            className="input-field pr-10 appearance-none cursor-pointer"
          >
            <option value="7d">Last 7 days</option>
            <option value="30d">Last 30 days</option>
            <option value="90d">Last 90 days</option>
          </select>
          <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-iron-500 pointer-events-none" />
        </div>

        {/* User Filter */}
        {users.length > 0 && (
          <div className="relative">
            <select
              value={selectedUser}
              onChange={(e) => setSelectedUser(e.target.value)}
              className="input-field pr-10 appearance-none cursor-pointer"
            >
              <option value="all">All Users</option>
              {users.map(u => (
                <option key={u.id} value={u.id}>
                  {u.displayName || u.email}
                </option>
              ))}
            </select>
            <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-iron-500 pointer-events-none" />
          </div>
        )}
      </div>

      {/* Summary Cards */}
      {summary && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          <div className="card-steel p-4">
            <div className="flex items-center gap-2 text-iron-400 mb-2">
              <Zap className="w-4 h-4" />
              <span className="text-sm">Total Tokens</span>
            </div>
            <p className="text-2xl font-display text-iron-100">
              {formatNumber(summary.totalTokens)}
            </p>
          </div>
          
          <div className="card-steel p-4">
            <div className="flex items-center gap-2 text-iron-400 mb-2">
              <MessageSquare className="w-4 h-4" />
              <span className="text-sm">Requests</span>
            </div>
            <p className="text-2xl font-display text-iron-100">
              {summary.totalRequests}
            </p>
          </div>
          
          <div className="card-steel p-4">
            <div className="flex items-center gap-2 text-iron-400 mb-2">
              <TrendingUp className="w-4 h-4" />
              <span className="text-sm">Avg/Request</span>
            </div>
            <p className="text-2xl font-display text-iron-100">
              {formatNumber(Math.round(summary.totalTokens / summary.totalRequests) || 0)}
            </p>
          </div>
          
          <div className="card-steel p-4">
            <div className="flex items-center gap-2 text-iron-400 mb-2">
              <span className="text-sm">Est. Cost</span>
            </div>
            <p className="text-2xl font-display text-flame-400">
              ${calculateCost(summary.totalTokens)}
            </p>
          </div>
        </div>
      )}

      {/* Feature Breakdown */}
      {summary?.byFeature && Object.keys(summary.byFeature).length > 0 && (
        <div className="card-steel p-5 mb-8">
          <h3 className="text-sm font-medium text-iron-400 mb-4">By Feature</h3>
          <div className="space-y-3">
            {Object.entries(summary.byFeature).map(([feature, data]) => {
              const config = FEATURE_COLORS[feature] || { bg: 'bg-iron-700', text: 'text-iron-400', icon: Zap }
              const Icon = config.icon
              const percentage = Math.round((data.tokens / summary.totalTokens) * 100)
              
              return (
                <div key={feature} className="flex items-center gap-4">
                  <div className={`w-10 h-10 rounded-lg ${config.bg} flex items-center justify-center flex-shrink-0`}>
                    <Icon className={`w-5 h-5 ${config.text}`} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-sm text-iron-200 capitalize">
                        {feature.replace(/-/g, ' ')}
                      </span>
                      <span className="text-sm text-iron-400">
                        {formatNumber(data.tokens)} tokens
                      </span>
                    </div>
                    <div className="h-2 bg-iron-800 rounded-full overflow-hidden">
                      <div 
                        className={`h-full ${config.bg} rounded-full`}
                        style={{ width: `${percentage}%` }}
                      />
                    </div>
                  </div>
                  <span className="text-sm text-iron-500 w-12 text-right">
                    {percentage}%
                  </span>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Usage List */}
      {loading ? (
        <div className="flex items-center justify-center py-20">
          <div className="w-10 h-10 border-4 border-flame-500 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : groupedUsage.length > 0 ? (
        <div className="space-y-6">
          {groupedUsage.map(([date, { records, totalTokens }]) => (
            <div key={date}>
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-medium text-iron-400">
                  {format(new Date(date), 'EEEE, MMMM d')}
                </h3>
                <span className="text-sm text-iron-500">
                  {formatNumber(totalTokens)} tokens
                </span>
              </div>
              
              <div className="space-y-2">
                {records.map((record, index) => {
                  const config = FEATURE_COLORS[record.feature] || { bg: 'bg-iron-700', text: 'text-iron-400', icon: Zap }
                  const Icon = config.icon
                  
                  return (
                    <div 
                      key={record.id || index}
                      className="card-steel p-4 flex items-center gap-4"
                    >
                      <div className={`w-10 h-10 rounded-lg ${config.bg} flex items-center justify-center flex-shrink-0`}>
                        <Icon className={`w-5 h-5 ${config.text}`} />
                      </div>
                      
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-iron-200 capitalize">
                          {record.feature?.replace(/-/g, ' ') || 'AI Request'}
                        </p>
                        <p className="text-xs text-iron-500">
                          {format(new Date(record.createdAt), 'h:mm a')}
                          {record.userName && ` · ${record.userName}`}
                        </p>
                      </div>
                      
                      <div className="text-right">
                        <p className="text-sm font-medium text-iron-200">
                          {formatNumber(record.totalTokens)}
                        </p>
                        <p className="text-xs text-iron-500">
                          tokens
                        </p>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="card-steel p-12 text-center">
          <div className="w-16 h-16 rounded-2xl bg-iron-800 flex items-center justify-center mx-auto mb-4">
            <Zap className="w-8 h-8 text-iron-500" />
          </div>
          <h3 className="text-lg font-display text-iron-300 mb-2">No usage data</h3>
          <p className="text-iron-500 text-sm max-w-sm mx-auto">
            AI usage will appear here once you start using features like workout generation and the assistant
          </p>
        </div>
      )}
    </div>
  )
}
