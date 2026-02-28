# QR Modes Explained (Plain English)

## Mode A: Immutable Forever

You mint a QR that points to a fixed piece of content forever.

- If you choose `url`, the QR points to a fixed HTTPS URL.
- If you choose `address`, the QR stores a fixed EVM wallet address.
- If you choose `ipfs`, the QR points to an IPFS CID.
- If you choose `arweave`, the QR points to an Arweave transaction ID.
- Nobody can edit this QR destination later.

If you need changes later, mint a new QR.

## Mode B: Same QR Forever, Owner-Updateable

You mint one QR ID that never changes. You can update where it points later.

- Only the wallet that owns the QR token can update it.
- All updates are on-chain and public.
- Optional timelock lets updates wait before they activate.

Timelock helps protect against phishing or accidental updates.
