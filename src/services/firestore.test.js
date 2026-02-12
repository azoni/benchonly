import { describe, it, expect } from 'vitest'
import {
  workoutService,
  goalService,
  programService,
  creditService,
  groupWorkoutService,
  scheduleService,
  healthService,
  tokenUsageService,
  attendanceService,
} from './firestore'
import { feedService } from './feedService'
import { analyticsService } from './analyticsService'

/**
 * Service contract tests
 * 
 * Verify every method called from pages/components actually exists.
 * Catches: mistyped names, removed methods, renames without updating callers.
 */

describe('workoutService', () => {
  const requiredMethods = [
    'create', 'update', 'delete', 'getByUser', 'getById',
    'getByDateRange', 'complete', 'completeWorkout', 'checkAndUpdateGoals',
    'getCardioByUser', 'getByDate', 'get',
  ]
  
  it.each(requiredMethods)('has method: %s', (method) => {
    expect(typeof workoutService[method]).toBe('function')
  })
})

describe('goalService', () => {
  const requiredMethods = ['create', 'update', 'delete', 'getByUser', 'get']
  
  it.each(requiredMethods)('has method: %s', (method) => {
    expect(typeof goalService[method]).toBe('function')
  })
})

describe('programService', () => {
  const requiredMethods = [
    'create', 'update', 'delete', 'get', 'getByUser', 'getActive', 'getProgramDay',
  ]
  
  it.each(requiredMethods)('has method: %s', (method) => {
    expect(typeof programService[method]).toBe('function')
  })
})

describe('creditService', () => {
  const requiredMethods = ['add', 'deduct']
  
  it.each(requiredMethods)('has method: %s', (method) => {
    expect(typeof creditService[method]).toBe('function')
  })
})

describe('feedService', () => {
  const requiredMethods = ['getFeed', 'getComments', 'addComment', 'createFeedItem']
  
  it.each(requiredMethods)('has method: %s', (method) => {
    expect(typeof feedService[method]).toBe('function')
  })
})

describe('groupWorkoutService', () => {
  const requiredMethods = [
    'get', 'getByGroup', 'getByUser', 'createBatch', 'update', 'delete',
    'complete', 'approveReview', 'getPendingReviews',
  ]
  
  it.each(requiredMethods)('has method: %s', (method) => {
    expect(typeof groupWorkoutService[method]).toBe('function')
  })
})

describe('scheduleService', () => {
  const requiredMethods = ['getByUser', 'update']
  
  it.each(requiredMethods)('has method: %s', (method) => {
    expect(typeof scheduleService[method]).toBe('function')
  })
})

describe('healthService', () => {
  const requiredMethods = ['create', 'getByUser', 'update']
  
  it.each(requiredMethods)('has method: %s', (method) => {
    expect(typeof healthService[method]).toBe('function')
  })
})

describe('analyticsService', () => {
  const requiredMethods = ['getActivitySummary', 'logAction']
  
  it.each(requiredMethods)('has method: %s', (method) => {
    expect(typeof analyticsService[method]).toBe('function')
  })
})

describe('tokenUsageService', () => {
  const requiredMethods = ['getByUser']
  
  it.each(requiredMethods)('has method: %s', (method) => {
    expect(typeof tokenUsageService[method]).toBe('function')
  })
})

describe('attendanceService', () => {
  const requiredMethods = ['getByUser', 'log']
  
  it.each(requiredMethods)('has method: %s', (method) => {
    expect(typeof attendanceService[method]).toBe('function')
  })
})
