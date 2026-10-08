export const env = {
  apiBaseUrl: import.meta.env.VITE_API_BASE_URL as string | undefined,
  contractAddress: import.meta.env.VITE_CONTRACT_ADDRESS as string | undefined,
  chainId: import.meta.env.VITE_CHAIN_ID as string | undefined,
  rpcUrl: import.meta.env.VITE_RPC_URL as string | undefined,
}

export const isMockMode = !env.apiBaseUrl
