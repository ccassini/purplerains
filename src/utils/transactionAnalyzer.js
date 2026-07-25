/**
 * Transaction Analyzer for Purple Rain
 * Analyzes transaction types and categorizes them
 */

// Known contract signatures for different transaction types
const CONTRACT_SIGNATURES = {
  // DeFi Operations - Swap, Stake, Liquidity (expanded for better detection)
  DEFI: {
    'swap': [
      // Uniswap V2 Router
      '0x7ff36ab5', // swapExactETHForTokens
      '0x38ed1739', // swapExactTokensForTokens
      '0x8803dbee', // swapTokensForExactTokens
      '0x18cbafe5', // swapExactTokensForETH
      '0x4a25d94a', // swapTokensForExactETH
      '0xfb3bdb41', // swapETHForExactTokens
      '0x5c11d795', // swapExactTokensForTokensSupportingFeeOnTransferTokens
      '0xb6f9de95', // swapExactETHForTokensSupportingFeeOnTransferTokens
      '0x791ac947', // swapExactTokensForETHSupportingFeeOnTransferTokens
      // Uniswap V3 Router
      '0x414bf389', // exactInputSingle
      '0xc04b8d59', // exactInput
      '0xdb3e2198', // exactOutputSingle
      '0xf28c0498', // exactOutput
      '0x128acb08', // swap (V3 pool)
      '0x04e45aaf', // exactInputSingleFeeOnTransfer
      // Uniswap Universal Router
      '0x3593564c', // execute
      '0x24856bc3', // execute (variant)
      '0x709a1cc2', // execute (variant 2)
      // SushiSwap
      '0xd9627aa4', // sellToUniswap
      // 1inch & Aggregators
      '0x12aa3caf', // swap
      '0xe449022e', // uniswapV3Swap
      '0x0502b1c5', // unoswap
      '0x2e95b6c8', // unoswapTo
      // 0x Protocol
      '0x415565b0', // transformERC20
      '0xf47261b0', // fillOrder
      // Ambient/CrocSwap
      '0x2c76d7a6', // swap
      // General DEX patterns
      '0x022c0d9f', // swap (generic pair)
      '0xfa461e33', // uniswapV3SwapCallback
      '0x2c0198a5', // swap (curve style)
      '0x38b6e9b6', // swapWithPermit
      '0x6af479b2', // getSwapOutput
      '0xdf791e50', // swapNoFee
      '0xb858183f', // exactInputSingleWithLimit
      '0x4e26c8c4', // swapSingle
    ],
    'stake': ['0xa694fc3a', '0x2e1a7d4d', '0x3ccfd60b', '0xb6b55f25', '0x2e17de78', '0x1249c58b', '0xe2bbb158'],
    'liquidity': ['0xe8e33700', '0xbaa2abde', '0x4515cef3', '0x02751cec', '0x89afcb44', '0x0dcd7a6c', '0xf305d719', '0x4883c06b']
  },
  
  // NFT Operations - Mint, Transfer, Sale
  NFT: {
    'mint': ['0x40c10f19', '0xa0712d68', '0x6a627842', '0x1249c58b'],
    'transfer': ['0x42842e0e', '0xb88d4fde', '0xf242432a', '0x2eb2c2d6'],
    'sale': ['0x96b5a755', '0xfb0f3ee1', '0xab834bab']
  },
  
  // Transfer Operations - MON and ERC-20 transfers
  TRANSFER: {
    'erc20': ['0xa9059cbb', '0x23b872dd', '0x095ea7b3'], // transfer, transferFrom, approve
    'native': [] // Native MON transfers (no method signature)
  },
  
  // Contract Operations
  CONTRACT: {
    'deploy': [], // Contract creation transactions
    'call': ['0x'] // Generic contract calls
  }
}

// Known DEX Router addresses on Monad mainnet (REAL VERIFIED ADDRESSES)
const KNOWN_DEX_ROUTERS = new Set([
  // ============ VERIFIED MONAD MAINNET DEXs ============
  // Nad.fun (REAL)
  '0x0b79d71ae99528d1db24a4148b5f4f865cc2b137', // Nad.fun: DEX_ROUTER
  '0x6f6b8f1a20703309951a5127c45b49b1cd981a22', // Nad.fun: BONDING_CURVE_ROUTER
  
  // Pinot Finance (REAL)
  '0x252b9c1a6c9867a514ea70fe9bbb23621acc1a50', // Pinot Finance: SwapRouter
  
  // PancakeSwap on Monad (REAL)
  '0x21114915ac6d5a2e156931e20b20b038ded0be7c', // PancakeSwap Router 1
  '0x23682a588cf2601aca977df200938634c9f7d552', // PancakeSwap Router 2
  
  // Uniswap on Monad (REAL)
  '0x4b2ab38dbf28d31d467aa8993f6c2585981d6804', // Uniswap: UniswapV2Router02
  
  // Capricorn (REAL)
  '0xdac97b6a3951641b177283028a8f428332333071', // Capricorn Router
  
  // Kuru (REAL)
  '0xb3e6778480b2e488385e8205ea05e20060b813cb', // Kuru Smart Router
  
  // OKX Aggregator (REAL)
  '0xb1e4e25b1938c78ec0b21ccb2d6a0be60aa7e63f', // OKX Aggregator Router
  
  // GMGN (REAL)
  '0xc9ca80b5ea956afa98627963d1880033545d108e', // GMGN Router
  
  // Matcha (REAL)
  '0x0000000000001ff3684f28c67538d4d072c22734', // Matcha Router
  
  // ============ OTHER MONAD DEXs ============
  // Ambient/CrocSwap
  '0xaaaaaaaaa24eeeb8d57d431224f73832bc34f688',
  '0xaaaa0090fcda256a57b31e65e6c00e800e30fcd3',
  
  // ============ COMMON DEX PATTERNS ============
  '0x7a250d5630b4cf539739df2c5dacb4c659f2488d', // Uniswap V2 Router
  '0xe592427a0aece92de3edee1f18e0157c05861564', // Uniswap V3 Router
  '0x68b3465833fb72a70ecdf485e0e4c7bd8665fc45', // Universal Router
  '0xef1c6e67703c7bd7107eed8303fbe6ec2554bf6b', // Universal Router 2
  '0xd9e1ce17f2641f24ae83637ab66a2cca9c378b9f', // SushiSwap
  '0x1111111254fb6c44bac0bed2854e76f90643097d', // 1inch V5
  '0x1111111254eeb25477b68fb85ed929f73a960582', // 1inch V4
  '0xdef1c0ded9bec7f1a1670819833240f027b25eff', // 0x Protocol
  '0x03a520b32c04bf3beef7beb72e919cf822ed34f1', // iZiSwap
  '0xdef171fe48cf0115b1d80b88dc8eab59176fee57', // ParaSwap
  '0xba12222222228d8ba445958a75a0704d566bf2c8', // Balancer
])

export class TransactionAnalyzer {
  constructor() {
    this.stats = {
      defi: 0,
      nft: 0,
      transfer: 0,
      contractCall: 0,
      contractDeploy: 0,
      other: 0
    }
  }

  reset() {
    this.stats = {
      defi: 0,
      nft: 0,
      transfer: 0,
      contractCall: 0,
      contractDeploy: 0,
      other: 0
    }
  }

  analyzeTransaction(tx) {
    const txType = this.categorizeTransaction(tx)
    this.stats[txType]++
    
    return {
      ...tx,
      category: txType,
      categoryDisplay: this.getCategoryDisplay(txType),
      dropImage: this.getDropImage(txType),
      color: this.getCategoryColor(txType)
    }
  }

  categorizeTransaction(tx) {
    // Validate transaction data
    if (!tx || !tx.hash) {
      return 'other'
    }

    // Contract deployment (to address is null or zero address)
    const toAddress = tx.to?.toLowerCase()
    if (!toAddress || toAddress === '0x0000000000000000000000000000000000000000' || toAddress === '0x') {
      return 'contractDeploy'
    }

    // Get input data (handle both hex string and empty cases)
    const input = tx.input || tx.data || '0x'
    const inputLower = input.toLowerCase()

    // Simple MON transfer (no input data or just 0x)
    if (inputLower === '0x' || inputLower.length <= 2) {
      return 'transfer'
    }

    // Extract method signature (first 4 bytes = 10 hex chars including 0x)
    if (inputLower.length < 10) {
      return 'transfer' // Too short to be a contract call
    }

    const methodSignature = inputLower.substring(0, 10)

    // Check ERC-20 transfers first (MON + ERC-20 tokens)
    if (this.isTransferTransaction(methodSignature, tx)) {
      return 'transfer'
    }

    // Check DeFi operations (Swap, Stake, Liquidity)
    if (this.isDeFiTransaction(methodSignature, tx)) {
      return 'defi'
    }

    // Check NFT operations (Mint, Transfer, Sale)
    if (this.isNFTTransaction(methodSignature, tx)) {
      return 'nft'
    }

    // Check if it's a contract call (has input data)
    if (inputLower.length > 10) {
      return 'contractCall'
    }

    return 'other'
  }

  isTransferTransaction(signature, tx) {
    // ERC-20 transfer signatures
    const transferSignatures = CONTRACT_SIGNATURES.TRANSFER.erc20
    
    if (transferSignatures.includes(signature)) {
      return true
    }

    const input = (tx.input || tx.data || '0x').toLowerCase()

    // Additional heuristics for ERC-20 transfers
    // transfer(address,uint256) - 4 bytes signature + 32 bytes address + 32 bytes amount = 138 chars
    if (signature === '0xa9059cbb' && input.length === 138) {
      return true
    }

    // transferFrom(address,address,uint256) - 4 bytes + 3*32 bytes = 202 chars
    if (signature === '0x23b872dd' && input.length === 202) {
      return true
    }

    // approve(address,uint256) - 4 bytes + 2*32 bytes = 138 chars
    if (signature === '0x095ea7b3' && input.length === 138) {
      return true
    }

    return false
  }

  isDeFiTransaction(signature, tx) {
    // Check if tx is going to a known DEX router (high confidence)
    const toAddress = tx.to?.toLowerCase()
    if (toAddress && KNOWN_DEX_ROUTERS.has(toAddress)) {
      return true
    }

    // Check against known DeFi signatures (Swap, Stake, Liquidity)
    for (const category of Object.values(CONTRACT_SIGNATURES.DEFI)) {
      if (category.includes(signature)) {
        return true
      }
    }

    // Additional DeFi heuristics
    if (tx.value > 0 && signature !== '0x') {
      // Check for common DeFi patterns with value transfers
      const commonDeFiSigs = ['0x7ff36ab5', '0x38ed1739', '0xa694fc3a', '0xe8e33700', '0x18cbafe5']
      if (commonDeFiSigs.includes(signature)) {
        return true
      }
    }

    // Check if marked as DEX transaction from context
    if (tx.isDexTx) {
      return true
    }

    return false
  }

  isNFTTransaction(signature, tx) {
    // Check against known NFT signatures (Mint, Transfer, Sale)
    for (const category of Object.values(CONTRACT_SIGNATURES.NFT)) {
      if (category.includes(signature)) {
        return true
      }
    }

    // ERC-721 specific signatures
    const nftSpecificSigs = ['0x42842e0e', '0xb88d4fde', '0xf242432a']
    if (nftSpecificSigs.includes(signature)) {
      return true
    }

    // Check for NFT-like patterns (different from ERC-20 transfers)
    if (signature === '0x23b872dd' && this.isLikelyNFT(tx)) {
      return true
    }

    return false
  }

  isLikelyNFT(tx) {
    // Heuristics to distinguish NFT from ERC-20 transfers
    const value = typeof tx.value === 'string' 
      ? parseInt(tx.value, 16) || 0 
      : (tx.value || 0)
    
    // NFTs often have 0 value and different gas patterns
    if (value === 0 || value === '0x0' || value === '0') {
      const input = tx.input || tx.data || '0x'
      // Check input data length - NFT transfers often have different patterns
      // ERC-721 safeTransferFrom has more complex data structures
      if (input.length > 200) {
        // Check for NFT-specific patterns in the signature
        const signature = input.substring(0, 10).toLowerCase()
        const nftSignatures = ['0x42842e0e', '0xb88d4fde', '0xf242432a', '0x2eb2c2d6']
        if (nftSignatures.includes(signature)) {
          return true
        }
      }
    }
    
    return false
  }

  getCategoryDisplay(category) {
    const displays = {
      defi: 'DeFi',
      nft: 'NFT',
      transfer: 'Transfer',
      contractCall: 'Contract Call',
      contractDeploy: 'Contract Deploy',
      other: 'Other'
    }
    return displays[category] || 'Unknown'
  }

  getDropImage(category) {
    const images = {
      defi: '/drops/defi.png',
      nft: '/drops/nft.png', 
      transfer: '/drops/transfer.png',
      contractCall: '/drops/contract-call.png',
      contractDeploy: '/drops/contract-deploy.png',
      other: '/drops/other.png'
    }
    return images[category] || '/raindrop.png'
  }

  getCategoryColor(category) {
    const colors = {
      defi: '#00D4AA',      // Teal for DeFi
      nft: '#FF6B6B',       // Red for NFT
      transfer: '#4ECDC4',  // Light blue for transfers
      contractCall: '#45B7D1', // Blue for contract calls
      contractDeploy: '#96CEB4', // Green for deployments
      other: '#FECA57'      // Yellow for others
    }
    return colors[category] || '#8B5CF6'
  }

  getStats() {
    const { contractCall, ...rest } = this.stats
    return {
      ...rest,
      other: (rest.other || 0) + (contractCall || 0)
    }
  }

  getTotalTransactions() {
    return Object.values(this.stats).reduce((sum, count) => sum + count, 0)
  }

  getPercentages() {
    const total = this.getTotalTransactions()
    if (total === 0) return {}

    const percentages = {}
    for (const [category, count] of Object.entries(this.stats)) {
      percentages[category] = Math.round((count / total) * 100)
    }
    return percentages
  }

  getMostActiveCategory() {
    let maxCategory = 'other'
    let maxCount = 0

    for (const [category, count] of Object.entries(this.stats)) {
      if (count > maxCount) {
        maxCount = count
        maxCategory = category
      }
    }

    return { category: maxCategory, count: maxCount }
  }

}

export default TransactionAnalyzer 