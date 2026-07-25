// Monad Staking Precompile (0x...1000) helpers
// Based on monad-developers/staking-sdk-cli selectors & calldata encoding.

import { decodeAbiParameters, encodeAbiParameters, parseAbiParameters } from 'viem'

export const STAKING_PRECOMPILE_ADDRESS = '0x0000000000000000000000000000000000001000'

// Write selectors (staking-sdk-cli/src/staking_sdk_py/constants.py)
export const SELECTOR = {
  DELEGATE: '0x84994fec',
  UNDELEGATE: '0x5cf41514',
  WITHDRAW: '0xaed2ee73',
  COMPOUND: '0xb34fea67',
  CLAIM_REWARDS: '0xa76e2ca5',
  CHANGE_COMMISSION: '0x9bdcc3c8',
}

// Read selectors
export const GETTER = {
  GET_EPOCH: '0x757991a8',
  GET_VALIDATOR: '0x2b6d639a',
  GET_DELEGATOR: '0x573c1ce0',
  GET_WITHDRAWAL_REQUEST: '0x56fa2045',
  GET_PROPOSER_VAL_ID: '0xfbacb0be',
  GET_CONSENSUS_VALSET: '0xfb29b729',
  GET_SNAPSHOT_VALSET: '0xde66a368',
  GET_EXECUTION_VALSET: '0x7cb074df',
  GET_DELEGATIONS: '0x4fd66050',
  GET_DELEGATORS: '0xa0843a26',
}

function withSelector(selector, encodedParamsHex) {
  return `${selector}${encodedParamsHex.startsWith('0x') ? encodedParamsHex.slice(2) : encodedParamsHex}`
}

export function encodeDelegateCalldata(valId) {
  const encoded = encodeAbiParameters(parseAbiParameters('uint64 valId'), [BigInt(valId)])
  return withSelector(SELECTOR.DELEGATE, encoded)
}

export function encodeUndelegateCalldata(valId, amountWei, withdrawalId) {
  const encoded = encodeAbiParameters(
    parseAbiParameters('uint64 valId, uint256 amount, uint8 withdrawalId'),
    [BigInt(valId), BigInt(amountWei), BigInt(withdrawalId)],
  )
  return withSelector(SELECTOR.UNDELEGATE, encoded)
}

export function encodeWithdrawCalldata(valId, withdrawalId) {
  const encoded = encodeAbiParameters(
    parseAbiParameters('uint64 valId, uint8 withdrawalId'),
    [BigInt(valId), BigInt(withdrawalId)],
  )
  return withSelector(SELECTOR.WITHDRAW, encoded)
}

export function encodeClaimRewardsCalldata(valId) {
  const encoded = encodeAbiParameters(parseAbiParameters('uint64 valId'), [BigInt(valId)])
  return withSelector(SELECTOR.CLAIM_REWARDS, encoded)
}

export function encodeCompoundCalldata(valId) {
  const encoded = encodeAbiParameters(parseAbiParameters('uint64 valId'), [BigInt(valId)])
  return withSelector(SELECTOR.COMPOUND, encoded)
}

export function encodeGetEpochCalldata() {
  return GETTER.GET_EPOCH
}

export function decodeGetEpochResult(resultHex) {
  // (uint64 epoch, bool inEpochDelayPeriod)
  const [epoch, inEpochDelayPeriod] = decodeAbiParameters(
    parseAbiParameters('uint64 epoch, bool inEpochDelayPeriod'),
    resultHex,
  )
  return { epoch: Number(epoch), inEpochDelayPeriod: Boolean(inEpochDelayPeriod) }
}

export function encodeGetDelegatorCalldata(valId, delegatorAddress) {
  const encoded = encodeAbiParameters(
    parseAbiParameters('uint64 valId, address delegator'),
    [BigInt(valId), delegatorAddress],
  )
  return withSelector(GETTER.GET_DELEGATOR, encoded)
}

export function decodeGetDelegatorResult(resultHex) {
  // staking-sdk-cli: ["uint256","uint256","uint256","uint256","uint256","uint64","uint64"]
  const [
    a0,
    a1,
    a2,
    a3,
    a4,
    e0,
    e1,
  ] = decodeAbiParameters(
    parseAbiParameters(
      'uint256 v0, uint256 v1, uint256 v2, uint256 v3, uint256 v4, uint64 e0, uint64 e1',
    ),
    resultHex,
  )
  return {
    v0: a0,
    v1: a1,
    v2: a2,
    v3: a3,
    v4: a4,
    e0: Number(e0),
    e1: Number(e1),
  }
}

export function encodeGetWithdrawalRequestCalldata(valId, delegatorAddress, withdrawalId) {
  const encoded = encodeAbiParameters(
    parseAbiParameters('uint64 valId, address delegator, uint8 withdrawalId'),
    [BigInt(valId), delegatorAddress, BigInt(withdrawalId)],
  )
  return withSelector(GETTER.GET_WITHDRAWAL_REQUEST, encoded)
}

export function decodeGetWithdrawalRequestResult(resultHex) {
  // staking-sdk-cli: ["uint256","uint256","uint64"]
  const [amount, maybeSomething, epoch] = decodeAbiParameters(
    parseAbiParameters('uint256 amount, uint256 v1, uint64 epoch'),
    resultHex,
  )
  return { amount, v1: maybeSomething, epoch: Number(epoch) }
}

export function encodeGetValsetCalldata(selector, index) {
  const encoded = encodeAbiParameters(parseAbiParameters('uint64 index'), [BigInt(index)])
  return withSelector(selector, encoded)
}

export function decodeGetValsetResult(resultHex) {
  // staking-sdk-cli: ["bool", "uint64","uint64[]"]
  const [done, nextIndex, ids] = decodeAbiParameters(
    parseAbiParameters('bool done, uint64 nextIndex, uint64[] ids'),
    resultHex,
  )
  return {
    done: Boolean(done),
    nextIndex: Number(nextIndex),
    ids: Array.isArray(ids) ? ids.map((x) => Number(x)) : [],
  }
}

export function encodeGetValidatorCalldata(valId) {
  const encoded = encodeAbiParameters(parseAbiParameters('uint64 valId'), [BigInt(valId)])
  return withSelector(GETTER.GET_VALIDATOR, encoded)
}

export function decodeGetValidatorResult(resultHex) {
  // Observed on-chain (rpc.monad.xyz): returns a fixed header + dynamic pubkeys.
  // Shape:
  // (address auth, uint64 status,
  //  uint256 a0, uint256 a1, uint256 a2, uint256 a3, uint256 a4, uint256 a5, uint256 a6, uint256 a7,
  //  bytes secp, bytes bls)
  //
  // Empirically, a0 behaves like totalStake (wei) and a2 behaves like commission (wad, 1e18 = 100%).
  const [
    auth,
    status,
    a0,
    a1,
    a2,
    a3,
    a4,
    a5,
    a6,
    a7,
    secp,
    bls,
  ] = decodeAbiParameters(
    parseAbiParameters(
      'address auth, uint64 status, uint256 a0, uint256 a1, uint256 a2, uint256 a3, uint256 a4, uint256 a5, uint256 a6, uint256 a7, bytes secp, bytes bls',
    ),
    resultHex,
  )

  return {
    auth,
    status: Number(status),
    totalStakeWei: a0,
    a1,
    commissionWad: a2,
    a3,
    a4,
    a5,
    a6,
    a7,
    secp,
    bls,
  }
}

