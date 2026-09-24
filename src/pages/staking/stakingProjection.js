const DAYS_PER_YEAR = 365
const MONTHS_PER_YEAR = 12
const CHART_INTERVALS = 48

// Display-model limits, not protocol limits. Never silently clamp user inputs.
export const STAKING_PROJECTION_LIMITS = Object.freeze({ amount: 1e12, days: 3650, grossApr: 1000 })

function decimal(value) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : NaN
  if (typeof value !== 'string' || !/^[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?$/.test(value.trim())) return NaN
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : NaN
}

function rewardsAt(amount, rate, days, reinvest) {
  if (amount === 0 || rate === 0 || days === 0) return 0
  if (reinvest === 'none') return amount * rate * days / DAYS_PER_YEAR

  // A model month is exactly 365/12 days. Completed months are reinvested;
  // the remainder accrues simple interest. This idealized scenario does not
  // imply that Monad automatically compounds or bypasses epoch activation.
  const months = days * MONTHS_PER_YEAR / DAYS_PER_YEAR
  const completed = Math.floor(months + 1e-12)
  const remainder = Math.max(0, months - completed)
  const monthlyRate = rate / MONTHS_PER_YEAR
  const growth = Math.expm1(completed * Math.log1p(monthlyRate))
  return amount * (growth + (1 + growth) * monthlyRate * remainder)
}

/**
 * Project already-active stake at an assumed gross inflation APR. Commission
 * is a fraction of rewards; principal is never charged. The input APR is not
 * a promise of realized returns. No market prices or unverified rates enter
 * this calculation.
 */
export function projectStakingScenario(input = {}) {
  const source = input && typeof input === 'object' ? input : {}
  const amount = decimal(source.amount)
  const days = decimal(source.days)
  const grossApr = decimal(source.grossApr)
  const commission = decimal(source.commission)
  const reinvest = source.reinvest
  const errors = {}

  if (!Number.isFinite(amount) || amount < 0 || amount > STAKING_PROJECTION_LIMITS.amount) {
    errors.amount = 'Enter an amount from 0 to 1 trillion MON.'
  }
  if (!Number.isInteger(days) || days < 1 || days > STAKING_PROJECTION_LIMITS.days) {
    errors.days = 'Enter a whole number from 1 to 3,650 days.'
  }
  if (!Number.isFinite(grossApr) || grossApr < 0 || grossApr > STAKING_PROJECTION_LIMITS.grossApr) {
    errors.grossApr = 'Enter a gross APR from 0% to 1,000%.'
  }
  if (!Number.isFinite(commission) || commission < 0 || commission > 100) {
    errors.commission = 'Enter a commission from 0% to 100%.'
  }
  if (reinvest !== 'none' && reinvest !== 'monthly') {
    errors.reinvest = 'Choose whether to reinvest rewards.'
  }
  if (Object.keys(errors).length) return { valid: false, errors }

  const netApr = grossApr * (1 - commission / 100)
  const rate = netApr / 100
  const rewards = rewardsAt(amount, rate, days, reinvest)
  const withoutReinvestment = rewardsAt(amount, rate, days, 'none')
  const total = amount + rewards
  const annualYieldPercent = rewardsAt(100, rate, DAYS_PER_YEAR, reinvest)
  const periods = {
    day: rewardsAt(amount, rate, 1, reinvest),
    month: rewardsAt(amount, rate, 30, reinvest),
    year: rewardsAt(amount, rate, DAYS_PER_YEAR, reinvest),
  }
  if (![rewards, withoutReinvestment, total, annualYieldPercent, ...Object.values(periods)].every(Number.isFinite)) {
    return { valid: false, errors: { projection: 'These inputs exceed the supported calculation range. Try a smaller amount, rate, or duration.' } }
  }

  const points = Array.from({ length: CHART_INTERVALS + 1 }, (_, index) => {
    const day = days * index / CHART_INTERVALS
    return { day, rewards: rewardsAt(amount, rate, day, reinvest), simpleRewards: rewardsAt(amount, rate, day, 'none') }
  })

  return {
    valid: true, errors, amount, days, grossApr, commission, reinvest, netApr,
    rewards, total, annualYieldPercent, withoutReinvestment,
    reinvestmentGain: Math.max(0, rewards - withoutReinvestment), periods, points,
  }
}
