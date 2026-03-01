# Safety and Phishing Prevention

## Best practice

For updateable QRs, set a timelock (for example, 3600 seconds).

Why:

- If your wallet is compromised or tricked, a bad update is delayed.
- You can cancel the pending change before activation.

## Resolver safety

The resolver checks the on-chain record before redirecting.

- It only redirects to validated `https`, `address`, `ipfs`, or `arweave` targets.
- It includes a verification page and a cancel button before auto-redirect.

For wallet backups, store only encrypted envelopes off-chain and point immutable QR targets to `/backup/<cid>`.
