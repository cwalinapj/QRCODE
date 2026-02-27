.PHONY: dev dev-web dev-worker build lint test typecheck contracts-compile contracts-test

dev:
	pnpm dev

dev-web:
	pnpm dev:web

dev-worker:
	pnpm dev:worker

build:
	pnpm build

lint:
	pnpm lint

test:
	pnpm test

typecheck:
	pnpm typecheck

contracts-compile:
	pnpm contracts:compile

contracts-test:
	pnpm contracts:test
