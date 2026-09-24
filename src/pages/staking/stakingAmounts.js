import { formatEther, parseEther } from 'viem'

export const STAKING_DUST_WEI = 1_000_000_000n
// A UI reserve, not a protocol fee. The wallet estimates the actual fee.
export const GAS_RESERVE_WEI = 10_000_000_000_000_000n

export function parseStakingAmount(value) {
  const text = String(value ?? '').trim()
  if (!/^(?:\d+(?:\.\d{0,18})?|\.\d{1,18})$/.test(text)) return null
  try { return parseEther(text) } catch { return null }
}

export function amountError(value, availableWei, { reserve = 0n, minimum = STAKING_DUST_WEI } = {}) {
  if (String(value ?? '').trim() === '') return null
  const amount = parseStakingAmount(value)
  if (amount === null) return 'Enter a decimal amount with up to 18 decimal places.'
  if (amount < minimum) return 'The minimum amount is 0.000000001 MON.'
  if (typeof availableWei === 'bigint' && amount > availableWei - reserve) {
    return reserve > 0n ? 'Leave 0.01 MON in your wallet for transaction fees.' : 'Amount exceeds your available stake.'
  }
  return null
}

export function amountPreset(availableWei, percent, reserve = 0n) {
  if (typeof availableWei !== 'bigint' || ![25, 50, 75, 100].includes(percent)) return ''
  const available = availableWei > reserve ? availableWei - reserve : 0n
  return formatEther(available * BigInt(percent) / 100n)
}
