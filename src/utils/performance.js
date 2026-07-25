/**
 * Performance utilities for handling high-concurrency scenarios
 * Optimized for 100+ simultaneous users
 */

// Request throttling with queue management
class RequestThrottler {
  constructor(maxConcurrent = 10, minDelay = 50) {
    this.maxConcurrent = maxConcurrent
    this.minDelay = minDelay
    this.activeRequests = 0
    this.queue = []
    this.lastRequestTime = 0
  }

  async throttle(fn) {
    return new Promise((resolve, reject) => {
      this.queue.push({ fn, resolve, reject })
      this.processQueue()
    })
  }

  async processQueue() {
    if (this.queue.length === 0) return
    if (this.activeRequests >= this.maxConcurrent) return

    const now = Date.now()
    const timeSinceLastRequest = now - this.lastRequestTime
    const delay = Math.max(0, this.minDelay - timeSinceLastRequest)

    setTimeout(() => {
      if (this.activeRequests >= this.maxConcurrent || this.queue.length === 0) {
        return
      }

      const { fn, resolve, reject } = this.queue.shift()
      this.activeRequests++
      this.lastRequestTime = Date.now()

      Promise.resolve(fn())
        .then((result) => {
          resolve(result)
        })
        .catch((error) => {
          reject(error)
        })
        .finally(() => {
          this.activeRequests--
          this.processQueue()
        })
    }, delay)
  }
}

// Debounce function for expensive operations
export function debounce(func, wait) {
  let timeout
  return function executedFunction(...args) {
    clearTimeout(timeout)
    timeout = setTimeout(() => func.apply(this, args), wait)
  }
}

// Throttle function for rate limiting
export function throttle(func, limit) {
  let inThrottle
  return function executedFunction(...args) {
    if (!inThrottle) {
      func.apply(this, args)
      inThrottle = true
      setTimeout(() => (inThrottle = false), limit)
    }
  }
}

// Batch requests together
export class RequestBatcher {
  constructor(batchSize = 10, batchDelay = 100) {
    this.batchSize = batchSize
    this.batchDelay = batchDelay
    this.queue = []
    this.timeout = null
  }

  add(request) {
    return new Promise((resolve, reject) => {
      this.queue.push({ request, resolve, reject })
      
      if (this.queue.length >= this.batchSize) {
        this.flush()
      } else if (!this.timeout) {
        this.timeout = setTimeout(() => this.flush(), this.batchDelay)
      }
    })
  }

  flush() {
    if (this.timeout) {
      clearTimeout(this.timeout)
      this.timeout = null
    }

    if (this.queue.length === 0) return

    const batch = this.queue.splice(0, this.batchSize)
    // Process batch
    batch.forEach(({ request, resolve, reject }) => {
      Promise.resolve(request())
        .then(resolve)
        .catch(reject)
    })
  }
}

// Global request throttler instance
export const requestThrottler = new RequestThrottler(10, 50)

// Virtual scrolling helper (React-free version)
export function calculateVirtualScroll(items, itemHeight, containerHeight, scrollTop) {
  
  const startIndex = Math.floor(scrollTop / itemHeight)
  const endIndex = Math.min(
    startIndex + Math.ceil(containerHeight / itemHeight) + 1,
    items.length
  )
  
  const visibleItems = items.slice(startIndex, endIndex)
  const offsetY = startIndex * itemHeight
  const totalHeight = items.length * itemHeight
  
  return {
    visibleItems,
    offsetY,
    totalHeight,
    startIndex,
    endIndex
  }
}

// Memory-efficient data pagination
export function paginateData(data, pageSize = 50) {
  const pages = []
  for (let i = 0; i < data.length; i += pageSize) {
    pages.push(data.slice(i, i + pageSize))
  }
  return pages
}

// Connection pooling for WebSocket/RPC
export class ConnectionPool {
  constructor(maxConnections = 5) {
    this.maxConnections = maxConnections
    this.connections = []
    this.queue = []
  }

  async acquire() {
    if (this.connections.length < this.maxConnections) {
      const connection = await this.createConnection()
      this.connections.push(connection)
      return connection
    }

    return new Promise((resolve) => {
      this.queue.push(resolve)
    })
  }

  release(connection) {
    const index = this.connections.indexOf(connection)
    if (index > -1) {
      this.connections.splice(index, 1)
      
      if (this.queue.length > 0) {
        const next = this.queue.shift()
        this.acquire().then(next)
      }
    }
  }

  async createConnection() {
    // Override in subclass
    throw new Error('createConnection must be implemented')
  }
}

// Performance monitoring
export class PerformanceMonitor {
  constructor() {
    this.metrics = {
      requestCount: 0,
      averageResponseTime: 0,
      errorCount: 0,
      cacheHitRate: 0
    }
  }

  recordRequest(duration, cached = false) {
    this.metrics.requestCount++
    if (cached) {
      this.metrics.cacheHitRate = 
        (this.metrics.cacheHitRate * (this.metrics.requestCount - 1) + 1) / 
        this.metrics.requestCount
    } else {
      this.metrics.cacheHitRate = 
        (this.metrics.cacheHitRate * (this.metrics.requestCount - 1)) / 
        this.metrics.requestCount
    }
    
    this.metrics.averageResponseTime = 
      (this.metrics.averageResponseTime * (this.metrics.requestCount - 1) + duration) / 
      this.metrics.requestCount
  }

  recordError() {
    this.metrics.errorCount++
  }

  getMetrics() {
    return { ...this.metrics }
  }
}

export const performanceMonitor = new PerformanceMonitor()
