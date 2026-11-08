/** Show a wallet address as 0x1234…abcd. */
export function shortAddress(address) {
  if (typeof address !== "string" || address.length < 10) {
    return "";
  }

  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}
