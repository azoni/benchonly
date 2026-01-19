// This function handles token usage logging and retrieval
// In production, this would interact with a database (Firestore)

// In-memory storage for demo (replace with Firestore in production)
let usageRecords = []

export async function handler(event) {
  const headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS'
  }

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' }
  }

  try {
    if (event.httpMethod === 'POST') {
      // Log new usage
      const record = JSON.parse(event.body)
      record.id = Date.now().toString()
      usageRecords.push(record)
      
      // Keep only last 1000 records in memory
      if (usageRecords.length > 1000) {
        usageRecords = usageRecords.slice(-1000)
      }

      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({ success: true, id: record.id })
      }
    }

    if (event.httpMethod === 'GET') {
      // Retrieve usage data
      const params = event.queryStringParameters || {}
      const { userId, startDate, endDate, feature } = params

      let filtered = [...usageRecords]

      if (userId) {
        filtered = filtered.filter(r => r.userId === userId)
      }

      if (startDate) {
        filtered = filtered.filter(r => new Date(r.createdAt) >= new Date(startDate))
      }

      if (endDate) {
        filtered = filtered.filter(r => new Date(r.createdAt) <= new Date(endDate))
      }

      if (feature) {
        filtered = filtered.filter(r => r.feature === feature)
      }

      // Calculate summary
      const summary = {
        totalTokens: filtered.reduce((acc, r) => acc + (r.totalTokens || 0), 0),
        totalRequests: filtered.length,
        byFeature: {}
      }

      filtered.forEach(r => {
        if (r.feature) {
          if (!summary.byFeature[r.feature]) {
            summary.byFeature[r.feature] = { tokens: 0, requests: 0 }
          }
          summary.byFeature[r.feature].tokens += r.totalTokens || 0
          summary.byFeature[r.feature].requests += 1
        }
      })

      // Get unique users
      const users = [...new Set(filtered.map(r => r.userId))]
        .filter(Boolean)
        .map(id => {
          const record = filtered.find(r => r.userId === id)
          return { id, displayName: record?.userName || id }
        })

      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          records: filtered.sort((a, b) => 
            new Date(b.createdAt) - new Date(a.createdAt)
          ).slice(0, 100),
          summary,
          users
        })
      }
    }

    return { 
      statusCode: 405, 
      headers,
      body: JSON.stringify({ error: 'Method not allowed' })
    }
  } catch (error) {
    console.error('Token usage error:', error)
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: 'Internal server error' })
    }
  }
}
